// src/modules/auth/auth.validation.js
const Joi = require('joi');

const registerSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required().messages({
    'string.email': 'Please provide a valid email address',
    'any.required': 'Email is required',
  }),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters',
      'string.pattern.base': 'Password must contain uppercase, lowercase, and a number',
      'any.required': 'Password is required',
    }),
  firstName: Joi.string().trim().min(2).max(50).required(),
  lastName: Joi.string().trim().min(2).max(50).required(),
  role: Joi.string().valid('ADMIN', 'MANAGER', 'STAFF', 'TECHNICIAN').default('STAFF'),
  department: Joi.string().trim().max(100).optional().allow('', null),
  phone: Joi.string().trim().max(20).optional().allow('', null),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().trim().required(),
  password: Joi.string().required(),
});

const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).optional(),
  lastName: Joi.string().trim().min(2).max(50).optional(),
  department: Joi.string().trim().max(100).optional().allow('', null),
  phone: Joi.string().trim().max(20).optional().allow('', null),
});

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .required()
    .messages({
      'string.min': 'New password must be at least 8 characters',
      'string.pattern.base': 'New password must contain uppercase, lowercase, and a number',
    }),
});

const updateUserSchema = Joi.object({
  firstName: Joi.string().trim().min(2).max(50).optional(),
  lastName: Joi.string().trim().min(2).max(50).optional(),
  role: Joi.string().valid('ADMIN', 'MANAGER', 'STAFF', 'TECHNICIAN').optional(),
  status: Joi.string().valid('ACTIVE', 'INACTIVE', 'SUSPENDED').optional(),
  department: Joi.string().trim().max(100).optional().allow('', null),
  phone: Joi.string().trim().max(20).optional().allow('', null),
});

module.exports = {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  updateUserSchema,
};
