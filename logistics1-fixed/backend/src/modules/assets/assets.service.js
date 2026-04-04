// src/modules/assets/assets.service.js
const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { createAuditLog } = require('../../utils/audit');
const logger = require('../../utils/logger');

// ─── Status Transition Rules ──────────────────────────────
const VALID_TRANSITIONS = {
  ACTIVE:            ['UNDER_MAINTENANCE', 'RETIRED', 'DISPOSED', 'LOST'],
  UNDER_MAINTENANCE: ['ACTIVE', 'RETIRED', 'DISPOSED'],
  RETIRED:           ['DISPOSED'],
  DISPOSED:          [],
  LOST:              ['ACTIVE'],
};

const validateTransition = (from, to) => {
  if (!VALID_TRANSITIONS[from]) throw new AppError(`Unknown status: ${from}`, 400);
  if (!VALID_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      `Invalid status transition: ${from} → ${to}. Allowed: ${VALID_TRANSITIONS[from].join(', ') || 'none'}`,
      400
    );
  }
};

// ─────────────────────────────────────────────────────────
// ASSET CRUD
// ─────────────────────────────────────────────────────────

const getAssets = async ({
  page = 1, limit = 20, status, category, department,
  search, warrantyExpiringSoon, maintenanceDueSoon,
} = {}) => {
  const skip = (page - 1) * limit;
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const where = {
    ...(status && { status }),
    ...(category && { category: { contains: category } }),
    ...(department && { department: { contains: department } }),
    ...(warrantyExpiringSoon && {
      warrantyExpiry: { lte: thirtyDaysOut, gte: now },
    }),
    ...(maintenanceDueSoon && {
      nextMaintenance: { lte: thirtyDaysOut },
      status: { not: 'RETIRED' },
    }),
    ...(search && {
      OR: [
        { assetCode: { contains: search } },
        { name: { contains: search } },
        { serialNumber: { contains: search } },
        { model: { contains: search } },
        { manufacturer: { contains: search } },
        { location: { contains: search } },
      ],
    }),
  };

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { assetCode: 'asc' },
      skip,
      take: limit,
      include: {
        inventoryItem: { select: { sku: true, name: true } },
        _count: { select: { workOrders: true, assetLogs: true, maintenanceSchedules: true } },
      },
    }),
    prisma.asset.count({ where }),
  ]);

  // Enrich with warranty/maintenance flags
  const enriched = assets.map((a) => ({
    ...a,
    warrantyExpired: a.warrantyExpiry ? a.warrantyExpiry < now : null,
    maintenanceOverdue: a.nextMaintenance ? a.nextMaintenance < now : false,
    maintenanceDueSoon: a.nextMaintenance
      ? a.nextMaintenance >= now && a.nextMaintenance <= thirtyDaysOut
      : false,
  }));

  return {
    assets: enriched,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

const getAssetById = async (id) => {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      inventoryItem: { select: { sku: true, name: true, unit: true, category: true } },
      batch: { select: { batchNumber: true, unitCost: true, expiryDate: true } },
      assetLogs: { orderBy: { createdAt: 'desc' }, take: 20 },
      maintenanceSchedules: {
        orderBy: { nextDue: 'asc' },
        include: {
          workOrders: {
            orderBy: { createdAt: 'desc' },
            take: 3,
            select: { id: true, woNumber: true, status: true, completedDate: true },
          },
        },
      },
      workOrders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, woNumber: true, title: true, type: true,
          status: true, priority: true, completedDate: true, totalCost: true,
        },
      },
    },
  });

  if (!asset) throw new AppError('Asset not found', 404);

  const now = new Date();
  return {
    ...asset,
    warrantyExpired: asset.warrantyExpiry ? asset.warrantyExpiry < now : null,
    maintenanceOverdue: asset.nextMaintenance ? asset.nextMaintenance < now : false,
    totalMaintenanceCost: asset.workOrders.reduce((sum, wo) => sum + (wo.totalCost || 0), 0),
    workOrderCount: asset.workOrders.length,
  };
};

