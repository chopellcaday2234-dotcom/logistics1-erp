// src/app.js — Logistics 1 ERP (All Phases 1–7 Active)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const logger = require('./utils/logger');
const { apiLimiter } = require('./middleware/rateLimiter');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Route imports — all 9 modules
const authRoutes          = require('./modules/auth/auth.routes');
const procurementRoutes   = require('./modules/procurement/procurement.routes');
const inventoryRoutes     = require('./modules/inventory/inventory.routes');
const assetRoutes         = require('./modules/assets/assets.routes');
const mroRoutes           = require('./modules/mro/mro.routes');
const projectRoutes       = require('./modules/projects/projects.routes');
const notificationRoutes  = require('./modules/notifications/notifications.routes');
const reportRoutes        = require('./modules/reports/reports.routes');
const validationRoutes    = require('./modules/validation/validation.routes');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/', apiLimiter);

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Logistics 1 ERP API is running',
    version: '1.0.0',
    modules: ['auth','procurement','inventory','assets','mro','projects','notifications','reports','validation'],
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ─── All API Routes (Phases 1–7) ─────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/procurement',   procurementRoutes);
app.use('/api/inventory',     inventoryRoutes);
app.use('/api/assets',        assetRoutes);
app.use('/api/mro',           mroRoutes);
app.use('/api/projects',      projectRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports',       reportRoutes);
app.use('/api/validation',    validationRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
