// src/modules/procurement/procurement.controller.js
const svc = require('./procurement.service');
const { sendSuccess, sendCreated, sendError } = require('../../utils/response');

// ─── Suppliers ────────────────────────────────────────────

const getSuppliers = async (req, res, next) => {
  try {
    const { page, limit, status, search } = req.query;
    const result = await svc.getSuppliers({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status, search,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await svc.getSupplierById(req.params.id);
    return sendSuccess(res, { supplier });
  } catch (e) { next(e); }
};

const createSupplier = async (req, res, next) => {
  try {
    const supplier = await svc.createSupplier(req.body, req.user);
    return sendCreated(res, { supplier }, 'Supplier created successfully');
  } catch (e) { next(e); }
};

const updateSupplier = async (req, res, next) => {
  try {
    const supplier = await svc.updateSupplier(req.params.id, req.body, req.user);
    return sendSuccess(res, { supplier }, 'Supplier updated successfully');
  } catch (e) { next(e); }
};

const deleteSupplier = async (req, res, next) => {
  try {
    await svc.deleteSupplier(req.params.id, req.user);
    return sendSuccess(res, null, 'Supplier deleted successfully');
  } catch (e) { next(e); }
};

// ─── RFQs ─────────────────────────────────────────────────

const getRFQs = async (req, res, next) => {
  try {
    const { page, limit, status, search, projectId } = req.query;
    const result = await svc.getRFQs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status, search, projectId,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getRFQById = async (req, res, next) => {
  try {
    const rfq = await svc.getRFQById(req.params.id);
    return sendSuccess(res, { rfq });
  } catch (e) { next(e); }
};

const createRFQ = async (req, res, next) => {
  try {
    const rfq = await svc.createRFQ(req.body, req.user);
    return sendCreated(res, { rfq }, 'RFQ created successfully');
  } catch (e) { next(e); }
};

const updateRFQ = async (req, res, next) => {
  try {
    const rfq = await svc.updateRFQ(req.params.id, req.body, req.user);
    return sendSuccess(res, { rfq }, 'RFQ updated successfully');
  } catch (e) { next(e); }
};

const submitRFQ = async (req, res, next) => {
  try {
    const rfq = await svc.submitRFQ(req.params.id, req.user);
    return sendSuccess(res, { rfq }, 'RFQ submitted to suppliers');
  } catch (e) { next(e); }
};

const approveRFQ = async (req, res, next) => {
  try {
    const rfq = await svc.approveRFQ(req.params.id, req.body, req.user);
    return sendSuccess(res, { rfq }, 'RFQ approved successfully');
  } catch (e) { next(e); }
};

const rejectRFQ = async (req, res, next) => {
  try {
    const rfq = await svc.rejectRFQ(req.params.id, req.body, req.user);
    return sendSuccess(res, { rfq }, 'RFQ rejected');
  } catch (e) { next(e); }
};

// ─── Quotes ───────────────────────────────────────────────

const createQuote = async (req, res, next) => {
  try {
    const quote = await svc.createQuote(req.body, req.user);
    return sendCreated(res, { quote }, 'Quote submitted successfully');
  } catch (e) { next(e); }
};

const selectQuote = async (req, res, next) => {
  try {
    const result = await svc.selectQuote(
      req.params.rfqId,
      req.params.quoteId,
      req.body,
      req.user
    );
    return sendSuccess(res, result, 'Quote selected successfully');
  } catch (e) { next(e); }
};

const getQuoteComparison = async (req, res, next) => {
  try {
    const comparison = await svc.getQuoteComparison(req.params.rfqId);
    return sendSuccess(res, { comparison });
  } catch (e) { next(e); }
};

// ─── Purchase Orders ──────────────────────────────────────

const getPOs = async (req, res, next) => {
  try {
    const { page, limit, status, supplierId, projectId, search } = req.query;
    const result = await svc.getPOs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status, supplierId, projectId, search,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getPOById = async (req, res, next) => {
  try {
    const po = await svc.getPOById(req.params.id);
    return sendSuccess(res, { po });
  } catch (e) { next(e); }
};

const createPO = async (req, res, next) => {
  try {
    const po = await svc.createPO(req.body, req.user);
    return sendCreated(res, { po }, 'Purchase Order created successfully');
  } catch (e) { next(e); }
};

const updatePO = async (req, res, next) => {
  try {
    const po = await svc.updatePO(req.params.id, req.body, req.user);
    return sendSuccess(res, { po }, 'Purchase Order updated successfully');
  } catch (e) { next(e); }
};

const submitPO = async (req, res, next) => {
  try {
    const po = await svc.submitPO(req.params.id, req.user);
    return sendSuccess(res, { po }, 'Purchase Order submitted for approval');
  } catch (e) { next(e); }
};

const approvePO = async (req, res, next) => {
  try {
    const po = await svc.approvePO(req.params.id, req.body, req.user);
    return sendSuccess(res, { po }, 'Purchase Order approved');
  } catch (e) { next(e); }
};

const rejectPO = async (req, res, next) => {
  try {
    const po = await svc.rejectPO(req.params.id, req.body, req.user);
    return sendSuccess(res, { po }, 'Purchase Order rejected back to DRAFT');
  } catch (e) { next(e); }
};

const cancelPO = async (req, res, next) => {
  try {
    const po = await svc.cancelPO(req.params.id, req.user);
    return sendSuccess(res, { po }, 'Purchase Order cancelled');
  } catch (e) { next(e); }
};

// ─── Receiving ────────────────────────────────────────────

const receivePO = async (req, res, next) => {
  try {
    const result = await svc.receivePO(req.params.id, req.body, req.user);
    return sendCreated(res, result, `Goods received. Receipt: ${result.receiving.receiptNumber}`);
  } catch (e) { next(e); }
};

const getReceivingsByPO = async (req, res, next) => {
  try {
    const receivings = await svc.getReceivingsByPO(req.params.id);
    return sendSuccess(res, { receivings });
  } catch (e) { next(e); }
};

// ─── Stats ────────────────────────────────────────────────

const getProcurementStats = async (req, res, next) => {
  try {
    const stats = await svc.getProcurementStats();
    return sendSuccess(res, { stats });
  } catch (e) { next(e); }
};

module.exports = {
  getSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier,
  getRFQs, getRFQById, createRFQ, updateRFQ, submitRFQ, approveRFQ, rejectRFQ,
  createQuote, selectQuote, getQuoteComparison,
  getPOs, getPOById, createPO, updatePO, submitPO, approvePO, rejectPO, cancelPO,
  receivePO, getReceivingsByPO,
  getProcurementStats,
};
