// src/modules/projects/projects.service.js
const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { createAuditLog } = require('../../utils/audit');
const logger = require('../../utils/logger');

// ─── Status Transition Rules ──────────────────────────────
const PROJECT_TRANSITIONS = {
  PLANNING:  ['ACTIVE', 'CANCELLED'],
  ACTIVE:    ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD:   ['ACTIVE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const validateProjectTransition = (from, to) => {
  if (!PROJECT_TRANSITIONS[from]?.includes(to)) {
    throw new AppError(
      `Invalid project status transition: ${from} → ${to}. Allowed: ${PROJECT_TRANSITIONS[from]?.join(', ') || 'none'}`,
      400
    );
  }
};

const generateProjectCode = async () => {
  const year = new Date().getFullYear();
  const count = await prisma.project.count();
  return `PROJ-${year}-${String(count + 1).padStart(4, '0')}`;
};

// ─── Project health score ─────────────────────────────────
const computeHealth = (project) => {
  const now = new Date();
  let score = 100;
  const issues = [];

  if (project.budget && project.actualCost > project.budget) {
    score -= 30;
    issues.push('Over budget');
  } else if (project.budget && project.actualCost > project.budget * 0.9) {
    score -= 10;
    issues.push('Approaching budget limit');
  }

  if (project.endDate && project.endDate < now && project.status === 'ACTIVE') {
    score -= 25;
    issues.push('Past end date');
  }

  const openRisks = project.risks?.filter((r) => r.level === 'CRITICAL' && r.status === 'OPEN') || [];
  if (openRisks.length > 0) {
    score -= openRisks.length * 10;
    issues.push(`${openRisks.length} critical open risk(s)`);
  }

  const overdueTasks = project.tasks?.filter(
    (t) => t.dueDate && t.dueDate < now && !['DONE', 'CANCELLED'].includes(t.status)
  ) || [];
  if (overdueTasks.length > 0) {
    score -= Math.min(overdueTasks.length * 5, 20);
    issues.push(`${overdueTasks.length} overdue task(s)`);
  }

  return {
    score: Math.max(0, score),
    status: score >= 80 ? 'HEALTHY' : score >= 50 ? 'AT_RISK' : 'CRITICAL',
    issues,
  };
};

// ─────────────────────────────────────────────────────────
// PROJECTS CRUD
// ─────────────────────────────────────────────────────────

const getProjects = async ({
  page = 1, limit = 20, status, department, search, createdById,
} = {}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(status && { status }),
    ...(department && { department: { contains: department } }),
    ...(createdById && { createdById }),
    ...(search && {
      OR: [
        { projectCode: { contains: search } },
        { name: { contains: search } },
        { description: { contains: search } },
        { location: { contains: search } },
      ],
    }),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
        _count: {
          select: {
            tasks: true,
            risks: true,
            materialUsages: true,
            purchaseOrders: true,
            workOrders: true,
          },
        },
      },
    }),
    prisma.project.count({ where }),
  ]);

  const now = new Date();
  const enriched = projects.map((p) => ({
    ...p,
    budgetUsedPct: p.budget ? Math.round((p.actualCost / p.budget) * 100) : null,
    isOverBudget: p.budget ? p.actualCost > p.budget : false,
    isPastEndDate: p.endDate ? p.endDate < now && p.status === 'ACTIVE' : false,
  }));

  return { projects: enriched, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const getProjectById = async (id) => {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      tasks: { orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }] },
      risks: { orderBy: [{ level: 'desc' }, { createdAt: 'desc' }] },
      communications: { orderBy: { createdAt: 'desc' }, take: 20 },
      materialUsages: {
        orderBy: { usedAt: 'desc' },
        include: {
          project: { select: { projectCode: true } },
        },
      },
      purchaseOrders: {
        select: {
          id: true, poNumber: true, status: true,
          totalAmount: true, orderDate: true,
          supplier: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      workOrders: {
        select: {
          id: true, woNumber: true, title: true, status: true,
          totalCost: true, completedDate: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      batches: {
        select: { batchNumber: true, quantity: true, remainingQty: true, unitCost: true },
      },
      _count: {
        select: {
          tasks: true, risks: true, communications: true,
          materialUsages: true, purchaseOrders: true, workOrders: true,
        },
      },
    },
  });

  if (!project) throw new AppError('Project not found', 404);

  const health = computeHealth(project);
  const taskSummary = {
    total: project.tasks.length,
    todo: project.tasks.filter((t) => t.status === 'TODO').length,
    inProgress: project.tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    done: project.tasks.filter((t) => t.status === 'DONE').length,
    cancelled: project.tasks.filter((t) => t.status === 'CANCELLED').length,
    completionPct: project.tasks.length
      ? Math.round(
          (project.tasks.filter((t) => t.status === 'DONE').length / project.tasks.length) * 100
        )
      : 0,
  };

  return { ...project, health, taskSummary };
};

