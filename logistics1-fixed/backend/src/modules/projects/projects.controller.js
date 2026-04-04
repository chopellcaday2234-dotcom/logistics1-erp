// src/modules/projects/projects.controller.js
const svc = require('./projects.service');
const { sendSuccess, sendCreated } = require('../../utils/response');

// ─── Projects ─────────────────────────────────────────────

const getProjects = async (req, res, next) => {
  try {
    const { page, limit, status, department, search, createdById } = req.query;
    const result = await svc.getProjects({
      page: parseInt(page) || 1, limit: parseInt(limit) || 20,
      status, department, search, createdById,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const getProjectById = async (req, res, next) => {
  try {
    const project = await svc.getProjectById(req.params.id);
    return sendSuccess(res, { project });
  } catch (e) { next(e); }
};

const createProject = async (req, res, next) => {
  try {
    const project = await svc.createProject(req.body, req.user);
    return sendCreated(res, { project }, `Project ${project.projectCode} created`);
  } catch (e) { next(e); }
};

const updateProject = async (req, res, next) => {
  try {
    const project = await svc.updateProject(req.params.id, req.body, req.user);
    return sendSuccess(res, { project }, 'Project updated successfully');
  } catch (e) { next(e); }
};

const deleteProject = async (req, res, next) => {
  try {
    await svc.deleteProject(req.params.id, req.user);
    return sendSuccess(res, null, 'Project deleted successfully');
  } catch (e) { next(e); }
};

// ─── Tasks ────────────────────────────────────────────────

const getTasks = async (req, res, next) => {
  try {
    const { status, priority } = req.query;
    const tasks = await svc.getTasks(req.params.id, { status, priority });
    return sendSuccess(res, { tasks });
  } catch (e) { next(e); }
};

const createTask = async (req, res, next) => {
  try {
    const task = await svc.createTask(req.params.id, req.body, req.user);
    return sendCreated(res, { task }, 'Task created successfully');
  } catch (e) { next(e); }
};

const updateTask = async (req, res, next) => {
  try {
    const task = await svc.updateTask(req.params.id, req.params.taskId, req.body, req.user);
    return sendSuccess(res, { task }, 'Task updated successfully');
  } catch (e) { next(e); }
};

const deleteTask = async (req, res, next) => {
  try {
    await svc.deleteTask(req.params.id, req.params.taskId, req.user);
    return sendSuccess(res, null, 'Task deleted successfully');
  } catch (e) { next(e); }
};

// ─── Risks ────────────────────────────────────────────────

const getRisks = async (req, res, next) => {
  try {
    const risks = await svc.getRisks(req.params.id);
    return sendSuccess(res, { risks });
  } catch (e) { next(e); }
};

const createRisk = async (req, res, next) => {
  try {
    const risk = await svc.createRisk(req.params.id, req.body, req.user);
    return sendCreated(res, { risk }, 'Risk created successfully');
  } catch (e) { next(e); }
};

const updateRisk = async (req, res, next) => {
  try {
    const risk = await svc.updateRisk(req.params.id, req.params.riskId, req.body, req.user);
    return sendSuccess(res, { risk }, 'Risk updated successfully');
  } catch (e) { next(e); }
};

const deleteRisk = async (req, res, next) => {
  try {
    await svc.deleteRisk(req.params.id, req.params.riskId, req.user);
    return sendSuccess(res, null, 'Risk deleted successfully');
  } catch (e) { next(e); }
};

// ─── Communications ───────────────────────────────────────

const getCommunications = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.getCommunications(req.params.id, {
      page: parseInt(page) || 1, limit: parseInt(limit) || 20,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const createCommunication = async (req, res, next) => {
  try {
    const comm = await svc.createCommunication(req.params.id, req.body, req.user);
    return sendCreated(res, { communication: comm }, 'Communication logged successfully');
  } catch (e) { next(e); }
};

// ─── Materials ────────────────────────────────────────────

const getMaterials = async (req, res, next) => {
  try {
    const { page, limit } = req.query;
    const result = await svc.getMaterials(req.params.id, {
      page: parseInt(page) || 1, limit: parseInt(limit) || 20,
    });
    return sendSuccess(res, result);
  } catch (e) { next(e); }
};

const consumeMaterial = async (req, res, next) => {
  try {
    const result = await svc.consumeMaterial(req.params.id, req.body, req.user);
    const msg = result.lowStockAlert
      ? `Material consumed. ⚠️ LOW STOCK: ${result.item.name} is below reorder point`
      : `Material consumed from ${result.item.sku}`;
    return sendCreated(res, result, msg);
  } catch (e) { next(e); }
};

// ─── Analytics ────────────────────────────────────────────

const getProjectStats = async (req, res, next) => {
  try {
    const stats = await svc.getProjectStats();
    return sendSuccess(res, { stats });
  } catch (e) { next(e); }
};

const getProjectBudgetReport = async (req, res, next) => {
  try {
    const report = await svc.getProjectBudgetReport(req.params.id);
    return sendSuccess(res, { report });
  } catch (e) { next(e); }
};

module.exports = {
  getProjects, getProjectById, createProject, updateProject, deleteProject,
  getTasks, createTask, updateTask, deleteTask,
  getRisks, createRisk, updateRisk, deleteRisk,
  getCommunications, createCommunication,
  getMaterials, consumeMaterial,
  getProjectStats, getProjectBudgetReport,
};
