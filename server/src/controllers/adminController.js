const crypto = require('crypto');
const OTPAuth = require('otpauth');
const { User, AuditLog, File } = require('../models');
const { getRedis } = require('../config/database');
const { createAuditLog } = require('../middleware/auditLogger');
const { sendOTP } = require('../utils/email');
const { createNotification } = require('../services/notificationService');

// ─── Helper: Invalidate cached risk scores (Continuous Re-evaluation) ───
// Called when admin changes policy (block user, blacklist IP, etc.)
// so cached risk scores don't let users bypass new policies mid-session
const _invalidateRiskCache = async (redis, userId) => {
  if (!redis) return;
  if (userId) {
    // Invalidate specific user's cached risk
    const keys = await redis.keys(`risk:${userId}:*`);
    for (const key of keys) await redis.del(key);
    await redis.del(`risk:${userId}`);
  } else {
    // Invalidate ALL cached risk scores (e.g., IP policy change affects everyone)
    const keys = await redis.keys('risk:*');
    for (const key of keys) await redis.del(key);
  }
};

// ─── DASHBOARD STATS ───
const getDashboardStats = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalUsers, totalFiles, totalLogs, riskBreakdown] = await Promise.all([
      User.countDocuments(),
      File.countDocuments({ isDeleted: false }),
      AuditLog.countDocuments(),
      AuditLog.aggregate([
        { $match: { riskLevel: { $in: ['low', 'medium', 'high'] }, createdAt: { $gte: since24h } } },
        { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
      ]),
    ]);

    // Recent activity (last 24h) — all queries share the same cutoff
    const [recentLogins, blockedSessions, stepUps, hourlyLogins] = await Promise.all([
      AuditLog.countDocuments({
        action: 'login_success',
        createdAt: { $gte: since24h },
      }),
      AuditLog.countDocuments({
        action: { $in: ['session_terminated', 'login_blocked', 'user_auto_blocked'] },
        createdAt: { $gte: since24h },
      }),
      AuditLog.countDocuments({
        action: { $in: ['step_up_triggered', 'login_initiated'] },
        createdAt: { $gte: since24h },
      }),
      AuditLog.aggregate([
        {
          $match: {
            action: 'login_success',
            createdAt: { $gte: since24h },
          },
        },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // Risk distribution for chart
    const riskDist = { low: 0, medium: 0, high: 0 };
    riskBreakdown.forEach((r) => { riskDist[r._id] = r.count; });

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalFiles,
        totalLogs,
        recentLogins,
        blockedSessions,
        stepUps,
        riskDistribution: riskDist,
        hourlyLogins: hourlyLogins.map((h) => ({ hour: h._id, logins: h.count })),
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to load stats.' });
  }
};

// ─── LIST ALL USERS ───
const listUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('email name role isBlocked isActive totp.enabled baselineProfile.loginCount baselineProfile.lastLoginAt baselineProfile.lastLoginIP riskHistory createdAt')
      .sort({ createdAt: -1 });

    const redis = getRedis();
    const usersWithRisk = await Promise.all(
      users.map(async (u) => {
        let currentRisk = null;
        if (redis) {
          // Check non-scoped key first, then try device-scoped keys
          const cached = await redis.get(`risk:${u._id}`);
          if (cached) {
            currentRisk = JSON.parse(cached);
          } else {
            // Login stores risk at risk:{userId}:{deviceScope} — find the most recent one
            const deviceKeys = await redis.keys(`risk:${u._id}:*`);
            if (deviceKeys.length > 0) {
              const values = await Promise.all(deviceKeys.map(k => redis.get(k)));
              let latest = null;
              for (const val of values) {
                if (!val) continue;
                const parsed = JSON.parse(val);
                if (!latest || (parsed.timestamp && parsed.timestamp > latest.timestamp)) {
                  latest = parsed;
                }
              }
              if (latest) currentRisk = latest;
            }
          }
        }
        const lastRisk = u.riskHistory?.length > 0 ? u.riskHistory[u.riskHistory.length - 1] : null;

        return {
          id: u._id,
          email: u.email,
          name: u.name,
          role: u.role,
          isBlocked: u.isBlocked,
          loginCount: u.baselineProfile?.loginCount || 0,
          lastLoginAt: u.baselineProfile?.lastLoginAt,
          lastLoginIP: u.baselineProfile?.lastLoginIP,
          currentRiskScore: currentRisk?.score ?? lastRisk?.score ?? 0,
          currentRiskLevel: currentRisk?.level ?? lastRisk?.level ?? 'none',
          totpEnabled: u.totp?.enabled || false,
          createdAt: u.createdAt,
        };
      })
    );

    res.status(200).json({ success: true, data: { users: usersWithRisk } });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ success: false, message: 'Failed to list users.' });
  }
};