const createProject = async (data, user) => {
  const existing = await prisma.project.findUnique({ where: { projectCode: data.projectCode } });
  if (existing) throw new AppError(`Project code "${data.projectCode}" already exists`, 409);

  const project = await prisma.project.create({
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : null,
      endDate: data.endDate ? new Date(data.endDate) : null,
      createdById: user.id,
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROJECTS',
    entityId: project.id, entityType: 'Project',
    newValues: { projectCode: project.projectCode, name: project.name, status: project.status },
    description: `Project created: ${project.projectCode} — ${project.name}`,
  });

  logger.info(`Project created: ${project.projectCode} by ${user.email}`);
  return project;
};

const updateProject = async (id, data, user) => {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError('Project not found', 404);

  if (data.status && data.status !== project.status) {
    validateProjectTransition(project.status, data.status);
  }

  if (['COMPLETED', 'CANCELLED'].includes(project.status) && data.status !== project.status) {
    throw new AppError(`Cannot edit a ${project.status} project`, 400);
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...data,
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      endDate: data.endDate ? new Date(data.endDate) : undefined,
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'PROJECTS',
    entityId: id, entityType: 'Project',
    oldValues: { status: project.status, budget: project.budget },
    newValues: data,
    description: `Project updated: ${project.projectCode}`,
  });

  return updated;
};

const deleteProject = async (id, user) => {
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: {
        select: { purchaseOrders: true, workOrders: true, materialUsages: true },
      },
    },
  });
  if (!project) throw new AppError('Project not found', 404);
  if (!['PLANNING', 'CANCELLED'].includes(project.status)) {
    throw new AppError('Only PLANNING or CANCELLED projects can be deleted', 409);
  }
  if (
    project._count.purchaseOrders > 0 ||
    project._count.workOrders > 0 ||
    project._count.materialUsages > 0
  ) {
    throw new AppError('Cannot delete project with linked POs, Work Orders, or Material usage', 409);
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectRisk.deleteMany({ where: { projectId: id } });
    await tx.projectTask.deleteMany({ where: { projectId: id } });
    await tx.projectCommunication.deleteMany({ where: { projectId: id } });
    await tx.project.delete({ where: { id } });
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'PROJECTS',
    entityId: id, entityType: 'Project',
    description: `Project deleted: ${project.projectCode} — ${project.name}`,
  });
};

// ─────────────────────────────────────────────────────────
// PROJECT TASKS
// ─────────────────────────────────────────────────────────

const getTasks = async (projectId, { status, priority } = {}) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Project not found', 404);

  return prisma.projectTask.findMany({
    where: {
      projectId,
      ...(status && { status }),
      ...(priority && { priority }),
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
  });
};

const createTask = async (projectId, data, user) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Project not found', 404);
  if (['COMPLETED', 'CANCELLED'].includes(project.status)) {
    throw new AppError(`Cannot add tasks to a ${project.status} project`, 400);
  }

  if (data.assignedTo) {
    const assignee = await prisma.user.findUnique({ where: { id: data.assignedTo } });
    if (!assignee) throw new AppError('Assigned user not found', 404);
  }

  const task = await prisma.projectTask.create({
    data: {
      projectId,
      ...data,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROJECTS',
    entityId: task.id, entityType: 'ProjectTask',
    description: `Task created in ${project.projectCode}: "${data.title}"`,
  });

  return task;
};

const updateTask = async (projectId, taskId, data, user) => {
  const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId } });
  if (!task) throw new AppError('Task not found', 404);

  const updateData = {
    ...data,
    dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    ...(data.status === 'DONE' && !task.completedAt && { completedAt: new Date() }),
  };

  const updated = await prisma.projectTask.update({ where: { id: taskId }, data: updateData });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'PROJECTS',
    entityId: taskId, entityType: 'ProjectTask',
    oldValues: { status: task.status }, newValues: data,
    description: `Task updated: "${task.title}" → status: ${data.status || task.status}`,
  });

  return updated;
};

