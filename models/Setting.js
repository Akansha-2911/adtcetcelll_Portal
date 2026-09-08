// models/Setting.js — MongoDB / Mongoose
const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  value: {
    type: String,
    default: '',
  },
  description: {
    type: String,
    default: '',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
