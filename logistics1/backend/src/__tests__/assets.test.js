// src/__tests__/assets.test.js
const request = require('supertest');
const app = require('../app');
const prisma = require('../config/database');
const bcrypt = require('bcryptjs');

describe('Asset Management Module', () => {
  let adminToken, managerToken, techToken, staffToken;
  let assetId, scheduleId;
  let inventoryItemId, batchId;

  beforeAll(async () => {
    const users = [
      { email: 'ast.admin@test.com',   password: 'Admin@1234',   role: 'ADMIN' },
      { email: 'ast.manager@test.com', password: 'Manager@1234', role: 'MANAGER' },
      { email: 'ast.tech@test.com',    password: 'Tech@1234',    role: 'TECHNICIAN' },
      { email: 'ast.staff@test.com',   password: 'Staff@1234',   role: 'STAFF' },
    ];
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: { email: u.email, password: hash, firstName: 'Asset', lastName: u.role, role: u.role, status: 'ACTIVE' },
      });
    }

    const logins = await Promise.all(users.map((u) =>
      request(app).post('/api/auth/login').send({ email: u.email, password: u.password })
    ));
    adminToken   = logins[0].body.data?.accessToken;
    managerToken = logins[1].body.data?.accessToken;
    techToken    = logins[2].body.data?.accessToken;
    staffToken   = logins[3].body.data?.accessToken;

    // Create test inventory item + batch for conversion tests
    const item = await prisma.inventoryItem.create({
      data: {
        sku: 'TEST-AST-ITEM-001',
        name: 'Test Equipment Item',
        category: 'EQUIPMENT',
        unit: 'Piece',
        currentStock: 5,
        averageCost: 2500,
      },
    });
    inventoryItemId = item.id;

    const batch = await prisma.inventoryBatch.create({
      data: {
        batchNumber: 'TEST-AST-BATCH-001',
        inventoryItemId: item.id,
        quantity: 5,
        remainingQty: 5,
        unitCost: 2500,
        totalCost: 12500,
        status: 'ACTIVE',
      },
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    await prisma.assetLog.deleteMany({ where: { asset: { assetCode: { startsWith: 'TEST-' } } } });
    await prisma.maintenanceSchedule.deleteMany({ where: { asset: { assetCode: { startsWith: 'TEST-' } } } });
    await prisma.asset.deleteMany({ where: { assetCode: { startsWith: 'TEST-' } } });
    await prisma.stockMovement.deleteMany({ where: { inventoryItem: { sku: { startsWith: 'TEST-AST-' } } } });
    await prisma.inventoryBatch.deleteMany({ where: { batchNumber: { startsWith: 'TEST-AST-' } } });
    await prisma.inventoryItem.deleteMany({ where: { sku: { startsWith: 'TEST-AST-' } } });
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'ast.' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'ast.' } } });
    await prisma.$disconnect();
  });

  // ─── Asset CRUD ───────────────────────────────────────────

  describe('Asset CRUD', () => {
    it('should create an asset', async () => {
      const res = await request(app)
        .post('/api/assets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          assetCode: 'TEST-ASSET-001',
          name: 'Test Commercial AC Unit',
          category: 'HVAC Equipment',
          location: 'Floor 2 — Server Room',
          department: 'IT',
          condition: 'EXCELLENT',
          manufacturer: 'Carrier',
          model: 'TestModel-X',
          purchaseCost: 85000,
          currentValue: 75000,
          purchaseDate: '2023-01-15',
          warrantyExpiry: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          nextMaintenance: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.asset.assetCode).toBe('TEST-ASSET-001');
      expect(res.body.data.asset.status).toBe('ACTIVE');
      assetId = res.body.data.asset.id;
    });

    it('should reject duplicate asset code', async () => {
      const res = await request(app)
        .post('/api/assets')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ assetCode: 'TEST-ASSET-001', name: 'Dupe', category: 'HVAC Equipment' });
      expect(res.statusCode).toBe(409);
    });

    it('should get asset by ID with full details', async () => {
      const res = await request(app)
        .get(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.asset).toHaveProperty('assetLogs');
      expect(res.body.data.asset).toHaveProperty('maintenanceSchedules');
      expect(res.body.data.asset).toHaveProperty('maintenanceOverdue');
      expect(res.body.data.asset).toHaveProperty('totalMaintenanceCost');
    });

    it('should list assets with filters', async () => {
      const res = await request(app)
        .get('/api/assets?category=HVAC')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.assets)).toBe(true);
    });

    it('should update asset details', async () => {
      const res = await request(app)
        .patch(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({ condition: 'GOOD', notes: 'Post-inspection update' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.asset.condition).toBe('GOOD');
    });

    it('should block direct status change via PATCH', async () => {
      const res = await request(app)
        .patch(`/api/assets/${assetId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'RETIRED' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Status Lifecycle ─────────────────────────────────────

  describe('Asset Status Lifecycle', () => {
    it('should transition ACTIVE → UNDER_MAINTENANCE', async () => {
      const res = await request(app)
        .post(`/api/assets/${assetId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'UNDER_MAINTENANCE', reason: 'Scheduled quarterly maintenance' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.asset.status).toBe('UNDER_MAINTENANCE');
    });

    it('should transition UNDER_MAINTENANCE → ACTIVE', async () => {
      const res = await request(app)
        .post(`/api/assets/${assetId}/status`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({ status: 'ACTIVE', reason: 'Maintenance complete. Passed inspection.' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.asset.status).toBe('ACTIVE');
    });

    it('should reject invalid status transition', async () => {
      const res = await request(app)
        .post(`/api/assets/${assetId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'DISPOSED', reason: 'Trying to skip to disposed' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid status transition');
    });

    it('should reject status change without reason', async () => {
      const res = await request(app)
        .post(`/api/assets/${assetId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'UNDER_MAINTENANCE' });
      expect(res.statusCode).toBe(400);
    });

    it('should reject same-status change', async () => {
      const res = await request(app)
        .post(`/api/assets/${assetId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'ACTIVE', reason: 'Trying same status' });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Batch → Asset Conversion ─────────────────────────────

  describe('Batch to Asset Conversion', () => {
    it('should convert an inventory batch to an asset', async () => {
      const res = await request(app)
        .post('/api/assets/convert')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          inventoryItemId,
          batchId,
          assetCode: 'TEST-ASSET-CONV-001',
          name: 'Converted Test Equipment',
          category: 'Equipment',
          location: 'Warehouse A',
          department: 'Operations',
          serialNumber: 'SN-TEST-0001',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.asset.inventoryItemId).toBe(inventoryItemId);
      expect(res.body.data.asset.batchId).toBe(batchId);
      expect(res.body.data.asset.status).toBe('ACTIVE');
    });

    it('should have decremented inventory stock after conversion', async () => {
      const invRes = await request(app)
        .get(`/api/inventory/${inventoryItemId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(invRes.body.data.item.currentStock).toBe(4); // was 5, now 4
    });

    it('should reject conversion with invalid batch', async () => {
      const res = await request(app)
        .post('/api/assets/convert')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          inventoryItemId,
          batchId: '00000000-0000-0000-0000-000000000000',
          assetCode: 'TEST-FAIL-001',
          name: 'Should Fail',
          category: 'Equipment',
        });
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── Asset Logs ───────────────────────────────────────────

  describe('Asset Logs', () => {
    it('should get asset logs', async () => {
      const res = await request(app)
        .get(`/api/assets/${assetId}/logs`)
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.logs)).toBe(true);
      expect(res.body.data.logs.length).toBeGreaterThan(0);
    });

    it('should add manual log entry', async () => {
      const res = await request(app)
        .post(`/api/assets/${assetId}/logs`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({ action: 'INSPECTION', description: 'Visual inspection passed. No visible wear.' });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.log.action).toBe('INSPECTION');
    });
  });

  // ─── Maintenance Schedules ────────────────────────────────

  describe('Maintenance Schedules', () => {
    it('should create a maintenance schedule', async () => {
      const res = await request(app)
        .post('/api/assets/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          assetId,
          title: 'Quarterly AC Service',
          description: 'Clean filters, check refrigerant, inspect connections.',
          frequencyDays: 90,
          nextDue: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          estimatedHours: 4,
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.schedule.frequencyDays).toBe(90);
      scheduleId = res.body.data.schedule.id;
    });

    it('should list schedules for an asset', async () => {
      const res = await request(app)
        .get(`/api/assets/schedules/all?assetId=${assetId}`)
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.schedules.some((s) => s.id === scheduleId)).toBe(true);
    });

    it('should advance schedule next due date', async () => {
      const completedDate = new Date().toISOString();
      const res = await request(app)
        .post(`/api/assets/schedules/${scheduleId}/advance`)
        .set('Authorization', `Bearer ${techToken}`)
        .send({ completedDate });
      expect(res.statusCode).toBe(200);
      // nextDue should be ~90 days from now
      const nextDue = new Date(res.body.data.schedule.nextDue);
      const daysDiff = Math.round((nextDue - new Date()) / (1000 * 60 * 60 * 24));
      expect(daysDiff).toBeGreaterThanOrEqual(88);
      expect(daysDiff).toBeLessThanOrEqual(92);
    });

    it('should reject schedule for retired asset', async () => {
      // Transition asset to RETIRED first
      await request(app)
        .post(`/api/assets/${assetId}/status`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'RETIRED', reason: 'End of service life for testing' });

      const res = await request(app)
        .post('/api/assets/schedules')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          assetId,
          title: 'Should Fail',
          frequencyDays: 30,
          nextDue: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Analytics ────────────────────────────────────────────

  describe('Analytics', () => {
    it('should return asset stats', async () => {
      const res = await request(app)
        .get('/api/assets/stats')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.stats).toHaveProperty('totalAssets');
      expect(res.body.data.stats).toHaveProperty('byStatus');
      expect(res.body.data.stats).toHaveProperty('maintenance');
      expect(res.body.data.stats).toHaveProperty('totalCurrentValue');
    });

    it('should return maintenance due report', async () => {
      const res = await request(app)
        .get('/api/assets/maintenance-report')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.report).toHaveProperty('overdue');
      expect(res.body.data.report).toHaveProperty('dueThisWeek');
      expect(res.body.data.report).toHaveProperty('summary');
    });
  });
});
