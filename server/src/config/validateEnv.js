/**
 * Validate required environment variables on startup.
 * Fail fast if critical vars are missing — prevents silent runtime errors.
 */
const validateEnv = () => {
  const required = [
    'MONGODB_URI',
    'REDIS_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'UEBA_SERVICE_URL',
  ];

  const optional = [
    'BREVO_API_KEY',
    'ALERT_EMAIL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_BUCKET',
    'CLIENT_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);
  const missingOptional = optional.filter((key) => !process.env[key]);

  if (missingOptional.length > 0) {
    console.warn(`\u26a0\ufe0f  Optional env vars missing: ${missingOptional.join(', ')}`);
  }

  if (missing.length > 0) {
    console.error(`\u274c  Missing required environment variables:\n   ${missing.join('\n   ')}`);
    process.exit(1);
  }

  // Validate JWT secrets aren't defaults
  if (process.env.JWT_SECRET === 'your-super-secret-jwt-key-change-this') {
    console.error('\u274c  JWT_SECRET is set to the default placeholder. Change it before running.');
    process.exit(1);
  }

  console.log('\u2705 Environment variables validated');
};

module.exports = validateEnv;