const deleteTask = async (projectId, taskId, user) => {
  const task = await prisma.projectTask.findFirst({ where: { id: taskId, projectId } });
  if (!task) throw new AppError('Task not found', 404);
  if (task.status === 'IN_PROGRESS') {
    throw new AppError('Cannot delete an IN_PROGRESS task. Cancel it first.', 400);
  }

  await prisma.projectTask.delete({ where: { id: taskId } });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'PROJECTS',
    entityId: taskId, entityType: 'ProjectTask',
    description: `Task deleted: "${task.title}"`,
  });
};

// ─────────────────────────────────────────────────────────
// PROJECT RISKS
// ─────────────────────────────────────────────────────────

const getRisks = async (projectId) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Project not found', 404);

  return prisma.projectRisk.findMany({
    where: { projectId },
    orderBy: [{ level: 'desc' }, { createdAt: 'desc' }],
  });
};

const createRisk = async (projectId, data, user) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Project not found', 404);

  const risk = await prisma.projectRisk.create({
    data: { projectId, ...data },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROJECTS',
    entityId: risk.id, entityType: 'ProjectRisk',
    description: `Risk created in ${project.projectCode}: "${data.title}" [${data.level}]`,
  });

  return risk;
};

const updateRisk = async (projectId, riskId, data, user) => {
  const risk = await prisma.projectRisk.findFirst({ where: { id: riskId, projectId } });
  if (!risk) throw new AppError('Risk not found', 404);

  const updated = await prisma.projectRisk.update({ where: { id: riskId }, data });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'PROJECTS',
    entityId: riskId, entityType: 'ProjectRisk',
    oldValues: { level: risk.level, status: risk.status }, newValues: data,
    description: `Risk updated: "${risk.title}"`,
  });

  return updated;
};

const deleteRisk = async (projectId, riskId, user) => {
  const risk = await prisma.projectRisk.findFirst({ where: { id: riskId, projectId } });
  if (!risk) throw new AppError('Risk not found', 404);

  await prisma.projectRisk.delete({ where: { id: riskId } });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'PROJECTS',
    entityId: riskId, entityType: 'ProjectRisk',
    description: `Risk deleted: "${risk.title}"`,
  });
};

// ─────────────────────────────────────────────────────────
// PROJECT COMMUNICATIONS
// ─────────────────────────────────────────────────────────