// ─── BLOCK / UNBLOCK USER ───
const toggleBlockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    user.isBlocked = !user.isBlocked;
    await user.save();

    // Clear their sessions if blocking
    const redis = getRedis();
    if (user.isBlocked && redis) {
      await redis.del(`refresh:${userId}`);
      await _invalidateRiskCache(redis, userId);
    }

    await createAuditLog({
      userId: req.user._id,
      action: user.isBlocked ? 'user_blocked' : 'user_unblocked',
      ipAddress: req.clientIP,
      details: { targetUserId: userId, targetEmail: user.email },
    });

    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('user-status-change', {
        userId, email: user.email, isBlocked: user.isBlocked,
      });
    }

    // Notify the affected user
    createNotification({
      userId,
      type: 'admin_action',
      title: user.isBlocked ? 'Account Blocked' : 'Account Unblocked',
      message: user.isBlocked
        ? 'Your account has been blocked by an administrator. Contact support if you believe this is an error.'
        : 'Your account has been unblocked by an administrator. You can now log in normally.',
      sendEmail: true,
      io,
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `User ${user.isBlocked ? 'blocked' : 'unblocked'}.`,
      data: { isBlocked: user.isBlocked },
    });
  } catch (error) {
    console.error('Toggle block error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
};

// ─── IP BLACKLIST / WHITELIST ───
const getIPList = async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) return res.status(200).json({ success: true, data: { blacklisted: [], whitelisted: [] } });

    const blacklisted = await redis.smembers('ip:blacklist');
    const whitelisted = await redis.smembers('ip:whitelist');

    res.status(200).json({ success: true, data: { blacklisted, whitelisted } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get IP lists.' });
  }
};

const addToIPList = async (req, res) => {
  try {
    const { ip, listType } = req.body; // listType: 'blacklist' | 'whitelist'
    const redis = getRedis();
    if (!redis) return res.status(500).json({ success: false, message: 'Redis unavailable.' });

    await redis.sadd(`ip:${listType}`, ip);

    // Continuous re-evaluation: invalidate all cached risk scores
    // so the new IP policy takes effect immediately (not after cache expires)
    await _invalidateRiskCache(redis, null);

    await createAuditLog({
      userId: req.user._id,
      action: listType === 'blacklist' ? 'ip_blacklisted' : 'ip_whitelisted',
      ipAddress: req.clientIP,
      details: { targetIP: ip, listType },
    });

    res.status(200).json({ success: true, message: `IP ${ip} added to ${listType}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update IP list.' });
  }
};

const removeFromIPList = async (req, res) => {
  try {
    const { ip, listType } = req.body;
    const redis = getRedis();
    if (!redis) return res.status(500).json({ success: false, message: 'Redis unavailable.' });

    await redis.srem(`ip:${listType}`, ip);

    res.status(200).json({ success: true, message: `IP ${ip} removed from ${listType}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update IP list.' });
  }
};

// ─── AUDIT LOGS ───
const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, riskLevel, userId } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (riskLevel) filter.riskLevel = riskLevel;
    if (userId) filter.userId = userId;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('userId', 'email name');

    const total = await AuditLog.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: {
        logs: logs.map((l) => ({
          id: l._id,
          user: l.userId ? { email: l.userId.email, name: l.userId.name } : null,
          action: l.action,
          ipAddress: l.ipAddress,
          riskScore: l.riskScore,
          riskLevel: l.riskLevel,
          success: l.success,
          details: l.details,
          createdAt: l.createdAt,
        })),
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to load audit logs.' });
  }
};