const createAsset = async (data, user) => {
  const existing = await prisma.asset.findUnique({ where: { assetCode: data.assetCode } });
  if (existing) throw new AppError(`Asset code "${data.assetCode}" already exists`, 409);

  // Validate inventory item link
  if (data.inventoryItemId) {
    const invItem = await prisma.inventoryItem.findUnique({ where: { id: data.inventoryItemId } });
    if (!invItem) throw new AppError('Linked inventory item not found', 404);
  }

  // Validate batch link
  if (data.batchId) {
    const batch = await prisma.inventoryBatch.findUnique({ where: { id: data.batchId } });
    if (!batch) throw new AppError('Linked batch not found', 404);
    if (data.inventoryItemId && batch.inventoryItemId !== data.inventoryItemId) {
      throw new AppError('Batch does not belong to the specified inventory item', 400);
    }
  }

  const asset = await prisma.asset.create({
    data: {
      ...data,
      purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
      warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : null,
      nextMaintenance: data.nextMaintenance ? new Date(data.nextMaintenance) : null,
    },
  });

  // Create initial asset log
  await prisma.assetLog.create({
    data: {
      assetId: asset.id,
      action: 'CREATED',
      description: `Asset created: ${asset.name} (${asset.assetCode})`,
      newStatus: asset.status,
      performedBy: `${user.firstName} ${user.lastName}`,
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'ASSETS',
    entityId: asset.id, entityType: 'Asset',
    newValues: { assetCode: asset.assetCode, name: asset.name, status: asset.status },
    description: `Asset created: ${asset.assetCode} — ${asset.name}`,
  });

  logger.info(`Asset created: ${asset.assetCode} by ${user.email}`);
  return asset;
};

const updateAsset = async (id, data, user) => {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) throw new AppError('Asset not found', 404);

  // Prevent direct status change through updateAsset — use changeAssetStatus
  if (data.status) {
    throw new AppError('Use the status-change endpoint to update asset status', 400);
  }

  const updated = await prisma.asset.update({
    where: { id },
    data: {
      ...data,
      warrantyExpiry: data.warrantyExpiry ? new Date(data.warrantyExpiry) : undefined,
      nextMaintenance: data.nextMaintenance ? new Date(data.nextMaintenance) : undefined,
    },
  });

  await prisma.assetLog.create({
    data: {
      assetId: id,
      action: 'UPDATED',
      description: `Asset details updated. Fields: ${Object.keys(data).join(', ')}`,
      performedBy: `${user.firstName} ${user.lastName}`,
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'ASSETS',
    entityId: id, entityType: 'Asset',
    oldValues: asset, newValues: data,
    description: `Asset updated: ${asset.assetCode}`,
  });

  return updated;
};

const changeAssetStatus = async (id, { status, reason, notes }, user) => {
  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) throw new AppError('Asset not found', 404);
  if (asset.status === status) throw new AppError(`Asset is already in ${status} status`, 400);

  // Enforce transition rules
  validateTransition(asset.status, status);

  // Prevent retiring an asset with open work orders
  if (status === 'RETIRED' || status === 'DISPOSED') {
    const openWOs = await prisma.workOrder.count({
      where: { assetId: id, status: { in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] } },
    });
    if (openWOs > 0) {
      throw new AppError(
        `Cannot ${status.toLowerCase()} asset with ${openWOs} open work order(s). Close them first.`,
        409
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.asset.update({
      where: { id },
      data: {
        status,
        ...(status === 'ACTIVE' && { lastMaintenance: new Date() }),
      },
    });

    await tx.assetLog.create({
      data: {
        assetId: id,
        action: 'STATUS_CHANGE',
        description: reason,
        oldStatus: asset.status,
        newStatus: status,
        performedBy: `${user.firstName} ${user.lastName}`,
      },
    });

    if (notes) {
      await tx.asset.update({ where: { id }, data: { notes } });
    }

    return result;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'ASSETS',
    entityId: id, entityType: 'Asset',
    oldValues: { status: asset.status },
    newValues: { status },
    description: `Asset status changed: ${asset.assetCode} — ${asset.status} → ${status}. Reason: ${reason}`,
  });

  logger.info(`Asset ${asset.assetCode} status: ${asset.status} → ${status} by ${user.email}`);
  return updated;
};

const deleteAsset = async (id, user) => {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: { _count: { select: { workOrders: true } } },
  });
  if (!asset) throw new AppError('Asset not found', 404);
  if (!['RETIRED', 'DISPOSED'].includes(asset.status)) {
    throw new AppError('Only RETIRED or DISPOSED assets can be deleted', 409);
  }
  if (asset._count.workOrders > 0) {
    throw new AppError('Cannot delete asset with work order history', 409);
  }

  await prisma.assetLog.deleteMany({ where: { assetId: id } });
  await prisma.asset.delete({ where: { id } });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'ASSETS',
    entityId: id, entityType: 'Asset',
    description: `Asset deleted: ${asset.assetCode} — ${asset.name}`,
  });
};

