// src/modules/auth/auth.controller.js
const authService = require('./auth.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/response');
const { getAuditMeta } = require('../../utils/audit');

const register = async (req, res, next) => {
  try {
    const user = await authService.register(req.body, req.user || null);
    return sendCreated(res, { user }, 'Account created successfully');
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const meta = getAuditMeta(req);
    const result = await authService.login(req.body, meta);
    return sendSuccess(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return sendError(res, 'Refresh token is required', 400);
    }
    const tokens = await authService.refreshAccessToken(refreshToken);
    return sendSuccess(res, tokens, 'Token refreshed successfully');
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    return sendSuccess(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    return sendSuccess(res, { user });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const user = await authService.updateProfile(req.user.id, req.body);
    return sendSuccess(res, { user }, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.body);
    return sendSuccess(res, null, 'Password changed successfully');
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    await authService.forgotPassword(req.body);
    // Always return success to prevent email enumeration
    return sendSuccess(res, null, 'If that email exists, a reset link has been sent.');
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body);
    return sendSuccess(res, null, 'Password has been reset successfully. You can now log in.');
  } catch (error) {
    next(error);
  }
};

// ─── Admin User Management ────────────────────────────────

const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const result = await authService.getAllUsers({
      page: parseInt(page),
      limit: parseInt(limit),
      role, status, search,
    });
    return sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = await authService.updateUser(userId, req.body, req.user);
    return sendSuccess(res, { user }, 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getAllUsers,
  updateUser,
};
