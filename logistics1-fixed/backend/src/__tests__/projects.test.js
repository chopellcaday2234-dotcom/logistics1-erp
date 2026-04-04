// src/__tests__/projects.test.js
const request = require('supertest');
const app = require('../app');
const prisma = require('../config/database');
const bcrypt = require('bcryptjs');

describe('Project Management Module', () => {
  let adminToken, managerToken, staffToken, techToken;
  let projectId, taskId, riskId, commId;
  let inventoryItemId, batchId;

  beforeAll(async () => {
    const users = [
      { email: 'prj.admin@test.com',   password: 'Admin@1234',   role: 'ADMIN' },
      { email: 'prj.manager@test.com', password: 'Manager@1234', role: 'MANAGER' },
      { email: 'prj.staff@test.com',   password: 'Staff@1234',   role: 'STAFF' },
      { email: 'prj.tech@test.com',    password: 'Tech@1234',    role: 'TECHNICIAN' },
    ];
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await prisma.user.upsert({
        where: { email: u.email }, update: {},
        create: { email: u.email, password: hash, firstName: 'Prj', lastName: u.role, role: u.role, status: 'ACTIVE' },
      });
    }

    const logins = await Promise.all(users.map((u) =>
      request(app).post('/api/auth/login').send({ email: u.email, password: u.password })
    ));
    adminToken   = logins[0].body.data?.accessToken;
    managerToken = logins[1].body.data?.accessToken;
    staffToken   = logins[2].body.data?.accessToken;
    techToken    = logins[3].body.data?.accessToken;

    // Setup inventory
    const item = await prisma.inventoryItem.create({
      data: {
        sku: 'PRJ-ITEM-001', name: 'Test Project Material',
        category: 'MAINTENANCE', unit: 'Kg',
        currentStock: 100, averageCost: 150,
      },
    });
    inventoryItemId = item.id;

    const batch = await prisma.inventoryBatch.create({
      data: {
        batchNumber: 'PRJ-BATCH-001', inventoryItemId: item.id,
        quantity: 100, remainingQty: 100,
        unitCost: 150, totalCost: 15000, status: 'ACTIVE',
      },
    });
    batchId = batch.id;
  });

  afterAll(async () => {
    await prisma.stockMovement.deleteMany({ where: { inventoryItem: { sku: { startsWith: 'PRJ-' } } } });
    await prisma.projectMaterial.deleteMany({ where: { project: { projectCode: { startsWith: 'TEST-PROJ' } } } });
    await prisma.projectCommunication.deleteMany({ where: { project: { projectCode: { startsWith: 'TEST-PROJ' } } } });
    await prisma.projectRisk.deleteMany({ where: { project: { projectCode: { startsWith: 'TEST-PROJ' } } } });
    await prisma.projectTask.deleteMany({ where: { project: { projectCode: { startsWith: 'TEST-PROJ' } } } });
    await prisma.project.deleteMany({ where: { projectCode: { startsWith: 'TEST-PROJ' } } });
    await prisma.inventoryBatch.deleteMany({ where: { batchNumber: { startsWith: 'PRJ-' } } });
    await prisma.inventoryItem.deleteMany({ where: { sku: { startsWith: 'PRJ-' } } });
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'prj.' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'prj.' } } });
    await prisma.$disconnect();
  });

  // ─── Project CRUD ─────────────────────────────────────────

  describe('Project CRUD', () => {
    it('should create a project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectCode: 'TEST-PROJ-001',
          name: 'Hotel Lobby Renovation',
          description: 'Full renovation of main lobby area.',
          status: 'PLANNING',
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          budget: 500000,
          location: 'Ground Floor Lobby',
          department: 'Operations',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.project.projectCode).toBe('TEST-PROJ-001');
      expect(res.body.data.project.status).toBe('PLANNING');
      projectId = res.body.data.project.id;
    });

    it('should reject duplicate project code', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ projectCode: 'TEST-PROJ-001', name: 'Dupe', status: 'PLANNING' });
      expect(res.statusCode).toBe(409);
    });

    it('should reject end date before start date', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          projectCode: 'TEST-PROJ-FAIL',
          name: 'Bad dates',
          startDate: '2024-06-01',
          endDate: '2024-01-01',
        });
      expect(res.statusCode).toBe(400);
    });

    it('should get project with health score', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.project).toHaveProperty('health');
      expect(res.body.data.project.health).toHaveProperty('score');
      expect(res.body.data.project.health).toHaveProperty('status');
      expect(res.body.data.project).toHaveProperty('taskSummary');
    });

    it('should update project status PLANNING → ACTIVE', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'ACTIVE' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.project.status).toBe('ACTIVE');
    });

    it('should reject invalid status transition ACTIVE → PLANNING', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'PLANNING' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Invalid project status transition');
    });

    it('technician should not create projects', async () => {
      const res = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${techToken}`)
        .send({ projectCode: 'TEST-PROJ-TECH', name: 'Tech project' });
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── Tasks ────────────────────────────────────────────────

  describe('Project Tasks', () => {
    it('should create a task', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          title: 'Source renovation materials',
          description: 'Contact suppliers for tiles and paint.',
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        });
      expect(res.statusCode).toBe(201);
      taskId = res.body.data.task.id;
    });

    it('should update task to IN_PROGRESS', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'IN_PROGRESS' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.task.status).toBe('IN_PROGRESS');
    });

    it('should complete a task (sets completedAt)', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${taskId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'DONE' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.task.completedAt).toBeTruthy();
    });

    it('should filter tasks by status', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/tasks?status=DONE`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      res.body.data.tasks.forEach((t) => expect(t.status).toBe('DONE'));
    });
  });

  // ─── Risks ────────────────────────────────────────────────

  describe('Project Risks', () => {
    it('should create a risk', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/risks`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          title: 'Supplier delivery delays',
          description: 'Materials may arrive late due to import restrictions.',
          level: 'HIGH',
          mitigation: 'Order 3 weeks in advance. Identify local backup suppliers.',
          status: 'OPEN',
        });
      expect(res.statusCode).toBe(201);
      riskId = res.body.data.risk.id;
    });

    it('should update risk to MITIGATED', async () => {
      const res = await request(app)
        .patch(`/api/projects/${projectId}/risks/${riskId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ status: 'MITIGATED', mitigation: 'Backup supplier confirmed.' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.risk.status).toBe('MITIGATED');
    });

    it('should list risks ordered by level', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/risks`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data.risks)).toBe(true);
    });
  });

  // ─── Communications ───────────────────────────────────────

  describe('Project Communications', () => {
    it('should log a communication', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/communications`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          subject: 'Kickoff Meeting Notes',
          message: 'Project kickoff held. All stakeholders aligned on scope and timeline.',
          recipients: 'operations@hotel.com, gm@hotel.com',
        });
      expect(res.statusCode).toBe(201);
      commId = res.body.data.communication.id;
    });

    it('should get communications with pagination', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/communications`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.communications.length).toBeGreaterThan(0);
    });
  });

  // ─── Material Consumption ─────────────────────────────────

  describe('Material Consumption — Inventory Integration', () => {
    it('should consume material and deduct inventory stock', async () => {
      const stockBefore = 100;
      const res = await request(app)
        .post(`/api/projects/${projectId}/materials`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          inventoryItemId,
          batchId,
          quantityUsed: 15,
          notes: 'Used for tile adhesive mixing',
        });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.material.quantityUsed).toBe(15);
      expect(res.body.data.item.newStock).toBe(stockBefore - 15);
    });

    it('should update project actualCost after material consumption', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.body.data.project.actualCost).toBeGreaterThan(0);
    });

    it('should reject consumption exceeding available stock', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/materials`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ inventoryItemId, quantityUsed: 99999, notes: 'Should fail' });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('Insufficient stock');
    });

    it('should reject consumption for CANCELLED project', async () => {
      const cancelledProj = await prisma.project.create({
        data: {
          projectCode: 'TEST-PROJ-CANCEL',
          name: 'Cancelled Test',
          status: 'CANCELLED',
          createdById: (await prisma.user.findFirst({ where: { role: 'ADMIN' } })).id,
        },
      });
      const res = await request(app)
        .post(`/api/projects/${cancelledProj.id}/materials`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ inventoryItemId, quantityUsed: 1, notes: 'Should fail' });
      expect(res.statusCode).toBe(400);
      await prisma.project.delete({ where: { id: cancelledProj.id } });
    });

    it('should get material list with total cost', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/materials`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('totalMaterialCost');
      expect(res.body.data.totalMaterialCost).toBeGreaterThan(0);
    });
  });

  // ─── Budget Report ────────────────────────────────────────

  describe('Budget Report', () => {
    it('should generate a budget report', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/budget-report`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.report).toHaveProperty('costs');
      expect(res.body.data.report).toHaveProperty('materialBreakdown');
      expect(res.body.data.report.costs.materialCost).toBeGreaterThan(0);
    });
  });

  // ─── Analytics ────────────────────────────────────────────

  describe('Analytics', () => {
    it('should return project stats', async () => {
      const res = await request(app)
        .get('/api/projects/stats')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.stats).toHaveProperty('totalProjects');
      expect(res.body.data.stats).toHaveProperty('byStatus');
      expect(res.body.data.stats).toHaveProperty('totalBudget');
      expect(res.body.data.stats).toHaveProperty('topConsumedItems');
    });

    it('technician should not access stats', async () => {
      const res = await request(app)
        .get('/api/projects/stats')
        .set('Authorization', `Bearer ${techToken}`);
      expect(res.statusCode).toBe(403);
    });
  });
});
