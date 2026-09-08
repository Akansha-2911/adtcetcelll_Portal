const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:          { type: String, required: true, trim: true },
  email:         { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  rollNo:        { type: String, unique: true, sparse: true, trim: true },
  password:      { type: String, required: true },
  role:          { type: String, enum: ['admin', 'student'], default: 'student' },
  isFirstLogin:  { type: Boolean, default: true },
  isActive:      { type: Boolean, default: true },
  phone:         { type: String, default: null },
  subject:       { type: String, default: null },
  parentContact: { type: String, default: null },
  classLevel:    { type: String, default: null, trim: true },
  division:      { type: String, default: null, trim: true },
  cetExamNo:     { type: String, default: null, trim: true },
  grNo:          { type: String, default: null, trim: true },
  aadhaarNo:     { type: String, default: null, trim: true },
  address:       { type: String, default: null, trim: true },
  taluka:        { type: String, default: null, trim: true },
  district:      { type: String, default: null, trim: true },
  pinCode:       { type: String, default: null, trim: true },
  parentContact2:{ type: String, default: null, trim: true },
  gender:        { type: String, default: null, trim: true },
  hostel:        { type: String, default: null, trim: true },
  dateOfBirth:   { type: Date, default: null },
  category:      { type: String, default: null, trim: true },
  bloodGroup:    { type: String, default: null, trim: true },
  subjectGroup:  { type: String, default: null, trim: true },
  academy:       { type: String, default: null, trim: true },
  profilePhoto:  { type: String, default: null },
  lastLogin:     { type: Date,   default: null },
}, { timestamps: true });

userSchema.index({ role: 1, isActive: 1, createdAt: -1 });
userSchema.index({ isActive: 1, rollNo: 1 });
userSchema.index({ role: 1, classLevel: 1, division: 1 });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
