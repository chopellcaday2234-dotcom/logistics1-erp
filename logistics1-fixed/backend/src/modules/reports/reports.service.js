// src/modules/reports/reports.service.js
const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');

// ─────────────────────────────────────────────────────────
// MASTER DASHBOARD REPORT
// FIX BUG 2 & 7: Removed broken prisma.fields?.reorderPoint query.
// Low-stock count is now computed entirely in-memory.
// ─────────────────────────────────────────────────────────

const getDashboardReport = async () => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    pendingPOs,
    poValueThisMonth,
    activeSuppliers,
    totalInventoryValue,
    expiringBatchCount,
    totalAssets,
    assetsUnderMaintenance,
    maintenanceOverdue,
    openWOs,
    overdueWOs,
    woCompletedThisMonth,
    maintenanceCostThisMonth,
    activeProjects,
    totalProjectBudget,
    totalProjectSpend,
    totalUnreadNotifications,
    recentAuditLogs,
    // FIX BUG 2: Fetch items for in-memory low-stock calculation (no broken fields? filter)
    allActiveItems,
  ] = await Promise.all([
    prisma.purchaseOrder.count({ where: { status: 'PENDING_APPROVAL' } }),

    prisma.purchaseOrder.aggregate({
      _sum: { totalAmount: true },
      where: { createdAt: { gte: thirtyDaysAgo }, status: { notIn: ['CANCELLED'] } },
    }),

    prisma.supplier.count({ where: { status: 'ACTIVE' } }),

    prisma.inventoryBatch.aggregate({
      _sum: { totalCost: true },
      where: { status: 'ACTIVE' },
    }),

    prisma.inventoryBatch.count({
      where: { status: 'ACTIVE', expiryDate: { gte: now, lte: in30Days } },
    }),

    prisma.asset.count({ where: { status: { notIn: ['DISPOSED'] } } }),
    prisma.asset.count({ where: { status: 'UNDER_MAINTENANCE' } }),

    prisma.maintenanceSchedule.count({
      where: { isActive: true, nextDue: { lt: now } },
    }),

    prisma.workOrder.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),

    prisma.workOrder.count({
      where: { dueDate: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED'] } },
    }),

    prisma.workOrder.count({
      where: { status: 'COMPLETED', completedDate: { gte: thirtyDaysAgo } },
    }),

    prisma.workOrder.aggregate({
      _sum: { totalCost: true },
      where: { status: 'COMPLETED', completedDate: { gte: thirtyDaysAgo } },
    }),

    prisma.project.count({ where: { status: 'ACTIVE' } }),

    prisma.project.aggregate({
      _sum: { budget: true },
      where: { status: { notIn: ['CANCELLED'] } },
    }),

    prisma.project.aggregate({
      _sum: { actualCost: true },
      where: { status: { notIn: ['CANCELLED'] } },
    }),

    prisma.notification.count({ where: { isRead: false } }),

    prisma.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true, role: true } } },
    }),

    // FIX BUG 2: Fetch all active items to compute low-stock count in memory
    prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { currentStock: true, reorderPoint: true },
    }),
  ]);

  // FIX BUG 2: In-memory low-stock count (Prisma cannot compare two columns)
  const lowStockItems = allActiveItems.filter((i) => i.reorderPoint > 0 && i.currentStock <= i.reorderPoint).length;

  // Over-budget project count (in-memory to avoid complex where)
  const allProjects = await prisma.project.findMany({
    where: { budget: { gt: 0 }, status: { notIn: ['CANCELLED'] } },
    select: { budget: true, actualCost: true },
  });
  const overBudgetProjects = allProjects.filter((p) => p.actualCost > p.budget).length;

  return {
    generatedAt: now,
    procurement: {
      pendingApprovals: pendingPOs,
      poValueThisMonth: poValueThisMonth._sum.totalAmount || 0,
      activeSuppliers,
    },
    inventory: {
      totalStockValue: totalInventoryValue._sum.totalCost || 0,
      lowStockItems,
      expiringBatchesSoon: expiringBatchCount,
    },
    assets: {
      totalAssets,
      underMaintenance: assetsUnderMaintenance,
      maintenanceSchedulesOverdue: maintenanceOverdue,
    },
    mro: {
      openWorkOrders: openWOs,
      overdueWorkOrders: overdueWOs,
      completedThisMonth: woCompletedThisMonth,
      maintenanceCostThisMonth: maintenanceCostThisMonth._sum.totalCost || 0,
    },
    projects: {
      activeProjects,
      overBudgetProjects,
      totalBudget: totalProjectBudget._sum.budget || 0,
      totalSpend: totalProjectSpend._sum.actualCost || 0,
      budgetVariance:
        (totalProjectBudget._sum.budget || 0) - (totalProjectSpend._sum.actualCost || 0),
    },
    system: {
      totalUnreadNotifications,
      recentActivity: recentAuditLogs,
    },
  };
};

