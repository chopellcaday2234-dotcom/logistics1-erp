// src/modules/mro/mro.service.js
const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { createAuditLog } = require('../../utils/audit');
const logger = require('../../utils/logger');

// ─── Status Transition Rules ──────────────────────────────
const WO_TRANSITIONS = {
  DRAFT:       ['OPEN', 'CANCELLED'],
  OPEN:        ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD:     ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED:   [],
  CANCELLED:   [],
};

const validateWOTransition = (from, to) => {
  if (!WO_TRANSITIONS[from]?.includes(to)) {
    throw new AppError(
      `Invalid work order transition: ${from} → ${to}. Allowed: ${WO_TRANSITIONS[from]?.join(', ') || 'none'}`,
      400
    );
  }
};

const generateWONumber = async () => {
  const year = new Date().getFullYear();
  const count = await prisma.workOrder.count();
  return `WO-${year}-${String(count + 1).padStart(4, '0')}`;
};

// ─────────────────────────────────────────────────────────
// WORK ORDERS
// ─────────────────────────────────────────────────────────

const getWorkOrders = async ({
  page = 1, limit = 20, status, type, priority,
  assetId, projectId, assignedToId, search, overdue,
} = {}) => {
  const skip = (page - 1) * limit;
  const now = new Date();

  const where = {
    ...(status && { status }),
    ...(type && { type }),
    ...(priority && { priority }),
    ...(assetId && { assetId }),
    ...(projectId && { projectId }),
    ...(assignedToId && { assignedToId }),
    ...(overdue === 'true' && {
      dueDate: { lt: now },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    }),
    ...(search && {
      OR: [
        { woNumber: { contains: search } },
        { title: { contains: search } },
      ],
    }),
  };

  const [workOrders, total] = await Promise.all([
    prisma.workOrder.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
      include: {
        asset: { select: { assetCode: true, name: true, location: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        assignedTo: { select: { firstName: true, lastName: true, email: true } },
        project: { select: { projectCode: true, name: true } },
        _count: { select: { maintenanceLogs: true, partsUsed: true } },
      },
    }),
    prisma.workOrder.count({ where }),
  ]);

  const enriched = workOrders.map((wo) => ({
    ...wo,
    isOverdue: wo.dueDate && wo.dueDate < now && !['COMPLETED', 'CANCELLED'].includes(wo.status),
  }));

  return { workOrders: enriched, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const getWorkOrderById = async (id) => {
  const wo = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      asset: {
        select: {
          assetCode: true, name: true, location: true, department: true,
          status: true, condition: true, manufacturer: true, model: true,
        },
      },
      schedule: { select: { title: true, frequencyDays: true, nextDue: true } },
      project: { select: { projectCode: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      assignedTo: { select: { firstName: true, lastName: true, email: true, department: true } },
      maintenanceLogs: {
        orderBy: { logDate: 'desc' },
        include: { workOrder: { select: { woNumber: true } } },
      },
      partsUsed: {
        include: {
          workOrder: { select: { woNumber: true } },
        },
      },
      stockMovements: {
        select: { id: true, quantity: true, unitCost: true, totalCost: true, createdAt: true },
      },
    },
  });

  if (!wo) throw new AppError('Work order not found', 404);

  const now = new Date();
  return {
    ...wo,
    isOverdue: wo.dueDate && wo.dueDate < now && !['COMPLETED', 'CANCELLED'].includes(wo.status),
    totalPartsCost: wo.partsUsed.reduce((s, p) => s + p.totalCost, 0),
    totalLogHours: wo.maintenanceLogs.reduce((s, l) => s + (l.hoursSpent || 0), 0),
  };
};

const createWorkOrder = async (data, user) => {
  // Validate asset exists if provided
  if (data.assetId) {
    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) throw new AppError('Asset not found', 404);
    if (asset.status === 'RETIRED' || asset.status === 'DISPOSED') {
      throw new AppError('Cannot create work order for a retired or disposed asset', 400);
    }
  }

  // Validate schedule belongs to asset
  if (data.scheduleId) {
    const schedule = await prisma.maintenanceSchedule.findUnique({ where: { id: data.scheduleId } });
    if (!schedule) throw new AppError('Maintenance schedule not found', 404);
    if (data.assetId && schedule.assetId !== data.assetId) {
      throw new AppError('Schedule does not belong to the specified asset', 400);
    }
    // FIX L-03: Prevent duplicate open WO for same asset + schedule
    const existingOpenWO = await prisma.workOrder.findFirst({
      where: {
        scheduleId: data.scheduleId,
        assetId: data.assetId || undefined,
        status: { in: ['DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD'] },
      },
    });
    if (existingOpenWO) {
      throw new AppError(
        `An open work order (${existingOpenWO.woNumber}) already exists for this asset and schedule. Complete or cancel it first.`,
        409
      );
    }
  }

  // Validate assigned user exists
  if (data.assignedToId) {
    const assignee = await prisma.user.findUnique({ where: { id: data.assignedToId } });
    if (!assignee) throw new AppError('Assigned user not found', 404);
    if (!['TECHNICIAN', 'MANAGER', 'ADMIN'].includes(assignee.role)) {
      throw new AppError('Work orders can only be assigned to Technicians, Managers, or Admins', 400);
    }
  }

  const woNumber = await generateWONumber();

  const wo = await prisma.workOrder.create({
    data: {
      woNumber,
      ...data,
      status: 'DRAFT',
      startDate: data.startDate ? new Date(data.startDate) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdById: user.id,
    },
    include: {
      asset: { select: { assetCode: true, name: true } },
      assignedTo: { select: { firstName: true, lastName: true } },
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'MRO',
    entityId: wo.id, entityType: 'WorkOrder',
    newValues: { woNumber, type: data.type, priority: data.priority, status: 'DRAFT' },
    description: `Work order created: ${woNumber} — ${data.title}`,
  });

  logger.info(`Work order created: ${woNumber} by ${user.email}`);
  return wo;
};

const updateWorkOrder = async (id, data, user) => {
  const wo = await prisma.workOrder.findUnique({ where: { id } });
  if (!wo) throw new AppError('Work order not found', 404);
  if (['COMPLETED', 'CANCELLED'].includes(wo.status)) {
    throw new AppError(`Cannot edit a ${wo.status} work order`, 400);
  }

  if (data.assignedToId && data.assignedToId !== wo.assignedToId) {
    const assignee = await prisma.user.findUnique({ where: { id: data.assignedToId } });
    if (!assignee) throw new AppError('Assigned user not found', 404);
  }

  const updated = await prisma.workOrder.update({
    where: { id },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'MRO',
    entityId: id, entityType: 'WorkOrder',
    oldValues: { title: wo.title, priority: wo.priority },
    newValues: data,
    description: `Work order updated: ${wo.woNumber}`,
  });

  return updated;
};

// ─── WO Status Transitions ────────────────────────────────

const openWorkOrder = async (id, user) => {
  const wo = await prisma.workOrder.findUnique({ where: { id } });
  if (!wo) throw new AppError('Work order not found', 404);
  validateWOTransition(wo.status, 'OPEN');

  const updated = await prisma.workOrder.update({
    where: { id },
    data: { status: 'OPEN', startDate: wo.startDate || new Date() },
  });

  // If linked to asset → put asset UNDER_MAINTENANCE
  if (wo.assetId) {
    const asset = await prisma.asset.findUnique({ where: { id: wo.assetId } });
    if (asset && asset.status === 'ACTIVE') {
      await prisma.asset.update({
        where: { id: wo.assetId },
        data: { status: 'UNDER_MAINTENANCE' },
      });
      await prisma.assetLog.create({
        data: {
          assetId: wo.assetId,
          action: 'STATUS_CHANGE',
          description: `Work order ${wo.woNumber} opened — asset placed under maintenance`,
          oldStatus: 'ACTIVE',
          newStatus: 'UNDER_MAINTENANCE',
          performedBy: `${user.firstName} ${user.lastName}`,
        },
      });
    }
  }

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'MRO',
    entityId: id, entityType: 'WorkOrder',
    oldValues: { status: wo.status }, newValues: { status: 'OPEN' },
    description: `Work order opened: ${wo.woNumber}`,
  });

  return updated;
};

