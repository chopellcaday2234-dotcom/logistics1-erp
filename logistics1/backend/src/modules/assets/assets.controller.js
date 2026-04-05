// src/modules/assets/assets.controller.js
const svc = require('./assets.service');
const { sendSuccess, sendCreated } = require('../../utils/response');

// ─── Assets ───────────────────────────────────────────────

const getAssets = async (req, res, next) => {
  try {
    const {
      page, limit, status, category, department,
      search, warrantyExpiringSoon, maintenanceDueSoon,
    } = req.query;
    const result = await svc.getAssets({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      status, category, department, search,
      warrantyExpiringSoon, maintenanceDueSoon,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getAssetById = async (req, res, next) => {
  try {
    const asset = await svc.getAssetById(req.params.id);
    return sendSuccess(res, { asset });
  } catch (e) { next(e); }
};

const createAsset = async (req, res, next) => {
  try {
    const asset = await svc.createAsset(req.body, req.user);
    return sendCreated(res, { asset }, 'Asset created successfully');
  } catch (e) { next(e); }
};

const updateAsset = async (req, res, next) => {
  try {
    const asset = await svc.updateAsset(req.params.id, req.body, req.user);
    return sendSuccess(res, { asset }, 'Asset updated successfully');
  } catch (e) { next(e); }
};

const changeAssetStatus = async (req, res, next) => {
  try {
    const asset = await svc.changeAssetStatus(req.params.id, req.body, req.user);
    return sendSuccess(res, { asset }, `Asset status changed to ${req.body.status}`);
  } catch (e) { next(e); }
};

const deleteAsset = async (req, res, next) => {
  try {
    await svc.deleteAsset(req.params.id, req.user);
    return sendSuccess(res, null, 'Asset deleted successfully');
  } catch (e) { next(e); }
};

const convertBatchToAsset = async (req, res, next) => {
  try {
    const asset = await svc.convertBatchToAsset(req.body, req.user);
    return sendCreated(res, { asset }, `Asset ${asset.assetCode} created from inventory batch`);
  } catch (e) { next(e); }
};

// ─── Asset Logs ───────────────────────────────────────────

const getAssetLogs = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.getAssetLogs(req.params.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const addAssetLog = async (req, res, next) => {
  try {
    const log = await svc.addAssetLog(req.params.id, req.body, req.user);
    return sendCreated(res, { log }, 'Asset log entry added');
  } catch (e) { next(e); }
};

// ─── Maintenance Schedules ────────────────────────────────

const getSchedules = async (req, res, next) => {
  try {
    const { page, limit, assetId, isActive, overdue } = req.query;
    const result = await svc.getSchedules({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      assetId, isActive, overdue,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getScheduleById = async (req, res, next) => {
  try {
    const schedule = await svc.getScheduleById(req.params.id);
    return sendSuccess(res, { schedule });
  } catch (e) { next(e); }
};

const createSchedule = async (req, res, next) => {
  try {
    const schedule = await svc.createSchedule(req.body, req.user);
    return sendCreated(res, { schedule }, 'Maintenance schedule created successfully');
  } catch (e) { next(e); }
};

const updateSchedule = async (req, res, next) => {
  try {
    const schedule = await svc.updateSchedule(req.params.id, req.body, req.user);
    return sendSuccess(res, { schedule }, 'Maintenance schedule updated successfully');
  } catch (e) { next(e); }
};

const deleteSchedule = async (req, res, next) => {
  try {
    await svc.deleteSchedule(req.params.id, req.user);
    return sendSuccess(res, null, 'Maintenance schedule deleted');
  } catch (e) { next(e); }
};

const advanceSchedule = async (req, res, next) => {
  try {
    const { completedDate } = req.body;
    const schedule = await svc.advanceSchedule(req.params.id, completedDate, req.user);
    return sendSuccess(res, { schedule }, `Schedule advanced. Next due: ${schedule.nextDue}`);
  } catch (e) { next(e); }
};

// ─── Analytics ────────────────────────────────────────────

const getAssetStats = async (req, res, next) => {
  try {
    const stats = await svc.getAssetStats();
    return sendSuccess(res, { stats });
  } catch (e) { next(e); }
};

const getMaintenanceDueReport = async (req, res, next) => {
  try {
    const report = await svc.getMaintenanceDueReport();
    return sendSuccess(res, { report });
  } catch (e) { next(e); }
};

module.exports = {
  getAssets, getAssetById, createAsset, updateAsset, changeAssetStatus, deleteAsset,
  convertBatchToAsset,
  getAssetLogs, addAssetLog,
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule, advanceSchedule,
  getAssetStats, getMaintenanceDueReport,
};
