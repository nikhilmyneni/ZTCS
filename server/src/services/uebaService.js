const axios = require('axios');
const { getRedis } = require('../config/database');

const UEBA_BASE_URL = process.env.UEBA_SERVICE_URL || 'http://localhost:8000';
const UEBA_SERVICE_TOKEN = process.env.UEBA_SERVICE_TOKEN || '';

// Headers for all UEBA requests (includes service auth token)
const _uebaHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (UEBA_SERVICE_TOKEN) headers['X-Service-Token'] = UEBA_SERVICE_TOKEN;
  return headers;
};

// ─── Circuit Breaker State ───
const circuitBreaker = {
  failures: 0,
  lastFailure: null,
  state: 'closed', // closed = normal, open = blocking calls, half-open = testing
  THRESHOLD: 3,         // failures before opening
  RESET_TIMEOUT: 60000, // 1 min before trying again (half-open)
};

const _checkCircuit = () => {
  if (circuitBreaker.state === 'open') {
    const elapsed = Date.now() - circuitBreaker.lastFailure;
    if (elapsed > circuitBreaker.RESET_TIMEOUT) {
      circuitBreaker.state = 'half-open';
      return 'half-open';
    }
    return 'open';
  }
  return circuitBreaker.state;
};

const _onSuccess = () => {
  circuitBreaker.failures = 0;
  circuitBreaker.state = 'closed';
};

const _onFailure = () => {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.THRESHOLD) {
    circuitBreaker.state = 'open';
    console.warn(`\u26a0\ufe0f UEBA Circuit Breaker OPEN \u2014 ${circuitBreaker.failures} consecutive failures`);
  }
};

/**
 * Build a fallback response when UEBA is unavailable.
 * Checks Redis for cached last known risk score for this user.
 * If cached score exists and is low, allow with elevated monitoring.
 * Otherwise, fail-closed with full step-up.
 */
const _buildFallback = async (user, errorMessage) => {
  const redis = getRedis();
  let cachedScore = null;

  if (redis) {
    const cached = await redis.get(`ueba:lastKnown:${user._id}`).catch(() => null);
    if (cached) {
      try { cachedScore = JSON.parse(cached); } catch {}
    }
  }

  // If user had a recent low-risk score, allow with elevated monitoring
  if (cachedScore && cachedScore.score <= 30 && cachedScore.level === 'low') {
    console.warn(`\u26a0\ufe0f UEBA DOWN \u2014 Using cached low-risk score (${cachedScore.score}) for ${user.email}`);
    return {
      user_id: user._id.toString(),
      risk_score: cachedScore.score,
      risk_level: 'low',
      factors: [{
        factor: 'ueba_unavailable_cached',
        triggered: true,
        weight: 0,
        description: 'Risk engine unavailable \u2014 using cached low-risk score with elevated monitoring',
      }],
      recommendation: 'allow',
      geo_info: cachedScore.geo_info || null,
      time_analysis: null,
      is_new_ip: false,
      is_new_device: false,
      is_new_country: false,
      required_challenges: [],
      challenge_reason: '',
      _ueba_unavailable: true,
      _ueba_cached: true,
      _ueba_error: errorMessage,
    };
  }

  // No cache or cache was medium/high \u2014 fail-closed with full step-up
  console.warn(`\u26a0\ufe0f UEBA UNREACHABLE \u2014 Forcing full step-up for user ${user.email}`);
  return {
    user_id: user._id.toString(),
    risk_score: 45,
    risk_level: 'medium',
    factors: [{
      factor: 'ueba_unavailable',
      triggered: true,
      weight: 45,
      description: 'Risk engine unavailable \u2014 full step-up required as precaution',
    }],
    recommendation: 'step_up',
    geo_info: null,
    time_analysis: null,
    is_new_ip: false,
    is_new_device: false,
    is_new_country: false,
    required_challenges: ['secret_question', 'otp_or_totp'],
    challenge_reason: 'Risk engine unavailable \u2014 identity verification required',
    _ueba_unavailable: true,
    _ueba_error: errorMessage,
  };
};

/**
 * Cache a successful UEBA result so it can be used as fallback when service is down.
 */
const _cacheResult = async (userId, result) => {
  const redis = getRedis();
  if (!redis) return;
  await redis.setex(
    `ueba:lastKnown:${userId}`,
    60 * 60 * 2, // 2 hour TTL
    JSON.stringify({
      score: result.risk_score,
      level: result.risk_level,
      geo_info: result.geo_info || null,
      timestamp: new Date().toISOString(),
    })
  ).catch(() => {});
};

