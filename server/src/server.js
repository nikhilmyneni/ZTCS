require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');

const { connectMongoDB, connectRedis } = require('./config/database');
const validateEnv = require('./config/validateEnv');
const { attachClientInfo } = require('./middleware/auditLogger');

// Import routes
const authRoutes = require('./routes/authRoutes');
const stepUpRoutes = require('./routes/stepUpRoutes');
const fileRoutes = require('./routes/fileRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const httpServer = createServer(app);

// ─── Socket.io Setup (for Phase 6 real-time monitoring) ───
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',')
  : ['http://localhost:5173'];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

// Make io accessible in routes
app.set('io', io);

// Trust proxy — required for real IP behind Render/Vercel/Cloudflare
app.set('trust proxy', 1);

// ─── Global Middleware ───
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
      connectSrc: [
        "'self'",
        process.env.UEBA_SERVICE_URL || 'http://localhost:8000',
        'https://*.supabase.co',
        'wss:',
        'ws:',
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permissionsPolicy: {
    features: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: [],
    },
  },
}));
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(attachClientInfo);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  validate: { trustProxy: false },
});
app.use('/api/', limiter);

// Stricter rate limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts. Please try again later.' },
  validate: { trustProxy: false },
});
app.use('/api/auth/', authLimiter);

// Per-endpoint rate limits for sensitive operations
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, message: 'Too many password reset requests. Try again in 1 hour.' },
  validate: { trustProxy: false },
});
app.use('/api/auth/forgot-password', passwordResetLimiter);
app.use('/api/auth/reset-password', passwordResetLimiter);

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, message: 'Too many registration attempts. Try again in 1 hour.' },
  validate: { trustProxy: false },
});
app.use('/api/auth/register', registerLimiter);

const fileUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  message: { success: false, message: 'Upload limit reached. Try again later.' },
  validate: { trustProxy: false },
});
app.use('/api/files/upload', fileUploadLimiter);

// ─── API Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/stepup', stepUpRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);
// Future routes will be added here:
// app.use('/api/files', fileRoutes);       // Phase 5
// app.use('/api/admin', adminRoutes);      // Phase 6
// app.use('/api/audit', auditRoutes);      // Phase 6

// ─── Public Stats (for landing page) ───
app.get('/api/public/stats', async (req, res) => {
  try {
    const { User, AuditLog, File } = require('./models');
    const [users, sessions, threats, files] = await Promise.all([
      User.countDocuments(),
      AuditLog.countDocuments({ action: 'login_success' }),
      AuditLog.countDocuments({ riskLevel: { $in: ['medium', 'high'] } }),
      File.countDocuments({ isDeleted: false }),
    ]);
    res.status(200).json({
      success: true,
      data: { users, sessions, threats, files },
    });
  } catch {
    res.status(200).json({
      success: true,
      data: { users: 0, sessions: 0, threats: 0, files: 0 },
    });
  }
});

// ─── Health Check ───
app.get('/api/health', (req, res) => {
  const { getCircuitBreakerState } = require('./services/uebaService');
  res.status(200).json({
    success: true,
    message: 'ZTCS API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uebaCircuitBreaker: getCircuitBreakerState(),
  });
});

// ─── 404 Handler ───
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// ─── Global Error Handler ───
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
});

// ─── Socket.io Connection Handler ───
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join-admin', () => {
    socket.join('admin-room');
    console.log(`👤 Admin joined monitoring room: ${socket.id}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});


// ─── Start Server ───
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Validate environment variables (fail fast)
  validateEnv();

  // Connect to databases
  await connectMongoDB();
  connectRedis();

  httpServer.listen(PORT, () => {
    console.log(`\n🚀 ZTCS Server running on port ${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
};

startServer();

module.exports = { app, httpServer, io };
