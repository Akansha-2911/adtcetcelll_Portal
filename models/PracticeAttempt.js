const mongoose = require('mongoose');

const practiceAttemptSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  subject: {
    type: String,
    required: true
  },

  topic: {
    type: String,
    default: null
  },

  subtopic: {
    type: String,
    default: null
  },

  difficulty: {
    type: String,
    enum: ['All', 'Easy', 'Medium', 'Hard'],
    default: 'All'
  },

  questionCount: {
    type: Number,
    required: true
  },

  questionIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    }
  ],

  answers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  score: {
    type: Number,
    default: 0
  },

  correct: {
    type: Number,
    default: 0
  },

  wrong: {
    type: Number,
    default: 0
  },

  unattempted: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    enum: ['in_progress', 'submitted'],
    default: 'in_progress'
  },

  startedAt: {
    type: Date,
    default: Date.now
  },

  submittedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});

practiceAttemptSchema.index({
  studentId: 1,
  createdAt: -1
});

module.exports =
  mongoose.models.PracticeAttempt ||
  mongoose.model('PracticeAttempt', practiceAttemptSchema);