const startWorkOrder = async (id, user) => {
  const wo = await prisma.workOrder.findUnique({ where: { id } });
  if (!wo) throw new AppError('Work order not found', 404);
  validateWOTransition(wo.status, 'IN_PROGRESS');

  const updated = await prisma.workOrder.update({
    where: { id },
    data: { status: 'IN_PROGRESS' },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'MRO',
    entityId: id, entityType: 'WorkOrder',
    description: `Work order started: ${wo.woNumber}`,
  });

  return updated;
};

const holdWorkOrder = async (id, { reason }, user) => {
  const wo = await prisma.workOrder.findUnique({ where: { id } });
  if (!wo) throw new AppError('Work order not found', 404);
  validateWOTransition(wo.status, 'ON_HOLD');

  const updated = await prisma.workOrder.update({
    where: { id },
    data: { status: 'ON_HOLD' },
  });

  // Log the hold reason
  await prisma.maintenanceLog.create({
    data: {
      workOrderId: id,
      description: `Work order placed on hold. Reason: ${reason}`,
      logDate: new Date(),
      loggedBy: user.id,
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'MRO',
    entityId: id, entityType: 'WorkOrder',
    description: `Work order on hold: ${wo.woNumber}. Reason: ${reason}`,
  });

  return updated;
};

const completeWorkOrder = async (id, data, user) => {
  const { completionNotes, actualHours, laborCost, completedDate, advanceSchedule } = data;

  const wo = await prisma.workOrder.findUnique({
    where: { id },
    include: {
      partsUsed: true,
      asset: { select: { id: true, assetCode: true, status: true } },
      schedule: { select: { id: true, title: true, frequencyDays: true } },
    },
  });
  if (!wo) throw new AppError('Work order not found', 404);
  validateWOTransition(wo.status, 'COMPLETED');

  const partsCost = wo.partsUsed.reduce((s, p) => s + p.totalCost, 0);
  const totalCost = partsCost + (laborCost || 0);
  const finalDate = completedDate ? new Date(completedDate) : new Date();

  const result = await prisma.$transaction(async (tx) => {
    // 1. Mark WO as completed
    const completed = await tx.workOrder.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completionNotes,
        actualHours,
        laborCost: laborCost || 0,
        partsCost,
        totalCost,
        completedDate: finalDate,
      },
    });

    // 2. Create completion log
    await tx.maintenanceLog.create({
      data: {
        workOrderId: id,
        description: `Work order completed. ${completionNotes}`,
        hoursSpent: actualHours,
        logDate: finalDate,
        loggedBy: user.id,
      },
    });

    // 3. Restore asset to ACTIVE if it was UNDER_MAINTENANCE due to this WO
    if (wo.asset && wo.asset.status === 'UNDER_MAINTENANCE') {
      await tx.asset.update({
        where: { id: wo.asset.id },
        data: { status: 'ACTIVE', lastMaintenance: finalDate },
      });
      await tx.assetLog.create({
        data: {
          assetId: wo.asset.id,
          action: 'STATUS_CHANGE',
          description: `Work order ${wo.woNumber} completed — asset restored to ACTIVE`,
          oldStatus: 'UNDER_MAINTENANCE',
          newStatus: 'ACTIVE',
          performedBy: `${user.firstName} ${user.lastName}`,
        },
      });
    }

    // 4. Advance maintenance schedule if requested and linked
    if (advanceSchedule !== false && wo.scheduleId) {
      const nextDue = new Date(finalDate.getTime() + wo.schedule.frequencyDays * 24 * 60 * 60 * 1000);
      await tx.maintenanceSchedule.update({
        where: { id: wo.scheduleId },
        data: { lastPerformed: finalDate, nextDue },
      });
      if (wo.asset) {
        await tx.asset.update({
          where: { id: wo.asset.id },
          data: { nextMaintenance: nextDue },
        });
      }
    }

    return completed;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'MRO',
    entityId: id, entityType: 'WorkOrder',
    oldValues: { status: wo.status },
    newValues: { status: 'COMPLETED', actualHours, totalCost },
    description: `Work order completed: ${wo.woNumber}. Hours: ${actualHours}. Total cost: ₱${totalCost.toLocaleString()}`,
  });

  logger.info(`WO ${wo.woNumber} completed. Cost: ₱${totalCost} by ${user.email}`);
  return result;
};

