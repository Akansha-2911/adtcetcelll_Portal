const mongoose=require('mongoose');

const extractedQuestionSchema=new mongoose.Schema({
  pageNumber:{type:Number,required:true},
  solutionPageNumber:{type:Number,default:null},

  question:{type:String,default:''},
  questionImage:{type:String,default:null},

  optionA:{type:String,default:''},
  optionB:{type:String,default:''},
  optionC:{type:String,default:''},
  optionD:{type:String,default:''},

  optionAImage:{type:String,default:null},
  optionBImage:{type:String,default:null},
  optionCImage:{type:String,default:null},
  optionDImage:{type:String,default:null},

  correctAnswer:{
    type:String,
    enum:['','A','B','C','D'],
    default:''
  },

  explanation:{type:String,default:''},
  detailedSolution:{type:String,default:''},
  solutionImage:{type:String,default:null},

  subject:{type:String,default:''},
  topic:{type:String,default:''},
  subtopic:{type:String,default:''},

  difficulty:{
    type:String,
    enum:['Easy','Medium','Hard'],
    default:'Medium'
  },

  marks:{type:Number,default:1},
  negativeMarks:{type:Number,default:0},

  questionType:{
    type:String,
    default:'Single Choice'
  },

  hasVisualQuestion:{
    type:Boolean,
    default:false
  },

  hasVisualOptions:{
    type:Boolean,
    default:false
  },

  fingerprint:{
    type:String,
    default:''
  },

  isDuplicate:{
    type:Boolean,
    default:false
  },

  existingQuestionId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'Question',
    default:null
  },

  duplicateReason:{
    type:String,
    default:''
  },

  includeInTest:{
    type:Boolean,
    default:true
  },

  extractionStatus:{
    type:String,
    enum:['pending','processing','success','warning','failed'],
    default:'pending'
  },

  extractionMessage:{
    type:String,
    default:''
  },

  questionPagePreview:{
    type:String,
    default:null
  },

  solutionPagePreview:{
    type:String,
    default:null
  }
},{_id:true});

const testUploadSessionSchema=new mongoose.Schema({
  createdBy:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'User',
    required:true,
    index:true
  },

  status:{
    type:String,
    enum:[
      'uploaded',
      'extracting',
      'review',
      'details',
      'completed',
      'failed'
    ],
    default:'uploaded',
    index:true
  },

  extractionMode:{
    type:String,
    enum:[
      'one_question_per_page',
      'auto_detect'
    ],
    default:'one_question_per_page'
  },

  questionFile:{
    originalName:{type:String,default:''},
    fileName:{type:String,default:''},
    path:{type:String,default:''},
    mimeType:{type:String,default:''},
    size:{type:Number,default:0},
    pageCount:{type:Number,default:0}
  },

  solutionFile:{
    originalName:{type:String,default:''},
    fileName:{type:String,default:''},
    path:{type:String,default:''},
    mimeType:{type:String,default:''},
    size:{type:Number,default:0},
    pageCount:{type:Number,default:0}
  },

  defaultSubject:{
    type:String,
    default:''
  },

  defaultTopic:{
    type:String,
    default:''
  },

  defaultSubtopic:{
    type:String,
    default:''
  },

  defaultDifficulty:{
    type:String,
    enum:['Easy','Medium','Hard'],
    default:'Medium'
  },

  defaultMarks:{
    type:Number,
    default:1
  },

  defaultNegativeMarks:{
    type:Number,
    default:0
  },

  questions:{
    type:[extractedQuestionSchema],
    default:[]
  },

  totalQuestionPages:{
    type:Number,
    default:0
  },

  totalSolutionPages:{
    type:Number,
    default:0
  },

  extractedCount:{
    type:Number,
    default:0
  },

  failedCount:{
    type:Number,
    default:0
  },

  warningCount:{
    type:Number,
    default:0
  },

  duplicateCount:{
    type:Number,
    default:0
  },

  newQuestionCount:{
    type:Number,
    default:0
  },

  testDetails:{
    title:{type:String,default:''},
    description:{type:String,default:''},

    course:{
      type:[String],
      default:[]
    },

    subject:{
      type:[String],
      default:[]
    },

    testType:{
      type:String,
      default:'Mock Test'
    },

    testPattern:{
      type:String,
      default:'MHT-CET'
    },

    rankSchema:{
      type:String,
      default:'Scheme 1'
    },

    duration:{
      type:Number,
      default:60
    },

    negativeMarking:{
      type:Number,
      default:0
    },

    instructions:{
      type:String,
      default:''
    },

    startTime:{
      type:Date,
      default:null
    },

    endTime:{
      type:Date,
      default:null
    },

    groupIds:{
      type:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:'Group'
      }],
      default:[]
    },

    shuffleQuestions:{
      type:Boolean,
      default:true
    },

    shuffleOptions:{
      type:Boolean,
      default:false
    },

    hideImmediateResults:{
      type:Boolean,
      default:false
    }
  },

  createdTestId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:'Test',
    default:null
  },

  errorMessage:{
    type:String,
    default:''
  },

  extractionStartedAt:{
    type:Date,
    default:null
  },

  extractionCompletedAt:{
    type:Date,
    default:null
  },

  completedAt:{
    type:Date,
    default:null
  },

  expiresAt:{
    type:Date,
    default:function(){
      return new Date(Date.now()+24*60*60*1000);
    }
  }
},{timestamps:true});

testUploadSessionSchema.index({
  createdBy:1,
  createdAt:-1
});

testUploadSessionSchema.index({
  status:1,
  createdAt:-1
});

testUploadSessionSchema.index(
  {expiresAt:1},
  {expireAfterSeconds:0}
);

testUploadSessionSchema.virtual(
  'includedQuestions'
).get(function(){
  return (this.questions||[]).filter(
    q=>q.includeInTest!==false
  );
});

testUploadSessionSchema.virtual(
  'includedQuestionCount'
).get(function(){
  return (this.questions||[]).filter(
    q=>q.includeInTest!==false
  ).length;
});

testUploadSessionSchema.set(
  'toJSON',
  {virtuals:true}
);

testUploadSessionSchema.set(
  'toObject',
  {virtuals:true}
);

module.exports=
  mongoose.models.TestUploadSession||
  mongoose.model(
    'TestUploadSession',
    testUploadSessionSchema
  );