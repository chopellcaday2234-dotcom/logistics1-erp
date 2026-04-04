// src/modules/reports/reports.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('./reports.controller');
const { authenticate } = require('../../middleware/auth');
const { permissions } = require('../../middleware/rbac');

router.use(authenticate);
router.use(permissions.reports.view); // All reports require MANAGER+

router.get('/dashboard',            ctrl.getDashboard);
router.get('/inventory',            ctrl.getInventoryReport);
router.get('/supplier-performance', ctrl.getSupplierPerformance);
router.get('/asset-maintenance',    ctrl.getAssetMaintenance);
router.get('/project-materials',    ctrl.getProjectMaterials);
router.get('/audit',                ctrl.getAuditLog);
router.get('/export/:type',         ctrl.exportReport);

module.exports = router;
