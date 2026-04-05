// src/modules/validation/validation.routes.js
const express = require('express');
const router = express.Router();
const ctrl = require('./validation.controller');
const { authenticate } = require('../../middleware/auth');
const { authorize } = require('../../middleware/rbac');

router.use(authenticate);
router.use(authorize('ADMIN', 'MANAGER'));

router.get('/run',              ctrl.runFullValidation);
router.get('/run/:module',      ctrl.runModuleValidation);

module.exports = router;