// ─────────────────────────────────────────────────────────
// BATCH → ASSET CONVERSION
// Deducts 1 unit from inventory batch and creates an asset record
// ─────────────────────────────────────────────────────────

const convertBatchToAsset = async (data, user) => {
  const { inventoryItemId, batchId, ...assetData } = data;

  // Validate existing asset code
  const existing = await prisma.asset.findUnique({ where: { assetCode: assetData.assetCode } });
  if (existing) throw new AppError(`Asset code "${assetData.assetCode}" already exists`, 409);

  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item) throw new AppError('Inventory item not found', 404);

  const batch = await prisma.inventoryBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new AppError('Batch not found', 404);
  if (batch.inventoryItemId !== inventoryItemId) {
    throw new AppError('Batch does not belong to this inventory item', 400);
  }
  if (batch.status !== 'ACTIVE') throw new AppError('Batch is not active', 400);
  if (batch.remainingQty < 1) throw new AppError('Batch has insufficient quantity for conversion', 400);
  if (item.currentStock < 1) throw new AppError('Inventory item has no available stock', 400);

  const asset = await prisma.$transaction(async (tx) => {
    // 1. Deduct 1 unit from batch
    const updatedBatch = await tx.inventoryBatch.update({
      where: { id: batchId },
      data: { remainingQty: { decrement: 1 } },
    });
    if (updatedBatch.remainingQty <= 0) {
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { status: 'DEPLETED', remainingQty: 0 },
      });
    }

    // 2. Deduct from item currentStock
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentStock: { decrement: 1 } },
    });

    // 3. Create OUT stock movement
    await tx.stockMovement.create({
      data: {
        inventoryItemId,
        batchId,
        movementType: 'OUT',
        source: 'MANUAL_ADJUSTMENT',
        quantity: 1,
        unitCost: batch.unitCost,
        totalCost: batch.unitCost,
        notes: `Converted to asset: ${assetData.assetCode}`,
        performedById: user.id,
      },
    });

    // 4. Create asset record linked to batch
    const newAsset = await tx.asset.create({
      data: {
        ...assetData,
        inventoryItemId,
        batchId,
        purchaseCost: batch.unitCost,
        currentValue: batch.unitCost,
        status: 'ACTIVE',
        condition: 'GOOD',
        purchaseDate: batch.createdAt,
        warrantyExpiry: assetData.warrantyExpiry ? new Date(assetData.warrantyExpiry) : null,
        nextMaintenance: assetData.nextMaintenance ? new Date(assetData.nextMaintenance) : null,
      },
    });

    // 5. Create asset log
    await tx.assetLog.create({
      data: {
        assetId: newAsset.id,
        action: 'CONVERTED_FROM_INVENTORY',
        description: `Converted from inventory batch ${batch.batchNumber} (${item.sku} — ${item.name})`,
        newStatus: 'ACTIVE',
        performedBy: `${user.firstName} ${user.lastName}`,
      },
    });

    return newAsset;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'ASSETS',
    entityId: asset.id, entityType: 'Asset',
    newValues: { assetCode: asset.assetCode, inventoryItemId, batchId },
    description: `Inventory → Asset conversion: Batch ${batch.batchNumber} (${item.sku}) → ${asset.assetCode}`,
  });

  logger.info(`Batch ${batch.batchNumber} converted to asset ${asset.assetCode} by ${user.email}`);
  return asset;
};

// ─────────────────────────────────────────────────────────
// ASSET LOGS
// ─────────────────────────────────────────────────────────

