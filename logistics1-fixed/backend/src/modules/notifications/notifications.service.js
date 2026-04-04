// src/modules/notifications/notifications.service.js
// FIX BUG 9: Added scan deduplication — each entity is only notified once per
// 24-hour window, preventing duplicate alerts on every scan run.
const prisma = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const logger = require('../../utils/logger');

// ─────────────────────────────────────────────────────────
// CORE NOTIFICATION ENGINE
// ─────────────────────────────────────────────────────────

const createNotification = async ({
  userIds,
  title,
  message,
  type = 'INFO',
  module = null,
  entityId = null,
}) => {
  if (!userIds || userIds.length === 0) return [];

  try {
    const notifications = await prisma.$transaction(
      userIds.map((userId) =>
        prisma.notification.create({
          data: { userId, title, message, type, module, entityId },
        })
      )
    );
    logger.info(`Notifications sent [${type}] "${title}" → ${userIds.length} user(s)`);
    return notifications;
  } catch (error) {
    logger.error(`Notification creation failed: ${error.message}`);
    return [];
  }
};

const getManagerIds = async () => {
  const users = await prisma.user.findMany({
    where: { role: { in: ['ADMIN', 'MANAGER'] }, status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((u) => u.id);
};

const getTechnicianIds = async () => {
  const users = await prisma.user.findMany({
    where: { role: 'TECHNICIAN', status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((u) => u.id);
};

// ─────────────────────────────────────────────────────────
// FIX BUG 9: Deduplication helper
// Returns true if we already notified about this entity+title combo
// within the last 24 hours. Prevents alert spam on repeated scans.
// ─────────────────────────────────────────────────────────

const wasRecentlyNotified = async (entityId, title, hoursWindow = 24) => {
  if (!entityId) return false;
  const since = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: {
      entityId,
      title,
      createdAt: { gte: since },
    },
  });
  return !!existing;
};

// ─────────────────────────────────────────────────────────
// CROSS-MODULE NOTIFICATION TRIGGERS
// ─────────────────────────────────────────────────────────

const triggers = {
  async poSubmittedForApproval({ poNumber, poId }) {
    const ids = await getManagerIds();
    await createNotification({
      userIds: ids,
      title: 'Purchase Order Awaiting Approval',
      message: `PO ${poNumber} has been submitted and requires your approval.`,
      type: 'INFO', module: 'PROCUREMENT', entityId: poId,
    });
  },

  async poApproved({ poNumber, poId, createdById }) {
    await createNotification({
      userIds: [createdById],
      title: 'Purchase Order Approved',
      message: `Your PO ${poNumber} has been approved and is ready to be sent to the supplier.`,
      type: 'SUCCESS', module: 'PROCUREMENT', entityId: poId,
    });
  },

  async poRejected({ poNumber, poId, createdById }) {
    await createNotification({
      userIds: [createdById],
      title: 'Purchase Order Rejected',
      message: `PO ${poNumber} was rejected. Please review and resubmit.`,
      type: 'ERROR', module: 'PROCUREMENT', entityId: poId,
    });
  },

  async rfqApproved({ rfqNumber, rfqId, createdById }) {
    await createNotification({
      userIds: [createdById],
      title: 'RFQ Approved',
      message: `RFQ ${rfqNumber} has been approved. You can now create a Purchase Order.`,
      type: 'SUCCESS', module: 'PROCUREMENT', entityId: rfqId,
    });
  },

  async lowStockAlert({ itemId, sku, name, currentStock, reorderPoint }) {
    const ids = await getManagerIds();
    await createNotification({
      userIds: ids,
      title: '⚠️ Low Stock Alert',
      message: `${name} (${sku}) is below reorder point. Current: ${currentStock}, Reorder at: ${reorderPoint}.`,
      type: 'WARNING', module: 'INVENTORY', entityId: itemId,
    });
  },

  async batchExpiringSoon({ batchId, itemName, expiryDate, daysLeft }) {
    const ids = await getManagerIds();
    await createNotification({
      userIds: ids,
      title: '⚠️ Batch Expiring Soon',
      message: `Batch of "${itemName}" expires in ${daysLeft} day(s) on ${new Date(expiryDate).toLocaleDateString('en-PH')}.`,
      type: 'WARNING', module: 'INVENTORY', entityId: batchId,
    });
  },

  async maintenanceDueSoon({ assetId, assetCode, assetName, daysUntilDue }) {
    const ids = [...await getManagerIds(), ...await getTechnicianIds()];
    const unique = [...new Set(ids)];
    await createNotification({
      userIds: unique,
      title: '🔧 Maintenance Due Soon',
      message: `Asset ${assetCode} (${assetName}) is due for maintenance in ${daysUntilDue} day(s).`,
      type: 'ALERT', module: 'ASSETS', entityId: assetId,
    });
  },

  async warrantyExpiringSoon({ assetId, assetCode, assetName, daysLeft }) {
    const ids = await getManagerIds();
    await createNotification({
      userIds: ids,
      title: '⚠️ Warranty Expiring Soon',
      message: `Warranty for asset ${assetCode} (${assetName}) expires in ${daysLeft} day(s).`,
      type: 'WARNING', module: 'ASSETS', entityId: assetId,
    });
  },

  async assetStatusChanged({ assetId, assetCode, newStatus, changedBy }) {
    const ids = await getManagerIds();
    await createNotification({
      userIds: ids,
      title: 'Asset Status Changed',
      message: `Asset ${assetCode} status changed to ${newStatus} by ${changedBy}.`,
      type: 'INFO', module: 'ASSETS', entityId: assetId,
    });
  },

  async workOrderAssigned({ woId, woNumber, title, assignedToId }) {
    if (!assignedToId) return;
    await createNotification({
      userIds: [assignedToId],
      title: 'Work Order Assigned to You',
      message: `You have been assigned to WO ${woNumber}: "${title}". Please review and begin when ready.`,
      type: 'INFO', module: 'MRO', entityId: woId,
    });
  },

  async workOrderOverdue({ woId, woNumber, title, assignedToId }) {
    const ids = await getManagerIds();
    if (assignedToId) ids.push(assignedToId);
    const unique = [...new Set(ids)];
    await createNotification({
      userIds: unique,
      title: '🚨 Work Order Overdue',
      message: `Work order ${woNumber}: "${title}" is past its due date and is still open.`,
      type: 'ALERT', module: 'MRO', entityId: woId,
    });
  },

  async workOrderCompleted({ woId, woNumber, totalCost, createdById }) {
    await createNotification({
      userIds: [createdById],
      title: '✅ Work Order Completed',
      message: `WO ${woNumber} has been completed. Total cost: ₱${totalCost?.toLocaleString() || 0}.`,
      type: 'SUCCESS', module: 'MRO', entityId: woId,
    });
  },

  async projectOverBudget({ projectId, projectCode, name, budget, actualCost }) {
    const ids = await getManagerIds();
    const overage = (((actualCost - budget) / budget) * 100).toFixed(1);
    await createNotification({
      userIds: ids,
      title: '🚨 Project Over Budget',
      message: `Project ${projectCode} (${name}) is ${overage}% over budget. Budget: ₱${budget?.toLocaleString()}, Actual: ₱${actualCost?.toLocaleString()}.`,
      type: 'ALERT', module: 'PROJECTS', entityId: projectId,
    });
  },

  async projectStatusChanged({ projectId, projectCode, oldStatus, newStatus, changedBy }) {
    const ids = await getManagerIds();
    await createNotification({
      userIds: ids,
      title: 'Project Status Changed',
      message: `Project ${projectCode} status changed from ${oldStatus} to ${newStatus} by ${changedBy}.`,
      type: 'INFO', module: 'PROJECTS', entityId: projectId,
    });
  },
};

// ─────────────────────────────────────────────────────────
// USER-FACING NOTIFICATION CRUD
// ─────────────────────────────────────────────────────────

const getUserNotifications = async (userId, { page = 1, limit = 20, unreadOnly = false } = {}) => {
  const skip = (page - 1) * limit;
  const where = {
    userId,
    ...(unreadOnly === 'true' || unreadOnly === true ? { isRead: false } : {}),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return {
    notifications,
    unreadCount,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
};

const markAsRead = async (userId, notificationId) => {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!notification) throw new AppError('Notification not found', 404);
  if (notification.isRead) return notification;

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
};

const markAllAsRead = async (userId) => {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { markedCount: result.count };
};

const deleteNotification = async (userId, notificationId) => {
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!notification) throw new AppError('Notification not found', 404);
  await prisma.notification.delete({ where: { id: notificationId } });
};

const clearAllRead = async (userId) => {
  const result = await prisma.notification.deleteMany({
    where: { userId, isRead: true },
  });
  return { deletedCount: result.count };
};

const getUnreadCount = async (userId) => {
  const count = await prisma.notification.count({ where: { userId, isRead: false } });
  return { unreadCount: count };
};

// ─────────────────────────────────────────────────────────
// SCHEDULED ALERT SCANNER
// FIX BUG 9: Each alert now checks wasRecentlyNotified() before firing.
// An entity will only receive the same alert once per 24-hour window.
// ─────────────────────────────────────────────────────────

const runSystemAlertScan = async () => {
  const now = new Date();
  const in7Days  = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  let alertsFired = 0;

  // 1. Low stock alerts (deduplicated per item)
  const lowStockItems = await prisma.inventoryItem.findMany({
    where: { isActive: true, reorderPoint: { gt: 0 } },
  });
  for (const item of lowStockItems) {
    if (item.currentStock <= item.reorderPoint) {
      const title = '⚠️ Low Stock Alert';
      const alreadyNotified = await wasRecentlyNotified(item.id, title);
      if (!alreadyNotified) {
        await triggers.lowStockAlert({
          itemId: item.id, sku: item.sku, name: item.name,
          currentStock: item.currentStock, reorderPoint: item.reorderPoint,
        });
        alertsFired++;
      }
    }
  }

  // 2. Expiring batches within 30 days (deduplicated)
  const expiringBatches = await prisma.inventoryBatch.findMany({
    where: {
      status: 'ACTIVE',
      expiryDate: { gte: now, lte: in30Days },
      remainingQty: { gt: 0 },
    },
    include: { inventoryItem: { select: { name: true } } },
  });
  for (const batch of expiringBatches) {
    const title = '⚠️ Batch Expiring Soon';
    const alreadyNotified = await wasRecentlyNotified(batch.id, title);
    if (!alreadyNotified) {
      const daysLeft = Math.ceil((batch.expiryDate - now) / (1000 * 60 * 60 * 24));
      await triggers.batchExpiringSoon({
        batchId: batch.id, itemName: batch.inventoryItem.name,
        expiryDate: batch.expiryDate, daysLeft,
      });
      alertsFired++;
    }
  }

  // 3. Maintenance due soon within 7 days (deduplicated)
  const maintenanceDue = await prisma.maintenanceSchedule.findMany({
    where: {
      isActive: true,
      nextDue: { gte: now, lte: in7Days },
      asset: { status: { notIn: ['RETIRED', 'DISPOSED'] } },
    },
    include: { asset: { select: { assetCode: true, name: true } } },
  });
  for (const schedule of maintenanceDue) {
    const title = '🔧 Maintenance Due Soon';
    const alreadyNotified = await wasRecentlyNotified(schedule.assetId, title);
    if (!alreadyNotified) {
      const daysUntilDue = Math.ceil((schedule.nextDue - now) / (1000 * 60 * 60 * 24));
      await triggers.maintenanceDueSoon({
        assetId: schedule.assetId, assetCode: schedule.asset.assetCode,
        assetName: schedule.asset.name, daysUntilDue,
      });
      alertsFired++;
    }
  }

  // 4. Warranty expiring within 30 days (deduplicated)
  const warrantyExpiring = await prisma.asset.findMany({
    where: {
      warrantyExpiry: { gte: now, lte: in30Days },
      status: { notIn: ['RETIRED', 'DISPOSED'] },
    },
  });
  for (const asset of warrantyExpiring) {
    const title = '⚠️ Warranty Expiring Soon';
    const alreadyNotified = await wasRecentlyNotified(asset.id, title);
    if (!alreadyNotified) {
      const daysLeft = Math.ceil((asset.warrantyExpiry - now) / (1000 * 60 * 60 * 24));
      await triggers.warrantyExpiringSoon({
        assetId: asset.id, assetCode: asset.assetCode, assetName: asset.name, daysLeft,
      });
      alertsFired++;
    }
  }

  // 5. Overdue work orders (deduplicated)
  const overdueWOs = await prisma.workOrder.findMany({
    where: {
      dueDate: { lt: now },
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
  });
  for (const wo of overdueWOs) {
    const title = '🚨 Work Order Overdue';
    const alreadyNotified = await wasRecentlyNotified(wo.id, title);
    if (!alreadyNotified) {
      await triggers.workOrderOverdue({
        woId: wo.id, woNumber: wo.woNumber, title: wo.title, assignedToId: wo.assignedToId,
      });
      alertsFired++;
    }
  }

  // 6. Projects over budget (deduplicated)
  const overBudgetProjects = await prisma.project.findMany({
    where: {
      budget: { gt: 0 },
      status: { notIn: ['CANCELLED', 'COMPLETED'] },
    },
  });
  for (const proj of overBudgetProjects) {
    if (proj.actualCost > proj.budget) {
      const title = '🚨 Project Over Budget';
      const alreadyNotified = await wasRecentlyNotified(proj.id, title);
      if (!alreadyNotified) {
        await triggers.projectOverBudget({
          projectId: proj.id, projectCode: proj.projectCode,
          name: proj.name, budget: proj.budget, actualCost: proj.actualCost,
        });
        alertsFired++;
      }
    }
  }

  logger.info(`System alert scan complete. ${alertsFired} new alert(s) fired.`);
  return { alertsFired, scannedAt: now };
};

module.exports = {
  createNotification,
  triggers,
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllRead,
  getUnreadCount,
  runSystemAlertScan,
};
