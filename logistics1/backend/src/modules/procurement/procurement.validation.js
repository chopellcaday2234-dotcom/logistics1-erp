// src/modules/procurement/procurement.validation.js
const Joi = require('joi');

// ─── Supplier ─────────────────────────────────────────────

const createSupplierSchema = Joi.object({
  code: Joi.string().trim().uppercase().max(20).required(),
  name: Joi.string().trim().min(2).max(150).required(),
  contactPerson: Joi.string().trim().max(100).optional().allow('', null),
  email: Joi.string().email().lowercase().optional().allow('', null),
  phone: Joi.string().trim().max(30).optional().allow('', null),
  address: Joi.string().trim().max(500).optional().allow('', null),
  city: Joi.string().trim().max(100).optional().allow('', null),
  country: Joi.string().trim().max(100).default('Philippines'),
  taxId: Joi.string().trim().max(50).optional().allow('', null),
  paymentTerms: Joi.string().trim().max(50).optional().allow('', null),
  leadTimeDays: Joi.number().integer().min(0).max(365).default(7),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'BLACKLISTED').default('ACTIVE'),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
});

const updateSupplierSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).optional(),
  contactPerson: Joi.string().trim().max(100).optional().allow('', null),
  email: Joi.string().email().lowercase().optional().allow('', null),
  phone: Joi.string().trim().max(30).optional().allow('', null),
  address: Joi.string().trim().max(500).optional().allow('', null),
  city: Joi.string().trim().max(100).optional().allow('', null),
  country: Joi.string().trim().max(100).optional(),
  taxId: Joi.string().trim().max(50).optional().allow('', null),
  paymentTerms: Joi.string().trim().max(50).optional().allow('', null),
  leadTimeDays: Joi.number().integer().min(0).max(365).optional(),
  rating: Joi.number().min(0).max(5).optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'BLACKLISTED').optional(),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
});

// ─── RFQ ──────────────────────────────────────────────────

const rfqItemSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().optional().allow(null),
  description: Joi.string().trim().max(300).required(),
  quantity: Joi.number().positive().required(),
  unit: Joi.string().trim().max(30).required(),
  specifications: Joi.string().trim().max(1000).optional().allow('', null),
});

const createRFQSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  dueDate: Joi.date().iso().greater('now').required().messages({
    'date.greater': 'Due date must be in the future',
  }),
  projectId: Joi.string().uuid().optional().allow(null),
  supplierIds: Joi.array().items(Joi.string().uuid()).min(1).required().messages({
    'array.min': 'At least one supplier must be selected',
  }),
  items: Joi.array().items(rfqItemSchema).min(1).required().messages({
    'array.min': 'At least one item is required',
  }),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

const updateRFQSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).optional(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  dueDate: Joi.date().iso().optional(),
  projectId: Joi.string().uuid().optional().allow(null),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

const rfqActionSchema = Joi.object({
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

// ─── RFQ Quote ────────────────────────────────────────────

const quoteItemSchema = Joi.object({
  rfqItemId: Joi.string().uuid().required(),
  unitPrice: Joi.number().min(0).required(),
  quantity: Joi.number().positive().required(),
  notes: Joi.string().trim().max(500).optional().allow('', null),
});

const createQuoteSchema = Joi.object({
  rfqId: Joi.string().uuid().required(),
  supplierId: Joi.string().uuid().required(),
  quoteNumber: Joi.string().trim().max(50).optional().allow('', null),
  totalAmount: Joi.number().min(0).required(),
  currency: Joi.string().trim().length(3).default('PHP'),
  validUntil: Joi.date().iso().optional().allow(null),
  deliveryDays: Joi.number().integer().min(0).optional().allow(null),
  paymentTerms: Joi.string().trim().max(100).optional().allow('', null),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
  items: Joi.array().items(quoteItemSchema).min(1).required(),
});

const selectQuoteSchema = Joi.object({
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

// ─── Purchase Order ───────────────────────────────────────

const poItemSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().optional().allow(null),
  description: Joi.string().trim().max(300).required(),
  quantity: Joi.number().positive().required(),
  unitPrice: Joi.number().min(0).required(),
  unit: Joi.string().trim().max(30).required(),
  taxRate: Joi.number().min(0).max(100).default(0),
  notes: Joi.string().trim().max(500).optional().allow('', null),
});

const createPOSchema = Joi.object({
  supplierId: Joi.string().uuid().required(),
  rfqId: Joi.string().uuid().optional().allow(null),
  projectId: Joi.string().uuid().optional().allow(null),
  expectedDate: Joi.date().iso().optional().allow(null),
  deliveryAddress: Joi.string().trim().max(500).optional().allow('', null),
  currency: Joi.string().trim().length(3).default('PHP'),
  paymentTerms: Joi.string().trim().max(100).optional().allow('', null),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
  items: Joi.array().items(poItemSchema).min(1).required(),
});

const updatePOSchema = Joi.object({
  expectedDate: Joi.date().iso().optional().allow(null),
  deliveryAddress: Joi.string().trim().max(500).optional().allow('', null),
  paymentTerms: Joi.string().trim().max(100).optional().allow('', null),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

const approvePOSchema = Joi.object({
  notes: Joi.string().trim().max(2000).optional().allow('', null),
});

// ─── PO Receiving ─────────────────────────────────────────

const receivingItemSchema = Joi.object({
  poItemId: Joi.string().uuid().required(),
  receivedQty: Joi.number().min(0).required(),
  acceptedQty: Joi.number().min(0).required(),
  rejectedQty: Joi.number().min(0).default(0),
  unitCost: Joi.number().min(0).required(),
  notes: Joi.string().trim().max(500).optional().allow('', null),
});

const createReceivingSchema = Joi.object({
  receivedDate: Joi.date().iso().default(() => new Date()),
  notes: Joi.string().trim().max(2000).optional().allow('', null),
  items: Joi.array().items(receivingItemSchema).min(1).required(),
});

module.exports = {
  createSupplierSchema,
  updateSupplierSchema,
  createRFQSchema,
  updateRFQSchema,
  rfqActionSchema,
  createQuoteSchema,
  selectQuoteSchema,
  createPOSchema,
  updatePOSchema,
  approvePOSchema,
  createReceivingSchema,
};
