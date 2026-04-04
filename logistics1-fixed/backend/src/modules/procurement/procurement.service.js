// src/modules/procurement/procurement.service.js
const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { createAuditLog } = require('../../utils/audit');
const logger = require('../../utils/logger');

// ─── Helpers ──────────────────────────────────────────────

const generateCode = async (prefix, model, field) => {
  const year = new Date().getFullYear();
  const count = await prisma[model].count();
  const seq = String(count + 1).padStart(4, "0") + "-" + Date.now().toString(36).slice(-3).toUpperCase();
  return `${prefix}-${year}-${seq}`;
};

const calcPOTotals = (items) => {
  let subtotal = 0;
  let taxAmount = 0;
  const enriched = items.map((item) => {
    const total = item.quantity * item.unitPrice;
    const tax = (total * (item.taxRate || 0)) / 100;
    subtotal += total;
    taxAmount += tax;
    return { ...item, totalPrice: total };
  });
  return { enriched, subtotal, taxAmount, totalAmount: subtotal + taxAmount };
};

// ─────────────────────────────────────────────────────────
// SUPPLIER CRUD
// ─────────────────────────────────────────────────────────

const getSuppliers = async ({ page = 1, limit = 20, status, search } = {}) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search } },
        { code: { contains: search } },
        { contactPerson: { contains: search } },
        { email: { contains: search } },
        { city: { contains: search } },
      ],
    }),
  };

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      skip,
      take: limit,
      include: {
        _count: { select: { rfqs: true, purchaseOrders: true } },
      },
    }),
    prisma.supplier.count({ where }),
  ]);

  return { suppliers, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const getSupplierById = async (id) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      rfqs: { orderBy: { createdAt: 'desc' }, take: 5 },
      purchaseOrders: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, poNumber: true, status: true, totalAmount: true, orderDate: true },
      },
      _count: { select: { rfqs: true, purchaseOrders: true } },
    },
  });
  if (!supplier) throw new AppError('Supplier not found', 404);
  return supplier;
};

const createSupplier = async (data, user) => {
  const existing = await prisma.supplier.findUnique({ where: { code: data.code } });
  if (existing) throw new AppError(`Supplier code ${data.code} already exists`, 409);

  const supplier = await prisma.supplier.create({ data });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROCUREMENT',
    entityId: supplier.id, entityType: 'Supplier',
    newValues: { code: supplier.code, name: supplier.name },
    description: `Supplier created: ${supplier.name} (${supplier.code})`,
  });

  return supplier;
};

const updateSupplier = async (id, data, user) => {
  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) throw new AppError('Supplier not found', 404);

  const updated = await prisma.supplier.update({ where: { id }, data });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'PROCUREMENT',
    entityId: id, entityType: 'Supplier',
    oldValues: supplier, newValues: data,
    description: `Supplier updated: ${supplier.name}`,
  });

  return updated;
};

const deleteSupplier = async (id, user) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: { _count: { select: { purchaseOrders: true } } },
  });
  if (!supplier) throw new AppError('Supplier not found', 404);
  if (supplier._count.purchaseOrders > 0) {
    throw new AppError('Cannot delete supplier with existing purchase orders. Set status to INACTIVE instead.', 409);
  }

  await prisma.supplier.delete({ where: { id } });
  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'DELETE', module: 'PROCUREMENT',
    entityId: id, entityType: 'Supplier',
    description: `Supplier deleted: ${supplier.name}`,
  });
};

// ─────────────────────────────────────────────────────────
// RFQ MODULE
// ─────────────────────────────────────────────────────────

