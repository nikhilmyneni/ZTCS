const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    publicUrl: {
      type: String,
      required: true,
    },
    format: String,
    sizeBytes: Number,
    resourceType: {
      type: String,
      enum: ['image', 'document', 'spreadsheet', 'archive', 'other'],
      default: 'other',
    },
    mimeType: String,

    // Access control
    isRestricted: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Tracking
    downloadCount: {
      type: Number,
      default: 0,
    },
    lastAccessedAt: Date,
    lastAccessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

fileSchema.index({ userId: 1, isDeleted: 1 });
fileSchema.index({ createdAt: -1 });

const File = mongoose.model('File', fileSchema);
module.exports = File;
