const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({

  question: {
    type: String,
    required: true
  },

  questionImage: {
    type: String,
    default: null
  },

  sourceDocument: {
    type: String,
    default: null
  },

  sourcePage: {
    type: Number,
    default: null
  },

  optionA: {
    type: String,
    required: true
  },

  optionB: {
    type: String,
    required: true
  },

  optionC: {
    type: String,
    required: true
  },

  optionD: {
    type: String,
    required: true
  },

  optionAImage: {
    type: String,
    default: null
  },

  optionBImage: {
    type: String,
    default: null
  },

  optionCImage: {
    type: String,
    default: null
  },

  optionDImage: {
    type: String,
    default: null
  },

  correctAnswer: {
    type: String,
    enum: ['A', 'B', 'C', 'D'],
    required: true
  },

  questionType: {
    type: String,
    enum: [
      'Single Choice',
      'Multiple Choice',
      'Numerical Answer'
    ],
    default: 'Single Choice'
  },

  course: {
    type: String,
    enum: ['JEE', 'CET', 'NEET', null],
    default: null
  },

  subject: {
    type: String,
    required: true
  },

  difficulty: {
    type: String,
    enum: ['Easy', 'Medium', 'Hard'],
    default: 'Medium'
  },

  marks: {
    type: Number,
    default: 1.0
  },

  explanation: {
    type: String,
    default: null
  },

  detailedSolution: {
    type: String,
    default: null
  },

  solutionImage: {
    type: String,
    default: null
  },

  negativeMarks: {
    type: Number,
    default: 0
  },

  partialMarks: {
    type: Number,
    default: 0
  },

  bonusMarks: {
    type: Number,
    default: 0
  },

  tags: {
    type: [String],
    default: []
  },

  source: {
    type: String,
    default: null
  },

  sourceYear: {
    type: Number,
    default: null
  },

  examCategory: {
    type: String,
    default: null
  },

  /*
    Used for duplicate detection.
    Generated from normalized question text.
  */
  fingerprint: {
    type: String,
    default: null
  },

  /*
    Tells us where the question came from.
  */
  sourceType: {
    type: String,
    enum: [
      'manual',
      'csv',
      'smart_scan',
      'uploaded_test'
    ],
    default: 'manual'
  },

  usageCount: {
    type: Number,
    default: 0
  },

  explanationImage: {
    type: String,
    default: null
  },

  topic: {
    type: String,
    default: null
  },

  subtopic: {
    type: String,
    default: null
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});


/* =========================================================
   INDEXES
========================================================= */

questionSchema.index({
  course: 1,
  subject: 1,
  topic: 1,
  subtopic: 1,
  difficulty: 1,
  questionType: 1
});


/*
  Important:
  prevents duplicate fingerprints when fingerprint exists.

  Existing old questions with fingerprint: null are unaffected.
*/
questionSchema.index(
  {
    fingerprint: 1
  },
  {
    unique: true,
    sparse: true
  }
);



questionSchema.index({
  isActive: 1,
  subject: 1,
  topic: 1,
  subtopic: 1,
  difficulty: 1,
  createdAt: -1
});

questionSchema.index({
  sourceYear: 1,
  source: 1
});


questionSchema.index({
  tags: 1
});


questionSchema.index({
  sourceType: 1,
  createdAt: -1
});


module.exports =
  mongoose.models.Question ||
  mongoose.model(
    'Question',
    questionSchema
  );