const getRFQs = async ({ page = 1, limit = 20, status, search, projectId } = {}) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(status && { status }),
    ...(projectId && { projectId }),
    ...(search && {
      OR: [
        { rfqNumber: { contains: search } },
        { title: { contains: search } },
      ],
    }),
  };

  const [rfqs, total] = await Promise.all([
    prisma.rFQ.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip, take: limit,
      include: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        project: { select: { projectCode: true, name: true } },
        _count: { select: { items: true, quotes: true, suppliers: true } },
      },
    }),
    prisma.rFQ.count({ where }),
  ]);

  return { rfqs, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const getRFQById = async (id) => {
  const rfq = await prisma.rFQ.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      approvedBy: { select: { firstName: true, lastName: true } },
      project: { select: { projectCode: true, name: true } },
      suppliers: { include: { supplier: { select: { id: true, code: true, name: true, email: true, rating: true } } } },
      items: { include: { inventoryItem: { select: { sku: true, name: true, unit: true } } } },
      quotes: {
        include: {
          supplier: { select: { id: true, code: true, name: true } },
          items: { include: { rfqItem: { select: { description: true, unit: true } } } },
        },
      },
      purchaseOrders: { select: { id: true, poNumber: true, status: true, totalAmount: true } },
    },
  });
  if (!rfq) throw new AppError('RFQ not found', 404);
  return rfq;
};

const createRFQ = async ({ supplierIds, items, ...data }, user) => {
  const rfqNumber = await generateCode('RFQ', 'rFQ', 'rfqNumber');

  // Validate suppliers exist and are active
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: supplierIds }, status: 'ACTIVE' },
  });
  if (suppliers.length !== supplierIds.length) {
    throw new AppError('One or more supplier IDs are invalid or inactive', 400);
  }

  const rfq = await prisma.$transaction(async (tx) => {
    const created = await tx.rFQ.create({
      data: {
        rfqNumber,
        ...data,
        createdById: user.id,
        suppliers: {
          create: supplierIds.map((sid) => ({ supplierId: sid })),
        },
        items: {
          create: items.map((item) => ({
            inventoryItemId: item.inventoryItemId || null,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            specifications: item.specifications || null,
          })),
        },
      },
      include: {
        suppliers: { include: { supplier: true } },
        items: true,
      },
    });
    return created;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROCUREMENT',
    entityId: rfq.id, entityType: 'RFQ',
    newValues: { rfqNumber, title: data.title, status: 'DRAFT' },
    description: `RFQ created: ${rfqNumber} — ${data.title}`,
  });

  logger.info(`RFQ created: ${rfqNumber} by ${user.email}`);
  return rfq;
};

const updateRFQ = async (id, data, user) => {
  const rfq = await prisma.rFQ.findUnique({ where: { id } });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (!['DRAFT', 'SENT'].includes(rfq.status)) {
    throw new AppError(`Cannot edit RFQ in ${rfq.status} status`, 400);
  }

  const updated = await prisma.rFQ.update({ where: { id }, data });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'PROCUREMENT',
    entityId: id, entityType: 'RFQ',
    oldValues: { title: rfq.title, status: rfq.status },
    newValues: data,
    description: `RFQ updated: ${rfq.rfqNumber}`,
  });

  return updated;
};

const submitRFQ = async (id, user) => {
  const rfq = await prisma.rFQ.findUnique({ where: { id }, include: { items: true, suppliers: true } });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (rfq.status !== 'DRAFT') throw new AppError('Only DRAFT RFQs can be submitted', 400);
  if (!rfq.items.length) throw new AppError('RFQ must have at least one item before submission', 400);
  if (!rfq.suppliers.length) throw new AppError('RFQ must have at least one supplier', 400);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.rFQ.update({
      where: { id },
      data: { status: 'SENT' },
    });
    // Mark all supplier links as sent
    await tx.rFQSupplier.updateMany({
      where: { rfqId: id, sentAt: null },
      data: { sentAt: new Date() },
    });
    return result;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'PROCUREMENT',
    entityId: id, entityType: 'RFQ',
    oldValues: { status: 'DRAFT' }, newValues: { status: 'SENT' },
    description: `RFQ submitted to suppliers: ${rfq.rfqNumber}`,
  });

  return updated;
};

const approveRFQ = async (id, { notes } = {}, user) => {
  const rfq = await prisma.rFQ.findUnique({ where: { id } });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (!['SENT', 'QUOTED', 'UNDER_REVIEW'].includes(rfq.status)) {
    throw new AppError(`RFQ in ${rfq.status} status cannot be approved`, 400);
  }

  const updated = await prisma.rFQ.update({
    where: { id },
    data: {
      status: 'APPROVED',
      approvedById: user.id,
      approvedAt: new Date(),
      ...(notes && { notes }),
    },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'APPROVE', module: 'PROCUREMENT',
    entityId: id, entityType: 'RFQ',
    oldValues: { status: rfq.status }, newValues: { status: 'APPROVED' },
    description: `RFQ approved: ${rfq.rfqNumber}`,
  });

  return updated;
};

