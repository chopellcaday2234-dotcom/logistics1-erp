// src/modules/inventory/inventory.validation.js
const Joi = require('joi');

// ─── Inventory Item ───────────────────────────────────────

const createItemSchema = Joi.object({
  sku: Joi.string().trim().uppercase().max(50).required().messages({
    'any.required': 'SKU is required',
  }),
  name: Joi.string().trim().min(2).max(200).required(),
  description: Joi.string().trim().max(1000).optional().allow('', null),
  category: Joi.string()
    .valid(
      'FOOD_BEVERAGE', 'HOUSEKEEPING', 'MAINTENANCE', 'OFFICE_SUPPLIES',
      'EQUIPMENT', 'SPARE_PARTS', 'CLEANING', 'LINEN', 'AMENITIES', 'OTHER'
    )
    .default('OTHER'),
  unit: Joi.string().trim().max(30).required(),
  reorderPoint: Joi.number().min(0).default(0),
  reorderQty: Joi.number().min(0).default(0),
  location: Joi.string().trim().max(100).optional().allow('', null),
  isSerialized: Joi.boolean().default(false),
  expiryTracked: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
});

const updateItemSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).optional(),
  description: Joi.string().trim().max(1000).optional().allow('', null),
  category: Joi.string()
    .valid(
      'FOOD_BEVERAGE', 'HOUSEKEEPING', 'MAINTENANCE', 'OFFICE_SUPPLIES',
      'EQUIPMENT', 'SPARE_PARTS', 'CLEANING', 'LINEN', 'AMENITIES', 'OTHER'
    )
    .optional(),
  unit: Joi.string().trim().max(30).optional(),
  reorderPoint: Joi.number().min(0).optional(),
  reorderQty: Joi.number().min(0).optional(),
  location: Joi.string().trim().max(100).optional().allow('', null),
  isSerialized: Joi.boolean().optional(),
  expiryTracked: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
});

// ─── Stock Adjustment ─────────────────────────────────────

const adjustmentSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().required(),
  adjustmentType: Joi.string().valid('ADD', 'REMOVE', 'SET').required().messages({
    'any.only': 'Adjustment type must be ADD, REMOVE, or SET',
  }),
  quantity: Joi.number().positive().required(),
  unitCost: Joi.number().min(0).optional().allow(null),
  reason: Joi.string().trim().max(500).required().messages({
    'any.required': 'Reason is required for stock adjustments',
  }),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
  projectId: Joi.string().uuid().optional().allow(null),
});

// ─── Stock Issue / Dispatch ───────────────────────────────

const issueStockSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().required(),
  quantity: Joi.number().positive().required(),
  source: Joi.string()
    .valid('PROJECT', 'MRO_WORK_ORDER', 'MANUAL_ADJUSTMENT', 'TRANSFER', 'DISPOSAL')
    .required(),
  referenceId: Joi.string().uuid().optional().allow(null),
  referenceNumber: Joi.string().trim().max(100).optional().allow('', null),
  projectId: Joi.string().uuid().optional().allow(null),
  workOrderId: Joi.string().uuid().optional().allow(null),
  batchId: Joi.string().uuid().optional().allow(null),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
});

// ─── Batch Operations ─────────────────────────────────────

const updateBatchSchema = Joi.object({
  status: Joi.string().valid('ACTIVE', 'DEPLETED', 'EXPIRED', 'QUARANTINED').optional(),
  expiryDate: Joi.date().iso().optional().allow(null),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
});

// ─── Transfer ─────────────────────────────────────────────

const transferStockSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().required(),
  fromLocation: Joi.string().trim().max(100).required(),
  toLocation: Joi.string().trim().max(100).required(),
  quantity: Joi.number().positive().required(),
  batchId: Joi.string().uuid().optional().allow(null),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
});

// ─── Picking ──────────────────────────────────────────────

const pickingItemSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().required(),
  quantity: Joi.number().positive().required(),
  batchId: Joi.string().uuid().optional().allow(null),
});

const createPickingSchema = Joi.object({
  referenceType: Joi.string().valid('PROJECT', 'MRO_WORK_ORDER', 'TRANSFER').required(),
  referenceId: Joi.string().uuid().required(),
  referenceNumber: Joi.string().trim().max(100).required(),
  items: Joi.array().items(pickingItemSchema).min(1).required(),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
});

module.exports = {
  createItemSchema,
  updateItemSchema,
  adjustmentSchema,
  issueStockSchema,
  updateBatchSchema,
  transferStockSchema,
  createPickingSchema,
};
