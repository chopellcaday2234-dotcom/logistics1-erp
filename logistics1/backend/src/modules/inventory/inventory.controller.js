// src/modules/inventory/inventory.controller.js
const svc = require('./inventory.service');
const { sendSuccess, sendCreated } = require('../../utils/response');

// ─── Items ────────────────────────────────────────────────

const getItems = async (req, res, next) => {
  try {
    const { page, limit, category, isActive, search, lowStock, orderBy, orderDir } = req.query;
    const result = await svc.getItems({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      category, isActive, search, lowStock, orderBy, orderDir,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getItemById = async (req, res, next) => {
  try {
    const item = await svc.getItemById(req.params.id);
    return sendSuccess(res, { item });
  } catch (e) { next(e); }
};

const createItem = async (req, res, next) => {
  try {
    const item = await svc.createItem(req.body, req.user);
    return sendCreated(res, { item }, 'Inventory item created successfully');
  } catch (e) { next(e); }
};

const updateItem = async (req, res, next) => {
  try {
    const item = await svc.updateItem(req.params.id, req.body, req.user);
    return sendSuccess(res, { item }, 'Inventory item updated successfully');
  } catch (e) { next(e); }
};

const deleteItem = async (req, res, next) => {
  try {
    await svc.deleteItem(req.params.id, req.user);
    return sendSuccess(res, null, 'Inventory item deleted successfully');
  } catch (e) { next(e); }
};

// ─── Batches ──────────────────────────────────────────────

const getBatches = async (req, res, next) => {
  try {
    const { page, limit, inventoryItemId, status, expiringSoonDays } = req.query;
    const result = await svc.getBatches({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      inventoryItemId, status,
      expiringSoonDays: expiringSoonDays ? parseInt(expiringSoonDays) : undefined,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getBatchById = async (req, res, next) => {
  try {
    const batch = await svc.getBatchById(req.params.id);
    return sendSuccess(res, { batch });
  } catch (e) { next(e); }
};

const updateBatch = async (req, res, next) => {
  try {
    const batch = await svc.updateBatch(req.params.id, req.body, req.user);
    return sendSuccess(res, { batch }, 'Batch updated successfully');
  } catch (e) { next(e); }
};

// ─── Movements ────────────────────────────────────────────

const getMovements = async (req, res, next) => {
  try {
    const { page, limit, inventoryItemId, movementType, source, projectId, dateFrom, dateTo } = req.query;
    const result = await svc.getMovements({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      inventoryItemId, movementType, source, projectId, dateFrom, dateTo,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

// ─── Operations ───────────────────────────────────────────

const adjustStock = async (req, res, next) => {
  try {
    const result = await svc.adjustStock(req.body, req.user);
    return sendSuccess(res, result, 'Stock adjustment completed successfully');
  } catch (e) { next(e); }
};

const issueStock = async (req, res, next) => {
  try {
    const result = await svc.issueStock(req.body, req.user);
    const msg = result.lowStockAlert
      ? `Stock issued. ⚠️ LOW STOCK ALERT: ${result.item.name} is below reorder point!`
      : 'Stock issued successfully';
    return sendSuccess(res, result, msg);
  } catch (e) { next(e); }
};

const transferStock = async (req, res, next) => {
  try {
    const result = await svc.transferStock(req.body, req.user);
    return sendSuccess(res, result, 'Stock transferred successfully');
  } catch (e) { next(e); }
};

const createPickingList = async (req, res, next) => {
  try {
    const result = await svc.createPickingList(req.body, req.user);
    return sendCreated(res, result, `Picking list dispatched for ${result.referenceNumber}`);
  } catch (e) { next(e); }
};

// ─── Alerts ───────────────────────────────────────────────

const getLowStockItems = async (req, res, next) => {
  try {
    const result = await svc.getLowStockItems();
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getExpiringBatches = async (req, res, next) => {
  try {
    const { days } = req.query;
    const result = await svc.getExpiringBatches(parseInt(days) || 30);
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

// ─── Analytics ────────────────────────────────────────────

const getInventoryStats = async (req, res, next) => {
  try {
    const stats = await svc.getInventoryStats();
    return sendSuccess(res, { stats });
  } catch (e) { next(e); }
};

const getStockValuation = async (req, res, next) => {
  try {
    const report = await svc.getStockValuation();
    return sendSuccess(res, { report });
  } catch (e) { next(e); }
};

module.exports = {
  getItems, getItemById, createItem, updateItem, deleteItem,
  getBatches, getBatchById, updateBatch,
  getMovements,
  adjustStock, issueStock, transferStock, createPickingList,
  getLowStockItems, getExpiringBatches,
  getInventoryStats, getStockValuation,
};
