// src/__tests__/integration/workflow.e2e.test.js
// ─────────────────────────────────────────────────────────
// END-TO-END WORKFLOW: Procurement → Inventory → Asset → MRO
// Tests the complete chain that a hotel ERP system performs daily:
//   1. Create supplier
//   2. Create RFQ → Submit → Approve
//   3. Create PO from RFQ → Submit → Approve → Receive (creates batch + stock movement)
//   4. Verify inventory batch was created and stock is updated
//   5. Convert inventory batch → Asset
//   6. Create Maintenance Schedule for Asset
//   7. Create Work Order → Open → Start → Add Parts (deducts inventory) → Complete
//   8. Verify asset restored to ACTIVE, schedule advanced
//   9. Run validation engine — expect no critical issues from our workflow
// ─────────────────────────────────────────────────────────

const request = require('supertest')
const app = require('../../app')
const prisma = require('../../config/database')
const bcrypt = require('bcryptjs')

describe('E2E: Procurement → Inventory → Asset → MRO Workflow', () => {
  let adminToken, managerToken, staffToken, techToken
  let adminUser, managerUser, techUser

  // Track created entities for cleanup
  let supplierId, rfqId, poId, receivingId
  let inventoryItemId, batchId
  let assetId, scheduleId
  let workOrderId

  const cleanup = {
    userEmails: ['e2e.admin@test.com', 'e2e.manager@test.com', 'e2e.staff@test.com', 'e2e.tech@test.com'],
    supplierCode: 'E2E-SUP-001',
    itemSKU: 'E2E-SKU-001',
    assetCode: 'E2E-ASSET-001',
  }

  // ─── Setup ──────────────────────────────────────────────
  beforeAll(async () => {
    const users = [
      { email: 'e2e.admin@test.com',   pw: 'Admin@1234',   role: 'ADMIN',      first: 'E2E', last: 'Admin' },
      { email: 'e2e.manager@test.com', pw: 'Manager@1234', role: 'MANAGER',    first: 'E2E', last: 'Manager' },
      { email: 'e2e.staff@test.com',   pw: 'Staff@1234',   role: 'STAFF',      first: 'E2E', last: 'Staff' },
      { email: 'e2e.tech@test.com',    pw: 'Tech@1234',    role: 'TECHNICIAN', first: 'E2E', last: 'Tech' },
    ]

    for (const u of users) {
      const hash = await bcrypt.hash(u.pw, 10)
      await prisma.user.upsert({
        where: { email: u.email }, update: {},
        create: { email: u.email, password: hash, firstName: u.first, lastName: u.last, role: u.role, status: 'ACTIVE' },
      })
    }

    const logins = await Promise.all(users.map((u) =>
      request(app).post('/api/auth/login').send({ email: u.email, password: u.pw })
    ))
    adminToken   = logins[0].body.data?.accessToken
    managerToken = logins[1].body.data?.accessToken
    staffToken   = logins[2].body.data?.accessToken
    techToken    = logins[3].body.data?.accessToken

    adminUser   = await prisma.user.findUnique({ where: { email: 'e2e.admin@test.com' } })
    managerUser = await prisma.user.findUnique({ where: { email: 'e2e.manager@test.com' } })
    techUser    = await prisma.user.findUnique({ where: { email: 'e2e.tech@test.com' } })
  })

  // ─── Teardown ────────────────────────────────────────────
  afterAll(async () => {
    // Clean up in reverse FK order
    await prisma.maintenanceLog.deleteMany({ where: { workOrder: { woNumber: { startsWith: 'WO-' } } } })
    await prisma.wOPartUsage.deleteMany({ where: { workOrder: { woNumber: { startsWith: 'WO-' } } } })
    await prisma.workOrder.deleteMany({ where: { asset: { assetCode: cleanup.assetCode } } })
    await prisma.maintenanceSchedule.deleteMany({ where: { asset: { assetCode: cleanup.assetCode } } })
    await prisma.assetLog.deleteMany({ where: { asset: { assetCode: cleanup.assetCode } } })
    await prisma.asset.deleteMany({ where: { assetCode: cleanup.assetCode } })
    await prisma.stockMovement.deleteMany({ where: { inventoryItem: { sku: cleanup.itemSKU } } })
    await prisma.pOReceivingItem.deleteMany({ where: { poReceiving: { purchaseOrder: { supplier: { code: cleanup.supplierCode } } } } })
    await prisma.pOReceiving.deleteMany({ where: { purchaseOrder: { supplier: { code: cleanup.supplierCode } } } })
    await prisma.inventoryBatch.deleteMany({ where: { inventoryItem: { sku: cleanup.itemSKU } } })
    await prisma.pOItem.deleteMany({ where: { purchaseOrder: { supplier: { code: cleanup.supplierCode } } } })
    await prisma.purchaseOrder.deleteMany({ where: { supplier: { code: cleanup.supplierCode } } })
    await prisma.rFQQuoteItem.deleteMany()
    await prisma.rFQQuote.deleteMany({ where: { rfq: { suppliers: { some: { supplier: { code: cleanup.supplierCode } } } } } })
    await prisma.rFQItem.deleteMany()
    await prisma.rFQSupplier.deleteMany()
    await prisma.rFQ.deleteMany({ where: { createdById: adminUser?.id } })
    await prisma.inventoryItem.deleteMany({ where: { sku: cleanup.itemSKU } })
    await prisma.supplier.deleteMany({ where: { code: cleanup.supplierCode } })
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'e2e.' } } })
    await prisma.notification.deleteMany({ where: { user: { email: { contains: 'e2e.' } } } })
    await prisma.user.deleteMany({ where: { email: { contains: 'e2e.' } } })
    await prisma.$disconnect()
  })

  // ═══════════════════════════════════════════════════════
  // PHASE A: PROCUREMENT
  // ═══════════════════════════════════════════════════════

  describe('Phase A — Procurement', () => {
    test('A1: Create supplier', async () => {
      const res = await request(app)
        .post('/api/procurement/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'E2E-SUP-001',
          name: 'E2E Test Supplies Ltd.',
          contactPerson: 'Test Contact',
          email: 'e2e@supplier.test',
          paymentTerms: 'NET 30',
          leadTimeDays: 5,
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.supplier.code).toBe('E2E-SUP-001')
      supplierId = res.body.data.supplier.id
    })

    test('A2: Create inventory item (required before RFQ)', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          sku: 'E2E-SKU-001',
          name: 'E2E Test HVAC Filter',
          category: 'SPARE_PARTS',
          unit: 'Piece',
          reorderPoint: 5,
          reorderQty: 10,
          location: 'E2E-Store-A1',
        })

      expect(res.statusCode).toBe(201)
      inventoryItemId = res.body.data.item.id
    })

    test('A3: Create RFQ with item and supplier', async () => {
      const res = await request(app)
        .post('/api/procurement/rfqs')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          title: 'E2E Test HVAC Filter Order',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [supplierId],
          items: [{
            inventoryItemId,
            description: 'HVAC Air Filter 16x20 E2E',
            quantity: 10,
            unit: 'Piece',
          }],
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.rfq.status).toBe('DRAFT')
      rfqId = res.body.data.rfq.id
    })

    test('A4: Submit RFQ → status becomes SENT', async () => {
      const res = await request(app)
        .post(`/api/procurement/rfqs/${rfqId}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.rfq.status).toBe('SENT')
    })

    test('A5: Add supplier quote', async () => {
      // Get RFQ items to reference in quote
      const rfqRes = await request(app)
        .get(`/api/procurement/rfqs/${rfqId}`)
        .set('Authorization', `Bearer ${staffToken}`)

      const rfqItemId = rfqRes.body.data.rfq.items[0]?.id
      expect(rfqItemId).toBeDefined()

      const res = await request(app)
        .post('/api/procurement/quotes')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          rfqId,
          supplierId,
          quoteNumber: 'E2E-QT-001',
          totalAmount: 3500,
          currency: 'PHP',
          deliveryDays: 5,
          paymentTerms: 'NET 30',
          items: [{ rfqItemId, unitPrice: 350, quantity: 10 }],
        })

      expect(res.statusCode).toBe(201)
      // RFQ should auto-advance to QUOTED
      const rfqCheck = await prisma.rFQ.findUnique({ where: { id: rfqId } })
      expect(rfqCheck.status).toBe('QUOTED')
    })

    test('A6: Manager approves RFQ → APPROVED', async () => {
      const res = await request(app)
        .post(`/api/procurement/rfqs/${rfqId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ notes: 'E2E approval' })

      expect(res.statusCode).toBe(200)
      expect(res.body.data.rfq.status).toBe('APPROVED')
    })

    test('A7: Create PO from approved RFQ', async () => {
      const res = await request(app)
        .post('/api/procurement/purchase-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          rfqId,
          paymentTerms: 'NET 30',
          expectedDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          items: [{
            inventoryItemId,
            description: 'HVAC Air Filter 16x20 E2E',
            quantity: 10,
            unitPrice: 350,
            unit: 'Piece',
            taxRate: 12,
          }],
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.po.status).toBe('DRAFT')
      expect(res.body.data.po.totalAmount).toBeGreaterThan(0)
      poId = res.body.data.po.id
    })

    test('A8: Submit PO for approval → PENDING_APPROVAL', async () => {
      const res = await request(app)
        .post(`/api/procurement/purchase-orders/${poId}/submit`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.po.status).toBe('PENDING_APPROVAL')
    })

    test('A9: Manager approves PO → APPROVED', async () => {
      const res = await request(app)
        .post(`/api/procurement/purchase-orders/${poId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ notes: 'E2E PO approval' })

      expect(res.statusCode).toBe(200)
      expect(res.body.data.po.status).toBe('APPROVED')
    })

    test('A10: Receive goods → creates inventory batch + stock movement', async () => {
      const poRes = await request(app)
        .get(`/api/procurement/purchase-orders/${poId}`)
        .set('Authorization', `Bearer ${staffToken}`)

      const poItemId = poRes.body.data.po.items[0]?.id

      const res = await request(app)
        .post(`/api/procurement/purchase-orders/${poId}/receive`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          receivedDate: new Date().toISOString(),
          notes: 'E2E goods received — all OK',
          items: [{
            poItemId,
            receivedQty: 10,
            acceptedQty: 10,
            rejectedQty: 0,
            unitCost: 350,
          }],
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.receiving).toBeDefined()
      expect(res.body.data.newPOStatus).toBe('RECEIVED')
      receivingId = res.body.data.receiving.id
    })
  })

  // ═══════════════════════════════════════════════════════
  // PHASE B: VERIFY INVENTORY STATE
  // ═══════════════════════════════════════════════════════

  describe('Phase B — Inventory State Verification', () => {
    test('B1: Inventory item currentStock should be 10 after receiving', async () => {
      const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } })
      expect(item.currentStock).toBe(10)
    })

    test('B2: Inventory batch should be created with ACTIVE status', async () => {
      const batches = await prisma.inventoryBatch.findMany({
        where: { inventoryItemId, status: 'ACTIVE' },
      })
      expect(batches.length).toBeGreaterThan(0)
      expect(batches[0].remainingQty).toBe(10)
      expect(batches[0].unitCost).toBe(350)
      batchId = batches[0].id
    })

    test('B3: StockMovement IN should exist for the receiving', async () => {
      const movement = await prisma.stockMovement.findFirst({
        where: {
          inventoryItemId,
          movementType: 'IN',
          source: 'PURCHASE_ORDER',
        },
      })
      expect(movement).not.toBeNull()
      expect(movement.quantity).toBe(10)
      expect(movement.totalCost).toBe(3500)
    })

    test('B4: Low stock check — 10 items, reorder at 5 — should NOT be low stock', async () => {
      const res = await request(app)
        .get('/api/inventory/low-stock')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const lowItem = res.body.data.lowStock.find((i) => i.id === inventoryItemId)
      expect(lowItem).toBeUndefined() // Should NOT appear in low stock
    })

    test('B5: Inventory API returns updated item details', async () => {
      const res = await request(app)
        .get(`/api/inventory/${inventoryItemId}`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.item.currentStock).toBe(10)
      expect(res.body.data.item.isLowStock).toBe(false)
      expect(res.body.data.item.batches.length).toBeGreaterThan(0)
    })
  })

  // ═══════════════════════════════════════════════════════
  // PHASE C: ASSET MANAGEMENT
  // ═══════════════════════════════════════════════════════

  describe('Phase C — Asset Conversion & Management', () => {
    test('C1: Convert inventory batch → Asset (deducts 1 unit from stock)', async () => {
      const res = await request(app)
        .post('/api/assets/convert')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          inventoryItemId,
          batchId,
          assetCode: 'E2E-ASSET-001',
          name: 'E2E HVAC Filter Unit (Installed)',
          category: 'HVAC Equipment',
          location: 'Floor 2 - Server Room',
          department: 'Maintenance',
          serialNumber: 'SN-E2E-0001',
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.asset.assetCode).toBe('E2E-ASSET-001')
      expect(res.body.data.asset.inventoryItemId).toBe(inventoryItemId)
      expect(res.body.data.asset.batchId).toBe(batchId)
      expect(res.body.data.asset.status).toBe('ACTIVE')
      assetId = res.body.data.asset.id
    })

    test('C2: Stock should be 9 after conversion (1 deducted)', async () => {
      const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } })
      expect(item.currentStock).toBe(9)
    })

    test('C3: Batch remainingQty should be 9', async () => {
      const batch = await prisma.inventoryBatch.findUnique({ where: { id: batchId } })
      expect(batch.remainingQty).toBe(9)
    })

    test('C4: StockMovement OUT (conversion) should exist', async () => {
      const mov = await prisma.stockMovement.findFirst({
        where: { inventoryItemId, movementType: 'OUT', source: 'MANUAL_ADJUSTMENT' },
        orderBy: { createdAt: 'desc' },
      })
      expect(mov).not.toBeNull()
      expect(mov.quantity).toBe(1)
    })

    test('C5: Asset log shows CONVERTED_FROM_INVENTORY', async () => {
      const log = await prisma.assetLog.findFirst({
        where: { assetId, action: 'CONVERTED_FROM_INVENTORY' },
      })
      expect(log).not.toBeNull()
      expect(log.description).toContain('E2E-SKU-001')
    })

    test('C6: Create preventive maintenance schedule for asset', async () => {
      const res = await request(app)
        .post('/api/assets/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          assetId,
          title: 'E2E Quarterly Filter Maintenance',
          description: 'Replace HVAC filter and inspect unit',
          frequencyDays: 90,
          nextDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          estimatedHours: 2,
          assignedTo: techUser.id,
        })

      expect(res.statusCode).toBe(201)
      scheduleId = res.body.data.schedule.id
    })
  })

  // ═══════════════════════════════════════════════════════
  // PHASE D: MRO WORK ORDER LIFECYCLE
  // ═══════════════════════════════════════════════════════

  describe('Phase D — MRO Work Order Lifecycle', () => {
    test('D1: Create corrective work order for asset', async () => {
      const res = await request(app)
        .post('/api/mro')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'E2E: HVAC Filter Replacement — Floor 2',
          description: 'Filter is clogged. Replace immediately.',
          type: 'CORRECTIVE',
          priority: 'HIGH',
          assetId,
          scheduleId,
          assignedToId: techUser.id,
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          estimatedHours: 2,
          safetyNotes: 'Power off HVAC before filter removal. Use PPE.',
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.workOrder.status).toBe('DRAFT')
      workOrderId = res.body.data.workOrder.id
    })

    test('D2: Open work order → asset becomes UNDER_MAINTENANCE', async () => {
      const res = await request(app)
        .post(`/api/mro/${workOrderId}/open`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.workOrder.status).toBe('OPEN')

      // Asset should now be UNDER_MAINTENANCE
      const asset = await prisma.asset.findUnique({ where: { id: assetId } })
      expect(asset.status).toBe('UNDER_MAINTENANCE')
    })

    test('D3: Start work order → IN_PROGRESS', async () => {
      const res = await request(app)
        .post(`/api/mro/${workOrderId}/start`)
        .set('Authorization', `Bearer ${techToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.workOrder.status).toBe('IN_PROGRESS')
    })

    test('D4: Add maintenance log entry', async () => {
      const res = await request(app)
        .post(`/api/mro/${workOrderId}/logs`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({
          description: 'Removed old filter. Heavy dust accumulation found. Installing new filter.',
          hoursSpent: 1.5,
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.log.hoursSpent).toBe(1.5)
    })

    test('D5: Add parts — deducts from inventory', async () => {
      const stockBefore = (await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } })).currentStock

      const res = await request(app)
        .post(`/api/mro/${workOrderId}/parts`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({
          inventoryItemId,
          partName: 'HVAC Air Filter 16x20 E2E',
          quantity: 1,
          unitCost: 350,
          batchId,
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.part.totalCost).toBe(350)

      // Inventory should be reduced
      const stockAfter = (await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } })).currentStock
      expect(stockAfter).toBe(stockBefore - 1)
    })

    test('D6: Complete work order → asset restored to ACTIVE, schedule advanced', async () => {
      const scheduleBefore = await prisma.maintenanceSchedule.findUnique({ where: { id: scheduleId } })

      const res = await request(app)
        .post(`/api/mro/${workOrderId}/complete`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          completionNotes: 'Filter replaced successfully. Unit running at full capacity. No leaks found.',
          actualHours: 2.0,
          laborCost: 800,
          advanceSchedule: true,
        })

      expect(res.statusCode).toBe(200)
      expect(res.body.data.workOrder.status).toBe('COMPLETED')
      expect(res.body.data.workOrder.actualHours).toBe(2.0)
      expect(res.body.data.workOrder.laborCost).toBe(800)
      expect(res.body.data.workOrder.partsCost).toBe(350)
      expect(res.body.data.workOrder.totalCost).toBe(1150)

      // Asset restored to ACTIVE
      const asset = await prisma.asset.findUnique({ where: { id: assetId } })
      expect(asset.status).toBe('ACTIVE')

      // Schedule should be advanced (nextDue should be ~90 days from now)
      const scheduleAfter = await prisma.maintenanceSchedule.findUnique({ where: { id: scheduleId } })
      expect(scheduleAfter.lastPerformed).not.toBeNull()
      const daysDiff = Math.round((new Date(scheduleAfter.nextDue) - new Date()) / (1000 * 60 * 60 * 24))
      expect(daysDiff).toBeGreaterThanOrEqual(88)
      expect(daysDiff).toBeLessThanOrEqual(92)
    })

    test('D7: Verify asset log shows ACTIVE restoration', async () => {
      const log = await prisma.assetLog.findFirst({
        where: { assetId, action: 'STATUS_CHANGE', newStatus: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
      })
      expect(log).not.toBeNull()
      expect(log.description).toContain('completed')
    })

    test('D8: Cannot complete already-completed work order', async () => {
      const res = await request(app)
        .post(`/api/mro/${workOrderId}/complete`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ completionNotes: 'Should fail', actualHours: 1 })

      expect(res.statusCode).toBe(400)
    })
  })

  // ═══════════════════════════════════════════════════════
  // PHASE E: FINAL STATE VERIFICATION
  // ═══════════════════════════════════════════════════════

  describe('Phase E — Final State Verification', () => {
    test('E1: PO final status is RECEIVED', async () => {
      const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } })
      expect(po.status).toBe('RECEIVED')
    })

    test('E2: Total inventory stock should be 8 (10 received - 1 converted - 1 part used)', async () => {
      const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } })
      expect(item.currentStock).toBe(8)
    })

    test('E3: Asset is ACTIVE with correct traceability to batch', async () => {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        include: { batch: true, inventoryItem: true },
      })
      expect(asset.status).toBe('ACTIVE')
      expect(asset.batch.batchNumber).toBeDefined()
      expect(asset.inventoryItem.sku).toBe('E2E-SKU-001')
    })

    test('E4: Work order has correct cost breakdown', async () => {
      const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId } })
      expect(wo.status).toBe('COMPLETED')
      expect(wo.partsCost).toBe(350)
      expect(wo.laborCost).toBe(800)
      expect(wo.totalCost).toBe(1150)
      expect(wo.actualHours).toBe(2.0)
    })

    test('E5: All stock movements are traceable', async () => {
      const movements = await prisma.stockMovement.findMany({
        where: { inventoryItemId },
        orderBy: { createdAt: 'asc' },
      })
      const types = movements.map((m) => `${m.movementType}:${m.source}`)
      expect(types).toContain('IN:PURCHASE_ORDER')     // From PO receiving
      expect(types).toContain('OUT:MANUAL_ADJUSTMENT') // From batch→asset conversion
      expect(types).toContain('OUT:MRO_WORK_ORDER')    // From WO parts usage
    })

    test('E6: Audit log has entries for all major workflow steps', async () => {
      const logs = await prisma.auditLog.findMany({
        where: { userEmail: { in: ['e2e.admin@test.com', 'e2e.manager@test.com', 'e2e.staff@test.com', 'e2e.tech@test.com'] } },
        orderBy: { createdAt: 'asc' },
      })
      const actions = logs.map((l) => l.action)
      const modules = [...new Set(logs.map((l) => l.module))]

      expect(actions).toContain('CREATE')
      expect(actions).toContain('APPROVE')
      expect(actions).toContain('WORKFLOW_CHANGE')
      expect(modules).toContain('PROCUREMENT')
      expect(modules).toContain('INVENTORY')
      expect(modules).toContain('ASSETS')
      expect(modules).toContain('MRO')
    })
  })

  // ═══════════════════════════════════════════════════════
  // PHASE F: VALIDATION ENGINE ON OUR WORKFLOW
  // ═══════════════════════════════════════════════════════

  describe('Phase F — Validation Engine Against E2E Data', () => {
    test('F1: Inventory validation finds no issues with our items', async () => {
      const res = await request(app)
        .get('/api/validation/run/inventory')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      // Our E2E item should be clean — no negative stock, no mismatch
      const ourIssues = res.body.data.issues.filter((i) =>
        i.entityId === inventoryItemId || i.message?.includes('E2E-SKU-001')
      )
      expect(ourIssues).toHaveLength(0)
    })

    test('F2: Asset validation finds no issues with our asset', async () => {
      const res = await request(app)
        .get('/api/validation/run/assets')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const ourIssues = res.body.data.issues.filter((i) =>
        i.entityId === assetId || i.message?.includes('E2E-ASSET-001')
      )
      expect(ourIssues).toHaveLength(0)
    })

    test('F3: MRO validation finds no issues with our completed WO', async () => {
      const res = await request(app)
        .get('/api/validation/run/mro')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const ourIssues = res.body.data.issues.filter((i) => i.entityId === workOrderId)
      expect(ourIssues).toHaveLength(0)
    })

    test('F4: Full validation runs without 500 error', async () => {
      const res = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data).toHaveProperty('systemHealth')
      expect(res.body.data).toHaveProperty('summary')
      expect(res.body.data.systemHealth.score).toBeGreaterThanOrEqual(0)
      expect(res.body.data.systemHealth.score).toBeLessThanOrEqual(100)
      expect(res.body.data.executionTimeMs).toBeGreaterThan(0)
    })

    test('F5: Dashboard report returns data from our workflow', async () => {
      const res = await request(app)
        .get('/api/reports/dashboard')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const r = res.body.data.report
      // At least 1 completed WO this month
      expect(r.mro.completedThisMonth).toBeGreaterThanOrEqual(1)
    })
  })
})
