// src/modules/inventory/inventory.service.js
const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { createAuditLog } = require('../../utils/audit');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────────────────
// INVENTORY ITEMS (Master Data)
// ─────────────────────────────────────────────────────────

const getItems = async ({
  page = 1, limit = 20, category, isActive, search,
  lowStock = false, orderBy = 'name', orderDir = 'asc',
} = {}) => {
  const skip = (page - 1) * limit;

  // FIX BUG 1 & 8: Cannot compare two columns with Prisma where clause.
  // Fetch all matching items and filter low-stock in memory when needed.
  const where = {
    ...(category && { category }),
    ...(isActive !== undefined && { isActive: isActive === 'true' || isActive === true }),
    ...(search && {
      OR: [
        { sku:  { contains: search } },
        { name: { contains: search } },
        { location: { contains: search } },
      ],
    }),
  };

  const [allItems, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      orderBy: { [orderBy]: orderDir },
      include: {
        _count: { select: { batches: true, stockMovements: true } },
      },
    }),
    prisma.inventoryItem.count({ where }),
  ]);

  // Apply low-stock filter in memory (Prisma cannot compare two columns)
  const filtered = (lowStock === 'true' || lowStock === true)
    ? allItems.filter((item) => item.currentStock <= item.reorderPoint)
    : allItems;

  // Apply pagination after in-memory filter
  const paginated = filtered.slice(skip, skip + limit);
  const filteredTotal = (lowStock === 'true' || lowStock === true) ? filtered.length : total;

  const enriched = paginated.map((item) => ({
    ...item,
    isLowStock: item.currentStock <= item.reorderPoint,
    availableStock: item.currentStock - item.reservedStock,
  }));

  return {
    items: enriched,
    pagination: {
      total: filteredTotal,
      page,
      limit,
      totalPages: Math.ceil(filteredTotal / limit),
    },
  };
};

const getItemById = async (id) => {
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      batches: {
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      },
      stockMovements: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          performedBy: { select: { firstName: true, lastName: true } },
          project: { select: { projectCode: true, name: true } },
        },
      },
      _count: { select: { batches: true, stockMovements: true, assets: true } },
    },
  });

  if (!item) throw new AppError('Inventory item not found', 404);

  return {
    ...item,
    isLowStock: item.currentStock <= item.reorderPoint,
    availableStock: item.currentStock - item.reservedStock,
  };
};

const createItem = async (data, user) => {
  const existing = await prisma.inventoryItem.findUnique({ where: { sku: data.sku } });
  if (existing) throw new AppError(`SKU "${data.sku}" already exists`, 409);

  const item = await prisma.inventoryItem.create({ data });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'INVENTORY',
    entityId: item.id, entityType: 'InventoryItem',
    newValues: { sku: item.sku, name: item.name, category: item.category },
    description: `Inventory item created: ${item.sku} — ${item.name}`,
  });

  return item;
};

const updateItem = async (id, data, user) => {
  const item = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!item) throw new AppError('Inventory item not found', 404);

  const updated = await prisma.inventoryItem.update({ where: { id }, data });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'INVENTORY',
    entityId: id, entityType: 'InventoryItem',
    oldValues: { name: item.name, reorderPoint: item.reorderPoint },
    newValues: data,
    description: `Inventory item updated: ${item.sku}`,
  });

  return updated;
};

const deleteItem = async (id, user) => {
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    include: {
      _count: { select: { batches: true, stockMovements: true, assets: true } },
    },
  });
  if (!item) throw new AppError('Inventory item not found', 404);

  if (item.currentStock > 0) {
    throw new AppError('Cannot delete item with existing stock. Set isActive=false instead.', 409);
  }
  if (item._count.assets > 0) {
    throw new AppError('Cannot delete item linked to assets.', 409);
  }

  await prisma.inventoryItem.delete({ where: { id } });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'INVENTORY',
    entityId: id, entityType: 'InventoryItem',
    description: `Inventory item deleted: ${item.sku} — ${item.name}`,
  });
};

