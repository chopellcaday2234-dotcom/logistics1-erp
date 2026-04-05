// src/modules/validation/validation.service.js
// End-to-end workflow validation engine
// Checks data integrity across all module boundaries

const prisma = require('../../config/database');

const SEVERITY = { CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };

const issue = (severity, module, code, message, entityId = null) => ({
  severity, module, code, message, entityId, detectedAt: new Date(),
});

// ─────────────────────────────────────────────────────────
// 1. PROCUREMENT WORKFLOW VALIDATION
// ─────────────────────────────────────────────────────────

const validateProcurementWorkflow = async () => {
  const issues = [];

  // POs approved but never sent (stuck > 7 days)
  const stuckPOs = await prisma.purchaseOrder.findMany({
    where: {
      status: 'APPROVED',
      approvedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true, poNumber: true, approvedAt: true },
  });
  for (const po of stuckPOs) {
    issues.push(issue(SEVERITY.MEDIUM, 'PROCUREMENT', 'PO_APPROVED_NOT_SENT',
      `PO ${po.poNumber} approved over 7 days ago but has not been received yet.`, po.id));
  }

  // POs with no items
  const emptyPOs = await prisma.purchaseOrder.findMany({
    where: { status: { notIn: ['CANCELLED'] } },
    include: { _count: { select: { items: true } } },
  });
  for (const po of emptyPOs) {
    if (po._count.items === 0) {
      issues.push(issue(SEVERITY.HIGH, 'PROCUREMENT', 'PO_NO_ITEMS',
        `PO ${po.poNumber} has no line items.`, po.id));
    }
  }

  // RFQs in DRAFT > 14 days (forgotten)
  const staleDraftRFQs = await prisma.rFQ.findMany({
    where: {
      status: 'DRAFT',
      createdAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true, rfqNumber: true, createdAt: true },
  });
  for (const rfq of staleDraftRFQs) {
    issues.push(issue(SEVERITY.LOW, 'PROCUREMENT', 'RFQ_STALE_DRAFT',
      `RFQ ${rfq.rfqNumber} has been in DRAFT status for over 14 days.`, rfq.id));
  }

  // Receiving items accepted > ordered quantity
  const overReceivedItems = await prisma.pOItem.findMany({
    where: { receivedQty: { gt: 0 } },
    select: { id: true, description: true, quantity: true, receivedQty: true, purchaseOrderId: true },
  });
  for (const item of overReceivedItems) {
    if (item.receivedQty > item.quantity + 0.001) {
      issues.push(issue(SEVERITY.HIGH, 'PROCUREMENT', 'PO_OVER_RECEIVED',
        `PO item "${item.description}" received ${item.receivedQty} but ordered ${item.quantity}.`,
        item.purchaseOrderId));
    }
  }

  return issues;
};

// ─────────────────────────────────────────────────────────
// 2. INVENTORY CONSISTENCY VALIDATION
// ─────────────────────────────────────────────────────────