/**
 * Call the Python UEBA service to analyze user behavior.
 * Uses circuit breaker pattern to avoid hammering a down service.
 */
const analyzeUserBehavior = async ({ user, ipAddress, deviceFingerprint, userAgent, deviceType, simulation }) => {
  // Circuit breaker check
  const cbState = _checkCircuit();
  if (cbState === 'open') {
    return _buildFallback(user, 'Circuit breaker open \u2014 UEBA service recently failed');
  }

  try {
    const payload = {
      user_id: user._id.toString(),
      ip_address: ipAddress,
      device_fingerprint: deviceFingerprint || `unknown_${Date.now()}`,
      user_agent: userAgent,
      login_time: new Date().toISOString(),
      action: 'login',

      known_ips: user.baselineProfile?.knownIPs || [],
      known_devices: (user.baselineProfile?.knownDevices || []).filter(d => d && d !== 'unknown'),
      known_device_types: user.baselineProfile?.knownDeviceTypes || [],
      current_device_type: deviceType || 'Unknown',
      typical_login_start: user.baselineProfile?.typicalLoginHours?.start || 6,
      typical_login_end: user.baselineProfile?.typicalLoginHours?.end || 23,
      login_count: user.baselineProfile?.loginCount || 0,
      last_login_at: user.baselineProfile?.lastLoginAt
        ? user.baselineProfile.lastLoginAt.toISOString()
        : null,
      geo_locations: user.baselineProfile?.geoLocations || [],
    };

    if (simulation && process.env.NODE_ENV !== 'production') {
      payload.simulation = simulation;
    }

    const response = await axios.post(`${UEBA_BASE_URL}/api/ueba/analyze`, payload, {
      timeout: 30000,
      headers: _uebaHeaders(),
    });

    _onSuccess();
    // Cache successful result for circuit breaker fallback
    await _cacheResult(user._id, response.data);
    return response.data;
  } catch (error) {
    console.error('UEBA service call failed:', error.message);
    _onFailure();
    return _buildFallback(user, error.message);
  }
};

/**
 * Call UEBA for file operation analysis.
 * Uses circuit breaker pattern.
 */
const analyzeFileOperation = async ({ user, ipAddress, deviceFingerprint, userAgent, action, deviceType }) => {
  const cbState = _checkCircuit();
  if (cbState === 'open') {
    return _buildFallback(user, 'Circuit breaker open \u2014 UEBA service recently failed');
  }

  try {
    const payload = {
      user_id: user._id.toString(),
      ip_address: ipAddress,
      device_fingerprint: deviceFingerprint || `unknown_${Date.now()}`,
      user_agent: userAgent,
      login_time: new Date().toISOString(),
      action,

      known_ips: user.baselineProfile?.knownIPs || [],
      known_devices: (user.baselineProfile?.knownDevices || []).filter(d => d && d !== 'unknown'),
      known_device_types: user.baselineProfile?.knownDeviceTypes || [],
      current_device_type: deviceType || 'Unknown',
      typical_login_start: user.baselineProfile?.typicalLoginHours?.start || 6,
      typical_login_end: user.baselineProfile?.typicalLoginHours?.end || 23,
      login_count: user.baselineProfile?.loginCount || 0,
      last_login_at: user.baselineProfile?.lastLoginAt
        ? user.baselineProfile.lastLoginAt.toISOString()
        : null,
      geo_locations: user.baselineProfile?.geoLocations || [],
    };

    const response = await axios.post(`${UEBA_BASE_URL}/api/ueba/analyze`, payload, {
      timeout: 5000,
      headers: _uebaHeaders(),
    });

    _onSuccess();
    await _cacheResult(user._id, response.data);
    return response.data;
  } catch (error) {
    console.error('UEBA file analysis failed:', error.message);
    _onFailure();
    return _buildFallback(user, error.message);
  }
};

/** Expose circuit breaker state for health checks */
const getCircuitBreakerState = () => ({
  state: circuitBreaker.state,
  failures: circuitBreaker.failures,
  lastFailure: circuitBreaker.lastFailure,
});

module.exports = { analyzeUserBehavior, analyzeFileOperation, getCircuitBreakerState };
