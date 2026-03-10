import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise = null;

/**
 * Get or initialize device fingerprint.
 * Caches in localStorage for consistency across sessions.
 */
export const getDeviceFingerprint = async () => {
  // Return cached if available
  const cached = localStorage.getItem('deviceFingerprint');
  if (cached) return cached;

  try {
    if (!fpPromise) {
      fpPromise = FingerprintJS.load();
    }
    const fp = await fpPromise;
    const result = await fp.get();
    const visitorId = result.visitorId;

    localStorage.setItem('deviceFingerprint', visitorId);
    return visitorId;
  } catch (error) {
    console.error('Fingerprint generation failed:', error);
    // Fallback: generate a random ID
    const fallbackId = `fb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('deviceFingerprint', fallbackId);
    return fallbackId;
  }
};