const validateInventoryConsistency = async () => {
  const issues = [];

  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    include: {
      batches: { where: { status: 'ACTIVE' } },
    },
  });

  for (const item of items) {
    // Stock cannot be negative
    if (item.currentStock < 0) {
      issues.push(issue(SEVERITY.CRITICAL, 'INVENTORY', 'NEGATIVE_STOCK',
        `Item ${item.sku} has negative stock: ${item.currentStock} ${item.unit}.`, item.id));
    }

    // Reserved stock cannot exceed current stock
    if (item.reservedStock > item.currentStock) {
      issues.push(issue(SEVERITY.HIGH, 'INVENTORY', 'RESERVED_EXCEEDS_STOCK',
        `Item ${item.sku} has reserved stock (${item.reservedStock}) exceeding current stock (${item.currentStock}).`,
        item.id));
    }

    // Batch remaining qty sum should approximately match currentStock
    const batchTotal = item.batches.reduce((s, b) => s + b.remainingQty, 0);
    if (item.batches.length > 0 && Math.abs(batchTotal - item.currentStock) > 0.5) {
      issues.push(issue(SEVERITY.HIGH, 'INVENTORY', 'BATCH_STOCK_MISMATCH',
        `Item ${item.sku} currentStock (${item.currentStock}) doesn't match sum of active batch remainingQty (${batchTotal.toFixed(2)}).`,
        item.id));
    }

    // Active batches with zero remaining qty (should be DEPLETED)
    const zombieBatches = item.batches.filter((b) => b.remainingQty <= 0);
    for (const batch of zombieBatches) {
      issues.push(issue(SEVERITY.MEDIUM, 'INVENTORY', 'ZOMBIE_ACTIVE_BATCH',
        `Batch ${batch.batchNumber} for ${item.sku} is ACTIVE but has ${batch.remainingQty} remaining qty. Should be DEPLETED.`,
        batch.id));
    }

    // Expired batches still marked ACTIVE
    const now = new Date();
    const expiredActiveBatches = await prisma.inventoryBatch.findMany({
      where: { inventoryItemId: item.id, status: 'ACTIVE', expiryDate: { lt: now } },
    });
    for (const batch of expiredActiveBatches) {
      issues.push(issue(SEVERITY.HIGH, 'INVENTORY', 'EXPIRED_BATCH_ACTIVE',
        `Batch ${batch.batchNumber} expired on ${batch.expiryDate.toLocaleDateString()} but is still ACTIVE.`,
        batch.id));
    }
  }

  return issues;
};

// ─────────────────────────────────────────────────────────
// 3. ASSET VALIDATION
// ─────────────────────────────────────────────────────────

const validateAssets = async () => {
  const issues = [];
  const now = new Date();

  // Assets UNDER_MAINTENANCE with no open work orders
  const maintenanceAssets = await prisma.asset.findMany({
    where: { status: 'UNDER_MAINTENANCE' },
    include: {
      workOrders: {
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      },
    },
  });
  for (const asset of maintenanceAssets) {
    if (asset.workOrders.length === 0) {
      issues.push(issue(SEVERITY.MEDIUM, 'ASSETS', 'MAINTENANCE_NO_OPEN_WO',
        `Asset ${asset.assetCode} is UNDER_MAINTENANCE but has no open Work Orders.`, asset.id));
    }
  }

  // Assets with overdue maintenance (not retired/disposed)
  const overdueAssets = await prisma.asset.findMany({
    where: {
      nextMaintenance: { lt: now },
      status: { notIn: ['RETIRED', 'DISPOSED', 'UNDER_MAINTENANCE'] },
    },
  });
  for (const asset of overdueAssets) {
    const daysOverdue = Math.floor((now - asset.nextMaintenance) / (1000 * 60 * 60 * 24));
    issues.push(issue(daysOverdue > 30 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      'ASSETS', 'MAINTENANCE_OVERDUE',
      `Asset ${asset.assetCode} maintenance is ${daysOverdue} day(s) overdue.`, asset.id));
  }

  // Assets with expired warranty in ACTIVE status (info only)
  const expiredWarranty = await prisma.asset.findMany({
    where: {
      warrantyExpiry: { lt: now },
      status: 'ACTIVE',
    },
  });
  for (const asset of expiredWarranty) {
    issues.push(issue(SEVERITY.LOW, 'ASSETS', 'WARRANTY_EXPIRED',
      `Asset ${asset.assetCode} warranty expired on ${asset.warrantyExpiry.toLocaleDateString()}.`,
      asset.id));
  }

  // Assets converted from batch — validate batch still exists
  const batchLinkedAssets = await prisma.asset.findMany({
    where: { batchId: { not: null } },
    include: { batch: { select: { id: true, batchNumber: true } } },
  });
  for (const asset of batchLinkedAssets) {
    if (!asset.batch) {
      issues.push(issue(SEVERITY.HIGH, 'ASSETS', 'ASSET_ORPHANED_BATCH',
        `Asset ${asset.assetCode} references a deleted inventory batch.`, asset.id));
    }
  }

  return issues;
};

