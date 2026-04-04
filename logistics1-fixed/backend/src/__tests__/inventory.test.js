// src/__tests__/inventory.test.js
const request = require('supertest');
const app = require('../app');
const prisma = require('../config/database');
const bcrypt = require('bcryptjs');

describe('Inventory Module', () => {
  let adminToken, managerToken, staffToken, techToken;
  let itemId, batchId;

  beforeAll(async () => {
    const roles = [
      { email: 'inv.admin@test.com',   password: 'Admin@1234',   role: 'ADMIN' },
      { email: 'inv.manager@test.com', password: 'Manager@1234', role: 'MANAGER' },
      { email: 'inv.staff@test.com',   password: 'Staff@1234',   role: 'STAFF' },
      { email: 'inv.tech@test.com',    password: 'Tech@1234',    role: 'TECHNICIAN' },
    ];

    for (const r of roles) {
      const hash = await bcrypt.hash(r.password, 10);
      await prisma.user.upsert({
        where: { email: r.email },
        update: {},
        create: { email: r.email, password: hash, firstName: 'Inv', lastName: r.role, role: r.role, status: 'ACTIVE' },
      });
    }

    const logins = await Promise.all(roles.map((r) =>
      request(app).post('/api/auth/login').send({ email: r.email, password: r.password })
    ));

    adminToken   = logins[0].body.data?.accessToken;
    managerToken = logins[1].body.data?.accessToken;
    staffToken   = logins[2].body.data?.accessToken;
    techToken    = logins[3].body.data?.accessToken;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { inventoryItem: { sku: { startsWith: 'TEST-' } } } });
    await prisma.inventoryBatch.deleteMany({ where: { inventoryItem: { sku: { startsWith: 'TEST-' } } } });
    await prisma.inventoryItem.deleteMany({ where: { sku: { startsWith: 'TEST-' } } });
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'inv.' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'inv.' } } });
    await prisma.$disconnect();
  });

  // ─── Item CRUD ────────────────────────────────────────────

  describe('Inventory Item CRUD', () => {
    it('should create an inventory item', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          sku: 'TEST-INV-001',
          name: 'Test Cleaning Cloth',
          category: 'CLEANING',
          unit: 'Piece',
          reorderPoint: 10,
          reorderQty: 20,
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.item.sku).toBe('TEST-INV-001');
      itemId = res.body.data.item.id;
    });

    it('should reject duplicate SKU', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ sku: 'TEST-INV-001', name: 'Dupe Item', unit: 'Piece' });
      expect(res.statusCode).toBe(409);
    });

    it('should list inventory items', async () => {
      const res = await request(app)
        .get('/api/inventory')
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.items)).toBe(true);
    });

    it('should get item by ID with batches and movements', async () => {
      const res = await request(app)
        .get(`/api/inventory/${itemId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.item.id).toBe(itemId);
      expect(res.body.data.item).toHaveProperty('batches');
      expect(res.body.data.item).toHaveProperty('isLowStock');
    });

    it('should update item reorder point', async () => {
      const res = await request(app)
        .patch(`/api/inventory/${itemId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ reorderPoint: 15, reorderQty: 30 });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.item.reorderPoint).toBe(15);
    });

    it('should filter items by category', async () => {
      const res = await request(app)
        .get('/api/inventory?category=CLEANING')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      res.body.data.items.forEach((i) => expect(i.category).toBe('CLEANING'));
    });
  });

  // ─── Stock Adjustments ────────────────────────────────────

  describe('Stock Adjustments', () => {
    it('should ADD stock via adjustment', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          inventoryItemId: itemId,
          adjustmentType: 'ADD',
          quantity: 50,
          unitCost: 25.00,
          reason: 'Initial stock load for testing',
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.item.newStock).toBe(50);
    });

    it('should REMOVE stock via adjustment', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          inventoryItemId: itemId,
          adjustmentType: 'REMOVE',
          quantity: 5,
          reason: 'Damaged goods disposal',
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.item.newStock).toBe(45);
    });

    it('should SET stock to exact quantity', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          inventoryItemId: itemId,
          adjustmentType: 'SET',
          quantity: 40,
          reason: 'Physical count reconciliation',
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.item.newStock).toBe(40);
    });

    it('should reject over-removal beyond current stock', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          inventoryItemId: itemId,
          adjustmentType: 'REMOVE',
          quantity: 9999,
          reason: 'Should fail',
        });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');
    });

    it('should reject SET to same quantity', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          inventoryItemId: itemId,
          adjustmentType: 'SET',
          quantity: 40,
          reason: 'Same value',
        });
      expect(res.statusCode).toBe(400);
    });

    it('should reject adjustment without reason', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ inventoryItemId: itemId, adjustmentType: 'ADD', quantity: 5 });
      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject staff from adjusting stock (RBAC)', async () => {
      const res = await request(app)
        .post('/api/inventory/adjust')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ inventoryItemId: itemId, adjustmentType: 'ADD', quantity: 5, reason: 'Test' });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── Stock Issuance (FIFO) ────────────────────────────────

  describe('Stock Issuance with FIFO', () => {
    it('should issue stock and auto-select FIFO batch', async () => {
      const res = await request(app)
        .post('/api/inventory/issue')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          inventoryItemId: itemId,
          quantity: 10,
          source: 'MANUAL_ADJUSTMENT',
          referenceNumber: 'TEST-ISSUE-001',
          notes: 'Test issue',
        });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.item.newStock).toBe(30);
    });

    it('should reject issuance exceeding available stock', async () => {
      const res = await request(app)
        .post('/api/inventory/issue')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          inventoryItemId: itemId,
          quantity: 9999,
          source: 'MANUAL_ADJUSTMENT',
        });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');
    });
  });

  // ─── Picking List ─────────────────────────────────────────

  describe('Picking List', () => {
    it('should create a picking list for multiple items', async () => {
      const res = await request(app)
        .post('/api/inventory/pick')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          referenceType: 'MANUAL_ADJUSTMENT',
          referenceId: itemId,
          referenceNumber: 'PICK-TEST-001',
          items: [{ inventoryItemId: itemId, quantity: 2 }],
          notes: 'Test pick',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.itemCount).toBe(1);
    });
  });

  // ─── Low Stock & Alerts ───────────────────────────────────

  describe('Alerts', () => {
    it('should return low stock items', async () => {
      const res = await request(app)
        .get('/api/inventory/low-stock')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('lowStock');
      expect(res.body.data).toHaveProperty('outOfStock');
      expect(res.body.data).toHaveProperty('summary');
    });

    it('should return expiring batches', async () => {
      const res = await request(app)
        .get('/api/inventory/expiring?days=90')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('expiringSoon');
    });
  });

  // ─── Inventory Stats ──────────────────────────────────────

  describe('Analytics', () => {
    it('should return inventory stats (manager+)', async () => {
      const res = await request(app)
        .get('/api/inventory/stats')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.stats).toHaveProperty('items');
      expect(res.body.data.stats).toHaveProperty('stockValue');
      expect(res.body.data.stats).toHaveProperty('categoryBreakdown');
    });

    it('should return stock valuation report', async () => {
      const res = await request(app)
        .get('/api/inventory/valuation')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.report).toHaveProperty('grandTotal');
      expect(res.body.data.report).toHaveProperty('items');
    });

    it('should return stock movements with filters', async () => {
      const res = await request(app)
        .get('/api/inventory/movements/all?movementType=IN')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.movements)).toBe(true);
    });

    it('should block technician from stats', async () => {
      const res = await request(app)
        .get('/api/inventory/stats')
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.statusCode).toBe(403);
    });
  });
});
