// src/modules/procurement/procurement.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('./procurement.controller');
const { authenticate } = require('../../middleware/auth');
const { authorize, permissions } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const {
  createSupplierSchema, updateSupplierSchema,
  createRFQSchema, updateRFQSchema, rfqActionSchema,
  createQuoteSchema, selectQuoteSchema,
  createPOSchema, updatePOSchema, approvePOSchema,
  createReceivingSchema,
} = require('./procurement.validation');

// All procurement routes require authentication
router.use(authenticate);

// ─── Stats ────────────────────────────────────────────────
router.get('/stats', permissions.reports.view, ctrl.getProcurementStats);

// ─── Suppliers ────────────────────────────────────────────
router.get('/suppliers', permissions.procurement.view, ctrl.getSuppliers);
router.get('/suppliers/:id', permissions.procurement.view, ctrl.getSupplierById);
router.post('/suppliers', permissions.procurement.create, validate(createSupplierSchema), ctrl.createSupplier);
router.patch('/suppliers/:id', permissions.procurement.create, validate(updateSupplierSchema), ctrl.updateSupplier);
router.delete('/suppliers/:id', permissions.procurement.delete, ctrl.deleteSupplier);

// ─── RFQs ─────────────────────────────────────────────────
router.get('/rfqs', permissions.procurement.view, ctrl.getRFQs);
router.get('/rfqs/:id', permissions.procurement.view, ctrl.getRFQById);
router.post('/rfqs', permissions.procurement.create, validate(createRFQSchema), ctrl.createRFQ);
router.patch('/rfqs/:id', permissions.procurement.create, validate(updateRFQSchema), ctrl.updateRFQ);

// RFQ Workflow actions
router.post('/rfqs/:id/submit', permissions.procurement.create, ctrl.submitRFQ);
router.post('/rfqs/:id/approve', permissions.procurement.approve, validate(rfqActionSchema), ctrl.approveRFQ);
router.post('/rfqs/:id/reject', permissions.procurement.approve, validate(rfqActionSchema), ctrl.rejectRFQ);

// ─── Quotes ───────────────────────────────────────────────
router.get('/rfqs/:rfqId/compare', permissions.procurement.view, ctrl.getQuoteComparison);
router.post('/quotes', permissions.procurement.create, validate(createQuoteSchema), ctrl.createQuote);
router.post('/rfqs/:rfqId/quotes/:quoteId/select', permissions.procurement.approve, validate(selectQuoteSchema), ctrl.selectQuote);

// ─── Purchase Orders ──────────────────────────────────────
router.get('/purchase-orders', permissions.procurement.view, ctrl.getPOs);
router.get('/purchase-orders/:id', permissions.procurement.view, ctrl.getPOById);
router.post('/purchase-orders', permissions.procurement.create, validate(createPOSchema), ctrl.createPO);
router.patch('/purchase-orders/:id', permissions.procurement.create, validate(updatePOSchema), ctrl.updatePO);

// PO Workflow actions
router.post('/purchase-orders/:id/submit', permissions.procurement.create, ctrl.submitPO);
router.post('/purchase-orders/:id/approve', permissions.procurement.approve, validate(approvePOSchema), ctrl.approvePO);
router.post('/purchase-orders/:id/reject', permissions.procurement.approve, validate(approvePOSchema), ctrl.rejectPO);
router.post('/purchase-orders/:id/cancel', permissions.procurement.approve, ctrl.cancelPO);

// ─── Receiving ────────────────────────────────────────────
router.get('/purchase-orders/:id/receivings', permissions.procurement.view, ctrl.getReceivingsByPO);
router.post('/purchase-orders/:id/receive', permissions.procurement.create, validate(createReceivingSchema), ctrl.receivePO);

module.exports = router;