// ─────────────────────────────────────────────────────────
// 4. MRO VALIDATION
// ─────────────────────────────────────────────────────────

const validateMROWorkflow = async () => {
  const issues = [];
  const now = new Date();

  // Open WOs with no assigned technician > 3 days
  const unassignedWOs = await prisma.workOrder.findMany({
    where: {
      assignedToId: null,
      status: { notIn: ['DRAFT', 'COMPLETED', 'CANCELLED'] },
      createdAt: { lt: new Date(now - 3 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true, woNumber: true, title: true, priority: true },
  });
  for (const wo of unassignedWOs) {
    issues.push(issue(wo.priority === 'CRITICAL' ? SEVERITY.CRITICAL : SEVERITY.MEDIUM,
      'MRO', 'WO_UNASSIGNED',
      `WO ${wo.woNumber} (${wo.priority}) has been open for 3+ days with no assigned technician.`,
      wo.id));
  }

  // Overdue WOs
  const overdueWOs = await prisma.workOrder.findMany({
    where: {
      dueDate: { lt: now },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    select: { id: true, woNumber: true, title: true, dueDate: true, priority: true },
  });
  for (const wo of overdueWOs) {
    const daysOverdue = Math.floor((now - wo.dueDate) / (1000 * 60 * 60 * 24));
    issues.push(issue(
      wo.priority === 'CRITICAL' || daysOverdue > 7 ? SEVERITY.CRITICAL : SEVERITY.HIGH,
      'MRO', 'WO_OVERDUE',
      `WO ${wo.woNumber} is ${daysOverdue} day(s) overdue (priority: ${wo.priority}).`,
      wo.id));
  }

  // FIX B-04: Completed WOs with zero cost — only flag if BOTH labor AND parts are zero
  // (previously fired even when parts cost existed but laborCost was 0)
  const zeroCostWOs = await prisma.workOrder.findMany({
    where: {
      status: 'COMPLETED',
      totalCost: 0,
      laborCost: 0,
      partsCost: 0,
    },
    select: { id: true, woNumber: true, title: true },
  });
  for (const wo of zeroCostWOs) {
    issues.push(issue(SEVERITY.LOW, 'MRO', 'WO_ZERO_COST',
      `Completed WO ${wo.woNumber} has ₱0 total cost. Labor cost or parts may be missing.`,
      wo.id));
  }

  return issues;
};

// ─────────────────────────────────────────────────────────
// 5. PROJECT TRACEABILITY VALIDATION
// ─────────────────────────────────────────────────────────

const validateProjectTraceability = async () => {
  const issues = [];
  const now = new Date();

  // Active projects past end date
  const overdueProjects = await prisma.project.findMany({
    where: { status: 'ACTIVE', endDate: { lt: now } },
    select: { id: true, projectCode: true, name: true, endDate: true },
  });
  for (const proj of overdueProjects) {
    const daysOverdue = Math.floor((now - proj.endDate) / (1000 * 60 * 60 * 24));
    issues.push(issue(SEVERITY.HIGH, 'PROJECTS', 'PROJECT_PAST_END_DATE',
      `Project ${proj.projectCode} is ${daysOverdue} day(s) past its end date and is still ACTIVE.`,
      proj.id));
  }

  // Projects over budget
  const projects = await prisma.project.findMany({
    where: { budget: { gt: 0 }, status: { notIn: ['CANCELLED'] } },
    select: { id: true, projectCode: true, name: true, budget: true, actualCost: true },
  });
  for (const proj of projects) {
    if (proj.actualCost > proj.budget) {
      const overPct = (((proj.actualCost - proj.budget) / proj.budget) * 100).toFixed(1);
      issues.push(issue(parseFloat(overPct) > 20 ? SEVERITY.CRITICAL : SEVERITY.HIGH,
        'PROJECTS', 'PROJECT_OVER_BUDGET',
        `Project ${proj.projectCode} is ${overPct}% over budget (Budget: ₱${proj.budget?.toLocaleString()}, Actual: ₱${proj.actualCost?.toLocaleString()}).`,
        proj.id));
    }
  }

  // Active projects with no tasks
  const noTaskProjects = await prisma.project.findMany({
    where: { status: 'ACTIVE' },
    include: { _count: { select: { tasks: true } } },
  });
  for (const proj of noTaskProjects) {
    if (proj._count.tasks === 0) {
      issues.push(issue(SEVERITY.LOW, 'PROJECTS', 'PROJECT_NO_TASKS',
        `Active project ${proj.projectCode} has no tasks defined.`, proj.id));
    }
  }

  // Stock movements referencing deleted projects
  const orphanedMovements = await prisma.stockMovement.findMany({
    where: { projectId: { not: null }, source: 'PROJECT' },
    select: { id: true, projectId: true, referenceNumber: true },
  });
  const projectIds = [...new Set(orphanedMovements.map((m) => m.projectId))];
  const existingProjects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true },
  });
  const existingIds = new Set(existingProjects.map((p) => p.id));
  for (const movement of orphanedMovements) {
    if (!existingIds.has(movement.projectId)) {
      issues.push(issue(SEVERITY.HIGH, 'INVENTORY', 'STOCK_MOVEMENT_ORPHANED_PROJECT',
        `Stock movement references project ${movement.referenceNumber} which no longer exists.`,
        movement.id));
    }
  }

  return issues;
};