// ─────────────────────────────────────────────────────────
// INVENTORY REPORTS
// ─────────────────────────────────────────────────────────

const getInventoryReport = async ({ dateFrom, dateTo, category } = {}) => {
  const where = {
    isActive: true,
    ...(category && { category }),
  };

  const movementWhere = {
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      },
    }),
  };

  const [
    items,
    totalIN,
    totalOUT,
    byCategory,
    topMovers,
  ] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: {
        batches: { where: { status: 'ACTIVE' }, select: { remainingQty: true, unitCost: true } },
      },
      orderBy: { category: 'asc' },
    }),

    prisma.stockMovement.aggregate({
      _sum: { quantity: true, totalCost: true },
      where: { movementType: 'IN', ...movementWhere },
    }),

    prisma.stockMovement.aggregate({
      _sum: { quantity: true, totalCost: true },
      where: { movementType: 'OUT', ...movementWhere },
    }),

    prisma.inventoryItem.groupBy({
      by: ['category'],
      where,
      _count: { id: true },
      _sum: { currentStock: true },
    }),

    prisma.stockMovement.groupBy({
      by: ['inventoryItemId'],
      where: { movementType: 'OUT', ...movementWhere },
      _sum: { quantity: true, totalCost: true },
      orderBy: { _sum: { totalCost: 'desc' } },
      take: 10,
    }),
  ]);

  const itemIds = topMovers.map((t) => t.inventoryItemId);
  const itemDetails = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sku: true, name: true, unit: true, category: true },
  });

  const stockValuation = items.map((item) => {
    const value = item.batches.reduce((s, b) => s + b.remainingQty * b.unitCost, 0);
    return {
      sku: item.sku, name: item.name, category: item.category, unit: item.unit,
      currentStock: item.currentStock, averageCost: item.averageCost,
      totalValue: value, isLowStock: item.currentStock <= item.reorderPoint,
    };
  });

  return {
    summary: {
      totalItems: items.length,
      totalStockValue: stockValuation.reduce((s, i) => s + i.totalValue, 0),
      totalIN: totalIN._sum.quantity || 0,
      totalINValue: totalIN._sum.totalCost || 0,
      totalOUT: totalOUT._sum.quantity || 0,
      totalOUTValue: totalOUT._sum.totalCost || 0,
    },
    byCategory,
    stockValuation,
    topMovers: topMovers.map((m) => ({
      ...m,
      item: itemDetails.find((i) => i.id === m.inventoryItemId),
    })),
    generatedAt: new Date(),
    filters: { dateFrom, dateTo, category },
  };
};

// ─────────────────────────────────────────────────────────
// SUPPLIER PERFORMANCE REPORT
// ─────────────────────────────────────────────────────────

const getSupplierPerformanceReport = async ({ dateFrom, dateTo } = {}) => {
  const where = {
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      },
    }),
    status: { notIn: ['CANCELLED'] },
  };

  const pos = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: { select: { id: true, code: true, name: true, rating: true, leadTimeDays: true } },
      receivings: { select: { receivedDate: true, status: true } },
    },
  });

  const supplierMap = {};
  for (const po of pos) {
    const sid = po.supplierId;
    if (!supplierMap[sid]) {
      supplierMap[sid] = {
        supplier: po.supplier,
        totalPOs: 0,
        totalValue: 0,
        fullyReceived: 0,
        partiallyReceived: 0,
        onTimeDeliveries: 0,
        lateDeliveries: 0,
      };
    }
    supplierMap[sid].totalPOs++;
    supplierMap[sid].totalValue += po.totalAmount;
    if (po.status === 'RECEIVED') supplierMap[sid].fullyReceived++;
    if (po.status === 'PARTIALLY_RECEIVED') supplierMap[sid].partiallyReceived++;

    if (po.receivedAt && po.expectedDate) {
      if (po.receivedAt <= po.expectedDate) supplierMap[sid].onTimeDeliveries++;
      else supplierMap[sid].lateDeliveries++;
    }
  }

  const performance = Object.values(supplierMap).map((s) => ({
    ...s,
    onTimeRate:
      s.onTimeDeliveries + s.lateDeliveries > 0
        ? Math.round((s.onTimeDeliveries / (s.onTimeDeliveries + s.lateDeliveries)) * 100)
        : null,
    fulfillmentRate:
      s.totalPOs > 0 ? Math.round((s.fullyReceived / s.totalPOs) * 100) : null,
  }));

  performance.sort((a, b) => b.totalValue - a.totalValue);

  return {
    suppliers: performance,
    summary: {
      totalSuppliers: performance.length,
      totalPOValue: performance.reduce((s, p) => s + p.totalValue, 0),
      avgOnTimeRate:
        performance.filter((p) => p.onTimeRate !== null).length > 0
          ? Math.round(
              performance
                .filter((p) => p.onTimeRate !== null)
                .reduce((s, p) => s + p.onTimeRate, 0) /
                performance.filter((p) => p.onTimeRate !== null).length
            )
          : null,
    },
    generatedAt: new Date(),
    filters: { dateFrom, dateTo },
  };
};

