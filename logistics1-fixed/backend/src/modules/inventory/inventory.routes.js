// src/modules/inventory/inventory.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('./inventory.controller');
const { authenticate } = require('../../middleware/auth');
const { permissions } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const {
  createItemSchema, updateItemSchema,
  adjustmentSchema, issueStockSchema,
  updateBatchSchema, transferStockSchema,
  createPickingSchema,
} = require('./inventory.validation');

router.use(authenticate);

// ─── Analytics & Alerts (before :id routes) ──────────────
router.get('/stats',          permissions.reports.view,    ctrl.getInventoryStats);
router.get('/valuation',      permissions.reports.view,    ctrl.getStockValuation);
router.get('/low-stock',      permissions.inventory.view,  ctrl.getLowStockItems);
router.get('/expiring',       permissions.inventory.view,  ctrl.getExpiringBatches);

// ─── Inventory Items ──────────────────────────────────────
router.get('/',               permissions.inventory.view,  ctrl.getItems);
router.get('/:id',            permissions.inventory.view,  ctrl.getItemById);
router.post('/',              permissions.inventory.create, validate(createItemSchema), ctrl.createItem);
router.patch('/:id',          permissions.inventory.create, validate(updateItemSchema), ctrl.updateItem);
router.delete('/:id',         permissions.inventory.delete, ctrl.deleteItem);

// ─── Batches ──────────────────────────────────────────────
router.get('/batches/all',    permissions.inventory.view,  ctrl.getBatches);
router.get('/batches/:id',    permissions.inventory.view,  ctrl.getBatchById);
router.patch('/batches/:id',  permissions.inventory.adjust, validate(updateBatchSchema), ctrl.updateBatch);

// ─── Stock Movements ──────────────────────────────────────
router.get('/movements/all',  permissions.inventory.view,  ctrl.getMovements);

// ─── Stock Operations ─────────────────────────────────────
router.post('/adjust',        permissions.inventory.adjust, validate(adjustmentSchema),   ctrl.adjustStock);
router.post('/issue',         permissions.inventory.create, validate(issueStockSchema),   ctrl.issueStock);
router.post('/transfer',      permissions.inventory.adjust, validate(transferStockSchema), ctrl.transferStock);
router.post('/pick',          permissions.inventory.create, validate(createPickingSchema), ctrl.createPickingList);

module.exports = router;
