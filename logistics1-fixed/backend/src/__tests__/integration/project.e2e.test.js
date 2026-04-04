// src/__tests__/integration/project.e2e.test.js
// ─────────────────────────────────────────────────────────
// END-TO-END WORKFLOW: Project → Material Consumption → Budget → Validation
// Tests:
//   1. Create project
//   2. Add tasks, risks, communications
//   3. Consume materials (deducts inventory, creates movement, updates actualCost)
//   4. Validate budget tracking
//   5. Generate budget report
//   6. Validate project traceability in validation engine
// ─────────────────────────────────────────────────────────

const request = require('supertest')
const app = require('../../app')
const prisma = require('../../config/database')
const bcrypt = require('bcryptjs')

describe('E2E: Project → Material Consumption → Budget Workflow', () => {
  let managerToken, staffToken
  let projectId, taskId, riskId
  let inventoryItemId, batchId
  const PROJ_CODE = 'E2E-PROJ-001'
  const ITEM_SKU  = 'E2E-PROJ-ITEM-001'

  beforeAll(async () => {
    const users = [
      { email: 'prje2e.manager@test.com', pw: 'Manager@1234', role: 'MANAGER' },
      { email: 'prje2e.staff@test.com',   pw: 'Staff@1234',   role: 'STAFF' },
    ]
    for (const u of users) {
      const hash = await bcrypt.hash(u.pw, 10)
      await prisma.user.upsert({
        where: { email: u.email }, update: {},
        create: { email: u.email, password: hash, firstName: 'ProjE2E', lastName: u.role, role: u.role, status: 'ACTIVE' },
      })
    }
    const logins = await Promise.all(users.map((u) =>
      request(app).post('/api/auth/login').send({ email: u.email, password: u.pw })
    ))
    managerToken = logins[0].body.data?.accessToken
    staffToken   = logins[1].body.data?.accessToken

    // Seed inventory
    const item = await prisma.inventoryItem.create({
      data: {
        sku: ITEM_SKU, name: 'E2E Project Paint',
        category: 'MAINTENANCE', unit: 'Liter',
        currentStock: 50, averageCost: 280,
      },
    })
    inventoryItemId = item.id

    const batch = await prisma.inventoryBatch.create({
      data: {
        batchNumber: 'E2E-PROJ-BATCH-001', inventoryItemId: item.id,
        quantity: 50, remainingQty: 50, unitCost: 280, totalCost: 14000,
        status: 'ACTIVE',
      },
    })
    batchId = batch.id
  })

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { inventoryItem: { sku: ITEM_SKU } } })
    await prisma.projectMaterial.deleteMany({ where: { project: { projectCode: PROJ_CODE } } })
    await prisma.projectCommunication.deleteMany({ where: { project: { projectCode: PROJ_CODE } } })
    await prisma.projectRisk.deleteMany({ where: { project: { projectCode: PROJ_CODE } } })
    await prisma.projectTask.deleteMany({ where: { project: { projectCode: PROJ_CODE } } })
    await prisma.project.deleteMany({ where: { projectCode: PROJ_CODE } })
    await prisma.inventoryBatch.deleteMany({ where: { batchNumber: 'E2E-PROJ-BATCH-001' } })
    await prisma.inventoryItem.deleteMany({ where: { sku: ITEM_SKU } })
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'prje2e.' } } })
    await prisma.user.deleteMany({ where: { email: { contains: 'prje2e.' } } })
    await prisma.$disconnect()
  })

  describe('Project Setup', () => {
    test('P1: Create project with budget', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectCode: PROJ_CODE,
          name: 'E2E Hotel Room Renovation',
          description: 'Full renovation of rooms 201-210.',
          status: 'ACTIVE',
          budget: 150000,
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
          location: 'Floor 2',
          department: 'Operations',
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.project.budget).toBe(150000)
      expect(res.body.data.project.actualCost).toBe(0)
      projectId = res.body.data.project.id
    })

    test('P2: Add project tasks', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ title: 'Procure paint and supplies', priority: 'HIGH', status: 'TODO' })

      expect(res.statusCode).toBe(201)
      taskId = res.body.data.task.id
    })

    test('P3: Add project risk', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/risks`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Material price fluctuation',
          level: 'MEDIUM',
          status: 'OPEN',
          mitigation: 'Lock in prices via signed POs early',
        })

      expect(res.statusCode).toBe(201)
      riskId = res.body.data.risk.id
    })

    test('P4: Log project communication', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/communications`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          subject: 'Kickoff Meeting — Room 201-210',
          message: 'All contractors aligned. Work begins Monday.',
          recipients: 'gm@hotel.com, ops@hotel.com',
        })

      expect(res.statusCode).toBe(201)
    })
  })

  describe('Material Consumption', () => {
    test('M1: First material consumption — 20 liters of paint', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/materials`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          inventoryItemId,
          batchId,
          quantityUsed: 20,
          notes: 'Used for rooms 201-205 — first coat',
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.material.quantityUsed).toBe(20)
      expect(res.body.data.material.totalCost).toBe(5600) // 20 * 280
      expect(res.body.data.item.newStock).toBe(30) // 50 - 20
    })

    test('M2: Project actualCost updated after consumption', async () => {
      const proj = await prisma.project.findUnique({ where: { id: projectId } })
      expect(proj.actualCost).toBe(5600)
    })

    test('M3: Stock movement created with project reference', async () => {
      const mov = await prisma.stockMovement.findFirst({
        where: { inventoryItemId, movementType: 'OUT', source: 'PROJECT', projectId },
      })
      expect(mov).not.toBeNull()
      expect(mov.quantity).toBe(20)
      expect(mov.referenceNumber).toBe(PROJ_CODE)
    })

    test('M4: Second consumption — 15 more liters', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/materials`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          inventoryItemId,
          batchId,
          quantityUsed: 15,
          notes: 'Used for rooms 206-210 — second coat',
        })

      expect(res.statusCode).toBe(201)
      expect(res.body.data.item.newStock).toBe(15) // 30 - 15
    })

    test('M5: Cumulative actualCost is correct (5600 + 4200 = 9800)', async () => {
      const proj = await prisma.project.findUnique({ where: { id: projectId } })
      expect(proj.actualCost).toBe(9800) // 5600 + 4200
    })

    test('M6: Cannot consume more than available stock', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/materials`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ inventoryItemId, quantityUsed: 9999, notes: 'Should fail' })

      expect(res.statusCode).toBe(400)
      expect(res.body.message).toContain('Insufficient stock')
    })

    test('M7: Materials list shows both consumptions with correct totals', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/materials`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.materials.length).toBe(2)
      expect(res.body.data.totalMaterialCost).toBe(9800)
    })
  })

  describe('Budget Report & Analytics', () => {
    test('B1: Budget report shows material costs', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/budget-report`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const report = res.body.data.report
      expect(report.costs.materialCost).toBe(9800)
      expect(report.costs.totalActual).toBe(9800)
      expect(report.budgetUsedPct).toBe(7) // 9800/150000 * 100 ≈ 6.5 → 7
      expect(report.variance).toBeGreaterThan(0)
      expect(report.materialBreakdown.length).toBe(1)
    })

    test('B2: Project detail shows health score and task summary', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.statusCode).toBe(200)
      const proj = res.body.data.project
      expect(proj.health.score).toBeGreaterThan(0)
      expect(proj.health).toHaveProperty('status')
      expect(proj.taskSummary.total).toBe(1)
      expect(proj.taskSummary.completionPct).toBe(0) // Task still TODO
    })

    test('B3: Completing task updates taskSummary', async () => {
      await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'DONE' })

      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.body.data.project.taskSummary.completionPct).toBe(100)
      expect(res.body.data.project.taskSummary.done).toBe(1)
    })

    test('B4: Project stats include our project', async () => {
      const res = await request(app)
        .get('/api/projects/stats')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.stats.activeProjects).toBeGreaterThanOrEqual(1)
      expect(res.body.data.stats.totalBudget).toBeGreaterThanOrEqual(150000)
    })

    test('B5: Project material report includes our data', async () => {
      const res = await request(app)
        .get(`/api/reports/project-materials?projectId=${projectId}`)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.report.summary.totalCost).toBe(9800)
      expect(res.body.data.report.summary.totalUsageEvents).toBe(2)
    })
  })

  describe('Project Validation', () => {
    test('V1: Project validation finds no critical issues', async () => {
      const res = await request(app)
        .get('/api/validation/run/projects')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      // Our project should be ACTIVE with budget, tasks, and within budget — no critical issues expected from it
      const criticalIssues = res.body.data.issues.filter(
        (i) => i.severity === 'CRITICAL' && i.entityId === projectId
      )
      expect(criticalIssues).toHaveLength(0)
    })

    test('V2: Inventory validation shows no issues with our item', async () => {
      const res = await request(app)
        .get('/api/validation/run/inventory')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      // currentStock(15) should match batch remainingQty(15) — no mismatch
      const mismatch = res.body.data.issues.filter(
        (i) => i.code === 'BATCH_STOCK_MISMATCH' && i.message?.includes(ITEM_SKU)
      )
      expect(mismatch).toHaveLength(0)
    })

    test('V3: Mitigating risk and checking project health improves', async () => {
      await request(app)
        .patch(`/api/projects/${projectId}/risks/${riskId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'MITIGATED', mitigation: 'Prices locked via signed POs' })

      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${staffToken}`)

      // With task done and risk mitigated, health should be HEALTHY or AT_RISK
      const { health } = res.body.data.project
      expect(['HEALTHY', 'AT_RISK']).toContain(health.status)
    })
  })
})
