// src/modules/auth/auth.service.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { createAuditLog } = require('../../utils/audit');
const logger = require('../../utils/logger');

// Optional nodemailer — only used if SMTP_HOST is configured
let transporter = null;
try {
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    logger.info('SMTP transport configured');
  }
} catch {
  logger.warn('nodemailer not available — forgot-password emails will be logged to console only');
}

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

// ─── Token Generation ────────────────────────────────────

const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

const formatUserResponse = (user) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: `${user.firstName} ${user.lastName}`,
  role: user.role,
  status: user.status,
  department: user.department,
  phone: user.phone,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
});

// ─── Auth Operations ─────────────────────────────────────

const register = async (data, createdByUser = null) => {
  const { email, password, firstName, lastName, role, department, phone } = data;

  // Check existing email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError('Email address is already registered', 409);
  }

  // Only ADMIN can create ADMIN or MANAGER accounts
  if (createdByUser && createdByUser.role !== 'ADMIN') {
    if (role === 'ADMIN' || role === 'MANAGER') {
      throw new AppError('Only administrators can create Admin or Manager accounts', 403);
    }
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: role || 'STAFF',
      department,
      phone,
    },
  });

  await createAuditLog({
    userId: createdByUser?.id || user.id,
    userEmail: createdByUser?.email || user.email,
    action: 'CREATE',
    module: 'AUTH',
    entityId: user.id,
    entityType: 'User',
    newValues: { email: user.email, role: user.role },
    description: `New user registered: ${user.email} (${user.role})`,
  });

  logger.info(`New user registered: ${email} with role ${role}`);
  return formatUserResponse(user);
};

const login = async ({ email, password }, meta = {}) => {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.status !== 'ACTIVE') {
    throw new AppError(
      `Account is ${user.status.toLowerCase()}. Please contact an administrator.`,
      403
    );
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password', 401);
  }

  const { accessToken, refreshToken } = generateTokens(user);
  const hashedRefresh = await bcrypt.hash(refreshToken, 8);

  // Store refresh token hash + update last login
  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: hashedRefresh,
      lastLoginAt: new Date(),
    },
  });

  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'LOGIN',
    module: 'AUTH',
    entityId: user.id,
    entityType: 'User',
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    description: `User logged in: ${user.email}`,
  });

  logger.info(`User logged in: ${email}`);

  return {
    user: formatUserResponse(user),
    accessToken,
    refreshToken,
  };
};

const refreshAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.id } });
  if (!user || !user.refreshToken) {
    throw new AppError('Invalid refresh token', 401);
  }

  const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
  if (!isValid) {
    throw new AppError('Invalid refresh token', 401);
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
  const hashedRefresh = await bcrypt.hash(newRefreshToken, 8);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: hashedRefresh },
  });

  return { accessToken, refreshToken: newRefreshToken };
};

const logout = async (userId) => {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshToken: null },
  });

  await createAuditLog({
    userId,
    action: 'LOGOUT',
    module: 'AUTH',
    entityId: userId,
    entityType: 'User',
    description: 'User logged out',
  });
};

const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, status: true, department: true, phone: true,
      avatarUrl: true, lastLoginAt: true, createdAt: true,
    },
  });

  if (!user) throw new AppError('User not found', 404);
  return user;
};

const updateProfile = async (userId, data) => {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
  });
  return formatUserResponse(user);
};

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) {
    throw new AppError('Current password is incorrect', 400);
  }

  if (currentPassword === newPassword) {
    throw new AppError('New password must be different from current password', 400);
  }

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed, refreshToken: null }, // Invalidate sessions
  });

  await createAuditLog({
    userId,
    action: 'UPDATE',
    module: 'AUTH',
    entityId: userId,
    entityType: 'User',
    description: 'Password changed',
  });
};

// ─── User Management (Admin) ──────────────────────────────

const getAllUsers = async ({ page = 1, limit = 20, role, status, search } = {}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(role && { role }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, status: true, department: true, phone: true,
        lastLoginAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

const updateUser = async (userId, data, updatedBy) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  // Prevent demoting the last admin
  if (data.role && user.role === 'ADMIN' && data.role !== 'ADMIN') {
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE' },
    });
    if (adminCount <= 1) {
      throw new AppError('Cannot change role: this is the last active admin account', 400);
    }
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });

  await createAuditLog({
    userId: updatedBy.id,
    userEmail: updatedBy.email,
    action: 'UPDATE',
    module: 'AUTH',
    entityId: userId,
    entityType: 'User',
    oldValues: { role: user.role, status: user.status },
    newValues: data,
    description: `User updated: ${user.email}`,
  });

  return formatUserResponse(updated);
};

// ─── Password Reset ───────────────────────────────────────

const forgotPassword = async ({ email }, meta = {}) => {
  // Always return success to prevent email enumeration
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') {
    logger.info(`Password reset requested for unknown/inactive email: ${email}`);
    return; // Silent success
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: tokenHash, passwordResetExpiry: expiry },
  });

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const resetUrl = `${clientUrl}/reset-password?token=${token}`;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"Logistics 1 ERP" <noreply@logistics1.com>`,
        to: user.email,
        subject: 'Password Reset Request',
        html: `
          <h2>Password Reset</h2>
          <p>Hello ${user.firstName},</p>
          <p>You requested a password reset. Click the link below (valid for 1 hour):</p>
          <a href="${resetUrl}" style="background:#f59e0b;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;">Reset Password</a>
          <p>If you did not request this, ignore this email.</p>
        `,
      });
      logger.info(`Password reset email sent to: ${email}`);
    } catch (err) {
      logger.error(`Failed to send reset email: ${err.message}`);
      // Fall through to console log
    }
  } else {
    // Dev mode: log reset URL to console
    logger.warn(`[DEV] Password reset URL for ${email}: ${resetUrl}`);
    console.log(`\n🔑 PASSWORD RESET LINK (dev mode):\n   ${resetUrl}\n`);
  }
};

const resetPassword = async ({ token, newPassword }) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await prisma.user.findFirst({
    where: {
      passwordResetToken: tokenHash,
      passwordResetExpiry: { gt: new Date() },
      status: 'ACTIVE',
    },
  });

  if (!user) {
    throw new AppError('Password reset token is invalid or has expired', 400);
  }

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashed,
      passwordResetToken: null,
      passwordResetExpiry: null,
      refreshToken: null, // Invalidate all sessions
    },
  });

  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'UPDATE',
    module: 'AUTH',
    entityId: user.id,
    entityType: 'User',
    description: 'Password reset via forgot-password flow',
  });

  logger.info(`Password reset completed for: ${user.email}`);
};

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getAllUsers,
  updateUser,
};