const rejectRFQ = async (id, { notes } = {}, user) => {
  const rfq = await prisma.rFQ.findUnique({ where: { id } });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (rfq.status === 'APPROVED' || rfq.status === 'CANCELLED') {
    throw new AppError(`Cannot reject RFQ in ${rfq.status} status`, 400);
  }

  const updated = await prisma.rFQ.update({
    where: { id },
    data: { status: 'REJECTED', ...(notes && { notes }) },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'REJECT', module: 'PROCUREMENT',
    entityId: id, entityType: 'RFQ',
    oldValues: { status: rfq.status }, newValues: { status: 'REJECTED' },
    description: `RFQ rejected: ${rfq.rfqNumber}`,
  });

  return updated;
};

// ─────────────────────────────────────────────────────────
// RFQ QUOTES
// ─────────────────────────────────────────────────────────

const createQuote = async (data, user) => {
  const { rfqId, supplierId, items, ...quoteData } = data;

  const rfq = await prisma.rFQ.findUnique({
    where: { id: rfqId },
    include: { items: true, suppliers: true },
  });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (!['SENT', 'QUOTED'].includes(rfq.status)) {
    throw new AppError('Quotes can only be added to SENT or QUOTED RFQs', 400);
  }

  // Validate supplier is part of this RFQ
  const isLinked = rfq.suppliers.some((s) => s.supplierId === supplierId);
  if (!isLinked) throw new AppError('Supplier is not part of this RFQ', 400);

  // Validate all rfqItemIds belong to this RFQ
  const validItemIds = rfq.items.map((i) => i.id);
  for (const item of items) {
    if (!validItemIds.includes(item.rfqItemId)) {
      throw new AppError(`Invalid rfqItemId: ${item.rfqItemId}`, 400);
    }
  }

  const quote = await prisma.$transaction(async (tx) => {
    const created = await tx.rFQQuote.create({
      data: {
        rfqId,
        supplierId,
        ...quoteData,
        items: {
          create: items.map((item) => ({
            rfqItemId: item.rfqItemId,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            totalPrice: item.unitPrice * item.quantity,
            notes: item.notes || null,
          })),
        },
      },
      include: { items: true, supplier: { select: { name: true, code: true } } },
    });

    // Advance RFQ to QUOTED if still SENT
    if (rfq.status === 'SENT') {
      await tx.rFQ.update({ where: { id: rfqId }, data: { status: 'QUOTED' } });
    }

    return created;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROCUREMENT',
    entityId: quote.id, entityType: 'RFQQuote',
    newValues: { rfqId, supplierId, totalAmount: quoteData.totalAmount },
    description: `Quote submitted for RFQ ${rfq.rfqNumber} by supplier ${quote.supplier.name}`,
  });

  return quote;
};

const selectQuote = async (rfqId, quoteId, { notes } = {}, user) => {
  const rfq = await prisma.rFQ.findUnique({
    where: { id: rfqId },
    include: { quotes: true },
  });
  if (!rfq) throw new AppError('RFQ not found', 404);
  if (rfq.status !== 'APPROVED') {
    throw new AppError('RFQ must be APPROVED before selecting a quote', 400);
  }

  const quote = rfq.quotes.find((q) => q.id === quoteId);
  if (!quote) throw new AppError('Quote not found in this RFQ', 404);

  // FIX B-03: Check quote validity
  if (quote.validUntil && new Date(quote.validUntil) < new Date()) {
    throw new AppError(
      `This quote expired on ${new Date(quote.validUntil).toLocaleDateString()}. Ask the supplier to resubmit.`,
      400
    );
  }

  await prisma.$transaction(async (tx) => {
    // Deselect all others
    await tx.rFQQuote.updateMany({ where: { rfqId }, data: { isSelected: false } });
    // Select chosen
    await tx.rFQQuote.update({ where: { id: quoteId }, data: { isSelected: true } });
    if (notes) await tx.rFQ.update({ where: { id: rfqId }, data: { notes } });
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'PROCUREMENT',
    entityId: quoteId, entityType: 'RFQQuote',
    description: `Quote selected for RFQ ${rfq.rfqNumber}`,
  });

  return { message: 'Quote selected successfully' };
};