// ─── EXPORT AUDIT LOGS TO CSV ───
const exportAuditCSV = async (req, res) => {
  try {
    const { action, riskLevel } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (riskLevel) filter.riskLevel = riskLevel;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(5000)
      .populate('userId', 'email name');

    const csvField = (v) => {
      if (v === null || v === undefined) return '""';
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };
    const fmtTs = (d) => {
      if (!d) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const headers = ['Timestamp', 'User Email', 'User Name', 'Action', 'IP Address', 'Risk Score', 'Risk Level', 'Success'];
    const lines = [headers.map(csvField).join(',')];
    for (const l of logs) {
      lines.push([
        fmtTs(l.createdAt),
        l.userId?.email || '',
        l.userId?.name || '',
        l.action || '',
        l.ipAddress || '',
        l.riskScore ?? '',
        l.riskLevel || '',
        l.success ? 'Yes' : 'No',
      ].map(csvField).join(','));
    }
    const body = '\uFEFF' + lines.join('\r\n') + '\r\n';

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=audit_logs_${Date.now()}.csv`);
    res.send(body);
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ success: false, message: 'Export failed.' });
  }
};

// ─── RISK SCORE HISTORY FOR A USER ───
const getUserRiskHistory = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('email name riskHistory');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    res.status(200).json({
      success: true,
      data: {
        email: user.email,
        name: user.name,
        riskHistory: (user.riskHistory || []).slice(-30), // Last 30 entries
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get risk history.' });
  }
};

// ─── ALL SESSION RISK SCORES (for admin graph) ───
const getAllRiskScores = async (req, res) => {
  try {
    const logs = await AuditLog.find({
      action: { $in: ['login_initiated', 'login_success', 'login_failed', 'login_blocked', 'file_upload', 'file_download', 'file_delete', 'bulk_download_detected', 'step_up_triggered', 'user_auto_blocked', 'session_terminated'] },
      riskScore: { $exists: true },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('userId action riskScore riskLevel createdAt ipAddress')
      .populate('userId', 'email name');

    const dataPoints = logs.reverse().map((log, i) => ({
      session: i + 1,
      score: Math.min(log.riskScore || 0, 100),
      level: log.riskLevel || 'low',
      email: log.userId?.email || 'Unknown',
      name: log.userId?.name || '',
      timestamp: log.createdAt,
      ip: log.ipAddress || '',
      action: log.action || 'login',
    }));

    res.status(200).json({ success: true, data: { dataPoints } });
  } catch (error) {
    console.error('Risk scores error:', error);
    res.status(500).json({ success: false, message: 'Failed to get risk scores.' });
  }
};

// ─── ACTION CENTER: Get Blocked Users ───
const getBlockedUsers = async (req, res) => {
  try {
    // 1. Users with isBlocked: true (manually blocked by admin)
    const manuallyBlocked = await User.find({ isBlocked: true })
      .select('email name baselineProfile.lastLoginAt baselineProfile.lastLoginIP riskHistory createdAt')
      .sort({ updatedAt: -1 });

    const manualUsers = manuallyBlocked.map(u => {
      const lastRisk = u.riskHistory?.length > 0 ? u.riskHistory[u.riskHistory.length - 1] : null;
      return {
        id: u._id,
        email: u.email,
        name: u.name,
        lastLoginAt: u.baselineProfile?.lastLoginAt,
        lastLoginIP: u.baselineProfile?.lastLoginIP,
        lastRiskScore: lastRisk?.score || 0,
        lastRiskLevel: lastRisk?.level || 'none',
        blockedFactors: lastRisk?.factors || [],
        blockType: 'account',
        createdAt: u.createdAt,
      };
    });

    // 2. Recent high-risk login blocks (device-level, last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const blockedLogins = await AuditLog.find({
      action: { $in: ['login_blocked', 'session_terminated'] },
      riskScore: { $gte: 60 },
      createdAt: { $gte: oneDayAgo },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'email name isBlocked');

    // Find users that were dismissed or escalated (so we exclude them from device-blocked list)
    const dismissedLogs = await AuditLog.find({
      action: { $in: ['admin_dismiss_block', 'admin_escalate_block'] },
      createdAt: { $gte: oneDayAgo },
    }).select('details.targetUserId createdAt');

    const dismissedUserIds = new Set(
      dismissedLogs.map(l => (l.details?.targetUserId || '').toString())
    );

    // Deduplicate by userId — only show the most recent block per user
    const seenUserIds = new Set(manualUsers.map(u => u.id.toString()));
    const deviceBlocked = [];

    for (const log of blockedLogins) {
      if (!log.userId || seenUserIds.has(log.userId._id.toString())) continue;
      // Skip if user is already manually blocked (shown above)
      if (log.userId.isBlocked) continue;
      // Skip if admin already dismissed or escalated this user's device block
      if (dismissedUserIds.has(log.userId._id.toString())) continue;
      seenUserIds.add(log.userId._id.toString());

      const factors = log.details?.factors
        ?.filter(f => f.triggered)
        ?.map(f => f.description || f.factor) || [];

      deviceBlocked.push({
        id: log.userId._id,
        email: log.userId.email,
        name: log.userId.name,
        lastLoginAt: log.createdAt,
        lastLoginIP: log.ipAddress,
        lastRiskScore: log.riskScore,
        lastRiskLevel: log.riskLevel || 'high',
        blockedFactors: factors,
        blockType: 'device',
        blockAction: log.action,
        blockedAt: log.createdAt,
      });
    }

    res.status(200).json({
      success: true,
      data: { users: [...manualUsers, ...deviceBlocked] },
    });
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ success: false, message: 'Failed to get blocked users.' });
  }
};

// ─── ACTION CENTER: Send Admin OTP ───
const adminSendOTP = async (req, res) => {
  try {
    const admin = req.user;
    const redis = getRedis();

    const otp = crypto.randomInt(100000, 999999).toString();

    if (redis) {
      await redis.setex(`admin-otp:${admin._id}`, 300, otp);
      await redis.setex(`admin-otp:attempts:${admin._id}`, 300, '0');
    }

    await sendOTP(admin.email, otp);

    res.status(200).json({
      success: true,
      message: 'Verification code sent to your admin email.',
      data: {
        email: admin.email.replace(/(.{2})(.*)(@.*)/, '$1***$3'),
        expiresIn: 300,
      },
    });
  } catch (error) {
    console.error('Admin send OTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to send verification code.' });
  }
};

// ─── ACTION CENTER: Verify & Unblock User ───
// Requires admin to provide both OTP and TOTP codes
const adminVerifyUnblock = async (req, res) => {
  try {
    const { userId, otp, totpCode } = req.body;
    const admin = req.user;
    const redis = getRedis();

    if (!userId || !otp || !totpCode) {
      return res.status(400).json({
        success: false,
        message: 'User ID, OTP, and TOTP code are all required.',
      });
    }

    // 1. Verify OTP
    if (!redis) {
      return res.status(500).json({ success: false, message: 'Service unavailable.' });
    }

    const attempts = parseInt(await redis.get(`admin-otp:attempts:${admin._id}`) || '0');
    if (attempts >= 5) {
      await redis.del(`admin-otp:${admin._id}`);
      return res.status(429).json({ success: false, message: 'Too many attempts. Request a new code.' });
    }

    const storedOTP = await redis.get(`admin-otp:${admin._id}`);
    if (!storedOTP) {
      return res.status(400).json({ success: false, message: 'OTP expired. Request a new code.' });
    }

    await redis.incr(`admin-otp:attempts:${admin._id}`);

    if (otp !== storedOTP) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP.' });
    }

    // 2. Verify TOTP
    const adminWithTOTP = await User.findById(admin._id).select('+totp.secret');
    if (!adminWithTOTP?.totp?.secret || !adminWithTOTP.totp.enabled) {
      return res.status(400).json({
        success: false,
        message: 'Admin must have TOTP authenticator enabled to perform unblock actions.',
      });
    }

    const totp = new OTPAuth.TOTP({
      issuer: 'ZTCS',
      label: admin.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(adminWithTOTP.totp.secret),
    });

    const delta = totp.validate({ token: totpCode, window: 1 });
    if (delta === null) {
      return res.status(400).json({ success: false, message: 'Invalid authenticator code.' });
    }

    // 3. Both verified — Unblock the user
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Unblock account-level block if set
    if (targetUser.isBlocked) {
      targetUser.isBlocked = false;
      await targetUser.save();
    }

    // Clean up Redis — clear all device-scoped blocks
    await redis.del(`admin-otp:${admin._id}`);
    await redis.del(`admin-otp:attempts:${admin._id}`);

    // Clear all blocked/revoked device sessions for this user
    const blockedKeys = await redis.keys(`blocked:${userId}:*`);
    const riskKeys = await redis.keys(`risk:${userId}:*`);
    const revokedKeys = await redis.keys(`revoked:${userId}:*`);
    for (const key of [...blockedKeys, ...riskKeys, ...revokedKeys]) {
      await redis.del(key);
    }
    // Also clear non-scoped keys (legacy)
    await redis.del(`blocked:${userId}`);
    await redis.del(`risk:${userId}`);

    await createAuditLog({
      userId: admin._id,
      action: 'admin_unblock_verified',
      ipAddress: req.clientIP,
      details: {
        targetUserId: userId,
        targetEmail: targetUser.email,
        verificationMethods: ['otp', 'totp'],
      },
    });

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('user-status-change', {
        userId, email: targetUser.email, isBlocked: false, unblockedBy: admin.email,
      });
      io.to('admin-room').emit('security-alert', {
        type: 'info',
        title: 'User Unblocked',
        message: `${targetUser.email} — Verified by ${admin.email}`,
        email: targetUser.email,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${targetUser.email} has been unblocked.`,
      data: { userId, email: targetUser.email },
    });
  } catch (error) {
    console.error('Admin verify unblock error:', error);
    res.status(500).json({ success: false, message: 'Unblock verification failed.' });
  }
};