const getAssetLogs = async (assetId, { page = 1, limit = 20 } = {}) => {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new AppError('Asset not found', 404);

  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.assetLog.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.assetLog.count({ where: { assetId } }),
  ]);

  return { logs, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const addAssetLog = async (assetId, { action, description, performedBy }, user) => {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new AppError('Asset not found', 404);

  const log = await prisma.assetLog.create({
    data: {
      assetId,
      action: action || 'NOTE',
      description,
      performedBy: performedBy || `${user.firstName} ${user.lastName}`,
    },
  });

  return log;
};

// ─────────────────────────────────────────────────────────
// MAINTENANCE SCHEDULES
// ─────────────────────────────────────────────────────────

const getSchedules = async ({ page = 1, limit = 20, assetId, isActive, overdue } = {}) => {
  const skip = (page - 1) * limit;
  const now = new Date();

  const where = {
    ...(assetId && { assetId }),
    ...(isActive !== undefined && {
      isActive: isActive === 'true' || isActive === true,
    }),
    ...(overdue === 'true' || overdue === true
      ? { nextDue: { lt: now }, isActive: true }
      : {}),
  };

  const [schedules, total] = await Promise.all([
    prisma.maintenanceSchedule.findMany({
      where,
      orderBy: { nextDue: 'asc' },
      skip,
      take: limit,
      include: {
        asset: { select: { assetCode: true, name: true, location: true, status: true } },
        _count: { select: { workOrders: true } },
      },
    }),
    prisma.maintenanceSchedule.count({ where }),
  ]);

  const enriched = schedules.map((s) => ({
    ...s,
    isOverdue: s.nextDue < now,
    daysUntilDue: Math.ceil((s.nextDue - now) / (1000 * 60 * 60 * 24)),
  }));

  return { schedules: enriched, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const getScheduleById = async (id) => {
  const schedule = await prisma.maintenanceSchedule.findUnique({
    where: { id },
    include: {
      asset: { select: { assetCode: true, name: true, status: true, location: true } },
      workOrders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, woNumber: true, title: true, status: true,
          completedDate: true, totalCost: true,
        },
      },
    },
  });
  if (!schedule) throw new AppError('Maintenance schedule not found', 404);
  return schedule;
};

const createSchedule = async (data, user) => {
  const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
  if (!asset) throw new AppError('Asset not found', 404);
  if (asset.status === 'RETIRED' || asset.status === 'DISPOSED') {
    throw new AppError('Cannot create maintenance schedule for a retired or disposed asset', 400);
  }

  const schedule = await prisma.maintenanceSchedule.create({
    data: {
      ...data,
      nextDue: new Date(data.nextDue),
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'ASSETS',
    entityId: schedule.id, entityType: 'MaintenanceSchedule',
    newValues: { assetId: data.assetId, title: data.title, frequencyDays: data.frequencyDays },
    description: `Maintenance schedule created: "${data.title}" for asset ${asset.assetCode}`,
  });

  return schedule;
};

const updateSchedule = async (id, data, user) => {
  const schedule = await prisma.maintenanceSchedule.findUnique({ where: { id } });
  if (!schedule) throw new AppError('Maintenance schedule not found', 404);

  const updated = await prisma.maintenanceSchedule.update({
    where: { id },
    data: {
      ...data,
      ...(data.nextDue && { nextDue: new Date(data.nextDue) }),
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'ASSETS',
    entityId: id, entityType: 'MaintenanceSchedule',
    oldValues: schedule, newValues: data,
    description: `Maintenance schedule updated: "${schedule.title}"`,
  });

  return updated;
};

const deleteSchedule = async (id, user) => {
  const schedule = await prisma.maintenanceSchedule.findUnique({
    where: { id },
    include: { _count: { select: { workOrders: true } } },
  });
  if (!schedule) throw new AppError('Maintenance schedule not found', 404);
  if (schedule._count.workOrders > 0) {
    throw new AppError('Cannot delete schedule with work order history. Deactivate it instead.', 409);
  }

  await prisma.maintenanceSchedule.delete({ where: { id } });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'ASSETS',
    entityId: id, entityType: 'MaintenanceSchedule',
    description: `Maintenance schedule deleted: "${schedule.title}"`,
  });
};

// Advance schedule next-due date after WO completion
const advanceSchedule = async (scheduleId, completedDate, user) => {
  const schedule = await prisma.maintenanceSchedule.findUnique({ where: { id: scheduleId } });
  if (!schedule) throw new AppError('Schedule not found', 404);

  const baseDate = completedDate ? new Date(completedDate) : new Date();
  const nextDue = new Date(baseDate.getTime() + schedule.frequencyDays * 24 * 60 * 60 * 1000);

  const updated = await prisma.maintenanceSchedule.update({
    where: { id: scheduleId },
    data: { lastPerformed: baseDate, nextDue },
  });

  // Also update the linked asset's maintenance dates
  await prisma.asset.update({
    where: { id: schedule.assetId },
    data: { lastMaintenance: baseDate, nextMaintenance: nextDue },
  });

  logger.info(`Schedule "${schedule.title}" advanced: next due ${nextDue.toISOString().split('T')[0]}`);
  return updated;
};

// ─────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────

const getAssetStats = async () => {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    totalAssets,
    byStatus,
    byCondition,
    maintenanceDueSoon,
    maintenanceOverdue,
    warrantyExpiringSoon,
    totalValue,
    recentLogs,
    topMaintenanceCost,
  ] = await Promise.all([
    prisma.asset.count(),

    prisma.asset.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    prisma.asset.groupBy({
      by: ['condition'],
      _count: { id: true },
    }),

    prisma.asset.count({
      where: {
        nextMaintenance: { gte: now, lte: thirtyDays },
        status: { notIn: ['RETIRED', 'DISPOSED'] },
      },
    }),

    prisma.asset.count({
      where: {
        nextMaintenance: { lt: now },
        status: { notIn: ['RETIRED', 'DISPOSED'] },
      },
    }),

    prisma.asset.count({
      where: { warrantyExpiry: { gte: now, lte: thirtyDays } },
    }),

    prisma.asset.aggregate({
      _sum: { currentValue: true, purchaseCost: true },
      where: { status: { notIn: ['DISPOSED'] } },
    }),

    prisma.assetLog.findMany({
      take: 8,
      orderBy: { createdAt: 'desc' },
      include: { asset: { select: { assetCode: true, name: true } } },
    }),

    prisma.workOrder.groupBy({
      by: ['assetId'],
      _sum: { totalCost: true },
      where: { status: 'COMPLETED', assetId: { not: null } },
      orderBy: { _sum: { totalCost: 'desc' } },
      take: 5,
    }),
  ]);

  // Enrich top maintenance cost
  const assetIds = topMaintenanceCost.map((t) => t.assetId).filter(Boolean);
  const assetDetails = await prisma.asset.findMany({
    where: { id: { in: assetIds } },
    select: { id: true, assetCode: true, name: true, category: true },
  });

  return {
    totalAssets,
    byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count.id }), {}),
    byCondition: byCondition.reduce((acc, c) => ({ ...acc, [c.condition]: c._count.id }), {}),
    maintenance: { dueSoon: maintenanceDueSoon, overdue: maintenanceOverdue },
    warrantyExpiringSoon,
    totalCurrentValue: totalValue._sum.currentValue || 0,
    totalPurchaseCost: totalValue._sum.purchaseCost || 0,
    depreciationValue: (totalValue._sum.purchaseCost || 0) - (totalValue._sum.currentValue || 0),
    recentActivity: recentLogs,
    topMaintenanceCost: topMaintenanceCost.map((t) => ({
      ...t,
      asset: assetDetails.find((a) => a.id === t.assetId),
    })),
  };
};

