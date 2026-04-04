// src/modules/validation/validation.controller.js
const svc = require('./validation.service');
const { sendSuccess } = require('../../utils/response');

const runFullValidation = async (req, res, next) => {
  try {
    const result = await svc.runFullValidation();
    return sendSuccess(res, result,
      `Validation complete. ${result.summary.totalIssues} issue(s) found. System health: ${result.systemHealth.status}`);
  } catch (e) { next(e); }
};

const runModuleValidation = async (req, res, next) => {
  try {
    const { module } = req.params;
    const result = await svc.runModuleValidation(module);
    return sendSuccess(res, result,
      `${module} validation complete. ${result.issueCount} issue(s) found.`);
  } catch (e) { next(e); }
};

module.exports = { runFullValidation, runModuleValidation };
