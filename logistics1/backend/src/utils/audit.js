// src/utils/audit.js
// Centralized audit logging for all CRUD and workflow actions

const { PrismaClient } = require('@prisma/client');
const logger = require('./logger');

const prisma = new PrismaClient();

/**
 * Create an audit log entry
 * @param {Object} params
 * @param {string} params.userId - User performing the action
 * @param {string} params.userEmail - Email of user
 * @param {string} params.action - AuditAction enum value
 * @param {string} params.module - Module name (PROCUREMENT, INVENTORY, etc.)
 * @param {string} [params.entityId] - ID of the affected entity
 * @param {string} [params.entityType] - Type of entity (PurchaseOrder, Asset, etc.)
 * @param {Object} [params.oldValues] - Previous state (for updates)
 * @param {Object} [params.newValues] - New state (for creates/updates)
 * @param {string} [params.ipAddress] - Client IP
 * @param {string} [params.userAgent] - Client user agent
 * @param {string} [params.description] - Human-readable description
 */
const createAuditLog = async ({
  userId = null,
  userEmail = null,
  action,
  module,
  entityId = null,
  entityType = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
  userAgent = null,
  description = null,
}) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action,
        module,
        entityId,
        entityType,
        oldValues,
        newValues,
        ipAddress,
        userAgent,
        description,
      },
    });
  } catch (error) {
    // Audit logging should NEVER break the main operation
    logger.error(`Audit log creation failed: ${error.message}`, { action, module, entityId });
  }
};

/**
 * Extract audit info from request
 */
const getAuditMeta = (req) => ({
  userId: req.user?.id || null,
  userEmail: req.user?.email || null,
  ipAddress: req.ip || req.connection?.remoteAddress || null,
  userAgent: req.get('User-Agent') || null,
});

module.exports = { createAuditLog, getAuditMeta };
