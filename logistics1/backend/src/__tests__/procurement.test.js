// src/__tests__/procurement.test.js
const request = require('supertest');
const app = require('../app');
const prisma = require('../config/database');
const bcrypt = require('bcryptjs');

describe('Procurement Module', () => {
  let adminToken, managerToken, staffToken;
  let supplierId, rfqId, quoteId, poId;

  beforeAll(async () => {
    const hash = await bcrypt.hash('Admin@1234', 10);
    const mHash = await bcrypt.hash('Manager@1234', 10);
    const sHash = await bcrypt.hash('Staff@1234', 10);

    await prisma.user.upsert({
      where: { email: 'proc.admin@test.com' },
      update: {},
      create: { email: 'proc.admin@test.com', password: hash, firstName: 'Proc', lastName: 'Admin', role: 'ADMIN', status: 'ACTIVE' },
    });
    await prisma.user.upsert({
      where: { email: 'proc.manager@test.com' },
      update: {},
      create: { email: 'proc.manager@test.com', password: mHash, firstName: 'Proc', lastName: 'Mgr', role: 'MANAGER', status: 'ACTIVE' },
    });
    await prisma.user.upsert({
      where: { email: 'proc.staff@test.com' },
      update: {},
      create: { email: 'proc.staff@test.com', password: sHash, firstName: 'Proc', lastName: 'Staff', role: 'STAFF', status: 'ACTIVE' },
    });

    const [a, m, s] = await Promise.all([
      request(app).post('/api/auth/login').send({ email: 'proc.admin@test.com', password: 'Admin@1234' }),
      request(app).post('/api/auth/login').send({ email: 'proc.manager@test.com', password: 'Manager@1234' }),
      request(app).post('/api/auth/login').send({ email: 'proc.staff@test.com', password: 'Staff@1234' }),
    ]);

    adminToken   = a.body.data?.accessToken;
    managerToken = m.body.data?.accessToken;
    staffToken   = s.body.data?.accessToken;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'proc.' } } });
    await prisma.supplier.deleteMany({ where: { code: { startsWith: 'TEST-' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'proc.' } } });
    await prisma.$disconnect();
  });

  // ─── Suppliers ───────────────────────────────────────────

  describe('Supplier CRUD', () => {
    it('should create a supplier', async () => {
      const res = await request(app)
        .post('/api/procurement/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'TEST-001',
          name: 'Test Supplier Co.',
          email: 'test@supplier.com',
          phone: '+63-2-1234-5678',
          paymentTerms: 'NET 30',
          leadTimeDays: 5,
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.supplier.code).toBe('TEST-001');
      supplierId = res.body.data.supplier.id;
    });

    it('should reject duplicate supplier code', async () => {
      const res = await request(app)
        .post('/api/procurement/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'TEST-001', name: 'Dupe Supplier' });
      expect(res.statusCode).toBe(409);
    });

    it('should list suppliers', async () => {
      const res = await request(app)
        .get('/api/procurement/suppliers')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.suppliers).toBeInstanceOf(Array);
    });

    it('should get supplier by ID', async () => {
      const res = await request(app)
        .get(`/api/procurement/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.supplier.id).toBe(supplierId);
    });

    it('should update supplier', async () => {
      const res = await request(app)
        .patch(`/api/procurement/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ rating: 4.5, notes: 'Reliable partner' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.supplier.rating).toBe(4.5);
    });

    it('should return 404 for non-existent supplier', async () => {
      const res = await request(app)
        .get('/api/procurement/suppliers/non-existent-id-000000')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(404);
    });
  });

  // ─── RFQ Workflow ─────────────────────────────────────────

  describe('RFQ Workflow', () => {
    let inventoryItemId;

    beforeAll(async () => {
      const item = await prisma.inventoryItem.findFirst();
      inventoryItemId = item?.id;
    });

    it('should create an RFQ', async () => {
      const res = await request(app)
        .post('/api/procurement/rfqs')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          title: 'Test Monthly Supplies RFQ',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          supplierIds: [supplierId],
          items: [
            { description: 'Test Item A', quantity: 10, unit: 'Piece' },
          ],
        });
      expect(res.statusCode).toBe(201);
      rfqId = res.body.data.rfq.id;
    });

    it('should reject RFQ with past due date', async () => {
      const res = await request(app)
        .post('/api/procurement/rfqs')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          title: 'Bad RFQ',
          dueDate: '2020-01-01',
          supplierIds: [supplierId],
          items: [{ description: 'Test', quantity: 1, unit: 'Piece' }],
        });
      expect(res.statusCode).toBe(400);
    });

    it('should submit RFQ to suppliers', async () => {
      const res = await request(app)
        .post(`/api/procurement/rfqs/${rfqId}/submit`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.rfq.status).toBe('SENT');
    });

    it('should not allow re-submission of SENT RFQ', async () => {
      const res = await request(app)
        .post(`/api/procurement/rfqs/${rfqId}/submit`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(400);
    });

    it('should add a quote to the RFQ', async () => {
      const rfqDetail = await request(app)
        .get(`/api/procurement/rfqs/${rfqId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      const rfqItemId = rfqDetail.body.data.rfq.items[0]?.id;

      const res = await request(app)
        .post('/api/procurement/quotes')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          rfqId,
          supplierId,
          quoteNumber: 'QT-TEST-001',
          totalAmount: 5000,
          currency: 'PHP',
          deliveryDays: 5,
          paymentTerms: 'NET 30',
          items: [{ rfqItemId, unitPrice: 500, quantity: 10 }],
        });
      expect(res.statusCode).toBe(201);
      quoteId = res.body.data.quote.id;
    });

    it('should approve RFQ (manager only)', async () => {
      const res = await request(app)
        .post(`/api/procurement/rfqs/${rfqId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ notes: 'Approved for procurement' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.rfq.status).toBe('APPROVED');
    });

    it('should staff not be able to approve RFQ', async () => {
      const res = await request(app)
        .post(`/api/procurement/rfqs/${rfqId}/approve`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });

    it('should get quote comparison', async () => {
      const res = await request(app)
        .get(`/api/procurement/rfqs/${rfqId}/compare`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.comparison.quotes).toHaveLength(1);
    });
  });

  // ─── PO Workflow ──────────────────────────────────────────

  describe('PO Workflow', () => {
    it('should create a PO', async () => {
      const res = await request(app)
        .post('/api/procurement/purchase-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          items: [{ description: 'Test Part', quantity: 5, unitPrice: 1000, unit: 'Piece', taxRate: 12 }],
          paymentTerms: 'NET 30',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.po.status).toBe('DRAFT');
      expect(res.body.data.po.totalAmount).toBeGreaterThan(0);
      poId = res.body.data.po.id;
    });

    it('should submit PO for approval', async () => {
      const res = await request(app)
        .post(`/api/procurement/purchase-orders/${poId}/submit`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.po.status).toBe('PENDING_APPROVAL');
    });

    it('should approve PO (manager only)', async () => {
      const res = await request(app)
        .post(`/api/procurement/purchase-orders/${poId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ notes: 'Approved' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.po.status).toBe('APPROVED');
    });

    it('should not allow staff to approve PO', async () => {
      const newPO = await request(app)
        .post('/api/procurement/purchase-orders')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          supplierId,
          items: [{ description: 'Test', quantity: 1, unitPrice: 100, unit: 'Piece' }],
        });
      await request(app)
        .post(`/api/procurement/purchase-orders/${newPO.body.data.po.id}/submit`)
        .set('Authorization', `Bearer ${staffToken}`);

      const res = await request(app)
        .post(`/api/procurement/purchase-orders/${newPO.body.data.po.id}/approve`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });

    it('should get PO stats', async () => {
      const res = await request(app)
        .get('/api/procurement/stats')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.stats).toHaveProperty('purchaseOrders');
      expect(res.body.data.stats).toHaveProperty('suppliers');
    });
  });
});
