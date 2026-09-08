const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const {Question,Test,Group,TestUploadSession}=require('../models');
const {
  SUPPORTED_EXTENSIONS,
  extractQuestionFiles,
  preserveQuestionVisuals
} = require('../utils/questionImporter');
const {extractUploadedTest}=require('../utils/uploadTestExtractor');
const {parseLocalDateTime}=require('../utils/dateTime');
const storagePaths = require('../utils/storagePaths');
const UPLOAD_ROOT = storagePaths.testUploadDir || path.join(storagePaths.uploadRoot || path.join(__dirname, '..', 'uploads'), 'tests');
const toUploadUrl = storagePaths.toUploadUrl || function(filePath) {
  if (!filePath) return '';
  const root = storagePaths.uploadRoot || path.join(__dirname, '..', 'uploads');
  const rel = path.relative(root, filePath).replace(/\\/g, '/');
  return `/uploads/${rel.startsWith('/') ? rel.slice(1) : rel}`;
};

const ALLOWED_EXTENSIONS=['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp'];
const MAX_FILE_SIZE=parseInt(process.env.MAX_FILE_SIZE,10)||40*1024*1024;

const cleanText=v=>String(v||'').replace(/\s+/g,' ').trim();

function normalizeQuestionText(v){
  return String(v||'').toLowerCase()
    .replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/[^a-z0-9]+/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function createFingerprint(question){
  const normalized=normalizeQuestionText(question);
  if(!normalized)return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function safeFileName(originalName){
  const ext=path.extname(originalName||'').toLowerCase();
  const base=path.basename(originalName||'document',ext)
    .replace(/[^a-z0-9_-]/gi,'_').slice(0,60);
  return `${base}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
}

function ensureAllowedFile(file){
  if(!file)throw new Error('Required file was not uploaded.');
  if(Array.isArray(file))throw new Error('Please upload files individually or select valid documents.');

  const ext=path.extname(file.name||'').toLowerCase();
  if(!ALLOWED_EXTENSIONS.includes(ext) && !SUPPORTED_EXTENSIONS.has(ext))
    throw new Error(`Unsupported file type (${ext}). Upload PDF, Word (.doc, .docx), or Images (.png, .jpg, .jpeg, .webp).`);

  if(Number(file.size||0)>MAX_FILE_SIZE)
    throw new Error(`Each file must be below ${Math.floor(MAX_FILE_SIZE/1024/1024)} MB.`);
}

async function saveUploadedFile(file,sessionFolder){
  ensureAllowedFile(file);

  const filename=safeFileName(file.name);
  const absolutePath=path.join(sessionFolder,filename);

  await fs.promises.writeFile(absolutePath,file.data);

  return {
    originalName:file.name||'',
    fileName:filename,
    path:absolutePath,
    publicPath:toUploadUrl(absolutePath),
    mimeType:file.mimetype||'',
    size:Number(file.size||0)
  };
}

async function getOwnedUploadSession(req,sessionId){
  const session=await TestUploadSession.findOne({
    _id:sessionId,
    createdBy:req.session.user.id
  });

  if(!session)throw new Error('Upload session not found or expired.');
  return session;
}

async function detectDuplicates(rows){
  const questions=rows||[];

  const prepared=questions.map(q=>({
    ...q,
    fingerprint:createFingerprint(q.question)
  }));

  const fingerprints=prepared.map(q=>q.fingerprint).filter(Boolean);

  const existing=fingerprints.length
    ?await Question.find({
      fingerprint:{$in:fingerprints},
      isActive:{$ne:false}
    }).select('_id fingerprint question').lean()
    :[];

  const map=new Map();
  existing.forEach(q=>{
    if(q.fingerprint)map.set(q.fingerprint,q);
  });

  return prepared.map(q=>{
    const match=q.fingerprint?map.get(q.fingerprint):null;

    return {
      ...q,
      isDuplicate:Boolean(match),
      existingQuestionId:match?._id||null,
      duplicateReason:match?'Same question already exists in Question Bank.':''
    };
  });
}

exports.getUploadPage=async(req,res)=>{
  try{
    res.render('admin/upload-test',{
      title:'Upload Test',
      subjects:['Physics','Chemistry','Mathematics','Biology']
    });
  }catch(error){
    console.error('Upload Test page error:',error);
    req.flash('error','Unable to open Upload Test.');
    res.redirect('/admin/tests');
  }
};

exports.extractTest=async(req,res)=>{
  let uploadSession=null;

  try{
    const rawQuestionFiles = req.files?.questionFile || req.files?.questionFiles;
    if (!rawQuestionFiles) {
      throw new Error('Please select at least one test document or image to upload.');
    }
    const filesToUpload = Array.isArray(rawQuestionFiles) ? rawQuestionFiles : [rawQuestionFiles];
    const solutionFile = req.files?.solutionFile;

    for (const f of filesToUpload) {
      ensureAllowedFile(f);
    }
    if (solutionFile) ensureAllowedFile(solutionFile);

    const extractionMode = 'smart_scan';
    const subject = cleanText(req.body.subject);
    const difficulty = ['Easy','Medium','Hard'].includes(req.body.difficulty)
      ? req.body.difficulty
      : 'Medium';

    const marks = Number(req.body.marks) || 1;
    const negativeMarks = Number(req.body.negativeMarks) || 0;

    uploadSession = await TestUploadSession.create({
      createdBy: req.session.user.id,
      status: 'uploaded',
      extractionMode,
      defaultSubject: subject,
      defaultTopic: cleanText(req.body.topic),
      defaultSubtopic: cleanText(req.body.subtopic),
      defaultDifficulty: difficulty,
      defaultMarks: marks,
      defaultNegativeMarks: negativeMarks
    });

    const sessionFolder = path.join(UPLOAD_ROOT, String(uploadSession._id));
    await fs.promises.mkdir(sessionFolder, { recursive: true });

    const savedFiles = [];
    for (const f of filesToUpload) {
      const saved = await saveUploadedFile(f, sessionFolder);
      savedFiles.push(saved);
    }

    const primarySaved = savedFiles[0];
    uploadSession.questionFile = {
      originalName: primarySaved.originalName,
      fileName: primarySaved.fileName,
      path: primarySaved.path,
      mimeType: primarySaved.mimeType,
      size: primarySaved.size,
      pageCount: 0
    };

    let savedSolutionFile = null;
    if (solutionFile) {
      savedSolutionFile = await saveUploadedFile(solutionFile, sessionFolder);
      uploadSession.solutionFile = {
        originalName: savedSolutionFile.originalName,
        fileName: savedSolutionFile.fileName,
        path: savedSolutionFile.path,
        mimeType: savedSolutionFile.mimeType,
        size: savedSolutionFile.size,
        pageCount: 0
      };
    }

    uploadSession.status = 'extracting';
    uploadSession.extractionStartedAt = new Date();
    await uploadSession.save();

    const defaults = {
      subject,
      topic: uploadSession.defaultTopic,
      subtopic: uploadSession.defaultSubtopic,
      difficulty,
      marks,
      negativeMarks
    };

    const allInputFiles = [...filesToUpload];
    if (solutionFile) allInputFiles.push(solutionFile);

    // Call Gemini AI Smart Scan engine
    const scanResult = await extractQuestionFiles(allInputFiles, defaults, req.session.user.id);
    if (!scanResult.questions || !scanResult.questions.length) {
      throw new Error('No questions could be detected. Please ensure your file contains clear multiple-choice questions with options.');
    }

    // Preserve and crop diagrams and visuals
    const visualResult = await preserveQuestionVisuals(allInputFiles, scanResult.questions, uploadSession._id);

    const mappedQuestions = visualResult.questions.map((q, index) => ({
      pageNumber: Number(q.pageNumber || index + 1),
      solutionPageNumber: null,

      question: cleanText(q.question),
      questionImage: q.questionImage || null,

      optionA: cleanText(q.optionA),
      optionB: cleanText(q.optionB),
      optionC: cleanText(q.optionC),
      optionD: cleanText(q.optionD),

      optionAImage: q.optionAImage || null,
      optionBImage: q.optionBImage || null,
      optionCImage: q.optionCImage || null,
      optionDImage: q.optionDImage || null,

      correctAnswer: ['A','B','C','D'].includes(String(q.correctAnswer).trim().toUpperCase())
        ? String(q.correctAnswer).trim().toUpperCase()
        : '',

      explanation: cleanText(q.explanation),
      detailedSolution: cleanText(q.detailedSolution || q.explanation),
      solutionImage: q.solutionImage || null,

      subject: cleanText(q.subject || subject),
      topic: cleanText(q.topic || uploadSession.defaultTopic),
      subtopic: cleanText(q.subtopic || uploadSession.defaultSubtopic),

      difficulty: ['Easy','Medium','Hard'].includes(q.difficulty)
        ? q.difficulty
        : difficulty,

      marks: Number(q.marks) || marks,
      negativeMarks: Number(q.negativeMarks) || negativeMarks,

      questionType: q.questionType || 'Single Choice',

      hasVisualQuestion: Boolean(q.hasVisualQuestion || q.questionImage),
      hasVisualOptions: Boolean(q.hasVisualOptions || q.optionAImage || q.optionBImage || q.optionCImage || q.optionDImage),

      fingerprint: null,
      isDuplicate: false,
      existingQuestionId: null,
      duplicateReason: '',

      includeInTest: true,

      extractionStatus: 'success',
      extractionMessage: '',

      questionPagePreview: null,
      solutionPagePreview: null
    }));

    const checkedQuestions = await detectDuplicates(mappedQuestions);
    const duplicateCount = checkedQuestions.filter(q => q.isDuplicate).length;

    uploadSession.questions = checkedQuestions;
    uploadSession.totalQuestionPages = checkedQuestions.length;
    uploadSession.totalSolutionPages = 0;
    uploadSession.questionFile.pageCount = checkedQuestions.length;
    if (solutionFile) uploadSession.solutionFile.pageCount = 1;

    uploadSession.extractedCount = checkedQuestions.length;
    uploadSession.failedCount = 0;
    uploadSession.warningCount = (scanResult.warnings || []).length;
    uploadSession.duplicateCount = duplicateCount;
    uploadSession.newQuestionCount = checkedQuestions.length - duplicateCount;
    uploadSession.status = 'review';
    uploadSession.extractionCompletedAt = new Date();
    uploadSession.errorMessage = '';

    await uploadSession.save();

    req.flash(
      'success',
      `Smart Scan complete: ${checkedQuestions.length} question(s) scanned accurately with Gemini. ${duplicateCount} duplicate(s) detected.`
    );

    return res.redirect(`/admin/tests/upload-test/review/${uploadSession._id}`);
  }catch(error){
    console.error('Upload Test extraction error:',error);

    if(uploadSession){
      try{
        uploadSession.status='failed';
        uploadSession.errorMessage=error.message;
        await uploadSession.save();
      }catch(_){}
    }

    req.flash('error','Extraction failed: '+error.message);
    return res.redirect('/admin/tests/upload-test');
  }
};

exports.getReview=async(req,res)=>{
  try{
    const uploadSession=await getOwnedUploadSession(req,req.params.sessionId);

    if(!['review','details'].includes(uploadSession.status)){
      req.flash('error','This upload is not ready for review.');
      return res.redirect('/admin/tests/upload-test');
    }

    res.render('admin/upload-test-review',{
      title:'Review Uploaded Test',
      uploadSession
    });

  }catch(error){
    console.error('Upload Test review error:',error);
    req.flash('error',error.message);
    res.redirect('/admin/tests/upload-test');
  }
};

exports.saveReview=async(req,res)=>{
  try{
    const uploadSession=await getOwnedUploadSession(req,req.params.sessionId);
    const body=req.body||{};

    for(const row of uploadSession.questions){
      const p=`q_${row._id}`;

      row.question=cleanText(body[`${p}_question`]??row.question);
      row.optionA=cleanText(body[`${p}_optionA`]??row.optionA);
      row.optionB=cleanText(body[`${p}_optionB`]??row.optionB);
      row.optionC=cleanText(body[`${p}_optionC`]??row.optionC);
      row.optionD=cleanText(body[`${p}_optionD`]??row.optionD);

      const answer=body[`${p}_correctAnswer`];
      row.correctAnswer=['A','B','C','D'].includes(answer)?answer:'';

      row.explanation=cleanText(
        body[`${p}_explanation`]??row.explanation
      );

      row.detailedSolution=cleanText(
        body[`${p}_detailedSolution`]??row.detailedSolution
      );

      row.subject=cleanText(body[`${p}_subject`]??row.subject);
      row.topic=cleanText(body[`${p}_topic`]??row.topic);
      row.subtopic=cleanText(body[`${p}_subtopic`]??row.subtopic);

      const difficulty=body[`${p}_difficulty`];
      if(['Easy','Medium','Hard'].includes(difficulty))
        row.difficulty=difficulty;

      const marks=Number(body[`${p}_marks`]);
      if(Number.isFinite(marks)&&marks>=0)row.marks=marks;

      const negative=Number(body[`${p}_negativeMarks`]);
      if(Number.isFinite(negative)&&negative>=0)
        row.negativeMarks=negative;

      row.includeInTest=body[`${p}_include`]==='on';
    }

    const checked=await detectDuplicates(
      uploadSession.questions.map(q=>q.toObject())
    );

    checked.forEach((q,index)=>{
      const row=uploadSession.questions[index];
      row.fingerprint=q.fingerprint;
      row.isDuplicate=q.isDuplicate;
      row.existingQuestionId=q.existingQuestionId;
      row.duplicateReason=q.duplicateReason;
    });

    const included=uploadSession.questions.filter(
      q=>q.includeInTest!==false
    );

    if(!included.length)
      throw new Error('Keep at least one question in the test.');

    const invalid=included.filter(q=>{
      const hasA=cleanText(q.optionA)||q.optionAImage;
      const hasB=cleanText(q.optionB)||q.optionBImage;
      const hasC=cleanText(q.optionC)||q.optionCImage;
      const hasD=cleanText(q.optionD)||q.optionDImage;

      return (
        !cleanText(q.question)||
        !hasA||
        !hasB||
        !hasC||
        !hasD||
        !['A','B','C','D'].includes(q.correctAnswer)
      );
    });

    if(invalid.length){
      throw new Error(
        `${invalid.length} question(s) still need valid question text, A/B/C/D options and correct answer.`
      );
    }

    uploadSession.duplicateCount=
      included.filter(q=>q.isDuplicate).length;

    uploadSession.newQuestionCount=
      included.length-uploadSession.duplicateCount;

    uploadSession.status='details';
    await uploadSession.save();

    return res.redirect(
      `/admin/tests/upload-test/${uploadSession._id}/details`
    );

  }catch(error){
    console.error('Save Upload Test review error:',error);
    req.flash('error',error.message);

    res.redirect(
      `/admin/tests/upload-test/review/${req.params.sessionId}`
    );
  }
};

exports.getTestDetails=async(req,res)=>{
  try{
    const uploadSession=await getOwnedUploadSession(
      req,
      req.params.sessionId
    );

    if(!['details','review'].includes(uploadSession.status))
      throw new Error('Upload is not ready for test configuration.');

    const groups=await Group.find({
      isActive:{$ne:false}
    }).sort({name:1}).lean();

    const included=uploadSession.questions.filter(
      q=>q.includeInTest!==false
    );

    const totalMarks=included.reduce(
      (sum,q)=>sum+Number(q.marks||0),
      0
    );

    res.render('admin/upload-test-details',{
      title:'Test Details',
      uploadSession,
      groups,
      questionCount:included.length,
      totalMarks,
      COURSES:['JEE','CET','NEET']
    });

  }catch(error){
    console.error('Upload Test details error:',error);
    req.flash('error',error.message);
    res.redirect('/admin/tests/upload-test');
  }
};

function optionText(value,image,label){
  const text=cleanText(value);
  if(text)return text;
  if(image)return `[Visual Option ${label}]`;
  return '';
}

async function getOrCreateQuestion(extracted,adminId){
  const fingerprint=createFingerprint(extracted.question);

  if(!fingerprint)
    throw new Error('Question text is empty.');

  let existing=await Question.findOne({
    fingerprint,
    isActive:{$ne:false}
  });

  if(existing){
    return {
      question:existing,
      created:false
    };
  }

  try{
    const created=await Question.create({
      question:cleanText(extracted.question),
      questionImage:extracted.questionImage||null,

      optionA:optionText(extracted.optionA,extracted.optionAImage,'A'),
      optionB:optionText(extracted.optionB,extracted.optionBImage,'B'),
      optionC:optionText(extracted.optionC,extracted.optionCImage,'C'),
      optionD:optionText(extracted.optionD,extracted.optionDImage,'D'),

      optionAImage:extracted.optionAImage||null,
      optionBImage:extracted.optionBImage||null,
      optionCImage:extracted.optionCImage||null,
      optionDImage:extracted.optionDImage||null,

      correctAnswer:extracted.correctAnswer,

      questionType:[
        'Single Choice',
        'Multiple Choice',
        'Numerical Answer'
      ].includes(extracted.questionType)
        ?extracted.questionType
        :'Single Choice',

      subject:cleanText(extracted.subject),
      difficulty:extracted.difficulty||'Medium',

      marks:Number(extracted.marks)||1,
      negativeMarks:Number(extracted.negativeMarks)||0,

      explanation:cleanText(extracted.explanation)||null,
      detailedSolution:cleanText(extracted.detailedSolution)||null,
      solutionImage:extracted.solutionImage||null,

      topic:cleanText(extracted.topic)||null,
      subtopic:cleanText(extracted.subtopic)||null,

      sourceDocument:'Uploaded Test',
      sourcePage:extracted.pageNumber||null,
      source:'Uploaded Test',
      sourceType:'uploaded_test',

      fingerprint,
      createdBy:adminId,
      isActive:true
    });

    return {
      question:created,
      created:true
    };

  }catch(error){
    if(error?.code===11000){
      existing=await Question.findOne({fingerprint});

      if(existing){
        return {
          question:existing,
          created:false
        };
      }
    }

    throw error;
  }
}

exports.createDraftTest=async(req,res)=>{
  try{
    const uploadSession=await getOwnedUploadSession(
      req,
      req.params.sessionId
    );

    if(uploadSession.createdTestId){
      req.flash('success','This upload has already created a test.');

      return res.redirect(
        `/admin/tests/${uploadSession.createdTestId}`
      );
    }

    const includedQuestions=uploadSession.questions.filter(
      q=>q.includeInTest!==false
    );

    if(!includedQuestions.length)
      throw new Error('No questions selected for this test.');

    const title=cleanText(req.body.title);

    if(!title)
      throw new Error('Test name is required.');

    const course=Array.isArray(req.body.course)
      ?req.body.course
      :req.body.course
        ?[req.body.course]
        :[];

    const subject=Array.isArray(req.body.subject)
      ?req.body.subject
      :req.body.subject
        ?[req.body.subject]
        :[];

    const groupIds=Array.isArray(req.body.groupIds)
      ?req.body.groupIds
      :req.body.groupIds
        ?[req.body.groupIds]
        :[];

    const questionIds=[];
    let createdCount=0;
    let reusedCount=0;

    for(const extracted of includedQuestions){
      const result=await getOrCreateQuestion(
        extracted,
        req.session.user.id
      );

      questionIds.push(result.question._id);

      if(result.created)createdCount++;
      else reusedCount++;
    }

    const uniqueQuestionIds=[];
    const seen=new Set();

    for(const id of questionIds){
      const key=String(id);

      if(!seen.has(key)){
        seen.add(key);
        uniqueQuestionIds.push(id);
      }
    }

    if(!uniqueQuestionIds.length)
      throw new Error('Unable to create test questions.');

    const questionDocuments=await Question.find({
      _id:{$in:uniqueQuestionIds}
    });

    const totalMarks=questionDocuments.reduce(
      (sum,q)=>sum+Number(q.marks||0),
      0
    );

    const startTime=parseLocalDateTime(req.body.startTime);
    const endTime=parseLocalDateTime(req.body.endTime);

    if(startTime&&endTime&&endTime<=startTime)
      throw new Error('End time must be after start time.');

    const test=await Test.create({
      title,
      description:cleanText(req.body.description)||null,

      duration:Math.max(
        1,
        parseInt(req.body.duration,10)||60
      ),

      totalMarks,

      negativeMarking:
        Number(req.body.negativeMarking)||0,

      passingMarks:
        req.body.passingMarks!==undefined&&
        req.body.passingMarks!==''
          ?Number(req.body.passingMarks)
          :null,

      shuffleQuestions:
        req.body.shuffleQuestions==='on',

      shuffleOptions:
        req.body.shuffleOptions==='on',

      status:'draft',

      startTime,
      endTime,

      createdBy:req.session.user.id,

      instructions:
        cleanText(req.body.instructions)||null,

      course,
      subject,

      topic:cleanText(req.body.topic)||null,
      subtopic:cleanText(req.body.subtopic)||null,

      marksPerQuestion:
        Number(req.body.marksPerQuestion)||1,

      noTimeLimit:
        req.body.noTimeLimit==='on',

      testType:
        cleanText(req.body.testType)||'Mock Test',

      testPattern:
        cleanText(req.body.testPattern)||'MHT-CET',

      creationMode:'uploaded_test',
      uploadSessionId:uploadSession._id,

      lastSavedAt:new Date(),
      publishedAt:null,

      rankSchema:
        cleanText(req.body.rankSchema)||'Scheme 1',

      testPassword:
        cleanText(req.body.testPassword)||null,

      hideImmediateResults:
        req.body.hideImmediateResults==='on',

      fixedTime:
        req.body.fixedTime==='on',

      notifyStudents:false,

      questions:uniqueQuestionIds,
      groups:groupIds,

      questionPdfPath:
        uploadSession.questionFile?.path||null,

      solutionPdfPath:
        uploadSession.solutionFile?.path||null
    });

    await Question.updateMany(
      {_id:{$in:uniqueQuestionIds}},
      {$inc:{usageCount:1}}
    );

    uploadSession.createdTestId=test._id;
    uploadSession.status='completed';
    uploadSession.completedAt=new Date();

    uploadSession.testDetails={
      title,
      description:cleanText(req.body.description),
      course,
      subject,
      testType:test.testType,
      testPattern:test.testPattern,
      rankSchema:test.rankSchema,
      duration:test.duration,
      negativeMarking:test.negativeMarking,
      instructions:test.instructions,
      startTime,
      endTime,
      groupIds,
      shuffleQuestions:test.shuffleQuestions,
      shuffleOptions:test.shuffleOptions,
      hideImmediateResults:test.hideImmediateResults
    };

    await uploadSession.save();

    req.flash(
      'success',
      `Test created as Draft. ${createdCount} new question(s) added to Question Bank and ${reusedCount} existing question(s) reused.`
    );

    return res.redirect(
      `/admin/tests/${test._id}/marking-template`
    );

  }catch(error){
    console.error('Create uploaded Draft test error:',error);

    req.flash(
      'error',
      'Unable to create test: '+error.message
    );

    return res.redirect(
      `/admin/tests/upload-test/${req.params.sessionId}/details`
    );
  }
};