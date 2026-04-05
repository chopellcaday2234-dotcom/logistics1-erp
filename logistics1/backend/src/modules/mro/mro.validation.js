// src/modules/mro/mro.validation.js
const Joi = require('joi');

// ─── Work Order ───────────────────────────────────────────

const createWorkOrderSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  type: Joi.string()
    .valid('PREVENTIVE', 'CORRECTIVE', 'EMERGENCY', 'INSPECTION')
    .default('CORRECTIVE'),
  priority: Joi.string()
    .valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    .default('MEDIUM'),
  assetId: Joi.string().uuid().optional().allow(null),
  scheduleId: Joi.string().uuid().optional().allow(null),
  projectId: Joi.string().uuid().optional().allow(null),
  assignedToId: Joi.string().uuid().optional().allow(null),
  startDate: Joi.date().iso().optional().allow(null),
  dueDate: Joi.date().iso().optional().allow(null),
  estimatedHours: Joi.number().min(0).optional().allow(null),
  safetyNotes: Joi.string().trim().max(2000).optional().allow('', null),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

const updateWorkOrderSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).optional(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  assignedToId: Joi.string().uuid().optional().allow(null),
  startDate: Joi.date().iso().optional().allow(null),
  dueDate: Joi.date().iso().optional().allow(null),
  estimatedHours: Joi.number().min(0).optional().allow(null),
  safetyNotes: Joi.string().trim().max(2000).optional().allow('', null),
});

const completeWorkOrderSchema = Joi.object({
  completionNotes: Joi.string().trim().min(5).max(2000).required().messages({
    'any.required': 'Completion notes are required',
    'string.min': 'Completion notes must be at least 5 characters',
  }),
  actualHours: Joi.number().min(0.1).required().messages({
    'any.required': 'Actual hours spent is required',
  }),
  laborCost: Joi.number().min(0).default(0),
  completedDate: Joi.date().iso().default(() => new Date()),
  advanceSchedule: Joi.boolean().default(true),
});

const holdWorkOrderSchema = Joi.object({
  reason: Joi.string().trim().min(5).max(500).required(),
});

// ─── Maintenance Log ──────────────────────────────────────

const createMaintenanceLogSchema = Joi.object({
  description: Joi.string().trim().min(5).max(2000).required(),
  hoursSpent: Joi.number().min(0).optional().allow(null),
  logDate: Joi.date().iso().default(() => new Date()),
});

// ─── Parts Usage ──────────────────────────────────────────

const addPartUsageSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().optional().allow(null),
  partName: Joi.string().trim().max(200).required(),
  quantity: Joi.number().positive().required(),
  unitCost: Joi.number().min(0).required(),
  batchId: Joi.string().uuid().optional().allow(null),
  notes: Joi.string().trim().max(500).optional().allow('', null),
});

module.exports = {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  completeWorkOrderSchema,
  holdWorkOrderSchema,
  createMaintenanceLogSchema,
  addPartUsageSchema,
};
