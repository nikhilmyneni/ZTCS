const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        // Auth events
        'login_success',
        'login_failed',
        'login_blocked',
        'login_initiated',       // Step-up required at login
        'register',
        'logout',
        // Step-up verification
        'step_up_triggered',     // File-access step-up via accessGateway
        'step_up_triggered_ueba_down', // Step-up when UEBA service unavailable
        'step_up_success',
        'step_up_failed',
        // File operations
        'file_upload',
        'file_download',
        'file_delete',
        'bulk_download_detected',
        'restricted_access_attempt',
        // Access control
        'session_terminated',    // High-risk block during file access
        'access_denied',         // IP blacklist or policy denial
        // Account management
        'password_change',
        'password_reset_completed',
        // Device & session management
        'device_trust_revoked',
        'session_revoked',
        // Admin actions
        'user_blocked',
        'user_unblocked',
        'ip_blacklisted',
        'ip_whitelisted',
        'admin_unblock_verified',
        'admin_dismiss_block',
        'admin_escalate_block',
        'totp_reset',
        'account_locked',
        'geo_country_blocked',
        'geo_country_allowed',
      ],
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // Flexible JSON for context
      default: {},
    },
    ipAddress: String,
    deviceFingerprint: String,
    userAgent: String,
    riskScore: Number,
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'none'],
    },
    success: {
      type: Boolean,
      default: true,
    },
    sessionId: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, action: 1 });
auditLogSchema.index({ riskLevel: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
module.exports = AuditLog;
