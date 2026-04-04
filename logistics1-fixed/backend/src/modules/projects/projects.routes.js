// src/modules/projects/projects.routes.js
const express = require('express');
const router = express.Router();

const ctrl = require('./projects.controller');
const { authenticate } = require('../../middleware/auth');
const { permissions } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validate');
const {
  createProjectSchema, updateProjectSchema,
  createTaskSchema, updateTaskSchema,
  createRiskSchema, updateRiskSchema,
  createCommunicationSchema, consumeMaterialSchema,
} = require('./projects.validation');

router.use(authenticate);

// ─── Analytics (before :id routes) ───────────────────────
router.get('/stats', permissions.reports.view, ctrl.getProjectStats);

// ─── Project CRUD ─────────────────────────────────────────
router.get('/',    permissions.projects.view,   ctrl.getProjects);
router.get('/:id', permissions.projects.view,   ctrl.getProjectById);
router.post('/',   permissions.projects.create, validate(createProjectSchema), ctrl.createProject);
router.patch('/:id', permissions.projects.update, validate(updateProjectSchema), ctrl.updateProject);
router.delete('/:id', permissions.projects.delete, ctrl.deleteProject);

// ─── Budget Report ────────────────────────────────────────
router.get('/:id/budget-report', permissions.reports.view, ctrl.getProjectBudgetReport);

// ─── Tasks ────────────────────────────────────────────────
router.get('/:id/tasks',              permissions.projects.view,   ctrl.getTasks);
router.post('/:id/tasks',             permissions.projects.update, validate(createTaskSchema), ctrl.createTask);
router.patch('/:id/tasks/:taskId',    permissions.projects.update, validate(updateTaskSchema), ctrl.updateTask);
router.delete('/:id/tasks/:taskId',   permissions.projects.delete, ctrl.deleteTask);

// ─── Risks ────────────────────────────────────────────────
router.get('/:id/risks',              permissions.projects.view,   ctrl.getRisks);
router.post('/:id/risks',             permissions.projects.update, validate(createRiskSchema), ctrl.createRisk);
router.patch('/:id/risks/:riskId',    permissions.projects.update, validate(updateRiskSchema), ctrl.updateRisk);
router.delete('/:id/risks/:riskId',   permissions.projects.delete, ctrl.deleteRisk);

// ─── Communications ───────────────────────────────────────
router.get('/:id/communications',  permissions.projects.view,   ctrl.getCommunications);
router.post('/:id/communications', permissions.projects.update, validate(createCommunicationSchema), ctrl.createCommunication);

// ─── Material Consumption ─────────────────────────────────
router.get('/:id/materials',   permissions.projects.view,   ctrl.getMaterials);
router.post('/:id/materials',  permissions.projects.update, validate(consumeMaterialSchema), ctrl.consumeMaterial);

module.exports = router;