const getQuoteComparison = async (rfqId) => {
  const rfq = await prisma.rFQ.findUnique({
    where: { id: rfqId },
    include: {
      items: { include: { inventoryItem: { select: { sku: true, name: true } } } },
      quotes: {
        include: {
          supplier: { select: { id: true, name: true, code: true, rating: true, leadTimeDays: true } },
          items: { include: { rfqItem: { select: { description: true, quantity: true, unit: true } } } },
        },
        orderBy: { totalAmount: 'asc' },
      },
    },
  });
  if (!rfq) throw new AppError('RFQ not found', 404);

  // Build comparison matrix
  const comparison = {
    rfqNumber: rfq.rfqNumber,
    title: rfq.title,
    itemCount: rfq.items.length,
    quoteCount: rfq.quotes.length,
    lowestQuote: rfq.quotes[0] || null,
    quotes: rfq.quotes.map((q) => ({
      id: q.id,
      supplier: q.supplier,
      quoteNumber: q.quoteNumber,
      totalAmount: q.totalAmount,
      currency: q.currency,
      deliveryDays: q.deliveryDays,
      paymentTerms: q.paymentTerms,
      validUntil: q.validUntil,
      isSelected: q.isSelected,
      savings: rfq.quotes[rfq.quotes.length - 1]
        ? rfq.quotes[rfq.quotes.length - 1].totalAmount - q.totalAmount
        : 0,
      items: q.items,
    })),
  };

  return comparison;
};

// ─────────────────────────────────────────────────────────
// PURCHASE ORDER
// ─────────────────────────────────────────────────────────

const getPOs = async ({ page = 1, limit = 20, status, supplierId, projectId, search } = {}) => {
  const skip = (page - 1) * limit;
  const where = {
    ...(status && { status }),
    ...(supplierId && { supplierId }),
    ...(projectId && { projectId }),
    ...(search && {
      OR: [
        { poNumber: { contains: search } },
        { supplier: { name: { contains: search } } },
      ],
    }),
  };

  const [pos, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip, take: limit,
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        createdBy: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
        project: { select: { projectCode: true, name: true } },
        _count: { select: { items: true, receivings: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return { pos, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } };
};

const getPOById = async (id) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      rfq: { select: { rfqNumber: true, title: true } },
      project: { select: { projectCode: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      approvedBy: { select: { firstName: true, lastName: true } },
      items: { include: { inventoryItem: { select: { sku: true, name: true, currentStock: true } } } },
      receivings: {
        include: {
          items: { include: { poItem: { select: { description: true, unit: true } } } },
        },
      },
    },
  });
  if (!po) throw new AppError('Purchase Order not found', 404);
  return po;
};

const createPO = async ({ items, ...data }, user) => {
  const poNumber = await generateCode('PO', 'purchaseOrder', 'poNumber');

  const supplier = await prisma.supplier.findUnique({ where: { id: data.supplierId } });
  if (!supplier || supplier.status === 'BLACKLISTED') {
    throw new AppError('Invalid or blacklisted supplier', 400);
  }

  const { enriched, subtotal, taxAmount, totalAmount } = calcPOTotals(items);

  const po = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseOrder.create({
      data: {
        poNumber,
        ...data,
        totalAmount,
        taxAmount,
        createdById: user.id,
        status: 'DRAFT',
        items: {
          create: enriched.map((item) => ({
            inventoryItemId: item.inventoryItemId || null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            unit: item.unit,
            taxRate: item.taxRate || 0,
            notes: item.notes || null,
          })),
        },
      },
      include: { items: true, supplier: { select: { name: true } } },
    });
    return created;
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROCUREMENT',
    entityId: po.id, entityType: 'PurchaseOrder',
    newValues: { poNumber, totalAmount, supplierId: data.supplierId },
    description: `PO created: ${poNumber} — ${supplier.name} (₱${totalAmount.toLocaleString()})`,
  });

  return po;
};

