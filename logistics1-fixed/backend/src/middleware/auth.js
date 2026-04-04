// src/middleware/auth.js
// JWT authentication middleware

const jwt = require('jsonwebtoken');
const { sendUnauthorized, sendForbidden } = require('../utils/response');
const prisma = require('../config/database');
const logger = require('../utils/logger');

/**
 * Verify JWT token and attach user to request
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendUnauthorized(res, 'No authentication token provided');
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return sendUnauthorized(res, 'Token expired. Please log in again.');
      }
      return sendUnauthorized(res, 'Invalid authentication token');
    }

    // Fetch fresh user data (catches suspended/deleted accounts)
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        department: true,
      },
    });

    if (!user) {
      return sendUnauthorized(res, 'User account not found');
    }

    if (user.status !== 'ACTIVE') {
      return sendForbidden(res, `Account is ${user.status.toLowerCase()}. Please contact an administrator.`);
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error(`Authentication error: ${error.message}`);
    return sendUnauthorized(res, 'Authentication failed');
  }
};

/**
 * Optional auth — attaches user if token present but doesn't block
 */
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  return authenticate(req, res, next);
};

module.exports = { authenticate, optionalAuth };
