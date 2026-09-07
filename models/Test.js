const mongoose = require('mongoose');

const testSchema = new mongoose.Schema({

  title: {
    type: String,
    required: true
  },

  description: {
    type: String,
    default: null
  },

  duration: {
    type: Number,
    default: 180
  },

  totalMarks: {
    type: Number,
    default: 0
  },

  negativeMarking: {
    type: Number,
    default: 0.25
  },

  passingMarks: {
    type: Number,
    default: null
  },

  shuffleQuestions: {
    type: Boolean,
    default: true
  },

  shuffleOptions: {
    type: Boolean,
    default: false
  },

  status: {
    type: String,
    enum: [
      'draft',
      'scheduled',
      'published',
      'active',
      'completed',
      'archived',
      'closed'
    ],
    default: 'draft'
  },

  startTime: {
    type: Date,
    default: null
  },

  endTime: {
    type: Date,
    default: null
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  instructions: {
    type: String,
    default: null
  },

  course: {
    type: [String],
    default: []
  },

  subject: {
    type: [String],
    default: []
  },

  topic: {
    type: String,
    default: null
  },

  subtopic: {
    type: String,
    default: null
  },

  marksPerQuestion: {
    type: Number,
    default: 1
  },

  noTimeLimit: {
    type: Boolean,
    default: false
  },

  testType: {
    type: String,
    default: 'Mock Test'
  },

  testPattern: {
    type: String,
    default: 'BASIC'
  },

  creationMode: {
    type: String,
    enum: [
      'builder',
      'direct_pdf',
      'combined',
      'uploaded_test'
    ],
    default: 'builder'
  },

  /*
    If test was created through Upload Test flow,
    this keeps reference to that temporary session.
  */
  uploadSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TestUploadSession',
    default: null
  },

  combinedFrom: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Test'
    }
  ],

  lastSavedAt: {
    type: Date,
    default: Date.now
  },

  publishedAt: {
    type: Date,
    default: null
  },

  validationWarnings: {
    type: [String],
    default: []
  },

  rankSchema: {
    type: String,
    default: 'Scheme 1'
  },

  testPassword: {
    type: String,
    default: null
  },

  hideImmediateResults: {
    type: Boolean,
    default: false
  },

  fixedTime: {
    type: Boolean,
    default: false
  },

  notifyStudents: {
    type: Boolean,
    default: true
  },

  questionSettings: [
    {
      questionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
        required: true
      },

      positiveMarks: {
        type: Number,
        default: 1
      },

      negativeMarks: {
        type: Number,
        default: 0
      },

      partialMarks: {
        type: Number,
        default: 0
      },

      bonusMark: {
        type: Number,
        default: 0
      },

      questionSubtype: {
        type: String,
        default: 'Single Selection'
      },

      answerKey: {
        type: String,
        enum: ['A', 'B', 'C', 'D'],
        default: 'A'
      }
    }
  ],

  questionPdfPath: {
    type: String,
    default: null
  },

  solutionPdfPath: {
    type: String,
    default: null
  },

  questions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    }
  ],

  groups: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group'
    }
  ],

  autoSubmitOnViolation: {
    type: Boolean,
    default: false
  },

  maxTabSwitches: {
    type: Number,
    default: 3
  },

  maxFocusLosses: {
    type: Number,
    default: 5
  },

  blockCopyPaste: {
    type: Boolean,
    default: true
  },

  requireFullscreen: {
    type: Boolean,
    default: false
  },

  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});


testSchema.index({
  status: 1,
  createdBy: 1,
  startTime: 1
});

testSchema.index({
  groups: 1,
  status: 1
});

testSchema.index({
  subject: 1,
  course: 1
});

testSchema.index({
  creationMode: 1,
  createdAt: -1
});

testSchema.index({
  uploadSessionId: 1
});


module.exports =
  mongoose.models.Test ||
  mongoose.model(
    'Test',
    testSchema
  );