// ─── ACTION CENTER: Dismiss Device Block (remove from action center) ───
const dismissBlock = async (req, res) => {
  try {
    const { userId } = req.body;
    const admin = req.user;
    const redis = getRedis();

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID required.' });
    }

    // Clear device-scoped Redis blocks
    if (redis) {
      const blockedKeys = await redis.keys(`blocked:${userId}:*`);
      const riskKeys = await redis.keys(`risk:${userId}:*`);
      for (const key of [...blockedKeys, ...riskKeys]) {
        await redis.del(key);
      }
    }

    await createAuditLog({
      userId: admin._id,
      action: 'admin_dismiss_block',
      ipAddress: req.clientIP,
      details: { targetUserId: userId, reason: 'Admin reviewed and dismissed device block' },
    });

    const targetUser = await User.findById(userId).select('email name');

    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('user-status-change', { userId, email: targetUser?.email, dismissed: true });
      io.to('admin-room').emit('security-alert', {
        type: 'info',
        title: 'Device Block Dismissed',
        message: `${targetUser?.email || userId} — Admin reviewed and dismissed`,
        email: targetUser?.email,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({ success: true, message: 'Block dismissed.' });
  } catch (error) {
    console.error('Dismiss block error:', error);
    res.status(500).json({ success: false, message: 'Failed to dismiss.' });
  }
};

// ─── ACTION CENTER: Escalate to Full Account Block ───
const escalateBlock = async (req, res) => {
  try {
    const { userId } = req.body;
    const admin = req.user;
    const redis = getRedis();

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID required.' });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    targetUser.isBlocked = true;
    await targetUser.save();

    // Invalidate all sessions
    if (redis) {
      await redis.del(`refresh:${userId}`);
      const blockedKeys = await redis.keys(`blocked:${userId}:*`);
      const riskKeys = await redis.keys(`risk:${userId}:*`);
      for (const key of [...blockedKeys, ...riskKeys]) {
        await redis.del(key);
      }
    }

    await createAuditLog({
      userId: admin._id,
      action: 'admin_escalate_block',
      ipAddress: req.clientIP,
      details: { targetUserId: userId, targetEmail: targetUser.email, reason: 'Admin escalated device block to full account block' },
    });

    const io = req.app.get('io');
    if (io) {
      io.to('admin-room').emit('user-status-change', {
        userId, email: targetUser.email, isBlocked: true, blockedBy: admin.email,
      });
      io.to('admin-room').emit('security-alert', {
        type: 'critical',
        title: 'Account Permanently Blocked',
        message: `${targetUser.email} — Escalated by ${admin.email}`,
        email: targetUser.email,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(200).json({
      success: true,
      message: `Account ${targetUser.email} has been permanently blocked.`,
    });
  } catch (error) {
    console.error('Escalate block error:', error);
    res.status(500).json({ success: false, message: 'Failed to block account.' });
  }
};

// ─── RESET USER TOTP ───
const resetUserTOTP = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('+totp.secret');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    if (!user.totp?.enabled) {
      return res.status(400).json({ success: false, message: 'User does not have TOTP enabled.' });
    }

    user.totp = { secret: undefined, enabled: false };
    await user.save();

    await createAuditLog({
      userId: req.user._id,
      action: 'totp_reset',
      ipAddress: req.clientIP,
      details: { targetUserId: userId, targetEmail: user.email },
    });

    res.status(200).json({
      success: true,
      message: `Authenticator reset for ${user.email}.`,
    });
  } catch (error) {
    console.error('Reset TOTP error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset authenticator.' });
  }
};

// ─── CLEAR LOGIN STATS ───
const clearLoginStats = async (req, res) => {
  try {
    const result = await AuditLog.deleteMany({
      action: { $in: ['login_success', 'login_initiated'] },
    });
    res.status(200).json({ success: true, message: `Cleared ${result.deletedCount} login records.` });
  } catch (error) {
    console.error('Clear login stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear login stats.' });
  }
};

