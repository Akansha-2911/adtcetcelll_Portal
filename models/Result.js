const mongoose = require('mongoose');


const resultSchema = new mongoose.Schema({

  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  testId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },


  /* =========================================================
     SCORE
  ========================================================= */

  score: {
    type: Number,
    default: 0
  },

  totalMarks: {
    type: Number,
    default: 0
  },

  fullTotalMarks: {
    type: Number,
    default: 0
  },

  correctAnswers: {
    type: Number,
    default: 0
  },

  wrongAnswers: {
    type: Number,
    default: 0
  },

  skippedAnswers: {
    type: Number,
    default: 0
  },

  rank: {
    type: Number,
    default: null
  },

  percentile: {
    type: Number,
    default: null
  },

  timeTaken: {
    type: Number,
    default: null
  },


  /* =========================================================
     ANSWERS
  ========================================================= */

  answers: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  questionTimings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  markedForReview: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },

  visitedQuestionIds: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },


  /* =========================================================
     QUESTION ORDER
  ========================================================= */

  questionOrder: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },


  /* =========================================================
     CET SECTION FLOW
  ========================================================= */

  /*
   * false:
   * Student is still in Physics + Chemistry phase.
   *
   * true:
   * Physics + Chemistry have been explicitly submitted.
   * They become permanently locked for this attempt.
   */

  section1Submitted: {
    type: Boolean,
    default: false
  },


  /*
   * When Phase 1 was submitted.
   */

  section1SubmittedAt: {
    type: Date,
    default: null
  },


  /*
   * Used by the exam controller to allow Mathematics/Biology.
   *
   * Kept separately for clear server-side state.
   */

  finalSectionUnlocked: {
    type: Boolean,
    default: false
  },


  /*
   * Optional explicit phase indicator.
   *
   * phase1 = Physics + Chemistry
   * phase2 = Mathematics or Biology
   * completed = final exam submitted
   */

  currentExamPhase: {
    type: String,
    enum: [
      'phase1',
      'phase2',
      'completed'
    ],
    default: 'phase1'
  },


  /* =========================================================
     SUBJECT ANALYTICS
  ========================================================= */

  subjectScores: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  attemptedSubjects: {
    type: [String],
    default: []
  },

  absentSubjects: {
    type: [String],
    default: []
  },

  topicScores: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },


  /* =========================================================
     ANTI-CHEAT
  ========================================================= */

  cheatingFlags: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      tabSwitches: 0,
      fullscreenExits: 0,
      focusLosses: 0
    }
  },

  violationCount: {
    type: Number,
    default: 0
  },


  /* =========================================================
     ATTEMPT STATUS
  ========================================================= */

  status: {
    type: String,
    enum: [
      'in_progress',
      'submitted',
      'auto_submitted',
      'terminated'
    ],
    default: 'in_progress'
  },

  startedAt: {
    type: Date,
    default: null
  },

  submittedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});


/* =========================================================
   INDEXES
========================================================= */

resultSchema.index({
  studentId: 1,
  testId: 1
});


resultSchema.index({
  testId: 1,
  status: 1,
  createdAt: -1
});


resultSchema.index({
  studentId: 1,
  status: 1,
  submittedAt: -1
});


/* =========================================================
   VIRTUALS
========================================================= */

resultSchema
  .virtual('student')
  .get(function () {

    return this.studentId;

  });


resultSchema
  .virtual('test')
  .get(function () {

    return this.testId;

  });


resultSchema.set(
  'toObject',
  {
    virtuals: true
  }
);


resultSchema.set(
  'toJSON',
  {
    virtuals: true
  }
);


module.exports =
  mongoose.models.Result ||
  mongoose.model(
    'Result',
    resultSchema
  );