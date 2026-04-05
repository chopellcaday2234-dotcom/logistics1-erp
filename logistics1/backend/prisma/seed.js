// prisma/seed.js
// Full sample data seed for Logistics 1 ERP
// Run: node prisma/seed.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ─── Clean existing data (order matters for FK constraints) ───
  console.log('🧹 Cleaning existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.projectMaterial.deleteMany();
  await prisma.projectCommunication.deleteMany();
  await prisma.projectRisk.deleteMany();
  await prisma.projectTask.deleteMany();
  await prisma.wOPartUsage.deleteMany();
  await prisma.maintenanceLog.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.maintenanceSchedule.deleteMany();
  await prisma.assetLog.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.pOReceivingItem.deleteMany();
  await prisma.inventoryBatch.deleteMany();   // Must delete BEFORE pOReceiving (receivingId FK)
  await prisma.pOReceiving.deleteMany();
  await prisma.pOItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.rFQQuoteItem.deleteMany();
  await prisma.rFQQuote.deleteMany();
  await prisma.rFQItem.deleteMany();
  await prisma.rFQSupplier.deleteMany();
  await prisma.rFQ.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  console.log('✅ Data cleaned\n');

  // ─── USERS ────────────────────────────────────────────────────
  console.log('👤 Creating users...');
  const passwordHash = await bcrypt.hash('Admin@1234', SALT_ROUNDS);
  const managerHash = await bcrypt.hash('Manager@1234', SALT_ROUNDS);
  const staffHash   = await bcrypt.hash('Staff@1234', SALT_ROUNDS);
  const techHash    = await bcrypt.hash('Tech@1234', SALT_ROUNDS);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@logistics1.com',
      password: passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'ADMIN',
      status: 'ACTIVE',
      department: 'Management',
      phone: '+63-912-000-0001',
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@logistics1.com',
      password: managerHash,
      firstName: 'Maria',
      lastName: 'Santos',
      role: 'MANAGER',
      status: 'ACTIVE',
      department: 'Operations',
      phone: '+63-912-000-0002',
    },
  });

  const staff = await prisma.user.create({
    data: {
      email: 'staff@logistics1.com',
      password: staffHash,
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      role: 'STAFF',
      status: 'ACTIVE',
      department: 'Warehouse',
      phone: '+63-912-000-0003',
    },
  });

  const technician = await prisma.user.create({
    data: {
      email: 'technician@logistics1.com',
      password: techHash,
      firstName: 'Roberto',
      lastName: 'Reyes',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      department: 'Maintenance',
      phone: '+63-912-000-0004',
    },
  });

  console.log('  ✅ 4 users created');

  // ─── SUPPLIERS ────────────────────────────────────────────────
  console.log('🏭 Creating suppliers...');

  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        code: 'SUP-001',
        name: 'Manila Food Distributors Inc.',
        contactPerson: 'Eduardo Lim',
        email: 'eduardo@manilafoods.ph',
        phone: '+63-2-8123-4567',
        address: '123 Quirino Ave, Malate',
        city: 'Manila',
        taxId: '123-456-789-000',
        paymentTerms: 'NET 30',
        leadTimeDays: 3,
        rating: 4.5,
        status: 'ACTIVE',
        notes: 'Primary F&B supplier. Reliable delivery.',
      },
    }),
    prisma.supplier.create({
      data: {
        code: 'SUP-002',
        name: 'ProClean Supplies Corp.',
        contactPerson: 'Annie Tan',
        email: 'annie@proclean.ph',
        phone: '+63-2-8234-5678',
        address: '456 EDSA, Mandaluyong',
        city: 'Mandaluyong',
        taxId: '234-567-890-000',
        paymentTerms: 'NET 15',
        leadTimeDays: 5,
        rating: 4.2,
        status: 'ACTIVE',
        notes: 'Housekeeping and cleaning supplies.',
      },
    }),
    prisma.supplier.create({
      data: {
        code: 'SUP-003',
        name: 'TechParts Philippines',
        contactPerson: 'Ramon Garcia',
        email: 'ramon@techparts.ph',
        phone: '+63-2-8345-6789',
        address: '789 Quezon Ave, QC',
        city: 'Quezon City',
        taxId: '345-678-901-000',
        paymentTerms: 'NET 45',
        leadTimeDays: 10,
        rating: 4.0,
        status: 'ACTIVE',
        notes: 'Spare parts and maintenance equipment.',
      },
    }),
    prisma.supplier.create({
      data: {
        code: 'SUP-004',
        name: 'Linens & Luxe Trading',
        contactPerson: 'Carla Villanueva',
        email: 'carla@linensluxe.ph',
        phone: '+63-2-8456-7890',
        address: '321 Shaw Blvd, Pasig',
        city: 'Pasig',
        taxId: '456-789-012-000',
        paymentTerms: 'NET 30',
        leadTimeDays: 7,
        rating: 4.7,
        status: 'ACTIVE',
        notes: 'Hotel linens, towels, and amenities.',
      },
    }),
    prisma.supplier.create({
      data: {
        code: 'SUP-005',
        name: 'Office Depot Philippines',
        contactPerson: 'Ben Cruz',
        email: 'ben.cruz@officedepot.ph',
        phone: '+63-2-8567-8901',
        address: '654 Ortigas Ave, Pasig',
        city: 'Pasig',
        taxId: '567-890-123-000',
        paymentTerms: 'NET 15',
        leadTimeDays: 2,
        rating: 3.8,
        status: 'ACTIVE',
        notes: 'Office and administrative supplies.',
      },
    }),
  ]);

  console.log(`  ✅ ${suppliers.length} suppliers created`);

  // ─── INVENTORY ITEMS ──────────────────────────────────────────
  console.log('📦 Creating inventory items...');

  const items = await Promise.all([
    // Food & Beverage
    prisma.inventoryItem.create({
      data: {
        sku: 'FB-001',
        name: 'All-Purpose Flour (25kg)',
        description: 'Premium all-purpose flour for kitchen use',
        category: 'FOOD_BEVERAGE',
        unit: 'Sack',
        reorderPoint: 10,
        reorderQty: 20,
        currentStock: 45,
        averageCost: 850.00,
        location: 'Dry Storage A1',
        expiryTracked: true,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        sku: 'FB-002',
        name: 'Cooking Oil (20L)',
        description: 'Refined palm cooking oil',
        category: 'FOOD_BEVERAGE',
        unit: 'Can',
        reorderPoint: 8,
        reorderQty: 15,
        currentStock: 28,
        averageCost: 1200.00,
        location: 'Dry Storage A2',
        expiryTracked: true,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        sku: 'FB-003',
        name: 'Mineral Water (500ml, 24-pack)',
        description: 'Bottled mineral water for guest rooms',
        category: 'FOOD_BEVERAGE',
        unit: 'Case',
        reorderPoint: 50,
        reorderQty: 100,
        currentStock: 120,
        averageCost: 180.00,
        location: 'Cold Storage B1',
        expiryTracked: true,
      },
    }),
    // Housekeeping
    prisma.inventoryItem.create({
      data: {
        sku: 'HK-001',
        name: 'Toilet Bowl Cleaner (1L)',
        description: 'Industrial-grade toilet bowl cleaner',
        category: 'CLEANING',
        unit: 'Bottle',
        reorderPoint: 20,
        reorderQty: 50,
        currentStock: 65,
        averageCost: 85.00,
        location: 'Housekeeping Store C1',
      },
    }),
    prisma.inventoryItem.create({
      data: {
        sku: 'HK-002',
        name: 'Microfiber Cleaning Cloths (Pack of 10)',
        description: 'Premium microfiber cloths for room cleaning',
        category: 'HOUSEKEEPING',
        unit: 'Pack',
        reorderPoint: 15,
        reorderQty: 30,
        currentStock: 40,
        averageCost: 250.00,
        location: 'Housekeeping Store C2',
      },
    }),
    // Linen & Amenities
    prisma.inventoryItem.create({
      data: {
        sku: 'LN-001',
        name: 'Bath Towel (Standard)',
        description: 'White 100% cotton bath towels 70x140cm',
        category: 'LINEN',
        unit: 'Piece',
        reorderPoint: 50,
        reorderQty: 100,
        currentStock: 180,
        averageCost: 320.00,
        location: 'Linen Room D1',
      },
    }),
    prisma.inventoryItem.create({
      data: {
        sku: 'LN-002',
        name: 'Bed Sheet Set (Queen)',
        description: 'Pure white 300TC cotton queen bed sheet set',
        category: 'LINEN',
        unit: 'Set',
        reorderPoint: 30,
        reorderQty: 60,
        currentStock: 95,
        averageCost: 850.00,
        location: 'Linen Room D2',
      },
    }),
    // Maintenance / Spare Parts
    prisma.inventoryItem.create({
      data: {
        sku: 'MP-001',
        name: 'LED Bulb 9W (Cool White)',
        description: 'Energy-saving LED bulb for room lighting',
        category: 'MAINTENANCE',
        unit: 'Piece',
        reorderPoint: 30,
        reorderQty: 60,
        currentStock: 85,
        averageCost: 95.00,
        location: 'Maintenance Store E1',
      },
    }),
    prisma.inventoryItem.create({
      data: {
        sku: 'MP-002',
        name: 'HVAC Air Filter (16x20)',
        description: 'Replacement air filter for HVAC units',
        category: 'SPARE_PARTS',
        unit: 'Piece',
        reorderPoint: 10,
        reorderQty: 20,
        currentStock: 22,
        averageCost: 350.00,
        location: 'Maintenance Store E2',
        isSerialized: false,
      },
    }),
    prisma.inventoryItem.create({
      data: {
        sku: 'MP-003',
        name: 'Pipe Wrench Set',
        description: 'Heavy duty 12" and 18" pipe wrench set',
        category: 'EQUIPMENT',
        unit: 'Set',
        reorderPoint: 2,
        reorderQty: 4,
        currentStock: 5,
        averageCost: 1800.00,
        location: 'Tool Room F1',
        isSerialized: true,
      },
    }),
    // Office Supplies
    prisma.inventoryItem.create({
      data: {
        sku: 'OS-001',
        name: 'A4 Bond Paper (500 sheets)',
        description: '80gsm A4 bond paper for office use',
        category: 'OFFICE_SUPPLIES',
        unit: 'Ream',
        reorderPoint: 20,
        reorderQty: 50,
        currentStock: 60,
        averageCost: 220.00,
        location: 'Office Supply Room G1',
      },
    }),
    prisma.inventoryItem.create({
      data: {
        sku: 'OS-002',
        name: 'Ballpen (Blue, Box of 12)',
        description: 'Standard blue ballpen box',
        category: 'OFFICE_SUPPLIES',
        unit: 'Box',
        reorderPoint: 10,
        reorderQty: 20,
        currentStock: 25,
        averageCost: 75.00,
        location: 'Office Supply Room G1',
      },
    }),
  ]);

  console.log(`  ✅ ${items.length} inventory items created`);

  // ─── INVENTORY BATCHES ────────────────────────────────────────
  console.log('📋 Creating inventory batches...');

  const batch1 = await prisma.inventoryBatch.create({
    data: {
      batchNumber: 'BATCH-2024-001',
      inventoryItemId: items[0].id, // Flour
      quantity: 45,
      remainingQty: 45,
      unitCost: 850.00,
      totalCost: 38250.00,
      status: 'ACTIVE',
      expiryDate: new Date('2025-06-30'),
      supplierLot: 'LOT-MFD-2024-01',
    },
  });

  const batch2 = await prisma.inventoryBatch.create({
    data: {
      batchNumber: 'BATCH-2024-002',
      inventoryItemId: items[1].id, // Cooking oil
      quantity: 28,
      remainingQty: 28,
      unitCost: 1200.00,
      totalCost: 33600.00,
      status: 'ACTIVE',
      expiryDate: new Date('2025-12-31'),
      supplierLot: 'LOT-MFD-2024-02',
    },
  });

  const batch3 = await prisma.inventoryBatch.create({
    data: {
      batchNumber: 'BATCH-2024-003',
      inventoryItemId: items[5].id, // Bath Towels
      quantity: 180,
      remainingQty: 180,
      unitCost: 320.00,
      totalCost: 57600.00,
      status: 'ACTIVE',
    },
  });

  const batch4 = await prisma.inventoryBatch.create({
    data: {
      batchNumber: 'BATCH-2024-004',
      inventoryItemId: items[7].id, // LED Bulbs
      quantity: 85,
      remainingQty: 85,
      unitCost: 95.00,
      totalCost: 8075.00,
      status: 'ACTIVE',
    },
  });

  const batch5 = await prisma.inventoryBatch.create({
    data: {
      batchNumber: 'BATCH-2024-005',
      inventoryItemId: items[8].id, // HVAC Filters
      quantity: 22,
      remainingQty: 22,
      unitCost: 350.00,
      totalCost: 7700.00,
      status: 'ACTIVE',
    },
  });

  console.log('  ✅ 5 inventory batches created');

  // ─── PROJECTS ─────────────────────────────────────────────────
  console.log('🏗️  Creating projects...');

  const project1 = await prisma.project.create({
    data: {
      projectCode: 'PROJ-2024-001',
      name: 'Guest Room Renovation — Floors 3-5',
      description: 'Complete renovation of 30 guest rooms including furniture replacement, painting, and HVAC upgrades.',
      status: 'ACTIVE',
      startDate: new Date('2024-01-15'),
      endDate: new Date('2024-06-30'),
      budget: 2500000.00,
      actualCost: 850000.00,
      location: 'Floors 3-5',
      department: 'Operations',
      createdById: admin.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      projectCode: 'PROJ-2024-002',
      name: 'Restaurant Kitchen Upgrade',
      description: 'Upgrade kitchen equipment and improve ventilation system for restaurant.',
      status: 'PLANNING',
      startDate: new Date('2024-03-01'),
      endDate: new Date('2024-05-31'),
      budget: 800000.00,
      actualCost: 0,
      location: 'Ground Floor Restaurant',
      department: 'F&B',
      createdById: manager.id,
    },
  });

  console.log('  ✅ 2 projects created');

  // ─── PROJECT TASKS ────────────────────────────────────────────
  await prisma.projectTask.createMany({
    data: [
      {
        projectId: project1.id,
        title: 'Procure furniture and fixtures',
        description: 'Source and purchase replacement furniture for 30 rooms',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assignedTo: manager.id,
        dueDate: new Date('2024-02-28'),
      },
      {
        projectId: project1.id,
        title: 'HVAC unit inspection and replacement',
        description: 'Inspect all HVAC units on floors 3-5 and replace faulty ones',
        status: 'TODO',
        priority: 'CRITICAL',
        assignedTo: technician.id,
        dueDate: new Date('2024-03-15'),
      },
      {
        projectId: project1.id,
        title: 'Painting and wallpaper',
        description: 'Paint all rooms and apply new wallpaper in common areas',
        status: 'TODO',
        priority: 'MEDIUM',
        dueDate: new Date('2024-04-30'),
      },
      {
        projectId: project2.id,
        title: 'Kitchen equipment assessment',
        description: 'Assess all existing kitchen equipment for replacement or refurbishment',
        status: 'TODO',
        priority: 'HIGH',
        assignedTo: manager.id,
        dueDate: new Date('2024-03-10'),
      },
    ],
  });

  // ─── PROJECT RISKS ────────────────────────────────────────────
  await prisma.projectRisk.createMany({
    data: [
      {
        projectId: project1.id,
        title: 'Supplier delivery delays',
        description: 'Risk of furniture supplier delaying delivery affecting renovation schedule',
        level: 'MEDIUM',
        mitigation: 'Order 30 days early. Identify backup suppliers.',
        status: 'OPEN',
      },
      {
        projectId: project1.id,
        title: 'Budget overrun',
        description: 'Material cost increases may push project over budget',
        level: 'HIGH',
        mitigation: 'Lock in prices via signed POs. Monitor weekly.',
        status: 'OPEN',
      },
    ],
  });

  console.log('  ✅ Project tasks and risks created');

  // ─── RFQs ─────────────────────────────────────────────────────
  console.log('📝 Creating RFQs...');

  const rfq1 = await prisma.rFQ.create({
    data: {
      rfqNumber: 'RFQ-2024-001',
      title: 'Monthly F&B Supplies — February 2024',
      description: 'Monthly food and beverage supply requisition for hotel kitchen and restaurant.',
      status: 'APPROVED',
      dueDate: new Date('2024-01-25'),
      projectId: null,
      createdById: staff.id,
      approvedById: manager.id,
      approvedAt: new Date('2024-01-20'),
    },
  });

  await prisma.rFQSupplier.create({
    data: { rfqId: rfq1.id, supplierId: suppliers[0].id, sentAt: new Date('2024-01-18') },
  });

  const rfqItem1 = await prisma.rFQItem.create({
    data: {
      rfqId: rfq1.id,
      inventoryItemId: items[0].id,
      description: 'All-Purpose Flour 25kg',
      quantity: 20,
      unit: 'Sack',
    },
  });

  const rfqItem2 = await prisma.rFQItem.create({
    data: {
      rfqId: rfq1.id,
      inventoryItemId: items[1].id,
      description: 'Cooking Oil 20L',
      quantity: 10,
      unit: 'Can',
    },
  });

  const rfqQuote1 = await prisma.rFQQuote.create({
    data: {
      rfqId: rfq1.id,
      supplierId: suppliers[0].id,
      quoteNumber: 'QT-MFD-2024-001',
      totalAmount: 29000.00,
      currency: 'PHP',
      validUntil: new Date('2024-02-15'),
      deliveryDays: 3,
      paymentTerms: 'NET 30',
      isSelected: true,
    },
  });

  await prisma.rFQQuoteItem.createMany({
    data: [
      {
        rfqQuoteId: rfqQuote1.id,
        rfqItemId: rfqItem1.id,
        unitPrice: 850.00,
        quantity: 20,
        totalPrice: 17000.00,
      },
      {
        rfqQuoteId: rfqQuote1.id,
        rfqItemId: rfqItem2.id,
        unitPrice: 1200.00,
        quantity: 10,
        totalPrice: 12000.00,
      },
    ],
  });

  console.log('  ✅ 1 RFQ with quote created');

  // ─── PURCHASE ORDERS ──────────────────────────────────────────
  console.log('🛒 Creating purchase orders...');

  const po1 = await prisma.purchaseOrder.create({
    data: {
      poNumber: 'PO-2024-001',
      supplierId: suppliers[0].id,
      rfqId: rfq1.id,
      status: 'RECEIVED',
      orderDate: new Date('2024-01-26'),
      expectedDate: new Date('2024-01-29'),
      deliveryAddress: 'The Grand Hotel Manila, Receiving Bay, Ermita, Manila',
      totalAmount: 29000.00,
      taxAmount: 3480.00,
      currency: 'PHP',
      paymentTerms: 'NET 30',
      notes: 'Deliver to receiving bay. Contact warehouse manager.',
      approvedById: manager.id,
      approvedAt: new Date('2024-01-26'),
      receivedAt: new Date('2024-01-29'),
      createdById: staff.id,
    },
  });

  const poItem1 = await prisma.pOItem.create({
    data: {
      purchaseOrderId: po1.id,
      inventoryItemId: items[0].id,
      description: 'All-Purpose Flour 25kg',
      quantity: 20,
      unitPrice: 850.00,
      totalPrice: 17000.00,
      unit: 'Sack',
      receivedQty: 20,
      taxRate: 12,
    },
  });

  const poItem2 = await prisma.pOItem.create({
    data: {
      purchaseOrderId: po1.id,
      inventoryItemId: items[1].id,
      description: 'Cooking Oil 20L',
      quantity: 10,
      unitPrice: 1200.00,
      totalPrice: 12000.00,
      unit: 'Can',
      receivedQty: 10,
      taxRate: 12,
    },
  });

  const po1Receiving = await prisma.pOReceiving.create({
    data: {
      purchaseOrderId: po1.id,
      receiptNumber: 'GRN-2024-001',
      receivedDate: new Date('2024-01-29'),
      receivedById: staff.id,
      status: 'COMPLETE',
      notes: 'All items received in good condition.',
    },
  });

  await prisma.pOReceivingItem.createMany({
    data: [
      {
        poReceivingId: po1Receiving.id,
        poItemId: poItem1.id,
        receivedQty: 20,
        acceptedQty: 20,
        rejectedQty: 0,
        unitCost: 850.00,
        batchId: batch1.id,
      },
      {
        poReceivingId: po1Receiving.id,
        poItemId: poItem2.id,
        receivedQty: 10,
        acceptedQty: 10,
        rejectedQty: 0,
        unitCost: 1200.00,
        batchId: batch2.id,
      },
    ],
  });

  // Update batch receiving reference
  await prisma.inventoryBatch.update({ where: { id: batch1.id }, data: { receivingId: po1Receiving.id } });
  await prisma.inventoryBatch.update({ where: { id: batch2.id }, data: { receivingId: po1Receiving.id } });

  console.log('  ✅ 1 PO with receiving created');

  // ─── STOCK MOVEMENTS ──────────────────────────────────────────
  console.log('📊 Creating stock movements...');

  await prisma.stockMovement.createMany({
    data: [
      {
        inventoryItemId: items[0].id,
        batchId: batch1.id,
        movementType: 'IN',
        source: 'PURCHASE_ORDER',
        quantity: 20,
        unitCost: 850.00,
        totalCost: 17000.00,
        referenceId: po1.id,
        referenceNumber: 'PO-2024-001',
        performedById: staff.id,
      },
      {
        inventoryItemId: items[1].id,
        batchId: batch2.id,
        movementType: 'IN',
        source: 'PURCHASE_ORDER',
        quantity: 10,
        unitCost: 1200.00,
        totalCost: 12000.00,
        referenceId: po1.id,
        referenceNumber: 'PO-2024-001',
        performedById: staff.id,
      },
      {
        inventoryItemId: items[0].id,
        batchId: batch1.id,
        movementType: 'OUT',
        source: 'PROJECT',
        quantity: 5,
        unitCost: 850.00,
        totalCost: 4250.00,
        referenceId: project1.id,
        referenceNumber: 'PROJ-2024-001',
        projectId: project1.id,
        performedById: staff.id,
      },
    ],
  });

  console.log('  ✅ Stock movements created');

  // ─── ASSETS ───────────────────────────────────────────────────
  console.log('🏷️  Creating assets...');

  const asset1 = await prisma.asset.create({
    data: {
      assetCode: 'ASSET-001',
      name: 'Commercial HVAC Unit — Floor 3',
      description: 'Carrier 5-ton split-type HVAC unit for Floor 3 corridor',
      inventoryItemId: null,
      category: 'HVAC Equipment',
      location: 'Floor 3 — Mechanical Room',
      department: 'Maintenance',
      status: 'ACTIVE',
      condition: 'GOOD',
      purchaseDate: new Date('2021-03-15'),
      purchaseCost: 185000.00,
      currentValue: 120000.00,
      serialNumber: 'CRR-HVAC-2021-3001',
      model: 'Carrier 38GXC060',
      manufacturer: 'Carrier',
      warrantyExpiry: new Date('2024-03-15'),
      lastMaintenance: new Date('2023-12-01'),
      nextMaintenance: new Date('2024-03-01'),
    },
  });

  const asset2 = await prisma.asset.create({
    data: {
      assetCode: 'ASSET-002',
      name: 'Industrial Dishwasher — Kitchen',
      description: 'Hobart commercial dishwasher for restaurant kitchen',
      category: 'Kitchen Equipment',
      location: 'Ground Floor — Kitchen',
      department: 'F&B',
      status: 'UNDER_MAINTENANCE',
      condition: 'FAIR',
      purchaseDate: new Date('2020-07-20'),
      purchaseCost: 250000.00,
      currentValue: 130000.00,
      serialNumber: 'HBT-DW-2020-0072',
      model: 'Hobart AM15VL',
      manufacturer: 'Hobart',
      warrantyExpiry: new Date('2023-07-20'),
      lastMaintenance: new Date('2024-01-10'),
      nextMaintenance: new Date('2024-04-10'),
    },
  });

  const asset3 = await prisma.asset.create({
    data: {
      assetCode: 'ASSET-003',
      name: 'Elevator — Main Lobby',
      description: 'Otis 10-passenger hydraulic elevator',
      category: 'Vertical Transport',
      location: 'Main Lobby',
      department: 'Operations',
      status: 'ACTIVE',
      condition: 'EXCELLENT',
      purchaseDate: new Date('2019-01-10'),
      purchaseCost: 1200000.00,
      currentValue: 900000.00,
      serialNumber: 'OTS-ELV-2019-0001',
      model: 'Otis Gen2 Comfort',
      manufacturer: 'Otis',
      warrantyExpiry: new Date('2024-12-31'),
      lastMaintenance: new Date('2024-01-15'),
      nextMaintenance: new Date('2024-04-15'),
    },
  });

  // Asset logs
  await prisma.assetLog.createMany({
    data: [
      {
        assetId: asset1.id,
        action: 'MAINTENANCE',
        description: 'Quarterly preventive maintenance completed. Filters cleaned and refrigerant checked.',
        oldStatus: 'UNDER_MAINTENANCE',
        newStatus: 'ACTIVE',
        performedBy: 'Roberto Reyes',
      },
      {
        assetId: asset2.id,
        action: 'STATUS_CHANGE',
        description: 'Unit flagged for maintenance. Spray arm broken and heating element degraded.',
        oldStatus: 'ACTIVE',
        newStatus: 'UNDER_MAINTENANCE',
        performedBy: 'Roberto Reyes',
      },
    ],
  });

  // Maintenance schedules
  const schedule1 = await prisma.maintenanceSchedule.create({
    data: {
      assetId: asset1.id,
      title: 'HVAC Quarterly Preventive Maintenance',
      description: 'Clean filters, check refrigerant, inspect electrical connections, test thermostat.',
      frequencyDays: 90,
      lastPerformed: new Date('2023-12-01'),
      nextDue: new Date('2024-03-01'),
      estimatedHours: 4,
      assignedTo: technician.id,
      isActive: true,
    },
  });

  const schedule2 = await prisma.maintenanceSchedule.create({
    data: {
      assetId: asset3.id,
      title: 'Elevator Monthly Safety Inspection',
      description: 'Inspect cables, doors, safety mechanisms, and lubricate moving parts.',
      frequencyDays: 30,
      lastPerformed: new Date('2024-01-15'),
      nextDue: new Date('2024-02-15'),
      estimatedHours: 3,
      assignedTo: technician.id,
      isActive: true,
    },
  });

  console.log('  ✅ 3 assets with logs and schedules created');

  // ─── WORK ORDERS ──────────────────────────────────────────────
  console.log('🔧 Creating work orders...');

  const wo1 = await prisma.workOrder.create({
    data: {
      woNumber: 'WO-2024-001',
      title: 'Dishwasher Repair — Broken Spray Arm',
      description: 'Replace broken spray arm and inspect heating element on kitchen dishwasher.',
      type: 'CORRECTIVE',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assetId: asset2.id,
      startDate: new Date('2024-01-20'),
      dueDate: new Date('2024-01-25'),
      estimatedHours: 6,
      safetyNotes: 'Ensure power is disconnected before working. Use non-slip mat.',
      createdById: manager.id,
      assignedToId: technician.id,
    },
  });

  const wo2 = await prisma.workOrder.create({
    data: {
      woNumber: 'WO-2024-002',
      title: 'HVAC Quarterly Maintenance — Floor 3',
      description: 'Scheduled quarterly preventive maintenance for Floor 3 HVAC unit.',
      type: 'PREVENTIVE',
      status: 'OPEN',
      priority: 'MEDIUM',
      assetId: asset1.id,
      scheduleId: schedule1.id,
      startDate: new Date('2024-03-01'),
      dueDate: new Date('2024-03-03'),
      estimatedHours: 4,
      safetyNotes: 'Wear PPE. Ensure area is clear of guests during maintenance.',
      createdById: admin.id,
      assignedToId: technician.id,
    },
  });

  await prisma.maintenanceLog.create({
    data: {
      workOrderId: wo1.id,
      description: 'Disassembled dishwasher. Spray arm confirmed broken. Ordered replacement part.',
      hoursSpent: 2,
      logDate: new Date('2024-01-20'),
      loggedBy: technician.id,
    },
  });

  await prisma.wOPartUsage.create({
    data: {
      workOrderId: wo1.id,
      inventoryItemId: items[7].id,
      partName: 'Dishwasher Spray Arm',
      quantity: 1,
      unitCost: 1500.00,
      totalCost: 1500.00,
      notes: 'OEM replacement part',
    },
  });

  console.log('  ✅ 2 work orders created');

  // ─── NOTIFICATIONS ────────────────────────────────────────────
  console.log('🔔 Creating notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: manager.id,
        title: 'Low Stock Alert',
        message: 'HVAC Air Filters (MP-002) are approaching reorder point. Current stock: 22 units. Reorder point: 10.',
        type: 'WARNING',
        module: 'INVENTORY',
        entityId: items[8].id,
        isRead: false,
      },
      {
        userId: admin.id,
        title: 'PO Approved',
        message: 'Purchase Order PO-2024-001 from Manila Food Distributors has been approved and sent to supplier.',
        type: 'SUCCESS',
        module: 'PROCUREMENT',
        entityId: po1.id,
        isRead: true,
        readAt: new Date(),
      },
      {
        userId: technician.id,
        title: 'Work Order Assigned',
        message: 'You have been assigned to Work Order WO-2024-001: Dishwasher Repair. Due: Jan 25, 2024.',
        type: 'INFO',
        module: 'MRO',
        entityId: wo1.id,
        isRead: false,
      },
      {
        userId: manager.id,
        title: 'Maintenance Due Soon',
        message: 'Elevator Monthly Safety Inspection is due on Feb 15, 2024. Please schedule with the technician.',
        type: 'ALERT',
        module: 'ASSETS',
        entityId: asset3.id,
        isRead: false,
      },
      {
        userId: admin.id,
        title: 'New Project Created',
        message: 'Project PROJ-2024-002 (Restaurant Kitchen Upgrade) has been created and is in Planning status.',
        type: 'INFO',
        module: 'PROJECTS',
        entityId: project2.id,
        isRead: false,
      },
    ],
  });

  console.log('  ✅ 5 notifications created');

  // ─── AUDIT LOGS ───────────────────────────────────────────────
  console.log('📋 Creating audit logs...');

  await prisma.auditLog.createMany({
    data: [
      {
        userId: admin.id,
        userEmail: admin.email,
        action: 'CREATE',
        module: 'AUTH',
        entityId: manager.id,
        entityType: 'User',
        newValues: { email: manager.email, role: 'MANAGER' },
        description: 'Created manager account: maria.santos',
      },
      {
        userId: staff.id,
        userEmail: staff.email,
        action: 'CREATE',
        module: 'PROCUREMENT',
        entityId: rfq1.id,
        entityType: 'RFQ',
        newValues: { rfqNumber: 'RFQ-2024-001', status: 'DRAFT' },
        description: 'RFQ created: Monthly F&B Supplies',
      },
      {
        userId: manager.id,
        userEmail: manager.email,
        action: 'APPROVE',
        module: 'PROCUREMENT',
        entityId: rfq1.id,
        entityType: 'RFQ',
        oldValues: { status: 'UNDER_REVIEW' },
        newValues: { status: 'APPROVED' },
        description: 'RFQ approved: RFQ-2024-001',
      },
      {
        userId: staff.id,
        userEmail: staff.email,
        action: 'CREATE',
        module: 'PROCUREMENT',
        entityId: po1.id,
        entityType: 'PurchaseOrder',
        newValues: { poNumber: 'PO-2024-001', totalAmount: 29000 },
        description: 'Purchase Order created from RFQ-2024-001',
      },
      {
        userId: manager.id,
        userEmail: manager.email,
        action: 'APPROVE',
        module: 'PROCUREMENT',
        entityId: po1.id,
        entityType: 'PurchaseOrder',
        oldValues: { status: 'PENDING_APPROVAL' },
        newValues: { status: 'APPROVED' },
        description: 'PO approved: PO-2024-001',
      },
    ],
  });

  console.log('  ✅ Audit logs created');

  // ─── SUMMARY ──────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅  SEED COMPLETE — Logistics 1 ERP System Ready');
  console.log('═══════════════════════════════════════════════════\n');
  console.log('🔑  Demo Accounts:');
  console.log('  Admin       → admin@logistics1.com        / Admin@1234');
  console.log('  Manager     → manager@logistics1.com      / Manager@1234');
  console.log('  Staff       → staff@logistics1.com        / Staff@1234');
  console.log('  Technician  → technician@logistics1.com   / Tech@1234');
  console.log('\n📊  Sample Data:');
  console.log('  Users: 4 | Suppliers: 5 | Inventory Items: 12');
  console.log('  Batches: 5 | RFQs: 1 | POs: 1');
  console.log('  Assets: 3 | Work Orders: 2 | Projects: 2');
  console.log('  Notifications: 5 | Audit Logs: 5\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
