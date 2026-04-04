// src/modules/reports/reports.controller.js
const svc = require('./reports.service');
const { sendSuccess } = require('../../utils/response');
const { AppError } = require('../../middleware/errorHandler');

const getDashboard = async (req, res, next) => {
  try {
    const report = await svc.getDashboardReport();
    return sendSuccess(res, { report });
  } catch (e) { next(e); }
};

const getInventoryReport = async (req, res, next) => {
  try {
    const { dateFrom, dateTo, category } = req.query;
    const report = await svc.getInventoryReport({ dateFrom, dateTo, category });
    return sendSuccess(res, { report });
  } catch (e) { next(e); }
};

const getSupplierPerformance = async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const report = await svc.getSupplierPerformanceReport({ dateFrom, dateTo });
    return sendSuccess(res, { report });
  } catch (e) { next(e); }
};

const getAssetMaintenance = async (req, res, next) => {
  try {
    const { assetId, dateFrom, dateTo } = req.query;
    const report = await svc.getAssetMaintenanceReport({ assetId, dateFrom, dateTo });
    return sendSuccess(res, { report });
  } catch (e) { next(e); }
};

const getProjectMaterials = async (req, res, next) => {
  try {
    const { projectId, dateFrom, dateTo } = req.query;
    const report = await svc.getProjectMaterialReport({ projectId, dateFrom, dateTo });
    return sendSuccess(res, { report });
  } catch (e) { next(e); }
};

const getAuditLog = async (req, res, next) => {
  try {
    const { page, limit, module, action, userId, dateFrom, dateTo } = req.query;
    const report = await svc.getAuditReport({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      module, action, userId, dateFrom, dateTo,
    });
    return sendSuccess(res, report);
  } catch (e) { next(e); }
};

// ─── CSV Export ────────────────────────────────────────────
const exportReport = async (req, res, next) => {
  try {
    const { type } = req.params;
    const { dateFrom, dateTo, category, projectId, assetId } = req.query;

    const ALLOWED_TYPES = ['inventory', 'supplier-performance', 'asset-maintenance', 'project-materials', 'audit'];
    if (!ALLOWED_TYPES.includes(type)) {
      throw new AppError(`Invalid export type. Allowed: ${ALLOWED_TYPES.join(', ')}`, 400);
    }

    const { rows, filename } = await svc.exportReportCSV(type, {
      dateFrom, dateTo, category, projectId, assetId,
    });

    // Build CSV
    if (!rows || rows.length === 0) {
      return res.status(200)
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send('No data available for the selected filters.\n');
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(','),
      ...rows.map(row =>
        headers.map(h => {
          const val = row[h] == null ? '' : String(row[h]);
          // Escape values with commas, quotes, or newlines
          return val.includes(',') || val.includes('"') || val.includes('\n')
            ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(',')
      ),
    ];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvLines.join('\n'));
  } catch (e) { next(e); }
};

module.exports = {
  getDashboard,
  getInventoryReport,
  getSupplierPerformance,
  getAssetMaintenance,
  getProjectMaterials,
  getAuditLog,
  exportReport,
};