const cancelWorkOrder = async (id, { reason } = {}, user) => {
  const wo = await prisma.workOrder.findUnique({ where: { id } });
  if (!wo) throw new AppError('Work order not found', 404);
  validateWOTransition(wo.status, 'CANCELLED');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.workOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    // If asset was placed UNDER_MAINTENANCE by this WO, restore it
    if (wo.assetId) {
      const asset = await tx.asset.findUnique({ where: { id: wo.assetId } });
      if (asset && asset.status === 'UNDER_MAINTENANCE') {
        await tx.asset.update({ where: { id: wo.assetId }, data: { status: 'ACTIVE' } });
        await tx.assetLog.create({
          data: {
            assetId: wo.assetId,
            action: 'STATUS_CHANGE',
            description: `Work order ${wo.woNumber} cancelled — asset restored to ACTIVE`,
            oldStatus: 'UNDER_MAINTENANCE',
            newStatus: 'ACTIVE',
            performedBy: `${user.firstName} ${user.lastName}`,
          },
        });
      }
    }

    if (reason) {
      await tx.maintenanceLog.create({
        data: {
          workOrderId: id,
          description: `Work order cancelled. Reason: ${reason}`,
          logDate: new Date(),
          loggedBy: user.id,
        },
      });
    }

    return result;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'MRO',
    entityId: id, entityType: 'WorkOrder',
    description: `Work order cancelled: ${wo.woNumber}${reason ? `. Reason: ${reason}` : ''}`,
  });

  return updated;
};