const getMaintenanceDueReport = async () => {
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [overdue, dueThisWeek, dueThisMonth] = await Promise.all([
    prisma.maintenanceSchedule.findMany({
      where: { nextDue: { lt: now }, isActive: true },
      include: {
        asset: { select: { assetCode: true, name: true, location: true, status: true } },
      },
      orderBy: { nextDue: 'asc' },
    }),

    prisma.maintenanceSchedule.findMany({
      where: { nextDue: { gte: now, lte: sevenDays }, isActive: true },
      include: {
        asset: { select: { assetCode: true, name: true, location: true, status: true } },
      },
      orderBy: { nextDue: 'asc' },
    }),

    prisma.maintenanceSchedule.findMany({
      where: { nextDue: { gt: sevenDays, lte: thirtyDays }, isActive: true },
      include: {
        asset: { select: { assetCode: true, name: true, location: true, status: true } },
      },
      orderBy: { nextDue: 'asc' },
    }),
  ]);

  return {
    overdue: overdue.map((s) => ({
      ...s,
      daysOverdue: Math.abs(Math.ceil((s.nextDue - now) / (1000 * 60 * 60 * 24))),
    })),
    dueThisWeek,
    dueThisMonth,
    summary: {
      overdueCount: overdue.length,
      dueThisWeekCount: dueThisWeek.length,
      dueThisMonthCount: dueThisMonth.length,
    },
  };
};

module.exports = {
  // Assets
  getAssets, getAssetById, createAsset, updateAsset, changeAssetStatus, deleteAsset,
  // Conversion
  convertBatchToAsset,
  // Logs
  getAssetLogs, addAssetLog,
  // Schedules
  getSchedules, getScheduleById, createSchedule, updateSchedule, deleteSchedule, advanceSchedule,
  // Analytics
  getAssetStats, getMaintenanceDueReport,
};
