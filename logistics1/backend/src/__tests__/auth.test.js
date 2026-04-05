// src/modules/auth/__tests__/auth.test.js
const request = require('supertest');
const app = require('../../../app');
const prisma = require('../../../config/database');
const bcrypt = require('bcryptjs');

describe('Auth Module', () => {
  let adminToken;
  let adminUser;
  let testUserId;

  beforeAll(async () => {
    // Create test admin user directly in DB
    const hash = await bcrypt.hash('Admin@1234', 12);
    adminUser = await prisma.user.upsert({
      where: { email: 'test.admin@logistics1.com' },
      update: {},
      create: {
        email: 'test.admin@logistics1.com',
        password: hash,
        firstName: 'Test',
        lastName: 'Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.auditLog.deleteMany({ where: { userEmail: { contains: 'test.' } } });
    await prisma.user.deleteMany({ where: { email: { contains: 'test.' } } });
    await prisma.$disconnect();
  });

  // ─── Login ───────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test.admin@logistics1.com', password: 'Admin@1234' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe('test.admin@logistics1.com');
      expect(res.body.data.user).not.toHaveProperty('password');

      adminToken = res.body.data.accessToken;
    });

    it('should fail with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test.admin@logistics1.com', password: 'WrongPass' });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'notexist@test.com', password: 'Admin@1234' });

      expect(res.statusCode).toBe(401);
    });

    it('should fail with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'not-an-email', password: 'Admin@1234' });

      expect(res.statusCode).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should fail with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test.admin@logistics1.com' });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Profile ─────────────────────────────────────────────────
  describe('GET /api/auth/profile', () => {
    it('should return user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.user.email).toBe('test.admin@logistics1.com');
      expect(res.body.data.user).not.toHaveProperty('password');
    });

    it('should fail without token', async () => {
      const res = await request(app).get('/api/auth/profile');
      expect(res.statusCode).toBe(401);
    });

    it('should fail with malformed token', async () => {
      const res = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalidtoken123');
      expect(res.statusCode).toBe(401);
    });
  });

  // ─── Register (Admin Only) ────────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('should create a new user (admin only)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test.newstaff@logistics1.com',
          password: 'Staff@12345',
          firstName: 'New',
          lastName: 'Staff',
          role: 'STAFF',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('test.newstaff@logistics1.com');
      testUserId = res.body.data.user.id;
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test.newstaff@logistics1.com',
          password: 'Staff@12345',
          firstName: 'Dupe',
          lastName: 'User',
          role: 'STAFF',
        });

      expect(res.statusCode).toBe(409);
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test.weak@logistics1.com',
          password: 'weak',
          firstName: 'Weak',
          lastName: 'Pass',
          role: 'STAFF',
        });

      expect(res.statusCode).toBe(400);
    });

    it('should fail without admin token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test.unauth@logistics1.com',
          password: 'Staff@1234',
          firstName: 'Un',
          lastName: 'Auth',
        });

      expect(res.statusCode).toBe(401);
    });
  });

  // ─── Change Password ─────────────────────────────────────────
  describe('PATCH /api/auth/change-password', () => {
    it('should reject wrong current password', async () => {
      const res = await request(app)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: 'WrongCurrent', newPassword: 'NewAdmin@1234' });

      expect(res.statusCode).toBe(400);
    });

    it('should reject same new password as current', async () => {
      const res = await request(app)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ currentPassword: 'Admin@1234', newPassword: 'Admin@1234' });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Logout ──────────────────────────────────────────────────
  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── RBAC ────────────────────────────────────────────────────
  describe('RBAC — Role Based Access Control', () => {
    let staffToken;

    beforeAll(async () => {
      // Login with the new staff user
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test.newstaff@logistics1.com', password: 'Staff@12345' });
      staffToken = res.body.data?.accessToken;
    });

    it('staff should NOT access admin user list', async () => {
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });
  });
});