// ─────────────────────────────────────────────────────────
// MAINTENANCE LOGS
// ─────────────────────────────────────────────────────────

const getLogs = async (workOrderId, { page = 1, limit = 20 } = {}) => {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!wo) throw new AppError('Work order not found', 404);

  const skip = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    prisma.maintenanceLog.findMany({
      where: { workOrderId },
      orderBy: { logDate: 'desc' },
      skip,
      take: limit,
    }),
    prisma.maintenanceLog.count({ where: { workOrderId } }),
  ]);

  return { logs, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const addLog = async (workOrderId, data, user) => {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!wo) throw new AppError('Work order not found', 404);
  if (['COMPLETED', 'CANCELLED'].includes(wo.status)) {
    throw new AppError(`Cannot add log to a ${wo.status} work order`, 400);
  }

  const log = await prisma.maintenanceLog.create({
    data: {
      workOrderId,
      description: data.description,
      hoursSpent: data.hoursSpent || null,
      logDate: data.logDate ? new Date(data.logDate) : new Date(),
      loggedBy: user.id,
    },
  });

  // Update accumulated actual hours
  if (data.hoursSpent) {
    const totalLogs = await prisma.maintenanceLog.aggregate({
      where: { workOrderId },
      _sum: { hoursSpent: true },
    });
    await prisma.workOrder.update({
      where: { id: workOrderId },
      data: { actualHours: totalLogs._sum.hoursSpent || 0 },
    });
  }

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'MRO',
    entityId: log.id, entityType: 'MaintenanceLog',
    description: `Log added to WO ${wo.woNumber}: ${data.description.substring(0, 80)}`,
  });

  return log;
};

const deleteLog = async (workOrderId, logId, user) => {
  const log = await prisma.maintenanceLog.findFirst({
    where: { id: logId, workOrderId },
  });
  if (!log) throw new AppError('Maintenance log not found', 404);

  await prisma.maintenanceLog.delete({ where: { id: logId } });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'MRO',
    entityId: logId, entityType: 'MaintenanceLog',
    description: `Maintenance log deleted from WO`,
  });
};

// ─────────────────────────────────────────────────────────
// PARTS USAGE — linked to inventory
// ─────────────────────────────────────────────────────────

const getParts = async (workOrderId) => {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!wo) throw new AppError('Work order not found', 404);

  return prisma.wOPartUsage.findMany({
    where: { workOrderId },
    orderBy: { usedAt: 'asc' },
  });
};