const updatePO = async (id, data, user) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id } });
  if (!po) throw new AppError('Purchase Order not found', 404);
  if (!['DRAFT', 'PENDING_APPROVAL'].includes(po.status)) {
    throw new AppError(`Cannot edit PO in ${po.status} status`, 400);
  }

  const updated = await prisma.purchaseOrder.update({ where: { id }, data });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'UPDATE', module: 'PROCUREMENT',
    entityId: id, entityType: 'PurchaseOrder',
    oldValues: po, newValues: data,
    description: `PO updated: ${po.poNumber}`,
  });

  return updated;
};

const submitPO = async (id, user) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id }, include: { items: true },
  });
  if (!po) throw new AppError('Purchase Order not found', 404);
  if (po.status !== 'DRAFT') throw new AppError('Only DRAFT POs can be submitted for approval', 400);
  if (!po.items.length) throw new AppError('PO must have at least one item', 400);

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'PENDING_APPROVAL' },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'PROCUREMENT',
    entityId: id, entityType: 'PurchaseOrder',
    oldValues: { status: 'DRAFT' }, newValues: { status: 'PENDING_APPROVAL' },
    description: `PO submitted for approval: ${po.poNumber}`,
  });

  return updated;
};

const approvePO = async (id, { notes } = {}, user) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!po) throw new AppError('Purchase Order not found', 404);
  if (po.status !== 'PENDING_APPROVAL') {
    throw new AppError('Only PENDING_APPROVAL POs can be approved', 400);
  }

  // FIX B-01: Reserve stock for each inventory item in the PO
  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        ...(notes && { notes }),
      },
    });
    for (const item of po.items) {
      if (item.inventoryItemId) {
        const qtyToReceive = item.quantity - item.receivedQty;
        if (qtyToReceive > 0) {
          await tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { reservedStock: { increment: qtyToReceive } },
          });
        }
      }
    }
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'APPROVE', module: 'PROCUREMENT',
    entityId: id, entityType: 'PurchaseOrder',
    oldValues: { status: 'PENDING_APPROVAL' }, newValues: { status: 'APPROVED' },
    description: `PO approved: ${po.poNumber}`,
  });

  return prisma.purchaseOrder.findUnique({ where: { id } });
};

const rejectPO = async (id, { notes } = {}, user) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!po) throw new AppError('Purchase Order not found', 404);
  if (po.status !== 'PENDING_APPROVAL') {
    throw new AppError('Only PENDING_APPROVAL POs can be rejected', 400);
  }

  await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'DRAFT', ...(notes && { notes }) },
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'REJECT', module: 'PROCUREMENT',
    entityId: id, entityType: 'PurchaseOrder',
    description: `PO rejected back to DRAFT: ${po.poNumber}. Notes: ${notes}`,
  });

  return prisma.purchaseOrder.findUnique({ where: { id } });
};

const cancelPO = async (id, user) => {
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!po) throw new AppError('Purchase Order not found', 404);
  if (['RECEIVED', 'CLOSED', 'CANCELLED'].includes(po.status)) {
    throw new AppError(`Cannot cancel PO in ${po.status} status`, 400);
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchaseOrder.update({
      where: { id }, data: { status: 'CANCELLED' },
    });
    // Release reserved stock if PO was already approved
    if (['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      for (const item of po.items) {
        if (item.inventoryItemId) {
          const qtyToRelease = item.quantity - item.receivedQty;
          if (qtyToRelease > 0) {
            await tx.inventoryItem.update({
              where: { id: item.inventoryItemId },
              data: { reservedStock: { decrement: qtyToRelease } },
            });
          }
        }
      }
    }
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'WORKFLOW_CHANGE', module: 'PROCUREMENT',
    entityId: id, entityType: 'PurchaseOrder',
    oldValues: { status: po.status }, newValues: { status: 'CANCELLED' },
    description: `PO cancelled: ${po.poNumber}`,
  });

  return prisma.purchaseOrder.findUnique({ where: { id } });
};

