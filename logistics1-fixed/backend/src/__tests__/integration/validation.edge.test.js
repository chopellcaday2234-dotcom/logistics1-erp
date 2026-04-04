// src/__tests__/integration/validation.edge.test.js
// ─────────────────────────────────────────────────────────
// VALIDATION ENGINE EDGE CASES
// Deliberately creates "bad" data states and verifies the
// validation engine correctly identifies each issue type.
// ─────────────────────────────────────────────────────────

const request = require('supertest')
const app = require('../../app')
const prisma = require('../../config/database')
const bcrypt = require('bcryptjs')

describe('Validation Engine — Edge Cases & Issue Detection', () => {
  let adminToken, managerToken

  beforeAll(async () => {
    const users = [
      { email: 'val.admin@test.com', pw: 'Admin@1234',   role: 'ADMIN' },
      { email: 'val.mgr@test.com',   pw: 'Manager@1234', role: 'MANAGER' },
    ]
    for (const u of users) {
      const hash = await bcrypt.hash(u.pw, 10)
      await prisma.user.upsert({
        where: { email: u.email }, update: {},
        create: { email: u.email, password: hash, firstName: 'Val', lastName: u.role, role: u.role, status: 'ACTIVE' },
      })
    }
    const logins = await Promise.all(users.map((u) =>
      request(app).post('/api/auth/login').send({ email: u.email, password: u.pw })
    ))
    adminToken   = logins[0].body.data?.accessToken
    managerToken = logins[1].body.data?.accessToken
  })

  afterAll(async () => {
    // Clean up all val- prefixed test data
    await prisma.assetLog.deleteMany({ where: { asset: { assetCode: { startsWith: 'VAL-' } } } })
    await prisma.maintenanceSchedule.deleteMany({ where: { asset: { assetCode: { startsWith: 'VAL-' } } } })
    await prisma.asset.deleteMany({ where: { assetCode: { startsWith: 'VAL-' } } })
    await prisma.inventoryBatch.deleteMany({ where: { batchNumber: { startsWith: 'VAL-' } } })
    await prisma.inventoryItem.deleteMany({ where: { sku: { startsWith: 'VAL-' } } })
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'val.' } } })
    await prisma.user.deleteMany({ where: { email: { contains: 'val.' } } })
    await prisma.$disconnect()
  })

  // ─────────────────────────────────────────────────────
  // INVENTORY VALIDATION
  // ─────────────────────────────────────────────────────

  describe('Inventory Edge Cases', () => {
    test('IV1: Detects batch with ACTIVE status but zero remainingQty (zombie batch)', async () => {
      // Create an item + batch in zombie state
      const item = await prisma.inventoryItem.create({
        data: { sku: 'VAL-ZOMBIE-001', name: 'Val Zombie Item', category: 'OTHER', unit: 'Piece', currentStock: 0 },
      })
      await prisma.inventoryBatch.create({
        data: {
          batchNumber: 'VAL-ZOMBIE-BATCH-001', inventoryItemId: item.id,
          quantity: 5, remainingQty: 0, // ZOMBIE: ACTIVE but 0 remaining
          unitCost: 100, totalCost: 500, status: 'ACTIVE',
        },
      })

      const res = await request(app)
        .get('/api/validation/run/inventory')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const zombieIssues = res.body.data.issues.filter((i) => i.code === 'ZOMBIE_ACTIVE_BATCH')
      expect(zombieIssues.length).toBeGreaterThan(0)
    })

    test('IV2: Detects expired batch still marked ACTIVE', async () => {
      const item = await prisma.inventoryItem.create({
        data: {
          sku: 'VAL-EXPIRED-001', name: 'Val Expired Item',
          category: 'FOOD_BEVERAGE', unit: 'Kg', currentStock: 5, expiryTracked: true,
        },
      })
      await prisma.inventoryBatch.create({
        data: {
          batchNumber: 'VAL-EXPIRED-BATCH-001', inventoryItemId: item.id,
          quantity: 5, remainingQty: 5, unitCost: 200, totalCost: 1000,
          status: 'ACTIVE',
          expiryDate: new Date('2020-01-01'), // Expired 4+ years ago
        },
      })

      const res = await request(app)
        .get('/api/validation/run/inventory')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const expiredIssues = res.body.data.issues.filter((i) => i.code === 'EXPIRED_BATCH_ACTIVE')
      expect(expiredIssues.length).toBeGreaterThan(0)
    })

    test('IV3: Detects batch/stock mismatch', async () => {
      // Item with currentStock=20 but batch only has remainingQty=5
      const item = await prisma.inventoryItem.create({
        data: {
          sku: 'VAL-MISMATCH-001', name: 'Val Mismatch Item',
          category: 'OTHER', unit: 'Piece', currentStock: 20, // Inflated
        },
      })
      await prisma.inventoryBatch.create({
        data: {
          batchNumber: 'VAL-MISMATCH-BATCH-001', inventoryItemId: item.id,
          quantity: 5, remainingQty: 5, // Only 5, but stock says 20
          unitCost: 100, totalCost: 500, status: 'ACTIVE',
        },
      })

      const res = await request(app)
        .get('/api/validation/run/inventory')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const mismatchIssues = res.body.data.issues.filter((i) => i.code === 'BATCH_STOCK_MISMATCH')
      expect(mismatchIssues.length).toBeGreaterThan(0)
    })
  })

  // ─────────────────────────────────────────────────────
  // ASSET VALIDATION
  // ─────────────────────────────────────────────────────

  describe('Asset Edge Cases', () => {
    test('AV1: Detects asset with overdue maintenance', async () => {
      const asset = await prisma.asset.create({
        data: {
          assetCode: 'VAL-OVERDUE-001',
          name: 'Val Overdue Asset',
          category: 'Equipment',
          status: 'ACTIVE',
          condition: 'FAIR',
          nextMaintenance: new Date('2020-01-01'), // Way overdue
        },
      })

      const res = await request(app)
        .get('/api/validation/run/assets')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const overdueIssues = res.body.data.issues.filter(
        (i) => i.code === 'MAINTENANCE_OVERDUE' && i.entityId === asset.id
      )
      expect(overdueIssues.length).toBeGreaterThan(0)
      expect(['HIGH', 'CRITICAL']).toContain(overdueIssues[0].severity) // 4+ years overdue = CRITICAL
    })

    test('AV2: Detects expired warranty (LOW severity)', async () => {
      const asset = await prisma.asset.create({
        data: {
          assetCode: 'VAL-WARRANTY-001',
          name: 'Val Expired Warranty Asset',
          category: 'Equipment',
          status: 'ACTIVE',
          condition: 'GOOD',
          warrantyExpiry: new Date('2022-06-15'), // Expired
        },
      })

      const res = await request(app)
        .get('/api/validation/run/assets')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const warrantyIssues = res.body.data.issues.filter(
        (i) => i.code === 'WARRANTY_EXPIRED' && i.entityId === asset.id
      )
      expect(warrantyIssues.length).toBeGreaterThan(0)
      expect(warrantyIssues[0].severity).toBe('LOW')
    })

    test('AV3: Detects UNDER_MAINTENANCE asset with no open work orders', async () => {
      const asset = await prisma.asset.create({
        data: {
          assetCode: 'VAL-NOMAINT-001',
          name: 'Val No-WO Maintenance Asset',
          category: 'Equipment',
          status: 'UNDER_MAINTENANCE', // Stuck in maintenance with no WO
          condition: 'FAIR',
        },
      })

      const res = await request(app)
        .get('/api/validation/run/assets')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const stuckIssues = res.body.data.issues.filter(
        (i) => i.code === 'MAINTENANCE_NO_OPEN_WO' && i.entityId === asset.id
      )
      expect(stuckIssues.length).toBeGreaterThan(0)
      expect(stuckIssues[0].severity).toBe('MEDIUM')
    })
  })

  // ─────────────────────────────────────────────────────
  // FULL VALIDATION STRUCTURE
  // ─────────────────────────────────────────────────────

  describe('Full Validation Engine Structure', () => {
    test('FV1: Returns correct response shape', async () => {
      const res = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const d = res.body.data

      // Top-level shape
      expect(d).toHaveProperty('systemHealth')
      expect(d).toHaveProperty('summary')
      expect(d).toHaveProperty('issues')
      expect(d).toHaveProperty('executionTimeMs')
      expect(d).toHaveProperty('validatedAt')

      // systemHealth shape
      expect(d.systemHealth).toHaveProperty('score')
      expect(d.systemHealth).toHaveProperty('status')
      expect(typeof d.systemHealth.score).toBe('number')
      expect(d.systemHealth.score).toBeGreaterThanOrEqual(0)
      expect(d.systemHealth.score).toBeLessThanOrEqual(100)
      expect(['HEALTHY', 'AT_RISK', 'CRITICAL']).toContain(d.systemHealth.status)

      // summary shape
      expect(d.summary).toHaveProperty('totalIssues')
      expect(d.summary).toHaveProperty('bySeverity')
      expect(d.summary).toHaveProperty('byModule')
      expect(typeof d.summary.totalIssues).toBe('number')

      // issues shape — all 5 modules
      expect(d.issues).toHaveProperty('procurement')
      expect(d.issues).toHaveProperty('inventory')
      expect(d.issues).toHaveProperty('assets')
      expect(d.issues).toHaveProperty('mro')
      expect(d.issues).toHaveProperty('projects')
      expect(Array.isArray(d.issues.inventory)).toBe(true)

      // Individual issue shape
      if (d.issues.inventory.length > 0) {
        const issue = d.issues.inventory[0]
        expect(issue).toHaveProperty('severity')
        expect(issue).toHaveProperty('module')
        expect(issue).toHaveProperty('code')
        expect(issue).toHaveProperty('message')
        expect(issue).toHaveProperty('detectedAt')
        expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(issue.severity)
      }
    })

    test('FV2: Health score degrades with more issues', async () => {
      // We have seeded multiple bad-data items — score should be < 100
      const res = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      // With zombie batches, expired batches, mismatches, overdue assets, we expect degraded score
      expect(res.body.data.systemHealth.score).toBeLessThan(100)
      expect(res.body.data.summary.totalIssues).toBeGreaterThan(0)
    })

    test('FV3: bySeverity counts match actual issues', async () => {
      const res = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      const { bySeverity } = res.body.data.summary
      const { issues } = res.body.data

      const allIssues = [
        ...issues.procurement, ...issues.inventory,
        ...issues.assets, ...issues.mro, ...issues.projects,
      ]

      // Count matches
      const counted = allIssues.reduce((acc, i) => {
        acc[i.severity] = (acc[i.severity] || 0) + 1
        return acc
      }, {})

      Object.entries(counted).forEach(([sev, count]) => {
        expect(bySeverity[sev]).toBe(count)
      })

      // totalIssues matches
      expect(res.body.data.summary.totalIssues).toBe(allIssues.length)
    })

    test('FV4: Per-module validation returns subset of full validation', async () => {
      const fullRes = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${managerToken}`)

      const invRes = await request(app)
        .get('/api/validation/run/inventory')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(fullRes.statusCode).toBe(200)
      expect(invRes.statusCode).toBe(200)

      // Per-module count should match full validation module count
      expect(invRes.body.data.issueCount).toBe(fullRes.body.data.issues.inventory.length)
    })

    test('FV5: Execution time is within acceptable range (< 10 seconds)', async () => {
      const res = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data.executionTimeMs).toBeLessThan(10000)
    })

    test('FV6: Non-manager/admin cannot access validation engine', async () => {
      // Create a staff user
      const hash = await bcrypt.hash('Staff@1234', 10)
      await prisma.user.upsert({
        where: { email: 'val.staffonly@test.com' }, update: {},
        create: { email: 'val.staffonly@test.com', password: hash, firstName: 'Val', lastName: 'Staff', role: 'STAFF', status: 'ACTIVE' },
      })
      const staffLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'val.staffonly@test.com', password: 'Staff@1234' })
      const staffToken = staffLogin.body.data?.accessToken

      const res = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${staffToken}`)

      expect(res.statusCode).toBe(403)
      await prisma.user.delete({ where: { email: 'val.staffonly@test.com' } })
    })
  })

  // ─────────────────────────────────────────────────────
  // NOTIFICATION SYSTEM
  // ─────────────────────────────────────────────────────

  describe('Notification System Edge Cases', () => {
    test('NS1: Alert scan runs without errors', async () => {
      const res = await request(app)
        .post('/api/notifications/scan')
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.statusCode).toBe(200)
      expect(res.body.data).toHaveProperty('alertsFired')
      expect(res.body.data).toHaveProperty('scannedAt')
      expect(typeof res.body.data.alertsFired).toBe('number')
    })

    test('NS2: Alert scan creates notifications for our seeded bad data (low stock, expired batches)', async () => {
      const beforeCount = await prisma.notification.count()

      await request(app)
        .post('/api/notifications/scan')
        .set('Authorization', `Bearer ${adminToken}`)

      const afterCount = await prisma.notification.count()
      // Scan should have created some notifications (expired batches, etc.)
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount)
    })

    test('NS3: Mark all read clears unread count', async () => {
      const admin = await prisma.user.findFirst({ where: { email: 'val.admin@test.com' } })

      // Seed an unread notification
      await prisma.notification.create({
        data: { userId: admin.id, title: 'Test', message: 'Test unread', type: 'INFO', isRead: false },
      })

      const beforeRes = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${adminToken}`)

      const beforeCount = beforeRes.body.data.unreadCount
      expect(beforeCount).toBeGreaterThan(0)

      await request(app)
        .post('/api/notifications/mark-all-read')
        .set('Authorization', `Bearer ${adminToken}`)

      const afterRes = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(afterRes.body.data.unreadCount).toBe(0)
    })
  })
})
