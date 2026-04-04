// src/middleware/errorHandler.js
// Global error handling middleware

const logger = require('../utils/logger');

// Custom application error class
class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handler middleware (must have 4 params)
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors || null;

  // Prisma known errors
  if (err.code) {
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        message = `Duplicate entry: ${err.meta?.target?.join(', ')} already exists`;
        break;
      case 'P2025':
        statusCode = 404;
        message = 'Record not found';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Foreign key constraint failed — referenced record does not exist';
        break;
      case 'P2014':
        statusCode = 400;
        message = 'Invalid relation — the change violates a required relation';
        break;
      default:
        if (err.code.startsWith('P')) {
          statusCode = 400;
          message = `Database error: ${err.message}`;
        }
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Multer errors
  if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? `File too large. Maximum size: ${process.env.MAX_FILE_SIZE_MB || 10}MB`
      : `File upload error: ${err.message}`;
  }

  // Validation errors (Joi)
  if (err.isJoi) {
    statusCode = 400;
    message = 'Validation error';
    errors = err.details?.map(d => ({
      field: d.path?.join('.'),
      message: d.message,
    }));
  }

  // Log non-operational errors (bugs) at error level
  if (!err.isOperational) {
    logger.error(`Unhandled error: ${err.message}`, {
      stack: err.stack,
      path: req.path,
      method: req.method,
      body: req.body,
      user: req.user?.email,
    });
  } else {
    logger.warn(`Operational error: ${message}`, {
      statusCode,
      path: req.path,
      user: req.user?.email,
    });
  }

  // Don't leak stack traces in production
  const response = {
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV === 'development' && !err.isOperational && { stack: err.stack }),
  };

  res.status(statusCode).json(response);
};

// 404 handler — must be before errorHandler
const notFound = (req, res, next) => {
  const error = new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404);
  next(error);
};

module.exports = { AppError, errorHandler, notFound };