const getCommunications = async (projectId, { page = 1, limit = 20 } = {}) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Project not found', 404);

  const skip = (page - 1) * limit;
  const [comms, total] = await Promise.all([
    prisma.projectCommunication.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      skip, take: limit,
    }),
    prisma.projectCommunication.count({ where: { projectId } }),
  ]);

  return { communications: comms, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const createCommunication = async (projectId, data, user) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Project not found', 404);

  const comm = await prisma.projectCommunication.create({
    data: {
      projectId,
      subject: data.subject,
      message: data.message,
      recipients: data.recipients || null,
      sentBy: `${user.firstName} ${user.lastName}`,
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROJECTS',
    entityId: comm.id, entityType: 'ProjectCommunication',
    description: `Communication logged in ${project.projectCode}: "${data.subject}"`,
  });

  return comm;
};

// ─────────────────────────────────────────────────────────
// MATERIAL CONSUMPTION — deducts from inventory
// ─────────────────────────────────────────────────────────

const getMaterials = async (projectId, { page = 1, limit = 20 } = {}) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Project not found', 404);

  const skip = (page - 1) * limit;
  const [materials, total] = await Promise.all([
    prisma.projectMaterial.findMany({
      where: { projectId },
      orderBy: { usedAt: 'desc' },
      skip, take: limit,
      include: {
        project: { select: { projectCode: true, name: true } },
      },
    }),
    prisma.projectMaterial.count({ where: { projectId } }),
  ]);

  const totalCost = await prisma.projectMaterial.aggregate({
    where: { projectId },
    _sum: { totalCost: true },
  });

  return {
    materials,
    totalMaterialCost: totalCost._sum.totalCost || 0,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

const consumeMaterial = async (projectId, data, user) => {
  const { inventoryItemId, batchId, quantityUsed, notes } = data;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Project not found', 404);
  if (!['ACTIVE', 'PLANNING'].includes(project.status)) {
    throw new AppError(`Cannot consume materials for a ${project.status} project`, 400);
  }

  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item) throw new AppError('Inventory item not found', 404);
  if (!item.isActive) throw new AppError('Cannot consume from an inactive inventory item', 400);

  const available = item.currentStock - item.reservedStock;
  if (available < quantityUsed) {
    throw new AppError(
      `Insufficient stock for "${item.name}" (${item.sku}). Available: ${available} ${item.unit}, Requested: ${quantityUsed}`,
      400
    );
  }

  // Resolve batch — FIFO if not specified
  let resolvedBatchId = batchId || null;
  let unitCost = item.averageCost;

  if (resolvedBatchId) {
    const batch = await prisma.inventoryBatch.findUnique({ where: { id: resolvedBatchId } });
    if (!batch || batch.inventoryItemId !== inventoryItemId) {
      throw new AppError('Specified batch does not belong to this inventory item', 400);
    }
    if (batch.status !== 'ACTIVE') throw new AppError('Batch is not active', 400);
    if (batch.remainingQty < quantityUsed) {
      throw new AppError(`Batch only has ${batch.remainingQty} ${item.unit} remaining`, 400);
    }
    unitCost = batch.unitCost;
  } else {
    const firstBatch = await prisma.inventoryBatch.findFirst({
      where: { inventoryItemId, status: 'ACTIVE', remainingQty: { gte: quantityUsed } },
      orderBy: { createdAt: 'asc' },
    });
    if (firstBatch) {
      resolvedBatchId = firstBatch.id;
      unitCost = firstBatch.unitCost;
    }
  }

  const totalCost = unitCost * quantityUsed;

  const result = await prisma.$transaction(async (tx) => {
    // 1. Deduct batch
    if (resolvedBatchId) {
      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: resolvedBatchId },
        data: { remainingQty: { decrement: quantityUsed } },
      });
      if (updatedBatch.remainingQty <= 0) {
        await tx.inventoryBatch.update({
          where: { id: resolvedBatchId },
          data: { status: 'DEPLETED', remainingQty: 0 },
        });
      }
    }

    // 2. Deduct currentStock
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentStock: { decrement: quantityUsed } },
    });

    // 3. Create stock movement
    await tx.stockMovement.create({
      data: {
        inventoryItemId,
        batchId: resolvedBatchId,
        movementType: 'OUT',
        source: 'PROJECT',
        quantity: quantityUsed,
        unitCost,
        totalCost,
        referenceId: projectId,
        referenceNumber: project.projectCode,
        projectId,
        notes: notes || `Material consumed for project ${project.projectCode}`,
        performedById: user.id,
      },
    });

    // 4. Record material usage
    const material = await tx.projectMaterial.create({
      data: {
        projectId,
        inventoryItemId,
        batchId: resolvedBatchId,
        quantityUsed,
        unitCost,
        totalCost,
        notes: notes || null,
      },
    });

    // 5. Update project actualCost
    await tx.project.update({
      where: { id: projectId },
      data: { actualCost: { increment: totalCost } },
    });

    return material;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'PROJECTS',
    entityId: projectId, entityType: 'Project',
    newValues: { inventoryItemId, quantityUsed, totalCost },
    description: `Material consumed: ${item.sku} — ${quantityUsed} ${item.unit} @ ₱${unitCost} for ${project.projectCode}`,
  });

  logger.info(`Material consumed: ${item.sku} x${quantityUsed} for project ${project.projectCode}`);

  const updatedItem = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  return {
    material: result,
    item: { sku: item.sku, name: item.name, newStock: updatedItem.currentStock },
    lowStockAlert: updatedItem.currentStock <= updatedItem.reorderPoint,
  };
};

// ─────────────────────────────────────────────────────────
// PROJECT ANALYTICS
// ─────────────────────────────────────────────────────────

