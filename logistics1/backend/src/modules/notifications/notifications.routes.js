// src/modules/notifications/notifications.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('./notifications.controller');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');

router.use(authenticate);

router.get('/',              ctrl.getMyNotifications);
router.get('/unread-count',  ctrl.getUnreadCount);
router.post('/mark-all-read', ctrl.markAllAsRead);
router.post('/clear-read',   ctrl.clearAllRead);
router.patch('/:id/read',    ctrl.markAsRead);
router.delete('/:id',        ctrl.deleteNotification);

// Admin-only: trigger system-wide alert scan
router.post('/scan', authorize('ADMIN', 'MANAGER'), ctrl.runAlertScan);

module.exports = router;
