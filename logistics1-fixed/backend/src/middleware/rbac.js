// src/middleware/rbac.js
// Role-Based Access Control middleware

const { sendForbidden } = require('../utils/response');

// Role hierarchy: higher index = more permissions
const ROLE_HIERARCHY = {
  ADMIN: 4,
  MANAGER: 3,
  STAFF: 2,
  TECHNICIAN: 1,
};

/**
 * Require specific role(s)
 * Usage: authorize('ADMIN') or authorize(['ADMIN', 'MANAGER'])
 */
const authorize = (...allowedRoles) => {
  // Flatten in case array is passed
  const roles = allowedRoles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return sendForbidden(res, 'Authentication required');
    }

    if (!roles.includes(req.user.role)) {
      return sendForbidden(
        res,
        `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}`
      );
    }

    next();
  };
};

/**
 * Require minimum role level
 * Usage: requireMinRole('MANAGER') — allows MANAGER and above
 */
const requireMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendForbidden(res, 'Authentication required');
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      return sendForbidden(
        res,
        `Access denied. Minimum required role: ${minRole}`
      );
    }

    next();
  };
};

/**
 * Allow Admin to bypass + specific roles
 */
const authorizeOrAdmin = (...roles) => {
  return authorize(['ADMIN', ...roles.flat()]);
};

// Module-specific permission sets
const permissions = {
  procurement: {
    view: authorize(['ADMIN', 'MANAGER', 'STAFF']),
    create: authorize(['ADMIN', 'MANAGER', 'STAFF']),
    approve: authorize(['ADMIN', 'MANAGER']),
    delete: authorize(['ADMIN']),
  },
  inventory: {
    view: authorize(['ADMIN', 'MANAGER', 'STAFF', 'TECHNICIAN']),
    create: authorize(['ADMIN', 'MANAGER', 'STAFF']),
    adjust: authorize(['ADMIN', 'MANAGER']),
    delete: authorize(['ADMIN']),
  },
  assets: {
    view: authorize(['ADMIN', 'MANAGER', 'STAFF', 'TECHNICIAN']),
    create: authorize(['ADMIN', 'MANAGER']),
    update: authorize(['ADMIN', 'MANAGER', 'TECHNICIAN']),
    delete: authorize(['ADMIN']),
  },
  mro: {
    view: authorize(['ADMIN', 'MANAGER', 'STAFF', 'TECHNICIAN']),
    create: authorize(['ADMIN', 'MANAGER', 'TECHNICIAN']),
    complete: authorize(['ADMIN', 'MANAGER', 'TECHNICIAN']),
    delete: authorize(['ADMIN']),
  },
  projects: {
    view: authorize(['ADMIN', 'MANAGER', 'STAFF']),
    create: authorize(['ADMIN', 'MANAGER']),
    update: authorize(['ADMIN', 'MANAGER', 'STAFF']),
    delete: authorize(['ADMIN']),
  },
  reports: {
    view: authorize(['ADMIN', 'MANAGER']),
    export: authorize(['ADMIN', 'MANAGER']),
  },
  users: {
    view: authorize(['ADMIN']),
    manage: authorize(['ADMIN']),
  },
};

module.exports = { authorize, requireMinRole, authorizeOrAdmin, permissions, ROLE_HIERARCHY };