const addPart = async (workOrderId, data, user) => {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!wo) throw new AppError('Work order not found', 404);
  if (['COMPLETED', 'CANCELLED'].includes(wo.status)) {
    throw new AppError(`Cannot add parts to a ${wo.status} work order`, 400);
  }

  const totalCost = data.quantity * data.unitCost;
  let batchId = data.batchId || null;

  const result = await prisma.$transaction(async (tx) => {
    // If linked to inventory item — deduct stock (FIFO)
    if (data.inventoryItemId) {
      const item = await tx.inventoryItem.findUnique({ where: { id: data.inventoryItemId } });
      if (!item) throw new AppError('Inventory item not found', 404);
      if (item.currentStock < data.quantity) {
        throw new AppError(
          `Insufficient stock for "${item.name}". Available: ${item.currentStock}, Requested: ${data.quantity}`,
          400
        );
      }

      // FIFO batch selection
      if (!batchId) {
        const batch = await tx.inventoryBatch.findFirst({
          where: {
            inventoryItemId: data.inventoryItemId,
            status: 'ACTIVE',
            remainingQty: { gte: data.quantity },
          },
          orderBy: { createdAt: 'asc' },
        });
        if (batch) batchId = batch.id;
      }

      // Deduct from batch
      if (batchId) {
        const updated = await tx.inventoryBatch.update({
          where: { id: batchId },
          data: { remainingQty: { decrement: data.quantity } },
        });
        if (updated.remainingQty <= 0) {
          await tx.inventoryBatch.update({
            where: { id: batchId },
            data: { status: 'DEPLETED', remainingQty: 0 },
          });
        }
      }

      // Create stock movement
      await tx.stockMovement.create({
        data: {
          inventoryItemId: data.inventoryItemId,
          batchId,
          movementType: 'OUT',
          source: 'MRO_WORK_ORDER',
          quantity: data.quantity,
          unitCost: data.unitCost,
          totalCost,
          referenceId: workOrderId,
          referenceNumber: wo.woNumber,
          workOrderId,
          notes: `Parts used for WO: ${wo.title}`,
          performedById: user.id,
        },
      });

      // Deduct currentStock
      await tx.inventoryItem.update({
        where: { id: data.inventoryItemId },
        data: { currentStock: { decrement: data.quantity } },
      });
    }

    // Record part usage
    const part = await tx.wOPartUsage.create({
      data: {
        workOrderId,
        inventoryItemId: data.inventoryItemId || null,
        partName: data.partName,
        quantity: data.quantity,
        unitCost: data.unitCost,
        totalCost,
        batchId,
        notes: data.notes || null,
      },
    });

    // Recalculate WO parts cost
    const partsAgg = await tx.wOPartUsage.aggregate({
      where: { workOrderId },
      _sum: { totalCost: true },
    });
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        partsCost: partsAgg._sum.totalCost || 0,
        totalCost: (wo.laborCost || 0) + (partsAgg._sum.totalCost || 0),
      },
    });

    return part;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'MRO',
    entityId: result.id, entityType: 'WOPartUsage',
    newValues: { workOrderId, partName: data.partName, quantity: data.quantity, totalCost },
    description: `Part added to WO ${wo.woNumber}: ${data.partName} x${data.quantity} = ₱${totalCost}`,
  });

  return result;
};