// ─────────────────────────────────────────────────────────
// ASSET MAINTENANCE HISTORY REPORT
// ─────────────────────────────────────────────────────────

const getAssetMaintenanceReport = async ({ assetId, dateFrom, dateTo } = {}) => {
  const where = {
    ...(assetId && { assetId }),
    ...((dateFrom || dateTo)
      ? {
          createdAt: {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
          },
        }
      : {}),
    status: 'COMPLETED',
  };

  const [workOrders, totalCost, byType, byAsset] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      orderBy: { completedDate: 'desc' },
      include: {
        asset: { select: { assetCode: true, name: true, category: true, location: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        partsUsed: true,
      },
    }),

    prisma.workOrder.aggregate({
      _sum: { totalCost: true, actualHours: true, laborCost: true, partsCost: true },
      where,
    }),

    prisma.workOrder.groupBy({
      by: ['type'],
      where,
      _count: { id: true },
      _sum: { totalCost: true },
    }),

    prisma.workOrder.groupBy({
      by: ['assetId'],
      where: { ...where, assetId: { not: null } },
      _count: { id: true },
      _sum: { totalCost: true },
      orderBy: { _sum: { totalCost: 'desc' } },
      take: 10,
    }),
  ]);

  const assetIds = byAsset.map((a) => a.assetId).filter(Boolean);
  const assetDetails = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, assetCode: true, name: true, category: true },
  });

  return {
    workOrders,
    summary: {
      totalWorkOrders: workOrders.length,
      totalCost: totalCost._sum.totalCost || 0,
      totalHours: totalCost._sum.actualHours || 0,
      totalLaborCost: totalCost._sum.laborCost || 0,
      totalPartsCost: totalCost._sum.partsCost || 0,
    },
    byType: byType.map((t) => ({ type: t.type, count: t._count.id, cost: t._sum.totalCost || 0 })),
    topAssetsByCost: byAsset.map((a) => ({
      ...a,
      asset: assetDetails.find((d) => d.id === a.assetId),
    })),
    generatedAt: new Date(),
    filters: { assetId, dateFrom, dateTo },
  };
};

// ─────────────────────────────────────────────────────────
// PROJECT MATERIAL CONSUMPTION REPORT
// ─────────────────────────────────────────────────────────

const getProjectMaterialReport = async ({ projectId, dateFrom, dateTo } = {}) => {
  const where = {
    ...(projectId && { projectId }),
    ...((dateFrom || dateTo) && {
      usedAt: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      },
    }),
  };

  const [materials, byProject, byItem, totalCost] = await Promise.all([
    prisma.projectMaterial.findMany({
      where,
      orderBy: { usedAt: 'desc' },
      include: {
        project: { select: { projectCode: true, name: true, status: true } },
      },
    }),

    prisma.projectMaterial.groupBy({
      by: ['projectId'],
      where,
      _sum: { quantityUsed: true, totalCost: true },
      _count: { id: true },
      orderBy: { _sum: { totalCost: 'desc' } },
    }),

    prisma.projectMaterial.groupBy({
      by: ['inventoryItemId'],
      where,
      _sum: { quantityUsed: true, totalCost: true },
      _count: { id: true },
      orderBy: { _sum: { totalCost: 'desc' } },
      take: 10,
    }),

    prisma.projectMaterial.aggregate({
      _sum: { totalCost: true, quantityUsed: true },
      where,
    }),
  ]);

  const projectIds = byProject.map((p) => p.projectId);
  const itemIds = byItem.map((i) => i.inventoryItemId);

  const [projectDetails, itemDetails] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, projectCode: true, name: true, status: true },
    }),
    prisma.inventoryItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, sku: true, name: true, unit: true, category: true },
    }),
  ]);

  return {
    materials,
    summary: {
      totalUsageEvents: materials.length,
      totalQuantityUsed: totalCost._sum.quantityUsed || 0,
      totalCost: totalCost._sum.totalCost || 0,
    },
    byProject: byProject.map((p) => ({
      ...p,
      project: projectDetails.find((d) => d.id === p.projectId),
    })),
    byItem: byItem.map((i) => ({
      ...i,
      item: itemDetails.find((d) => d.id === i.inventoryItemId),
    })),
    generatedAt: new Date(),
    filters: { projectId, dateFrom, dateTo },
  };
};