// ─── COUNTRY GEO-RESTRICTION (Cloudflare Zero Trust style) ───
const getGeoList = async (req, res) => {
  try {
    const redis = getRedis();
    if (!redis) return res.status(200).json({ success: true, data: { blocklist: [], allowlist: [] } });

    const blocklist = await redis.smembers('geo:blocklist');
    const allowlist = await redis.smembers('geo:allowlist');

    res.status(200).json({ success: true, data: { blocklist, allowlist } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get geo lists.' });
  }
};

const addToGeoList = async (req, res) => {
  try {
    const { country, listType } = req.body; // listType: 'blocklist' | 'allowlist'
    const redis = getRedis();
    if (!redis) return res.status(500).json({ success: false, message: 'Redis unavailable.' });

    const countryCode = country.toUpperCase().trim();
    await redis.sadd(`geo:${listType}`, countryCode);

    // Invalidate all cached risk scores so geo policy takes effect immediately
    await _invalidateRiskCache(redis, null);

    await createAuditLog({
      userId: req.user._id,
      action: listType === 'blocklist' ? 'geo_country_blocked' : 'geo_country_allowed',
      ipAddress: req.clientIP,
      details: { country: countryCode, listType },
    });

    res.status(200).json({ success: true, message: `${countryCode} added to geo ${listType}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update geo list.' });
  }
};

const removeFromGeoList = async (req, res) => {
  try {
    const { country, listType } = req.body;
    const redis = getRedis();
    if (!redis) return res.status(500).json({ success: false, message: 'Redis unavailable.' });

    await redis.srem(`geo:${listType}`, country.toUpperCase().trim());

    res.status(200).json({ success: true, message: `${country} removed from geo ${listType}.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update geo list.' });
  }
};

// ─── GENERATE USER REPORT (aggregated data for PDF) ───
const generateUserReport = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('email name role isBlocked createdAt riskHistory baselineProfile');
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const [
      totalLogins,
      fileUploads,
      fileDownloads,
      fileDeletes,
      securityEvents,
      recentLogs,
      fileCount,
    ] = await Promise.all([
      AuditLog.countDocuments({ userId, action: 'login_success' }),
      AuditLog.countDocuments({ userId, action: 'file_upload' }),
      AuditLog.countDocuments({ userId, action: 'file_download' }),
      AuditLog.countDocuments({ userId, action: 'file_delete' }),
      AuditLog.countDocuments({
        userId,
        action: { $in: ['step_up_triggered', 'login_blocked', 'session_terminated', 'access_denied'] },
      }),
      AuditLog.find({ userId })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('action ipAddress riskScore riskLevel createdAt'),
      File.countDocuments({ userId, isDeleted: false }),
    ]);

    const riskHistory = (user.riskHistory || []).slice(-30).map(r => ({
      score: Math.min(r.score || 0, 100),
      level: r.level || 'low',
      factors: r.factors || [],
      action: r.action || '',
      timestamp: r.timestamp,
    }));

    const avgRiskScore = riskHistory.length > 0
      ? Math.round(riskHistory.reduce((sum, r) => sum + r.score, 0) / riskHistory.length)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        user: {
          email: user.email,
          name: user.name,
          role: user.role,
          isBlocked: user.isBlocked,
          createdAt: user.createdAt,
        },
        activity: {
          totalLogins,
          fileUploads,
          fileDownloads,
          fileDeletes,
          securityEvents,
          fileCount,
          avgRiskScore,
          knownDevices: user.baselineProfile?.knownDevices?.length || 0,
          knownIPs: user.baselineProfile?.knownIPs?.length || 0,
        },
        riskHistory,
        recentLogs: recentLogs.map(l => ({
          action: l.action,
          ipAddress: l.ipAddress,
          riskScore: l.riskScore,
          riskLevel: l.riskLevel,
          time: l.createdAt,
        })),
      },
    });
  } catch (error) {
    console.error('Generate user report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report.' });
  }
};

module.exports = {
  getDashboardStats,
  listUsers,
  toggleBlockUser,
  getIPList,
  addToIPList,
  removeFromIPList,
  getGeoList,
  addToGeoList,
  removeFromGeoList,
  getAuditLogs,
  exportAuditCSV,
  getUserRiskHistory,
  getAllRiskScores,
  getBlockedUsers,
  adminSendOTP,
  adminVerifyUnblock,
  dismissBlock,
  escalateBlock,
  resetUserTOTP,
  clearLoginStats,
  generateUserReport,
};
