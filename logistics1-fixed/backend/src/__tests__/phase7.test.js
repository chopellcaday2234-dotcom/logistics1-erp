// src/__tests__/phase7.test.js
const request = require('supertest');
const app = require('../app');
const prisma = require('../config/database');
const bcrypt = require('bcryptjs');

describe('Phase 7 — Notifications, Reports & Validation', () => {
  let adminToken, managerToken, staffToken;
  let notifId;

  beforeAll(async () => {
    const users = [
      { email: 'p7.admin@test.com',   password: 'Admin@1234',   role: 'ADMIN' },
      { email: 'p7.manager@test.com', password: 'Manager@1234', role: 'MANAGER' },
      { email: 'p7.staff@test.com',   password: 'Staff@1234',   role: 'STAFF' },
    ];
    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await prisma.user.upsert({
        where: { email: u.email }, update: {},
        create: { email: u.email, password: hash, firstName: 'P7', lastName: u.role, role: u.role, status: 'ACTIVE' },
      });
    }
    const logins = await Promise.all(users.map((u) =>
      request(app).post('/api/auth/login').send({ email: u.email, password: u.password })
    ));
    adminToken   = logins[0].body.data?.accessToken;
    managerToken = logins[1].body.data?.accessToken;
    staffToken   = logins[2].body.data?.accessToken;

    // Seed a notification for the admin
    const admin = await prisma.user.findFirst({ where: { email: 'p7.admin@test.com' } });
    await prisma.notification.create({
      data: {
        userId: admin.id,
        title: 'Test Notification',
        message: 'This is a test notification for phase 7 tests.',
        type: 'INFO',
        module: 'INVENTORY',
      },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { user: { email: { contains: 'p7.' } } } });
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'p7.' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'p7.' } } });
    await prisma.$disconnect();
  });

  // ─── Notifications ────────────────────────────────────────

  describe('Notifications', () => {
    it('should get my notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('notifications');
      expect(res.body.data).toHaveProperty('unreadCount');
      if (res.body.data.notifications.length > 0) {
        notifId = res.body.data.notifications[0].id;
      }
    });

    it('should get unread count', async () => {
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('unreadCount');
      expect(typeof res.body.data.unreadCount).toBe('number');
    });

    it('should mark a notification as read', async () => {
      if (!notifId) return;
      const res = await request(app)
        .patch(`/api/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.notification.isRead).toBe(true);
    });

    it('should mark all as read', async () => {
      const res = await request(app)
        .post('/api/notifications/mark-all-read')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('markedCount');
    });

    it('should clear all read notifications', async () => {
      const res = await request(app)
        .post('/api/notifications/clear-read')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('deletedCount');
    });

    it('should run system alert scan (admin/manager only)', async () => {
      const res = await request(app)
        .post('/api/notifications/scan')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('alertsFired');
      expect(res.body.data).toHaveProperty('scannedAt');
    });

    it('should block staff from running alert scan', async () => {
      const res = await request(app)
        .post('/api/notifications/scan')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── Reports ──────────────────────────────────────────────

  describe('Reports', () => {
    it('should return master dashboard report', async () => {
      const res = await request(app)
        .get('/api/reports/dashboard')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      const r = res.body.data.report;
      expect(r).toHaveProperty('procurement');
      expect(r).toHaveProperty('inventory');
      expect(r).toHaveProperty('assets');
      expect(r).toHaveProperty('mro');
      expect(r).toHaveProperty('projects');
      expect(r).toHaveProperty('system');
      expect(r).toHaveProperty('generatedAt');
    });

    it('should return inventory report with summary', async () => {
      const res = await request(app)
        .get('/api/reports/inventory')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.report).toHaveProperty('summary');
      expect(res.body.data.report.summary).toHaveProperty('totalStockValue');
      expect(res.body.data.report).toHaveProperty('byCategory');
      expect(res.body.data.report).toHaveProperty('stockValuation');
    });

    it('should return inventory report filtered by category', async () => {
      const res = await request(app)
        .get('/api/reports/inventory?category=CLEANING')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.report.filters.category).toBe('CLEANING');
    });

    it('should return supplier performance report', async () => {
      const res = await request(app)
        .get('/api/reports/supplier-performance')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.report).toHaveProperty('suppliers');
      expect(res.body.data.report).toHaveProperty('summary');
    });

    it('should return asset maintenance report', async () => {
      const res = await request(app)
        .get('/api/reports/asset-maintenance')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.report).toHaveProperty('summary');
      expect(res.body.data.report.summary).toHaveProperty('totalWorkOrders');
      expect(res.body.data.report).toHaveProperty('byType');
    });

    it('should return project material consumption report', async () => {
      const res = await request(app)
        .get('/api/reports/project-materials')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.report).toHaveProperty('summary');
      expect(res.body.data.report).toHaveProperty('byProject');
      expect(res.body.data.report).toHaveProperty('byItem');
    });

    it('should return audit log report', async () => {
      const res = await request(app)
        .get('/api/reports/audit?limit=10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('logs');
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data).toHaveProperty('pagination');
    });

    it('should block staff from all reports', async () => {
      const res = await request(app)
        .get('/api/reports/dashboard')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });
  });

  // ─── Validation Engine ────────────────────────────────────

  describe('Validation Engine', () => {
    it('should run full system validation', async () => {
      const res = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('systemHealth');
      expect(res.body.data.systemHealth).toHaveProperty('score');
      expect(res.body.data.systemHealth).toHaveProperty('status');
      expect(res.body.data).toHaveProperty('summary');
      expect(res.body.data.summary).toHaveProperty('totalIssues');
      expect(res.body.data.summary).toHaveProperty('bySeverity');
      expect(res.body.data.summary).toHaveProperty('byModule');
      expect(res.body.data).toHaveProperty('issues');
      expect(res.body.data).toHaveProperty('executionTimeMs');
    });

    it('should run per-module validation — inventory', async () => {
      const res = await request(app)
        .get('/api/validation/run/inventory')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.module).toBe('inventory');
      expect(res.body.data).toHaveProperty('issues');
      expect(res.body.data).toHaveProperty('issueCount');
    });

    it('should run per-module validation — procurement', async () => {
      const res = await request(app)
        .get('/api/validation/run/procurement')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.module).toBe('procurement');
    });

    it('should run per-module validation — assets', async () => {
      const res = await request(app)
        .get('/api/validation/run/assets')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
    });

    it('should run per-module validation — mro', async () => {
      const res = await request(app)
        .get('/api/validation/run/mro')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
    });

    it('should run per-module validation — projects', async () => {
      const res = await request(app)
        .get('/api/validation/run/projects')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
    });

    it('should block staff from validation engine', async () => {
      const res = await request(app)
        .get('/api/validation/run')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });
  });
});
