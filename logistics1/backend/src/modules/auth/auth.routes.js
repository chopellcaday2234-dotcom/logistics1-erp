// src/modules/auth/auth.routes.js
const express = require('express');
const router = express.Router();

const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const { authLimiter } = require('../../middleware/rateLimiter');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  updateUserSchema,
} = require('./auth.validation');

// ─── Public routes (no auth required) ────────────────────
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/forgot-password', authLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// ─── Protected routes ─────────────────────────────────────
router.use(authenticate); // All routes below require valid JWT

router.post('/logout', authController.logout);
router.get('/profile', authController.getProfile);
router.patch('/profile', validate(updateProfileSchema), authController.updateProfile);
router.patch('/change-password', validate(changePasswordSchema), authController.changePassword);

// ─── Admin-only routes ────────────────────────────────────
router.post(
  '/register',
  authorize('ADMIN'),
  validate(registerSchema),
  authController.register
);

router.get('/users', authorize('ADMIN'), authController.getAllUsers);
router.patch(
  '/users/:userId',
  authorize('ADMIN'),
  validate(updateUserSchema),
  authController.updateUser
);

module.exports = router;