const removePart = async (workOrderId, partId, user) => {
  const wo = await prisma.workOrder.findUnique({ where: { id: workOrderId } });
  if (!wo) throw new AppError('Work order not found', 404);
  if (wo.status === 'COMPLETED') {
    throw new AppError('Cannot remove parts from a completed work order', 400);
  }

  const part = await prisma.wOPartUsage.findFirst({ where: { id: partId, workOrderId } });
  if (!part) throw new AppError('Part usage record not found', 404);

  await prisma.$transaction(async (tx) => {
    // Restore inventory stock if linked
    if (part.inventoryItemId) {
      await tx.inventoryItem.update({
        where: { id: part.inventoryItemId },
        data: { currentStock: { increment: part.quantity } },
      });
      if (part.batchId) {
        await tx.inventoryBatch.update({
          where: { id: part.batchId },
          data: { remainingQty: { increment: part.quantity }, status: 'ACTIVE' },
        });
      }
      // Create reversal stock movement
      await tx.stockMovement.create({
        data: {
          inventoryItemId: part.inventoryItemId,
          batchId: part.batchId,
          movementType: 'IN',
          source: 'RETURN',
          quantity: part.quantity,
          unitCost: part.unitCost,
          totalCost: part.totalCost,
          referenceId: workOrderId,
          referenceNumber: wo.woNumber,
          notes: `Parts return from WO ${wo.woNumber}`,
          performedById: user.id,
        },
      });
    }

    await tx.wOPartUsage.delete({ where: { id: partId } });

    // Recalculate WO parts cost
    const partsAgg = await tx.wOPartUsage.aggregate({
      where: { workOrderId },
      _sum: { totalCost: true },
    });
    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        partsCost: partsAgg._sum.totalCost || 0,
        totalCost: (wo.laborCost || 0) + (partsAgg._sum.totalCost || 0),
      },
    });
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'MRO',
    description: `Part removed from WO ${wo.woNumber}: ${part.partName}`,
  });
};

// ─────────────────────────────────────────────────────────
// MRO ANALYTICS
// ─────────────────────────────────────────────────────────

const getMROStats = async () => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    totalWOs,
    byStatus,
    byType,
    overdueCount,
    completedThisMonth,
    costThisMonth,
    avgCompletionHours,
    recentWOs,
    topCostWOs,
  ] = await Promise.all([
    prisma.workOrder.count(),

    prisma.workOrder.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    prisma.workOrder.groupBy({
      by: ['type'],
      _count: { id: true },
    }),

    prisma.workOrder.count({
      where: {
        dueDate: { lt: now },
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
    }),

    prisma.workOrder.count({
      where: { status: 'COMPLETED', completedDate: { gte: thirtyDaysAgo } },
    }),

    prisma.workOrder.aggregate({
      _sum: { totalCost: true },
      where: { status: 'COMPLETED', completedDate: { gte: thirtyDaysAgo } },
    }),

    prisma.workOrder.aggregate({
      _avg: { actualHours: true },
      where: { status: 'COMPLETED', actualHours: { gt: 0 } },
    }),

    prisma.workOrder.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      where: { status: { notIn: ['CANCELLED'] } },
      include: {
        asset: { select: { assetCode: true, name: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    }),

    prisma.workOrder.findMany({
      take: 5,
      where: { status: 'COMPLETED', totalCost: { gt: 0 } },
      orderBy: { totalCost: 'desc' },
      include: {
        asset: { select: { assetCode: true, name: true } },
      },
    }),
  ]);

  // Monthly trend (last 6 months)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const [count, cost] = await Promise.all([
      prisma.workOrder.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.workOrder.aggregate({
        _sum: { totalCost: true },
        where: { status: 'COMPLETED', completedDate: { gte: start, lte: end } },
      }),
    ]);
    months.push({
      month: start.toLocaleString('default', { month: 'short', year: '2-digit' }),
      count,
      cost: cost._sum.totalCost || 0,
    });
  }

  return {
    totalWOs,
    byStatus: byStatus.reduce((a, s) => ({ ...a, [s.status]: s._count.id }), {}),
    byType: byType.reduce((a, t) => ({ ...a, [t.type]: t._count.id }), {}),
    overdueCount,
    completedThisMonth,
    costThisMonth: costThisMonth._sum.totalCost || 0,
    avgCompletionHours: Math.round((avgCompletionHours._avg.actualHours || 0) * 10) / 10,
    recentWOs,
    topCostWOs,
    monthlyTrend: months,
  };
};

module.exports = {
  // Work Orders
  getWorkOrders, getWorkOrderById, createWorkOrder, updateWorkOrder,
  openWorkOrder, startWorkOrder, holdWorkOrder, completeWorkOrder, cancelWorkOrder,
  // Maintenance Logs
  getLogs, addLog, deleteLog,
  // Parts
  getParts, addPart, removePart,
  // Analytics
  getMROStats,
};