// ─────────────────────────────────────────────────────────
// PO RECEIVING → triggers inventory batch creation
// ─────────────────────────────────────────────────────────

const receivePO = async (poId, data, user) => {
  const { items: receivingItems, notes, receivedDate } = data;

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      items: true,
      supplier: { select: { name: true } },
    },
  });

  if (!po) throw new AppError('Purchase Order not found', 404);
  if (!['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    throw new AppError(`Cannot receive PO in ${po.status} status. PO must be APPROVED first.`, 400);
  }

  // Validate receiving items
  for (const ri of receivingItems) {
    const poItem = po.items.find((i) => i.id === ri.poItemId);
    if (!poItem) throw new AppError(`PO item ${ri.poItemId} not found`, 400);

    const remainingQty = poItem.quantity - poItem.receivedQty;
    if (ri.receivedQty > remainingQty + 0.001) {
      throw new AppError(
        `Cannot receive ${ri.receivedQty} for "${poItem.description}". Remaining: ${remainingQty}`,
        400
      );
    }
    if (ri.acceptedQty + ri.rejectedQty > ri.receivedQty + 0.001) {
      throw new AppError(`Accepted + Rejected cannot exceed Received for item "${poItem.description}"`, 400);
    }
  }

  const receiptNumber = await generateCode('GRN', 'pOReceiving', 'receiptNumber');

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create the receiving record
    const receiving = await tx.pOReceiving.create({
      data: {
        purchaseOrderId: poId,
        receiptNumber,
        receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
        receivedById: user.id,
        status: 'COMPLETE',
        notes,
      },
    });

    const batchIds = {};

    // 2. Process each receiving item
    for (const ri of receivingItems) {
      const poItem = po.items.find((i) => i.id === ri.poItemId);
      let batchId = null;

      // 3. If linked to an inventory item → create batch + stock movement
      if (poItem.inventoryItemId && ri.acceptedQty > 0) {
        const batchNumber = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

        const batch = await tx.inventoryBatch.create({
          data: {
            batchNumber,
            inventoryItemId: poItem.inventoryItemId,
            quantity: ri.acceptedQty,
            remainingQty: ri.acceptedQty,
            unitCost: ri.unitCost,
            totalCost: ri.unitCost * ri.acceptedQty,
            status: 'ACTIVE',
            receivingId: receiving.id,
          },
        });
        batchId = batch.id;
        batchIds[ri.poItemId] = batchId;

        // 4. Create stock movement (IN)
        await tx.stockMovement.create({
          data: {
            inventoryItemId: poItem.inventoryItemId,
            batchId: batch.id,
            movementType: 'IN',
            source: 'PURCHASE_ORDER',
            quantity: ri.acceptedQty,
            unitCost: ri.unitCost,
            totalCost: ri.unitCost * ri.acceptedQty,
            referenceId: poId,
            referenceNumber: po.poNumber,
            performedById: user.id,
          },
        });

        // 5. Update currentStock on inventory item
        await tx.inventoryItem.update({
          where: { id: poItem.inventoryItemId },
          data: { currentStock: { increment: ri.acceptedQty } },
        });
      }

      // 6. Create receiving item record
      await tx.pOReceivingItem.create({
        data: {
          poReceivingId: receiving.id,
          poItemId: ri.poItemId,
          receivedQty: ri.receivedQty,
          acceptedQty: ri.acceptedQty,
          rejectedQty: ri.rejectedQty || 0,
          unitCost: ri.unitCost,
          batchId,
          notes: ri.notes || null,
        },
      });

      // 7. Update PO item received qty
      await tx.pOItem.update({
        where: { id: ri.poItemId },
        data: { receivedQty: { increment: ri.receivedQty } },
      });
    }

    // 8. Check if PO is fully received
    const freshPOItems = await tx.pOItem.findMany({ where: { purchaseOrderId: poId } });
    const allReceived = freshPOItems.every((i) => i.receivedQty >= i.quantity - 0.001);
    const anyReceived = freshPOItems.some((i) => i.receivedQty > 0);

    const newPOStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status;

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: newPOStatus,
        ...(allReceived && { receivedAt: new Date() }),
      },
    });

    // FIX B-01: Release reservedStock for received items
    for (const ri of receivingItems) {
      const poItem = po.items.find((i) => i.id === ri.poItemId);
      if (poItem && poItem.inventoryItemId && ri.receivedQty > 0) {
        await tx.inventoryItem.update({
          where: { id: poItem.inventoryItemId },
          data: { reservedStock: { decrement: ri.receivedQty } },
        });
      }
    }

    return { receiving, newPOStatus, batchIds };
  });

  await createAuditLog({
    userId: user.id, userEmail: user.email,
    action: 'CREATE', module: 'PROCUREMENT',
    entityId: result.receiving.id, entityType: 'POReceiving',
    newValues: { receiptNumber, poId, status: result.newPOStatus },
    description: `GRN created: ${receiptNumber} for PO ${po.poNumber}. PO status → ${result.newPOStatus}`,
  });

  logger.info(`PO ${po.poNumber} received. GRN: ${receiptNumber}. New status: ${result.newPOStatus}`);
  return result;
};

