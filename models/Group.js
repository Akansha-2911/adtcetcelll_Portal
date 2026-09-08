const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name:         { type: String, required: true, unique: true, trim: true },
  description:  { type: String, default: null },
  academicYear: { type: String, default: process.env.ACADEMIC_YEAR || '2024-2025' },
  course:       { type: String, enum: ['JEE','CET','NEET', null], default: null },
  startDate:    { type: Date, default: null },
  endDate:      { type: Date, default: null },
  status:       { type: String, enum: ['active','inactive','completed'], default: 'active' },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

groupSchema.index({ isActive: 1, status: 1, course: 1, createdAt: -1 });

module.exports = mongoose.models.Group || mongoose.model('Group', groupSchema);
