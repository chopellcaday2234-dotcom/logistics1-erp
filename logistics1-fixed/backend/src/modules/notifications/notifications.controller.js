// src/modules/notifications/notifications.controller.js
const svc = require('./notifications.service');
const { sendSuccess, sendCreated } = require('../../utils/response');

const getMyNotifications = async (req, res, next) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await svc.getUserNotifications(req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      unreadOnly,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const result = await svc.getUnreadCount(req.user.id);
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const markAsRead = async (req, res, next) => {
  try {
    const notification = await svc.markAsRead(req.user.id, req.params.id);
    return sendSuccess(res, { notification }, 'Notification marked as read');
  } catch (e) { next(e); }
};

const markAllAsRead = async (req, res, next) => {
  try {
    const result = await svc.markAllAsRead(req.user.id);
    return sendSuccess(res, result, `${result.markedCount} notification(s) marked as read`);
  } catch (e) { next(e); }
};

const deleteNotification = async (req, res, next) => {
  try {
    await svc.deleteNotification(req.user.id, req.params.id);
    return sendSuccess(res, null, 'Notification deleted');
  } catch (e) { next(e); }
};

const clearAllRead = async (req, res, next) => {
  try {
    const result = await svc.clearAllRead(req.user.id);
    return sendSuccess(res, result, `${result.deletedCount} read notification(s) cleared`);
  } catch (e) { next(e); }
};

const runAlertScan = async (req, res, next) => {
  try {
    const result = await svc.runSystemAlertScan();
    return sendSuccess(res, result, `Alert scan complete. ${result.alertsFired} alert(s) fired.`);
  } catch (e) { next(e); }
};

module.exports = {
  getMyNotifications, getUnreadCount,
  markAsRead, markAllAsRead,
  deleteNotification, clearAllRead,
  runAlertScan,
};
