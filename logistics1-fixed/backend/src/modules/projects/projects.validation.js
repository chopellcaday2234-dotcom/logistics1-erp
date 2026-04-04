// src/modules/projects/projects.validation.js
const Joi = require('joi');

// ─── Project ──────────────────────────────────────────────

const createProjectSchema = Joi.object({
  projectCode: Joi.string().trim().uppercase().max(50).required().messages({
    'any.required': 'Project code is required',
  }),
  name: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().max(3000).optional().allow('', null),
  status: Joi.string()
    .valid('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')
    .default('PLANNING'),
  startDate: Joi.date().iso().optional().allow(null),
  endDate: Joi.date().iso().optional().allow(null).when('startDate', {
    is: Joi.date().exist(),
    then: Joi.date().min(Joi.ref('startDate')).messages({
      'date.min': 'End date must be after start date',
    }),
  }),
  budget: Joi.number().min(0).optional().allow(null),
  location: Joi.string().trim().max(200).optional().allow('', null),
  department: Joi.string().trim().max(100).optional().allow('', null),
});

const updateProjectSchema = Joi.object({
  name: Joi.string().trim().min(3).max(200).optional(),
  description: Joi.string().trim().max(3000).optional().allow('', null),
  status: Joi.string()
    .valid('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')
    .optional(),
  startDate: Joi.date().iso().optional().allow(null),
  endDate: Joi.date().iso().optional().allow(null),
  budget: Joi.number().min(0).optional().allow(null),
  location: Joi.string().trim().max(200).optional().allow('', null),
  department: Joi.string().trim().max(100).optional().allow('', null),
});

// ─── Project Task ─────────────────────────────────────────

const createTaskSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  status: Joi.string()
    .valid('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED')
    .default('TODO'),
  priority: Joi.string()
    .valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
    .default('MEDIUM'),
  assignedTo: Joi.string().uuid().optional().allow(null),
  dueDate: Joi.date().iso().optional().allow(null),
});

const updateTaskSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).optional(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  status: Joi.string()
    .valid('TODO', 'IN_PROGRESS', 'REVIEW', 'DONE', 'CANCELLED')
    .optional(),
  priority: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  assignedTo: Joi.string().uuid().optional().allow(null),
  dueDate: Joi.date().iso().optional().allow(null),
  completedAt: Joi.date().iso().optional().allow(null),
});

// ─── Project Risk ─────────────────────────────────────────

const createRiskSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  level: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').default('MEDIUM'),
  mitigation: Joi.string().trim().max(2000).optional().allow('', null),
  status: Joi.string().valid('OPEN', 'MITIGATED', 'CLOSED', 'ACCEPTED').default('OPEN'),
});

const updateRiskSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).optional(),
  description: Joi.string().trim().max(2000).optional().allow('', null),
  level: Joi.string().valid('LOW', 'MEDIUM', 'HIGH', 'CRITICAL').optional(),
  mitigation: Joi.string().trim().max(2000).optional().allow('', null),
  status: Joi.string().valid('OPEN', 'MITIGATED', 'CLOSED', 'ACCEPTED').optional(),
});

// ─── Communication ────────────────────────────────────────

const createCommunicationSchema = Joi.object({
  subject: Joi.string().trim().min(3).max(200).required(),
  message: Joi.string().trim().min(5).max(5000).required(),
  recipients: Joi.string().trim().max(500).optional().allow('', null),
});

// ─── Material Consumption ─────────────────────────────────

const consumeMaterialSchema = Joi.object({
  inventoryItemId: Joi.string().uuid().required(),
  batchId: Joi.string().uuid().optional().allow(null),
  quantityUsed: Joi.number().positive().required().messages({
    'any.required': 'Quantity used is required',
    'number.positive': 'Quantity must be greater than 0',
  }),
  notes: Joi.string().trim().max(1000).optional().allow('', null),
});

module.exports = {
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  createRiskSchema,
  updateRiskSchema,
  createCommunicationSchema,
  consumeMaterialSchema,
};