// ─────────────────────────────────────────────────────────
// MASTER VALIDATION RUNNER
// ─────────────────────────────────────────────────────────

const runFullValidation = async () => {
  const startTime = Date.now();

  const [
    procurementIssues,
    inventoryIssues,
    assetIssues,
    mroIssues,
    projectIssues,
  ] = await Promise.all([
    validateProcurementWorkflow(),
    validateInventoryConsistency(),
    validateAssets(),
    validateMROWorkflow(),
    validateProjectTraceability(),
  ]);

  const allIssues = [
    ...procurementIssues,
    ...inventoryIssues,
    ...assetIssues,
    ...mroIssues,
    ...projectIssues,
  ];

  const bySeverity = allIssues.reduce((acc, i) => {
    acc[i.severity] = (acc[i.severity] || 0) + 1;
    return acc;
  }, {});

  const byModule = allIssues.reduce((acc, i) => {
    acc[i.module] = (acc[i.module] || 0) + 1;
    return acc;
  }, {});

  const systemHealthScore = Math.max(
    0,
    100 -
      (bySeverity.CRITICAL || 0) * 20 -
      (bySeverity.HIGH || 0) * 10 -
      (bySeverity.MEDIUM || 0) * 5 -
      (bySeverity.LOW || 0) * 2
  );

  return {
    systemHealth: {
      score: systemHealthScore,
      status:
        systemHealthScore >= 90 ? 'HEALTHY' :
        systemHealthScore >= 70 ? 'AT_RISK' : 'CRITICAL',
    },
    summary: {
      totalIssues: allIssues.length,
      bySeverity,
      byModule,
    },
    issues: {
      procurement: procurementIssues,
      inventory: inventoryIssues,
      assets: assetIssues,
      mro: mroIssues,
      projects: projectIssues,
    },
    executionTimeMs: Date.now() - startTime,
    validatedAt: new Date(),
  };
};

const runModuleValidation = async (module) => {
  const validators = {
    procurement: validateProcurementWorkflow,
    inventory: validateInventoryConsistency,
    assets: validateAssets,
    mro: validateMROWorkflow,
    projects: validateProjectTraceability,
  };

  const fn = validators[module.toLowerCase()];
  if (!fn) throw new Error(`Unknown module: ${module}`);

  const issues = await fn();
  return {
    module,
    issueCount: issues.length,
    issues,
    validatedAt: new Date(),
  };
};

module.exports = {
  runFullValidation,
  runModuleValidation,
  validateProcurementWorkflow,
  validateInventoryConsistency,
  validateAssets,
  validateMROWorkflow,
  validateProjectTraceability,
};
