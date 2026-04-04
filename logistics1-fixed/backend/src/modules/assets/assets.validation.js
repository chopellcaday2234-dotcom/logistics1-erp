// src/modules/assets/assets.validation.js
const Joi = require('joi');

// ─── Asset ────────────────────────────────────────────────

const createAssetSchema = Joi.object({
  assetCode: Joi.string().trim().uppercase().max(50).required().messages({
    'any.required': 'Asset code is required',
  }),
  name: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  inventoryItemId: Joi.string().uuid().optional().allow(null),
  batchId: Joi.string().uuid().optional().allow(null),
  category: Joi.string().trim().max(100).required(),
  location: Joi.string().trim().max(200).optional().allow('', null),
  department: Joi.string().trim().max(100).optional().allow('', null),
  status: Joi.string()
    .valid('ACTIVE', 'UNDER_MAINTENANCE', 'RETIRED', 'DISPOSED', 'LOST')
    .default('ACTIVE'),
  condition: Joi.string()
    .valid('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'CRITICAL')
    .default('GOOD'),
  purchaseDate: Joi.date().iso().optional().allow(null),
  purchaseCost: Joi.number().min(0).optional().allow(null),
  currentValue: Joi.number().min(0).optional().allow(null),
  serialNumber: Joi.string().trim().max(100).optional().allow('', null),
  model: Joi.string().trim().max(100).optional().allow('', null),
  manufacturer: Joi.string().trim().max(100).optional().allow('', null),
  warrantyExpiry: Joi.date().iso().optional().allow(null),
  nextMaintenance: Joi.date().iso().optional().allow(null),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

const updateAssetSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).optional(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  category: Joi.string().trim().max(100).optional(),
  location: Joi.string().trim().max(200).optional().allow('', null),
  department: Joi.string().trim().max(100).optional().allow('', null),
  condition: Joi.string()
    .valid('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'CRITICAL')
    .optional(),
  currentValue: Joi.number().min(0).optional().allow(null),
  serialNumber: Joi.string().trim().max(100).optional().allow('', null),
  model: Joi.string().trim().max(100).optional().allow('', null),
  manufacturer: Joi.string().trim().max(100).optional().allow('', null),
  warrantyExpiry: Joi.date().iso().optional().allow(null),
  nextMaintenance: Joi.date().iso().optional().allow(null),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

const changeAssetStatusSchema = Joi.object({
  status: Joi.string()
    .valid('ACTIVE', 'UNDER_MAINTENANCE', 'RETIRED', 'DISPOSED', 'LOST')
    .required(),
  reason: Joi.string().trim().min(5).max(500).required().messages({
    'any.required': 'A reason is required for status changes',
    'string.min': 'Reason must be at least 5 characters',
  }),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
});

const convertBatchToAssetSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().required(),
  batchId: Joi.string().uuid().required(),
  assetCode: Joi.string().trim().uppercase().max(50).required(),
  name: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  category: Joi.string().trim().max(100).required(),
  location: Joi.string().trim().max(200).optional().allow('', null),
  department: Joi.string().trim().max(100).optional().allow('', null),
  serialNumber: Joi.string().trim().max(100).optional().allow('', null),
  model: Joi.string().trim().max(100).optional().allow('', null),
  manufacturer: Joi.string().trim().max(100).optional().allow('', null),
  warrantyExpiry: Joi.date().iso().optional().allow(null),
  nextMaintenance: Joi.date().iso().optional().allow(null),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

// ─── Maintenance Schedule ─────────────────────────────────

const createScheduleSchema = Joi.object({
  assetId: Joi.string().uuid().required(),
  title: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  frequencyDays: Joi.number().integer().min(1).max(3650).required().messages({
    'any.required': 'Frequency in days is required',
    'number.min': 'Frequency must be at least 1 day',
  }),
  nextDue: Joi.date().iso().required(),
  estimatedHours: Joi.number().min(0).optional().allow(null),
  assignedTo: Joi.string().uuid().optional().allow(null),
  isActive: Joi.boolean().default(true),
});

const updateScheduleSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).optional(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  frequencyDays: Joi.number().integer().min(1).optional(),
  nextDue: Joi.date().iso().optional(),
  estimatedHours: Joi.number().min(0).optional().allow(null),
  assignedTo: Joi.string().uuid().optional().allow(null),
  isActive: Joi.boolean().optional(),
});

module.exports = {
  createAssetSchema,
  updateAssetSchema,
  changeAssetStatusSchema,
  convertBatchToAssetSchema,
  createScheduleSchema,
  updateScheduleSchema,
};
