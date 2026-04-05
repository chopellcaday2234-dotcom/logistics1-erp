// src/modules/mro/mro.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('./mro.controller');
const { authenticate } = require('../../middleware/auth');
const { permissions } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const {
  createWorkOrderSchema, updateWorkOrderSchema,
  completeWorkOrderSchema, holdWorkOrderSchema,
  createMaintenanceLogSchema, addPartUsageSchema,
} = require('./mro.validation');

router.use(authenticate);

// ─── Analytics (before :id routes) ───────────────────────
router.get('/stats', permissions.reports.view, ctrl.getMROStats);

// ─── Work Orders ──────────────────────────────────────────
router.get('/',     permissions.mro.view,   ctrl.getWorkOrders);
router.get('/:id',  permissions.mro.view,   ctrl.getWorkOrderById);
router.post('/',    permissions.mro.create, validate(createWorkOrderSchema), ctrl.createWorkOrder);
router.patch('/:id', permissions.mro.create, validate(updateWorkOrderSchema), ctrl.updateWorkOrder);

// ─── WO Status Transitions ────────────────────────────────
router.post('/:id/open',     permissions.mro.create,   ctrl.openWorkOrder);
router.post('/:id/start',    permissions.mro.create,   ctrl.startWorkOrder);
router.post('/:id/hold',     permissions.mro.create,   validate(holdWorkOrderSchema), ctrl.holdWorkOrder);
router.post('/:id/complete', permissions.mro.complete, validate(completeWorkOrderSchema), ctrl.completeWorkOrder);
router.post('/:id/cancel',   permissions.mro.complete, ctrl.cancelWorkOrder);

// ─── Maintenance Logs ─────────────────────────────────────
router.get('/:id/logs',         permissions.mro.view,   ctrl.getLogs);
router.post('/:id/logs',        permissions.mro.create, validate(createMaintenanceLogSchema), ctrl.addLog);
router.delete('/:id/logs/:logId', permissions.mro.complete, ctrl.deleteLog);

// ─── Parts Usage ──────────────────────────────────────────
router.get('/:id/parts',           permissions.mro.view,   ctrl.getParts);
router.post('/:id/parts',          permissions.mro.create, validate(addPartUsageSchema), ctrl.addPart);
router.delete('/:id/parts/:partId', permissions.mro.complete, ctrl.removePart);

module.exports = router;
