const { getRedis } = require('../config/database');
const { analyzeUserBehavior, analyzeFileOperation } = require('../services/uebaService');
const { createAuditLog } = require('./auditLogger');
const { sendHighRiskAlert, sendAutoBlockAlert } = require('../utils/email');
const { User } = require('../models');
const { createNotification } = require('../services/notificationService');

/**
 * Access Gateway Middleware
 * 
 * Central security checkpoint from the Zero Trust architecture.
 * Every request passes through here for:
 *   1. Token verification (handled by auth.js before this)
 *   2. Risk score check from Redis cache
 *   3. Policy evaluation
 *   4. Final access decision: allow / step_up / block
 * 
 * Used on all file operation routes and sensitive endpoints.
 */
const accessGateway = (options = {}) => {
  const {
    action = 'file_access',          // Action type for UEBA
    requireLowRisk = false,          // Block if not low risk
    allowMediumWithStepUp = true,    // Allow medium risk if step-up completed
  } = options;

  return async (req, res, next) => {
    try {
      const user = req.user;
      const redis = getRedis();
      const deviceScope = req.deviceFingerprint || 'default';

      // ─── 0. IP Blacklist/Whitelist Enforcement ───
      if (redis && req.clientIP) {
        const isBlacklisted = await redis.sismember('ip:blacklist', req.clientIP);
        if (isBlacklisted) {
          await createAuditLog({
            userId: user._id,
            action: 'access_denied',
            ipAddress: req.clientIP,
            details: { reason: 'IP blacklisted', action },
          });
          return res.status(403).json({
            success: false,
            message: 'Access denied. Your IP has been blocked by administrator.',
            code: 'IP_BLACKLISTED',
          });
        }

        // Whitelisted IPs bypass step-up (but not high-risk blocks)
        const isWhitelisted = await redis.sismember('ip:whitelist', req.clientIP);
        if (isWhitelisted) {
          req.riskData = { score: 0, level: 'low', recommendation: 'allow', factors: [] };
          return next();
        }
      }

      // ─── 0.25. Country Allow/Deny List (Cloudflare-style geo-restriction) ───
      if (redis && req.clientIP) {
        // Try to get geo info from the most recent risk cache or UEBA lookup
        let country = null;
        const cachedRisk = await redis.get(`risk:${user._id}:${deviceScope}`);
        if (cachedRisk) {
          try {
            const parsed = JSON.parse(cachedRisk);
            country = parsed.geo_info?.country || null;
          } catch {}
        }

        if (country) {
          // Check if country is explicitly blocked
          const geoBlockEnabled = await redis.scard('geo:blocklist');
          if (geoBlockEnabled > 0) {
            const isBlocked = await redis.sismember('geo:blocklist', country);
            if (isBlocked) {
              await createAuditLog({
                userId: user._id,
                action: 'access_denied',
                ipAddress: req.clientIP,
                details: { reason: 'Country blocked by geo policy', country, policyRule: 'geo_country_blocked', action },
              });
              return res.status(403).json({
                success: false,
                message: `Access denied. Logins from ${country} are not permitted.`,
                code: 'GEO_BLOCKED',
              });
            }
          }

          // Check if country is outside allowlist (if allowlist is configured)
          const geoAllowEnabled = await redis.scard('geo:allowlist');
          if (geoAllowEnabled > 0) {
            const isAllowed = await redis.sismember('geo:allowlist', country);
            if (!isAllowed) {
              await createAuditLog({
                userId: user._id,
                action: 'access_denied',
                ipAddress: req.clientIP,
                details: { reason: 'Country not in geo allowlist', country, policyRule: 'geo_country_not_allowed', action },
              });
              return res.status(403).json({
                success: false,
                message: `Access denied. Your country (${country}) is not in the allowed list.`,
                code: 'GEO_NOT_ALLOWED',
              });
            }
          }
        }
      }

      // ─── 0.5. Check if device is trusted (30-day remember) ───
      if (redis && deviceScope !== 'default') {
        const trusted = await redis.get(`trusted:${user._id}:${deviceScope}`);
        if (trusted) {
          req.riskData = { score: 0, level: 'low', recommendation: 'allow', factors: [] };
          return next();
        }
      }

      // ─── 1. Check if THIS DEVICE has pending step-up requirement ───
      if (redis) {
        const pendingStepUp = await redis.get(`stepup:pending:${user._id}:${deviceScope}`);
        if (pendingStepUp) {
          // Check if step-up was already completed for this device session
          const stepUpCompleted = await redis.get(`stepup:verified:${user._id}:${deviceScope}`);
          if (!stepUpCompleted) {
            // Parse structured pending data
            let pendingData = { required: [], reason: '', completedMethods: [] };
            try { pendingData = JSON.parse(pendingStepUp); } catch { /* legacy string format */ }

            return res.status(403).json({
              success: false,
              message: 'Step-up authentication required before accessing resources.',
              code: 'STEP_UP_REQUIRED',
              riskLevel: 'medium',
              requiredChallenges: pendingData.required || [],
              challengeReason: pendingData.reason || 'Unusual activity detected',
              secretQuestion: user.secretQuestion,
            });
          }
        }
      }

      // ─── 2. Get cached risk score for THIS DEVICE from Redis ───
      let riskData = null;
      if (redis) {
        const cached = await redis.get(`risk:${user._id}:${deviceScope}`);
        if (cached) {
          riskData = JSON.parse(cached);
        }
      }

      // ─── 3. If no cached risk, do a fresh UEBA analysis ───
      // Skip re-analysis if step-up was already verified for this device (session is trusted)
      if (!riskData && redis) {
        const stepUpVerified = await redis.get(`stepup:verified:${user._id}:${deviceScope}`);
        if (stepUpVerified) {
          riskData = { score: 0, level: 'low', recommendation: 'allow', factors: [] };
          await redis.setex(`risk:${user._id}:${deviceScope}`, 60 * 15, JSON.stringify(riskData));
        }
      }

      if (!riskData) {
        const uebaResult = await analyzeFileOperation({
          user,
          ipAddress: req.clientIP,
          deviceFingerprint: req.deviceFingerprint,
          userAgent: req.clientUserAgent,
          action,
        });

        riskData = {
          score: uebaResult.risk_score,
          level: uebaResult.risk_level,
          recommendation: uebaResult.recommendation,
          factors: uebaResult.factors,
          required_challenges: uebaResult.required_challenges || [],
          challenge_reason: uebaResult.challenge_reason || '',
          ueba_unavailable: !!uebaResult._ueba_unavailable,
        };

        // Adaptive cache TTL: low=15min, medium=5min
        const cacheTTL = riskData.level === 'medium' ? 60 * 5 : 60 * 15;

        // Cache the result per device
        if (redis) {
          await redis.setex(
            `risk:${user._id}:${deviceScope}`,
            cacheTTL,
            JSON.stringify(riskData)
          );
        }
      }

      // ─── 4. Apply access policy ───
      req.riskData = riskData; // Attach for downstream use

      if (riskData.level === 'high') {
        // HIGH RISK — Block this device session only (not the entire account)
        console.log(`ACCESS BLOCKED — User: ${user.email}, Score: ${riskData.score}, Device: ${deviceScope}`);

        const triggeredFactors = riskData.factors?.filter(f => f.triggered).map(f => f.description) || [];

        // Invalidate session for this device only
        if (redis) {
          await redis.setex(`blocked:${user._id}:${deviceScope}`, 60 * 60, 'true'); // 1 hour device block
          await redis.del(`risk:${user._id}:${deviceScope}`);
        }

        // Emit socket events BEFORE audit log so admin dashboard gets real-time notification
        const io = req.app.get('io');
        if (io) {
          io.to('admin-room').emit('session-blocked', {
            userId: user._id,
            email: user.email,
            name: user.name,
            riskScore: riskData.score,
            factors: triggeredFactors,
            timestamp: new Date().toISOString(),
          });
          io.to('admin-room').emit('security-alert', {
            type: 'critical',
            title: 'High-Risk Session Blocked',
            message: `${user.email} — Risk Score: ${riskData.score}`,
            email: user.email,
            riskScore: riskData.score,
            factors: triggeredFactors,
            timestamp: new Date().toISOString(),
          });
        }

        await createAuditLog({
          userId: user._id,
          action: 'session_terminated',
          ipAddress: req.clientIP,
          riskScore: riskData.score,
          riskLevel: 'high',
          details: { reason: 'High risk — device session blocked', factors: riskData.factors },
        });

        // Send admin alert email (non-blocking)
        sendAutoBlockAlert(user.email, riskData.score, triggeredFactors)
          .catch(err => console.error('Alert email failed:', err.message));

        // Notify user about the block
        const io = req.app.get('io');
        createNotification({
          userId: user._id,
          type: 'security_alert',
          title: 'Session Blocked — High Risk Detected',
          message: `Your session was blocked due to high-risk activity (score: ${riskData.score}). Contact an administrator if this was you.`,
          metadata: { riskScore: riskData.score, factors: triggeredFactors },
          sendEmail: true,
          io,
        }).catch(() => {});

        return res.status(403).json({
          success: false,
          message: 'Session terminated due to high-risk activity.',
          code: 'SESSION_TERMINATED',
          riskScore: riskData.score,
        });
      }

      if (riskData.level === 'medium' && allowMediumWithStepUp) {
        // MEDIUM RISK — Check if step-up auth was completed for this device
        if (redis) {
          const stepUpVerified = await redis.get(`stepup:verified:${user._id}:${deviceScope}`);
          if (!stepUpVerified) {
            // Set structured pending step-up with challenge prescriptions (per device)
            const requiredChallenges = riskData.required_challenges || ['otp_or_totp'];
            const challengeReason = riskData.ueba_unavailable
              ? 'Risk engine unavailable — full verification required'
              : (riskData.challenge_reason || 'Unusual activity detected');
            await redis.setex(
              `stepup:pending:${user._id}:${deviceScope}`,
              60 * 30,
              JSON.stringify({
                required: requiredChallenges,
                reason: challengeReason,
                completedMethods: [],
                uebaUnavailable: !!riskData.ueba_unavailable,
              })
            );

            await createAuditLog({
              userId: user._id,
              action: riskData.ueba_unavailable ? 'step_up_triggered_ueba_down' : 'step_up_triggered',
              ipAddress: req.clientIP,
              riskScore: riskData.score,
              riskLevel: 'medium',
              details: { requiredChallenges, challengeReason, uebaUnavailable: !!riskData.ueba_unavailable },
            });

            // Notify user about step-up requirement
            createNotification({
              userId: user._id,
              type: 'risk_alert',
              title: 'Additional Verification Required',
              message: challengeReason,
              metadata: { riskScore: riskData.score, requiredChallenges },
              io: req.app.get('io'),
            }).catch(() => {});

            return res.status(403).json({
              success: false,
              message: 'Additional verification required due to unusual activity.',
              code: 'STEP_UP_REQUIRED',
              riskScore: riskData.score,
              riskLevel: 'medium',
              requiredChallenges,
              challengeReason,
              secretQuestion: user.secretQuestion,
            });
          }
        }
      }

      if (requireLowRisk && riskData.level !== 'low') {
        return res.status(403).json({
          success: false,
          message: 'This action requires a low-risk session.',
          code: 'LOW_RISK_REQUIRED',
          riskScore: riskData.score,
        });
      }

      // ─── 5. Access Granted — Update session activity ───
      if (redis) {
        const sessionKey = `session:${user._id}:${deviceScope}`;
        const sessionRaw = await redis.get(sessionKey);
        if (sessionRaw) {
          try {
            const session = JSON.parse(sessionRaw);
            session.lastActive = new Date().toISOString();
            const ttl = await redis.ttl(sessionKey);
            if (ttl > 0) await redis.setex(sessionKey, ttl, JSON.stringify(session));
          } catch {}
        }
      }
      next();
    } catch (error) {
      console.error('Access Gateway error:', error);
      // FAIL-CLOSED: Zero Trust must never silently allow access on gateway errors
      await createAuditLog({
        userId: req.user?._id,
        action: 'access_denied',
        ipAddress: req.clientIP,
        details: { reason: 'Access gateway error — fail-closed', error: error.message },
      }).catch(() => {});
      return res.status(403).json({
        success: false,
        message: 'Access denied — security check failed. Please try again.',
        code: 'GATEWAY_ERROR',
      });
    }
  };
};

module.exports = { accessGateway };