const getProjectStats = async () => {
  const now = new Date();

  const [
    totalProjects,
    byStatus,
    activeProjects,
    overdueProjects,
    totalBudget,
    totalActualCost,
    recentProjects,
    topMaterialCost,
  ] = await Promise.all([
    prisma.project.count(),

    prisma.project.groupBy({
      by: ['status'],
      _count: { id: true },
    }),

    prisma.project.count({ where: { status: 'ACTIVE' } }),

    prisma.project.count({
      where: { endDate: { lt: now }, status: 'ACTIVE' },
    }),

    prisma.project.aggregate({
      _sum: { budget: true },
      where: { status: { notIn: ['CANCELLED'] } },
    }),

    prisma.project.aggregate({
      _sum: { actualCost: true },
      where: { status: { notIn: ['CANCELLED'] } },
    }),

    prisma.project.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { tasks: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),

    prisma.projectMaterial.groupBy({
      by: ['projectId'],
      _sum: { totalCost: true },
      orderBy: { _sum: { totalCost: 'desc' } },
      take: 5,
    }),
  ]);

  const projectIds = topMaterialCost.map((t) => t.projectId);
  const projectDetails = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, projectCode: true, name: true, status: true },
  });

  // Top consumed items across all projects
  const topConsumedItems = await prisma.projectMaterial.groupBy({
    by: ['inventoryItemId'],
    _sum: { quantityUsed: true, totalCost: true },
    orderBy: { _sum: { totalCost: 'desc' } },
    take: 10,
  });

  const itemIds = topConsumedItems.map((t) => t.inventoryItemId);
  const itemDetails = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sku: true, name: true, unit: true },
  });

  return {
    totalProjects,
    byStatus: byStatus.reduce((a, s) => ({ ...a, [s.status]: s._count.id }), {}),
    activeProjects,
    overdueProjects,
    totalBudget: totalBudget._sum.budget || 0,
    totalActualCost: totalActualCost._sum.actualCost || 0,
    budgetVariance: (totalBudget._sum.budget || 0) - (totalActualCost._sum.actualCost || 0),
    recentProjects,
    topMaterialCost: topMaterialCost.map((t) => ({
      ...t,
      project: projectDetails.find((p) => p.id === t.projectId),
    })),
    topConsumedItems: topConsumedItems.map((t) => ({
      ...t,
      item: itemDetails.find((i) => i.id === t.inventoryItemId),
    })),
  };
};

const getProjectBudgetReport = async (projectId) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      materialUsages: {
        include: { project: { select: { projectCode: true } } },
        orderBy: { usedAt: 'desc' },
      },
      purchaseOrders: {
        where: { status: { notIn: ['CANCELLED'] } },
        select: { poNumber: true, totalAmount: true, status: true, orderDate: true },
      },
      workOrders: {
        where: { status: 'COMPLETED' },
        select: { woNumber: true, totalCost: true, completedDate: true },
      },
    },
  });
  if (!project) throw new AppError('Project not found', 404);

  const materialCost = project.materialUsages.reduce((s, m) => s + m.totalCost, 0);
  const poCost = project.purchaseOrders.reduce((s, p) => s + p.totalAmount, 0);
  const woCost = project.workOrders.reduce((s, w) => s + (w.totalCost || 0), 0);
  const totalActual = materialCost + poCost + woCost;

  // Group materials by inventory item
  const materialByItem = {};
  for (const m of project.materialUsages) {
    const key = m.inventoryItemId;
    if (!materialByItem[key]) {
      materialByItem[key] = { inventoryItemId: key, totalQty: 0, totalCost: 0, usages: [] };
    }
    materialByItem[key].totalQty += m.quantityUsed;
    materialByItem[key].totalCost += m.totalCost;
    materialByItem[key].usages.push(m);
  }

  const itemIds = Object.keys(materialByItem);
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sku: true, name: true, unit: true },
  });
  for (const item of items) {
    if (materialByItem[item.id]) materialByItem[item.id].item = item;
  }

  return {
    project: { id: project.id, projectCode: project.projectCode, name: project.name, status: project.status },
    budget: project.budget,
    costs: { materialCost, poCost, woCost, totalActual },
    variance: project.budget ? project.budget - totalActual : null,
    budgetUsedPct: project.budget ? Math.round((totalActual / project.budget) * 100) : null,
    materialBreakdown: Object.values(materialByItem),
    purchaseOrders: project.purchaseOrders,
    workOrders: project.workOrders,
    generatedAt: new Date(),
  };
};

module.exports = {
  // Projects
  getProjects, getProjectById, createProject, updateProject, deleteProject,
  // Tasks
  getTasks, createTask, updateTask, deleteTask,
  // Risks
  getRisks, createRisk, updateRisk, deleteRisk,
  // Communications
  getCommunications, createCommunication,
  // Materials
  getMaterials, consumeMaterial,
  // Analytics
  getProjectStats, getProjectBudgetReport,
};
