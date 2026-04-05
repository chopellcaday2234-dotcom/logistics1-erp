// src/middleware/validate.js
// Joi validation middleware factory

const { sendBadRequest } = require('../utils/response');

/**
 * Validate request body against a Joi schema
 * Usage: router.post('/path', validate(schema), controller)
 */
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = source === 'query' ? req.query : source === 'params' ? req.params : req.body;

    const { error, value } = schema.validate(data, {
      abortEarly: false,      // Return all errors
      allowUnknown: false,    // Reject unknown fields
      stripUnknown: true,     // Strip unknown fields
    });

    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/"/g, ''),
      }));
      return sendBadRequest(res, 'Validation failed', errors);
    }

    // Replace with validated (and stripped) values
    if (source === 'query') req.query = value;
    else if (source === 'params') req.params = value;
    else req.body = value;

    next();
  };
};

module.exports = { validate };