const getReceivingsByPO = async (poId) => {
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId } });
  if (!po) throw new AppError('Purchase Order not found', 404);

  return prisma.pOReceiving.findMany({
    where: { purchaseOrderId: poId },
    orderBy: { receivedDate: 'desc' },
    include: {
      items: {
        include: {
          poItem: { select: { description: true, unit: true, unitPrice: true } },
          batch: { select: { batchNumber: true } },
        },
      },
    },
  });
};

// ─────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────

const getProcurementStats = async () => {
  const [
    totalSuppliers,
    activeSuppliers,
    totalRFQs,
    pendingRFQs,
    totalPOs,
    pendingPOs,
    poValueResult,
    recentPOs,
  ] = await Promise.all([
    prisma.supplier.count(),
    prisma.supplier.count({ where: { status: 'ACTIVE' } }),
    prisma.rFQ.count(),
    prisma.rFQ.count({ where: { status: { in: ['DRAFT', 'SENT', 'QUOTED', 'UNDER_REVIEW'] } } }),
    prisma.purchaseOrder.count(),
    prisma.purchaseOrder.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.purchaseOrder.aggregate({
      _sum: { totalAmount: true },
      where: { status: { notIn: ['CANCELLED'] } },
    }),
    prisma.purchaseOrder.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { supplier: { select: { name: true } } },
    }),
  ]);

  // Top suppliers by PO value
  const topSuppliers = await prisma.purchaseOrder.groupBy({
    by: ['supplierId'],
    _sum: { totalAmount: true },
    _count: { id: true },
    where: { status: { notIn: ['CANCELLED'] } },
    orderBy: { _sum: { totalAmount: 'desc' } },
    take: 5,
  });

  const supplierIds = topSuppliers.map((s) => s.supplierId);
  const supplierDetails = await prisma.supplier.findMany({
    where: { id: { in: supplierIds } },
    select: { id: true, name: true, code: true, rating: true },
  });

  const topSuppliersWithDetails = topSuppliers.map((ts) => ({
    ...ts,
    supplier: supplierDetails.find((s) => s.id === ts.supplierId),
  }));

  return {
    suppliers: { total: totalSuppliers, active: activeSuppliers },
    rfqs: { total: totalRFQs, pending: pendingRFQs },
    purchaseOrders: {
      total: totalPOs,
      pendingApproval: pendingPOs,
      totalValue: poValueResult._sum.totalAmount || 0,
    },
    recentPOs,
    topSuppliers: topSuppliersWithDetails,
  };
};

module.exports = {
  // Suppliers
  getSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier,
  // RFQs
  getRFQs, getRFQById, createRFQ, updateRFQ, submitRFQ, approveRFQ, rejectRFQ,
  // Quotes
  createQuote, selectQuote, getQuoteComparison,
  // POs
  getPOs, getPOById, createPO, updatePO, submitPO, approvePO, rejectPO, cancelPO,
  // Receiving
  receivePO, getReceivingsByPO,
  // Analytics
  getProcurementStats,
};
