import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ─── Step-Up Event Emitter ───
const stepUpListeners = new Set();
export const stepUpEvents = {
  on(fn) { stepUpListeners.add(fn); },
  off(fn) { stepUpListeners.delete(fn); },
  emit(data) { stepUpListeners.forEach(fn => fn(data)); },
};

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// ─── Request Interceptor: Attach JWT ───
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // Attach device fingerprint if available
  const fp = localStorage.getItem('deviceFingerprint');
  if (fp) {
    config.headers['X-Device-Fingerprint'] = fp;
  }

  return config;
});

// ─── Response Interceptor: Auto-refresh expired tokens ───
let isRefreshing = false;
let failedQueue = [];
let isLoggingOut = false;

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Emit step-up events on 403 STEP_UP_REQUIRED
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'STEP_UP_REQUIRED'
    ) {
      stepUpEvents.emit({
        requiredChallenges: error.response.data.requiredChallenges || [],
        challengeReason: error.response.data.challengeReason || '',
        riskScore: error.response.data.riskScore,
        secretQuestion: error.response.data.secretQuestion,
      });
      return Promise.reject(error);
    }

    // If session was revoked (by admin or user from another device), alert and force logout
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'SESSION_REVOKED'
    ) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      toast.error('Your session has been terminated. Please log in again.', {
        duration: 5000,
        icon: '\u{1F6A8}',
      });
      setTimeout(() => { window.location.href = '/login'; }, 2000);
      return Promise.reject(error);
    }

    // If 401 with TOKEN_EXPIRED and we haven't retried yet
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        const fp = localStorage.getItem('deviceFingerprint');
        const { data } = await axios.post(`${API_BASE}/auth/refresh`, {
          refreshToken,
        }, {
          headers: fp ? { 'X-Device-Fingerprint': fp } : {},
        });

        const newAccessToken = data.data.accessToken;
        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);

        api.defaults.headers.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        // Show appropriate message based on why refresh failed
        if (refreshError.response?.data?.code === 'SESSION_REVOKED') {
          toast.error('Your session has been terminated. Please log in again.', {
            duration: 5000,
            icon: '\u{1F6A8}',
          });
          setTimeout(() => { window.location.href = '/login'; }, 2000);
        } else {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Handle 429 rate limiting — reject without retry to stop the cascade
    if (error.response?.status === 429) {
      return Promise.reject(error);
    }

    // Any other 401 (generic, unknown code) — clear tokens and redirect once
    if (error.response?.status === 401 && !isLoggingOut) {
      isLoggingOut = true;
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
