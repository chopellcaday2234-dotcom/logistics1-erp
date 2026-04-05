// src/modules/assets/assets.routes.js
// FIX BUG 6: Moved POST /convert BEFORE dynamic /:id routes to prevent any
// future route shadowing. Static routes always before dynamic in Express.
const express = require('express');
const router = express.Router();

const ctrl = require('./assets.controller');
const { authenticate } = require('../../middleware/auth');
const { permissions } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const {
  createAssetSchema, updateAssetSchema, changeAssetStatusSchema,
  convertBatchToAssetSchema, createScheduleSchema, updateScheduleSchema,
} = require('./assets.validation');

router.use(authenticate);

// ─── Analytics (static paths — must come before any :id routes) ──────────
router.get('/stats',              permissions.assets.view,   ctrl.getAssetStats);
router.get('/maintenance-report', permissions.assets.view,   ctrl.getMaintenanceDueReport);

// ─── Maintenance Schedules (static prefix — before /:id dynamic routes) ───
router.get('/schedules/all',      permissions.assets.view,   ctrl.getSchedules);
router.get('/schedules/:id',      permissions.assets.view,   ctrl.getScheduleById);
router.post('/schedules',         permissions.assets.create, validate(createScheduleSchema), ctrl.createSchedule);
router.patch('/schedules/:id',    permissions.assets.update, validate(updateScheduleSchema), ctrl.updateSchedule);
router.delete('/schedules/:id',   permissions.assets.delete, ctrl.deleteSchedule);
router.post('/schedules/:id/advance', permissions.assets.update, ctrl.advanceSchedule);

// ─── Batch → Asset Conversion (static — before /:id dynamic routes) ───────
router.post('/convert',           permissions.assets.create, validate(convertBatchToAssetSchema), ctrl.convertBatchToAsset);

// ─── Asset CRUD (dynamic :id routes) ─────────────────────────────────────
router.get('/',                   permissions.assets.view,   ctrl.getAssets);
router.get('/:id',                permissions.assets.view,   ctrl.getAssetById);
router.post('/',                  permissions.assets.create, validate(createAssetSchema), ctrl.createAsset);
router.patch('/:id',              permissions.assets.update, validate(updateAssetSchema), ctrl.updateAsset);
router.delete('/:id',             permissions.assets.delete, ctrl.deleteAsset);

// ─── Status Workflow (after base CRUD) ────────────────────────────────────
router.post('/:id/status',        permissions.assets.update, validate(changeAssetStatusSchema), ctrl.changeAssetStatus);

// ─── Asset Logs ───────────────────────────────────────────────────────────
router.get('/:id/logs',           permissions.assets.view,   ctrl.getAssetLogs);
router.post('/:id/logs',          permissions.assets.update, ctrl.addAssetLog);

module.exports = router;