// ─────────────────────────────────────────────────────────
// INVENTORY BATCHES
// ─────────────────────────────────────────────────────────

const getBatches = async ({
  page = 1, limit = 20, inventoryItemId, status, expiringSoonDays,
} = {}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(inventoryItemId && { inventoryItemId }),
    ...(status && { status }),
    ...(expiringSoonDays && {
      expiryDate: {
        lte: new Date(Date.now() + expiringSoonDays * 24 * 60 * 60 * 1000),
        gte: new Date(),
      },
      status: 'ACTIVE',
    }),
  };

  const [batches, total] = await Promise.all([
    prisma.inventoryBatch.findMany({
      where,
      orderBy: { createdAt: 'asc' }, // FIFO order
      skip,
      take: limit,
      include: {
        inventoryItem: { select: { sku: true, name: true, unit: true, category: true } },
        receiving: { select: { receiptNumber: true, receivedDate: true } },
        project: { select: { projectCode: true, name: true } },
      },
    }),
    prisma.inventoryBatch.count({ where }),
  ]);

  return { batches, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const getBatchById = async (id) => {
  const batch = await prisma.inventoryBatch.findUnique({
    where: { id },
    include: {
      inventoryItem: { select: { sku: true, name: true, unit: true } },
      receiving: { select: { receiptNumber: true, receivedDate: true } },
      project: { select: { projectCode: true, name: true } },
      stockMovements: {
        orderBy: { createdAt: 'desc' },
        include: { performedBy: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (!batch) throw new AppError('Batch not found', 404);
  return batch;
};

const updateBatch = async (id, data, user) => {
  const batch = await prisma.inventoryBatch.findUnique({ where: { id } });
  if (!batch) throw new AppError('Batch not found', 404);

  const updated = await prisma.inventoryBatch.update({ where: { id }, data });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'INVENTORY',
    entityId: id, entityType: 'InventoryBatch',
    oldValues: { status: batch.status }, newValues: data,
    description: `Batch updated: ${batch.batchNumber}`,
  });

  return updated;
};

// ─────────────────────────────────────────────────────────
// STOCK MOVEMENTS
// ─────────────────────────────────────────────────────────

const getMovements = async ({
  page = 1, limit = 20, inventoryItemId, movementType,
  source, projectId, dateFrom, dateTo,
} = {}) => {
  const skip = (page - 1) * limit;

  const where = {
    ...(inventoryItemId && { inventoryItemId }),
    ...(movementType && { movementType }),
    ...(source && { source }),
    ...(projectId && { projectId }),
    ...((dateFrom || dateTo) && {
      createdAt: {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      },
    }),
  };

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        inventoryItem: { select: { sku: true, name: true, unit: true } },
        batch: { select: { batchNumber: true } },
        performedBy: { select: { firstName: true, lastName: true } },
        project: { select: { projectCode: true, name: true } },
        workOrder: { select: { woNumber: true, title: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return { movements, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

// ─────────────────────────────────────────────────────────
// STOCK ADJUSTMENT (Manual IN/OUT with full audit)
// FIX BUG 3: Wrapped SET case in block to avoid lexical declaration error
// ─────────────────────────────────────────────────────────

const adjustStock = async (data, user) => {
  const { inventoryItemId, adjustmentType, quantity, unitCost, reason, notes, projectId } = data;

  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item) throw new AppError('Inventory item not found', 404);
  if (!item.isActive) throw new AppError('Cannot adjust stock for an inactive item', 400);

  let movementType, newStock, actualQty;

  // FIX BUG 3: Use if/else instead of switch to avoid const-in-case lexical issues
  if (adjustmentType === 'ADD') {
    movementType = 'IN';
    newStock = item.currentStock + quantity;
    actualQty = quantity;
  } else if (adjustmentType === 'REMOVE') {
    if (item.currentStock < quantity) {
      throw new AppError(
        `Insufficient stock. Available: ${item.currentStock} ${item.unit}. Requested: ${quantity}`,
        400
      );
    }
    movementType = 'OUT';
    newStock = item.currentStock - quantity;
    actualQty = quantity;
  } else if (adjustmentType === 'SET') {
    if (quantity < 0) throw new AppError('Stock quantity cannot be negative', 400);
    const diff = quantity - item.currentStock;
    if (diff === 0) throw new AppError('Stock is already at the specified quantity', 400);
    movementType = diff >= 0 ? 'IN' : 'OUT';
    actualQty = Math.abs(diff);
    newStock = quantity;
  } else {
    throw new AppError('Invalid adjustment type. Must be ADD, REMOVE, or SET', 400);
  }

  const effectiveCost = unitCost || item.averageCost || 0;

  const result = await prisma.$transaction(async (tx) => {
    let batchId = null;
    if (movementType === 'IN' && actualQty > 0) {
      const batch = await tx.inventoryBatch.create({
        data: {
          batchNumber: `ADJ-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
          inventoryItemId,
          quantity: actualQty,
          remainingQty: actualQty,
          unitCost: effectiveCost,
          totalCost: effectiveCost * actualQty,
          status: 'ACTIVE',
          notes: `Manual adjustment: ${reason}`,
        },
      });
      batchId = batch.id;
    }

    const movement = await tx.stockMovement.create({
      data: {
        inventoryItemId,
        batchId,
        movementType,
        source: 'MANUAL_ADJUSTMENT',
        quantity: actualQty,
        unitCost: effectiveCost,
        totalCost: effectiveCost * actualQty,
        projectId: projectId || null,
        notes: `[${adjustmentType}] ${reason}${notes ? ` — ${notes}` : ''}`,
        performedById: user.id,
      },
    });

    // Update item stock and recalculate weighted average cost
    const updateData = { currentStock: newStock };
    if (movementType === 'IN' && effectiveCost > 0 && newStock > 0) {
      updateData.averageCost =
        ((item.averageCost * item.currentStock) + (effectiveCost * actualQty)) / newStock;
    }
    await tx.inventoryItem.update({ where: { id: inventoryItemId }, data: updateData });

    return movement;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'INVENTORY',
    entityId: inventoryItemId, entityType: 'InventoryItem',
    oldValues: { currentStock: item.currentStock },
    newValues: { currentStock: newStock, adjustmentType, quantity },
    description: `Stock adjustment [${adjustmentType}]: ${item.sku} — ${reason}. ${item.currentStock} → ${newStock} ${item.unit}`,
  });

  logger.info(`Stock adjusted: ${item.sku} [${adjustmentType} ${quantity}] by ${user.email}`);

  return {
    movement: result,
    item: { sku: item.sku, name: item.name, previousStock: item.currentStock, newStock },
  };
};

// ─────────────────────────────────────────────────────────
// STOCK ISSUE (OUT movement — FIFO batch selection)
// ─────────────────────────────────────────────────────────

const issueStock = async (data, user) => {
  const {
    inventoryItemId, quantity, source, referenceId,
    referenceNumber, projectId, workOrderId, batchId: requestedBatchId, notes,
  } = data;

  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item) throw new AppError('Inventory item not found', 404);

  const available = item.currentStock - item.reservedStock;
  if (available < quantity) {
    throw new AppError(
      `Insufficient stock for "${item.name}". Available: ${available} ${item.unit}. Requested: ${quantity}`,
      400
    );
  }

  let batchId = requestedBatchId || null;
  let unitCost = item.averageCost;

  if (requestedBatchId) {
    const batch = await prisma.inventoryBatch.findUnique({ where: { id: requestedBatchId } });
    if (!batch || batch.inventoryItemId !== inventoryItemId) {
      throw new AppError('Specified batch does not belong to this inventory item', 400);
    }
    if (batch.status !== 'ACTIVE') throw new AppError('Batch is not active', 400);
    if (batch.remainingQty < quantity) {
      throw new AppError(
        `Batch ${batch.batchNumber} only has ${batch.remainingQty} ${item.unit} remaining`, 400
      );
    }
    unitCost = batch.unitCost;
  } else {
    const firstBatch = await prisma.inventoryBatch.findFirst({
      where: { inventoryItemId, status: 'ACTIVE', remainingQty: { gte: quantity } },
      orderBy: { createdAt: 'asc' },
    });
    if (firstBatch) {
      batchId = firstBatch.id;
      unitCost = firstBatch.unitCost;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    if (batchId) {
      const updatedBatch = await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { remainingQty: { decrement: quantity } },
      });
      if (updatedBatch.remainingQty <= 0) {
        await tx.inventoryBatch.update({
          where: { id: batchId },
          data: { status: 'DEPLETED', remainingQty: 0 },
        });
      }
    }

    const movement = await tx.stockMovement.create({
      data: {
        inventoryItemId,
        batchId,
        movementType: 'OUT',
        source,
        quantity,
        unitCost,
        totalCost: unitCost * quantity,
        referenceId: referenceId || null,
        referenceNumber: referenceNumber || null,
        projectId: projectId || null,
        workOrderId: workOrderId || null,
        notes: notes || null,
        performedById: user.id,
      },
    });

    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { currentStock: { decrement: quantity } },
    });

    return movement;
  });

  const updatedItem = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  const lowStockAlert = updatedItem.currentStock <= updatedItem.reorderPoint;

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'INVENTORY',
    entityId: inventoryItemId, entityType: 'InventoryItem',
    oldValues: { currentStock: item.currentStock },
    newValues: { currentStock: updatedItem.currentStock },
    description: `Stock issued [${source}]: ${item.sku} — ${quantity} ${item.unit}. Ref: ${referenceNumber || 'N/A'}`,
  });

  if (lowStockAlert) {
    logger.warn(`LOW STOCK ALERT: ${item.sku} is at ${updatedItem.currentStock} (reorder point: ${updatedItem.reorderPoint})`);
  }

  return {
    movement: result,
    lowStockAlert,
    item: {
      sku: item.sku,
      name: item.name,
      previousStock: item.currentStock,
      newStock: updatedItem.currentStock,
      reorderPoint: updatedItem.reorderPoint,
    },
  };
};

// ─────────────────────────────────────────────────────────
// STOCK TRANSFER (between locations)
// ─────────────────────────────────────────────────────────

const transferStock = async (data, user) => {
  const { inventoryItemId, fromLocation, toLocation, quantity, batchId, notes } = data;

  const item = await prisma.inventoryItem.findUnique({ where: { id: inventoryItemId } });
  if (!item) throw new AppError('Inventory item not found', 404);
  if (item.currentStock < quantity) {
    throw new AppError(`Insufficient stock for transfer. Available: ${item.currentStock}`, 400);
  }
  if (fromLocation === toLocation) {
    throw new AppError('Source and destination locations must be different', 400);
  }

  const movement = await prisma.$transaction(async (tx) => {
    await tx.inventoryItem.update({
      where: { id: inventoryItemId },
      data: { location: toLocation },
    });

    return tx.stockMovement.create({
      data: {
        inventoryItemId,
        batchId: batchId || null,
        movementType: 'TRANSFER',
        source: 'TRANSFER',
        quantity,
        unitCost: item.averageCost,
        totalCost: item.averageCost * quantity,
        notes: `Transfer: ${fromLocation} → ${toLocation}${notes ? `. ${notes}` : ''}`,
        performedById: user.id,
      },
    });
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'INVENTORY',
    entityId: inventoryItemId, entityType: 'InventoryItem',
    oldValues: { location: fromLocation },
    newValues: { location: toLocation },
    description: `Stock transferred: ${item.sku} — ${quantity} ${item.unit} from "${fromLocation}" to "${toLocation}"`,
  });

  return { movement, item: { sku: item.sku, name: item.name, newLocation: toLocation } };
};

// ─────────────────────────────────────────────────────────
// PICKING LIST (batch issue for projects / work orders)
// FIX BUG 4: Correctly map TRANSFER referenceType to TRANSFER source
// ─────────────────────────────────────────────────────────

const createPickingList = async (data, user) => {
  const { referenceType, referenceId, referenceNumber, items: pickItems, notes } = data;

  // Pre-flight stock check — all-or-nothing
  for (const pi of pickItems) {
    const item = await prisma.inventoryItem.findUnique({ where: { id: pi.inventoryItemId } });
    if (!item) throw new AppError(`Item ${pi.inventoryItemId} not found`, 404);
    if (item.currentStock < pi.quantity) {
      throw new AppError(
        `Insufficient stock for "${item.name}" (${item.sku}). Available: ${item.currentStock}, Requested: ${pi.quantity}`,
        400
      );
    }
  }

  // FIX BUG 4: Map referenceType to the correct StockMovementSource enum value
  const getSource = (type) => {
    if (type === 'PROJECT') return 'PROJECT';
    if (type === 'TRANSFER') return 'TRANSFER';
    return 'MRO_WORK_ORDER';
  };

  const movements = [];

  await prisma.$transaction(async (tx) => {
    for (const pi of pickItems) {
      const item = await tx.inventoryItem.findUnique({ where: { id: pi.inventoryItemId } });

      let batchId = pi.batchId || null;
      let unitCost = item.averageCost;

      if (!batchId) {
        const batch = await tx.inventoryBatch.findFirst({
          where: { inventoryItemId: pi.inventoryItemId, status: 'ACTIVE', remainingQty: { gte: pi.quantity } },
          orderBy: { createdAt: 'asc' },
        });
        if (batch) { batchId = batch.id; unitCost = batch.unitCost; }
      }

      if (batchId) {
        const updatedBatch = await tx.inventoryBatch.update({
          where: { id: batchId },
          data: { remainingQty: { decrement: pi.quantity } },
        });
        if (updatedBatch.remainingQty <= 0) {
          await tx.inventoryBatch.update({
            where: { id: batchId },
            data: { status: 'DEPLETED', remainingQty: 0 },
          });
        }
      }

      const source = getSource(referenceType);

      const movement = await tx.stockMovement.create({
        data: {
          inventoryItemId: pi.inventoryItemId,
          batchId,
          movementType: 'OUT',
          source,
          quantity: pi.quantity,
          unitCost,
          totalCost: unitCost * pi.quantity,
          referenceId,
          referenceNumber,
          projectId: referenceType === 'PROJECT' ? referenceId : null,
          workOrderId: referenceType === 'MRO_WORK_ORDER' ? referenceId : null,
          notes,
          performedById: user.id,
        },
      });

      await tx.inventoryItem.update({
        where: { id: pi.inventoryItemId },
        data: { currentStock: { decrement: pi.quantity } },
      });

      movements.push(movement);
    }
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'INVENTORY',
    entityType: 'PickingList',
    newValues: { referenceType, referenceNumber, itemCount: pickItems.length },
    description: `Picking list dispatched for ${referenceType} ${referenceNumber} — ${pickItems.length} item(s)`,
  });

  return { movements, referenceType, referenceNumber, itemCount: movements.length };
};

// ─────────────────────────────────────────────────────────
// LOW STOCK ALERTS
// ─────────────────────────────────────────────────────────

const getLowStockItems = async () => {
  // FIX BUG 1: Cannot use Prisma field reference in where clause.
  // Fetch all active items with reorderPoint > 0 and filter in memory.
  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true, reorderPoint: { gt: 0 } },
  });

  const lowStock = items.filter((i) => i.currentStock <= i.reorderPoint);
  const outOfStock = items.filter((i) => i.currentStock === 0);

  return {
    lowStock: lowStock.map((i) => ({
      ...i,
      deficit: i.reorderQty > 0 ? i.reorderQty - i.currentStock : i.reorderPoint - i.currentStock,
    })),
    outOfStock,
    summary: {
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      totalActiveItems: items.length,
    },
  };
};

// ─────────────────────────────────────────────────────────
// EXPIRING BATCHES
// ─────────────────────────────────────────────────────────

const getExpiringBatches = async (days = 30) => {
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const [batches, expired] = await Promise.all([
    prisma.inventoryBatch.findMany({
      where: {
        status: 'ACTIVE',
        expiryDate: { lte: cutoff, gte: new Date() },
        remainingQty: { gt: 0 },
      },
      orderBy: { expiryDate: 'asc' },
      include: {
        inventoryItem: { select: { sku: true, name: true, unit: true, category: true } },
      },
    }),
    prisma.inventoryBatch.findMany({
      where: { status: 'ACTIVE', expiryDate: { lt: new Date() } },
      include: { inventoryItem: { select: { sku: true, name: true } } },
    }),
  ]);

  return { expiringSoon: batches, expired, days };
};

// ─────────────────────────────────────────────────────────
// INVENTORY ANALYTICS
// ─────────────────────────────────────────────────────────

const getInventoryStats = async () => {
  const [
    totalItems,
    activeItems,
    totalBatches,
    activeBatches,
    stockValueResult,
    categoryBreakdown,
    recentMovements,
    topConsumedRaw,
  ] = await Promise.all([
    prisma.inventoryItem.count(),
    prisma.inventoryItem.count({ where: { isActive: true } }),
    prisma.inventoryBatch.count(),
    prisma.inventoryBatch.count({ where: { status: 'ACTIVE' } }),
    prisma.inventoryBatch.aggregate({
      _sum: { totalCost: true },
      where: { status: 'ACTIVE' },
    }),
    prisma.inventoryItem.groupBy({
      by: ['category'],
      _count: { id: true },
      _sum: { currentStock: true },
    }),
    prisma.stockMovement.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        inventoryItem: { select: { sku: true, name: true } },
        performedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.stockMovement.groupBy({
      by: ['inventoryItemId'],
      where: {
        movementType: 'OUT',
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { quantity: true, totalCost: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    }),
  ]);

  const itemIds = topConsumedRaw.map((t) => t.inventoryItemId);
  const itemDetails = await prisma.inventoryItem.findMany({
    where: { id: { in: itemIds } },
    select: { id: true, sku: true, name: true, unit: true },
  });

  const topConsumed = topConsumedRaw.map((t) => ({
    ...t,
    item: itemDetails.find((i) => i.id === t.inventoryItemId),
  }));

  // FIX BUG 1: Use in-memory low stock calculation
  const { summary: lowStockSummary } = await getLowStockItems();

  return {
    items: { total: totalItems, active: activeItems },
    batches: { total: totalBatches, active: activeBatches },
    stockValue: stockValueResult._sum.totalCost || 0,
    lowStock: lowStockSummary,
    categoryBreakdown,
    recentMovements,
    topConsumed,
  };
};

const getStockValuation = async () => {
  const items = await prisma.inventoryItem.findMany({
    where: { isActive: true },
    include: {
      batches: {
        where: { status: 'ACTIVE' },
        select: { batchNumber: true, remainingQty: true, unitCost: true, totalCost: true, expiryDate: true },
      },
    },
    orderBy: { category: 'asc' },
  });

  const valuationReport = items.map((item) => {
    const totalValue = item.batches.reduce((sum, b) => sum + (b.remainingQty * b.unitCost), 0);
    return {
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      currentStock: item.currentStock,
      averageCost: item.averageCost,
      totalValue,
      batchCount: item.batches.length,
      batches: item.batches,
    };
  });

  const grandTotal = valuationReport.reduce((sum, r) => sum + r.totalValue, 0);

  return { items: valuationReport, grandTotal, generatedAt: new Date() };
};

module.exports = {
  getItems, getItemById, createItem, updateItem, deleteItem,
  getBatches, getBatchById, updateBatch,
  getMovements,
  adjustStock, issueStock, transferStock, createPickingList,
  getLowStockItems, getExpiringBatches,
  getInventoryStats, getStockValuation,
};
