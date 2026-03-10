const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Never return password in queries by default
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    secretQuestion: {
      type: String,
      required: [true, 'Secret question is required'],
    },
    secretAnswer: {
      type: String,
      required: [true, 'Secret answer is required'],
      select: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // ─── TOTP Authenticator ───
    totp: {
      secret: { type: String, select: false },  // Base32 encoded secret
      enabled: { type: Boolean, default: false },
      verifiedAt: Date,
    },

    // ─── UEBA Baseline Profile (populated on first logins) ───
    baselineProfile: {
      knownIPs: [String],           // Historical IP addresses
      knownDevices: [String],       // Device fingerprint hashes
      knownDeviceTypes: [String],   // OS types: Windows/macOS/Android/iOS/Linux
      typicalLoginHours: {          // Usual login time window
        start: { type: Number, default: 6 },   // 6 AM
        end: { type: Number, default: 23 },     // 11 PM
      },
      avgSessionDuration: { type: Number, default: 0 },
      loginCount: { type: Number, default: 0 },
      lastLoginAt: Date,
      lastLoginIP: String,
      lastLoginDevice: String,
      geoLocations: [
        {
          city: String,
          region: String,
          country: String,
          loc: String, // "lat,lng"
        },
      ],
    },

    // ─── Password History (last 5 hashes — reject reuse) ───
    passwordHistory: {
      type: [String],
      select: false,
      default: [],
    },

    // ─── Risk History ───
    riskHistory: [
      {
        score: Number,
        level: { type: String, enum: ['low', 'medium', 'high'] },
        factors: [String],
        timestamp: { type: Date, default: Date.now },
        action: { type: String, enum: ['allowed', 'step-up', 'blocked'] },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Pre-save: Hash password + track history ───
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  // Save old hash to history before overwriting (skip on first creation)
  if (this.password && !this.isNew) {
    // Push current (old) hashed password to history, keep last 5
    if (!this.passwordHistory) this.passwordHistory = [];
    this.passwordHistory.push(this.password);
    if (this.passwordHistory.length > 5) {
      this.passwordHistory = this.passwordHistory.slice(-5);
    }
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─── Pre-save: Hash secret answer ───
userSchema.pre('save', async function (next) {
  if (!this.isModified('secretAnswer')) return next();
  const salt = await bcrypt.genSalt(10);
  this.secretAnswer = await bcrypt.hash(this.secretAnswer.toLowerCase().trim(), salt);
  next();
});

// ─── Methods ───
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.compareSecretAnswer = async function (candidateAnswer) {
  return bcrypt.compare(candidateAnswer.toLowerCase().trim(), this.secretAnswer);
};

userSchema.methods.isPasswordReused = async function (candidatePassword) {
  if (!this.passwordHistory || this.passwordHistory.length === 0) return false;
  for (const oldHash of this.passwordHistory) {
    const match = await bcrypt.compare(candidatePassword, oldHash);
    if (match) return true;
  }
  return false;
};

// Index for fast lookups
userSchema.index({ email: 1 });
userSchema.index({ 'baselineProfile.knownIPs': 1 });

const User = mongoose.model('User', userSchema);
module.exports = User;
