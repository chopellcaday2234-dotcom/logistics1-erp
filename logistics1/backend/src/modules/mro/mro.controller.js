// src/modules/mro/mro.controller.js
const svc = require('./mro.service');
const { sendSuccess, sendCreated } = require('../../utils/response');

// ─── Work Orders ──────────────────────────────────────────

const getWorkOrders = async (req, res, next) => {
  try {
    const { page, limit, status, type, priority, assetId, projectId, assignedToId, search, overdue } = req.query;
    const result = await svc.getWorkOrders({
      page: parseInt(page) || 1, limit: parseInt(limit) || 20,
      status, type, priority, assetId, projectId, assignedToId, search, overdue,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getWorkOrderById = async (req, res, next) => {
  try {
    const wo = await svc.getWorkOrderById(req.params.id);
    return sendSuccess(res, { workOrder: wo });
  } catch (e) { next(e); }
};

const createWorkOrder = async (req, res, next) => {
  try {
    const wo = await svc.createWorkOrder(req.body, req.user);
    return sendCreated(res, { workOrder: wo }, `Work order ${wo.woNumber} created`);
  } catch (e) { next(e); }
};

const updateWorkOrder = async (req, res, next) => {
  try {
    const wo = await svc.updateWorkOrder(req.params.id, req.body, req.user);
    return sendSuccess(res, { workOrder: wo }, 'Work order updated');
  } catch (e) { next(e); }
};

// ─── Workflow Transitions ─────────────────────────────────

const openWorkOrder = async (req, res, next) => {
  try {
    const wo = await svc.openWorkOrder(req.params.id, req.user);
    return sendSuccess(res, { workOrder: wo }, 'Work order opened');
  } catch (e) { next(e); }
};

const startWorkOrder = async (req, res, next) => {
  try {
    const wo = await svc.startWorkOrder(req.params.id, req.user);
    return sendSuccess(res, { workOrder: wo }, 'Work order started');
  } catch (e) { next(e); }
};

const holdWorkOrder = async (req, res, next) => {
  try {
    const wo = await svc.holdWorkOrder(req.params.id, req.body, req.user);
    return sendSuccess(res, { workOrder: wo }, 'Work order placed on hold');
  } catch (e) { next(e); }
};

const completeWorkOrder = async (req, res, next) => {
  try {
    const wo = await svc.completeWorkOrder(req.params.id, req.body, req.user);
    return sendSuccess(res, { workOrder: wo }, `Work order completed. Total cost: ₱${wo.totalCost?.toLocaleString()}`);
  } catch (e) { next(e); }
};

const cancelWorkOrder = async (req, res, next) => {
  try {
    const wo = await svc.cancelWorkOrder(req.params.id, req.body, req.user);
    return sendSuccess(res, { workOrder: wo }, 'Work order cancelled');
  } catch (e) { next(e); }
};

// ─── Maintenance Logs ─────────────────────────────────────

const getLogs = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.getLogs(req.params.id, {
      page: parseInt(page) || 1, limit: parseInt(limit) || 20,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const addLog = async (req, res, next) => {
  try {
    const log = await svc.addLog(req.params.id, req.body, req.user);
    return sendCreated(res, { log }, 'Maintenance log added');
  } catch (e) { next(e); }
};

const deleteLog = async (req, res, next) => {
  try {
    await svc.deleteLog(req.params.id, req.params.logId, req.user);
    return sendSuccess(res, null, 'Maintenance log deleted');
  } catch (e) { next(e); }
};

// ─── Parts Usage ──────────────────────────────────────────

const getParts = async (req, res, next) => {
  try {
    const parts = await svc.getParts(req.params.id);
    return sendSuccess(res, { parts });
  } catch (e) { next(e); }
};

const addPart = async (req, res, next) => {
  try {
    const part = await svc.addPart(req.params.id, req.body, req.user);
    return sendCreated(res, { part }, 'Part added to work order');
  } catch (e) { next(e); }
};

const removePart = async (req, res, next) => {
  try {
    await svc.removePart(req.params.id, req.params.partId, req.user);
    return sendSuccess(res, null, 'Part removed and inventory restored');
  } catch (e) { next(e); }
};

// ─── Analytics ────────────────────────────────────────────

const getMROStats = async (req, res, next) => {
  try {
    const stats = await svc.getMROStats();
    return sendSuccess(res, { stats });
  } catch (e) { next(e); }
};

module.exports = {
  getWorkOrders, getWorkOrderById, createWorkOrder, updateWorkOrder,
  openWorkOrder, startWorkOrder, holdWorkOrder, completeWorkOrder, cancelWorkOrder,
  getLogs, addLog, deleteLog,
  getParts, addPart, removePart,
  getMROStats,
};