// ─────────────────────────────────────────────────────────
// AUDIT LOG REPORT
// ─────────────────────────────────────────────────────────

const getAuditReport = async ({
  page = 1, limit = 50, module, action, userId, dateFrom, dateTo,
} = {}) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(module && { module }),
    ...(action && { action }),
    ...(userId && { userId }),
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      },
    }),
  };

  const [logs, total, byModule, byAction] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip, take: limit,
      include: { user: { select: { firstName: true, lastName: true, role: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['module'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
    prisma.auditLog.groupBy({ by: ['action'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } }),
  ]);

  return {
    logs,
    summary: { byModule, byAction },
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    filters: { module, action, userId, dateFrom, dateTo },
  };
};

module.exports = {
  getDashboardReport,
  getInventoryReport,
  getSupplierPerformanceReport,
  getAssetMaintenanceReport,
  getProjectMaterialReport,
  getAuditReport,
  exportReportCSV,
};

// ─── CSV Export Helper ─────────────────────────────────────

async function exportReportCSV(type, filters = {}) {
  const { dateFrom, dateTo, category, projectId, assetId } = filters;
  const dateLabel = dateFrom ? `_${dateFrom}_to_${dateTo || 'now'}` : '';

  switch (type) {
    case 'inventory': {
      const report = await getInventoryReport({ dateFrom, dateTo, category });
      const rows = report.items.map(i => ({
        SKU: i.sku,
        Name: i.name,
        Category: i.category,
        Unit: i.unit,
        'Current Stock': i.currentStock,
        'Reserved Stock': i.reservedStock,
        'Reorder Point': i.reorderPoint,
        'Average Cost (PHP)': i.averageCost,
        'Stock Value (PHP)': i.stockValue,
        Status: i.currentStock <= 0 ? 'OUT OF STOCK' : i.currentStock <= i.reorderPoint ? 'LOW STOCK' : 'OK',
      }));
      return { rows, filename: `inventory_report${dateLabel}.csv` };
    }

    case 'supplier-performance': {
      const report = await getSupplierPerformanceReport({ dateFrom, dateTo });
      const rows = report.suppliers.map(s => ({
        'Supplier Code': s.code,
        'Supplier Name': s.name,
        'Total POs': s.totalPOs,
        'On-Time Deliveries': s.onTimeDeliveries,
        'On-Time Rate (%)': s.onTimeRate,
        'Total Spent (PHP)': s.totalSpent,
        'Avg Lead Time (days)': s.avgLeadTime,
        Rating: s.rating,
        Status: s.status,
      }));
      return { rows, filename: `supplier_performance${dateLabel}.csv` };
    }

    case 'asset-maintenance': {
      const report = await getAssetMaintenanceReport({ assetId, dateFrom, dateTo });
      const rows = report.workOrders.map(wo => ({
        'WO Number': wo.woNumber,
        Title: wo.title,
        Type: wo.type,
        Priority: wo.priority,
        Status: wo.status,
        Asset: wo.asset?.name || '',
        'Asset Code': wo.asset?.assetCode || '',
        'Labor Cost (PHP)': wo.laborCost,
        'Parts Cost (PHP)': wo.partsCost,
        'Total Cost (PHP)': wo.totalCost,
        'Completed Date': wo.completedDate ? new Date(wo.completedDate).toLocaleDateString() : '',
      }));
      return { rows, filename: `asset_maintenance${dateLabel}.csv` };
    }

    case 'project-materials': {
      const report = await getProjectMaterialReport({ projectId, dateFrom, dateTo });
      const rows = report.materials.map(m => ({
        Project: m.project?.name || '',
        'Project Code': m.project?.projectCode || '',
        Item: m.inventoryItem?.name || '',
        SKU: m.inventoryItem?.sku || '',
        'Qty Used': m.quantityUsed,
        Unit: m.inventoryItem?.unit || '',
        'Unit Cost (PHP)': m.unitCost,
        'Total Cost (PHP)': m.totalCost,
        'Used At': new Date(m.usedAt).toLocaleDateString(),
      }));
      return { rows, filename: `project_materials${dateLabel}.csv` };
    }

    case 'audit': {
      const report = await getAuditReport({ page: 1, limit: 5000, dateFrom, dateTo });
      const rows = report.logs.map(l => ({
        Date: new Date(l.createdAt).toLocaleString(),
        User: l.userEmail || '',
        Action: l.action,
        Module: l.module,
        'Entity Type': l.entityType || '',
        Description: l.description || '',
        'IP Address': l.ipAddress || '',
      }));
      return { rows, filename: `audit_log${dateLabel}.csv` };
    }

    default:
      throw new Error(`Unknown export type: ${type}`);
  }
}
