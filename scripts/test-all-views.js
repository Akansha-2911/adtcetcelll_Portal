#!/usr/bin/env node
/**
 * scripts/test-all-views.js
 * Comprehensive rendering test for all 58 EJS view templates in the views/ directory.
 */
const path = require('path');
const fs = require('fs');
const ejs = require('ejs');

const root = path.resolve(__dirname, '..');
const viewsDir = path.join(root, 'views');

function walkEjs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkEjs(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ejs')) {
      out.push(path.relative(viewsDir, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

const allViews = walkEjs(viewsDir);
console.log(`Found ${allViews.length} EJS view files.`);

const mockAdmin = {
  id: 'adm_001',
  _id: 'adm_001',
  name: 'System Admin',
  email: 'admin@xyzcollege.edu.in',
  role: 'admin',
  isActive: true,
  isFirstLogin: false
};

const mockStudent = {
  id: 'stu_001',
  _id: 'stu_001',
  name: 'Aarav Patil',
  email: 'aarav@student.edu.in',
  rollNo: '2024CE001',
  grNo: 'GR-2024-001',
  cetExamNo: 'CET-2024-9988',
  role: 'student',
  classLevel: '12th',
  division: 'A',
  stream: 'Science',
  subjectGroup: 'PCM',
  gender: 'Male',
  category: 'Open',
  bloodGroup: 'O+',
  academy: 'SPVN Academy',
  hostel: 'Day Scholar',
  phone: '9876543210',
  parentContact: '9876543201',
  parentContact2: '9876543202',
  address: '123 Sharda Nagar',
  taluka: 'Baramati',
  district: 'Pune',
  pinCode: '413115',
  aadhaarNo: '123456789012',
  isActive: true,
  isFirstLogin: false,
  createdAt: new Date(),
  lastLogin: new Date()
};

const mockGroup = {
  _id: 'grp_001',
  id: 'grp_001',
  name: 'Batch A - 12th PCM 2026',
  academicYear: '2026-2027',
  course: 'CET',
  description: 'Regular classroom batch',
  students: [mockStudent],
  createdAt: new Date()
};

const mockQuestion = {
  _id: 'q_001',
  id: 'q_001',
  question: 'What is the velocity of light in vacuum? $c = 3 \\times 10^8 \\text{ m/s}$',
  optionA: '$3 \\times 10^8$ m/s',
  optionB: '$3 \\times 10^7$ m/s',
  optionC: '$3 \\times 10^6$ m/s',
  optionD: '$3 \\times 10^5$ m/s',
  correctAnswer: 'A',
  subject: 'Physics',
  topic: 'Optics',
  subtopic: 'Wave Optics',
  difficulty: 'Medium',
  marks: 1,
  explanation: 'By definition, light in vacuum travels at approx $3 \\times 10^8$ m/s.',
  createdAt: new Date()
};

const mockTest = {
  _id: 'tst_001',
  id: 'tst_001',
  title: 'MHT-CET Full Mock Test 01',
  description: 'Full syllabus CET mock examination',
  duration: 180,
  totalMarks: 200,
  course: ['CET'],
  subject: ['Physics', 'Chemistry', 'Mathematics'],
  status: 'published',
  questions: [mockQuestion],
  groups: [mockGroup],
  shuffleQuestions: true,
  shuffleOptions: false,
  startTime: new Date(Date.now() - 3600000),
  endTime: new Date(Date.now() + 86400000),
  instructions: 'No calculators allowed.',
  negativeMarking: 0,
  createdAt: new Date()
};

const mockResult = {
  _id: 'res_001',
  id: 'res_001',
  testId: mockTest,
  studentId: mockStudent,
  score: 165,
  totalMarks: 200,
  fullTotalMarks: 200,
  correctAnswers: 85,
  wrongAnswers: 15,
  skippedAnswers: 0,
  timeTaken: 7200,
  status: 'submitted',
  rank: 1,
  percentile: 99.5,
  subjectScores: {
    Physics: { marks: 45, total: 50, correct: 45, wrong: 5, skipped: 0, attempted: true, status: 'ATTEMPTED' },
    Chemistry: { marks: 42, total: 50, correct: 42, wrong: 8, skipped: 0, attempted: true, status: 'ATTEMPTED' },
    Mathematics: { marks: 78, total: 100, correct: 39, wrong: 11, skipped: 0, attempted: true, status: 'ATTEMPTED' }
  },
  topicScores: {
    Optics: { correct: 10, wrong: 2, skipped: 0 }
  },
  answers: {
    q_001: { answer: 'A', savedAt: new Date() }
  },
  markedForReview: [],
  visitedQuestionIds: ['q_001'],
  cheatingFlags: { tabSwitches: 0, fullscreenExits: 0, focusLosses: 0 },
  violationCount: 0,
  submittedAt: new Date()
};

const baseLocals = {
  collegeLogo: '/spvn-logo.png',
  collegeShort: 'SPVN',
  collegeName: 'Agricultural Development Trust Baramati',
  collegeAddress: 'Malegaon Khurd, Sharda Nagar, Baramati, Maharashtra 413115',
  academicYear: '2026-2027',
  appTimeZone: 'Asia/Kolkata',
  currentUser: mockAdmin,
  user: mockAdmin,
  student: mockStudent,
  requestPath: '/',
  successMsg: [],
  errorMsg: [],
  warningMsg: [],
  infoMsg: [],
  messages: { success: [], error: [], warning: [], info: [] }
};

// Custom fixtures for specific views
const viewFixtures = {
  'error.ejs': { statusCode: 404, message: 'Not found', title: 'Error', error: {} },
  'auth/login.ejs': { title: 'Student Login', currentUser: null, user: null },
  'auth/admin-login.ejs': { title: 'Admin Login', currentUser: null, user: null },
  'auth/portal-select.ejs': { title: 'Portal Select', currentUser: null, user: null },
  'auth/change-password.ejs': { title: 'Change Password', user: mockStudent, currentUser: mockStudent },
  
  // Student views
  'student/dashboard.ejs': {
    title: 'My Dashboard',
    currentUser: mockStudent,
    user: mockStudent,
    pendingTests: [mockTest],
    completedResults: [mockResult],
    allResultsCount: 1,
    notifications: [],
    chartData: JSON.stringify([{ label: 'Test 1', pct: 82.5, score: 165, total: 200, date: '19 Sep' }]),
    subjectStats: [{ name: 'Physics', pct: 90, count: 1, marks: 45, maxMarks: 50 }],
    upcomingTest: null,
    bestResult: null,
    stats: { pending: 1, completed: 1, avgScore: 82.5, scoreTrend: 'up', accuracy: 85, totalCorrect: 85, totalAttempted: 100 }
  },
  'student/tests.ejs': {
    title: 'My Tests',
    currentUser: mockStudent,
    user: mockStudent,
    newTests: [{ test: mockTest, result: null }],
    pendingTests: [],
    expiredTests: [],
    solvedTests: [{ test: mockTest, result: mockResult }],
    upcomingTests: [],
    resultMap: { [mockTest._id]: mockResult },
    queryTab: 'new'
  },
  'student/results.ejs': {
    title: 'My Results',
    currentUser: mockStudent,
    user: mockStudent,
    results: [mockResult]
  },
  'student/profile.ejs': {
    title: 'My Profile',
    currentUser: mockStudent,
    user: mockStudent,
    student: mockStudent,
    memberships: [{ groupId: mockGroup }],
    documents: [],
    results: [mockResult],
    stats: { totalTests: 1, averageScore: '165.0', averagePercentage: '82.5', highestScore: 165, highestPercentage: '82.5', accuracy: '85.0', totalCorrect: 85, totalWrong: 15 }
  },
  'student/notifications.ejs': {
    title: 'Notifications',
    currentUser: mockStudent,
    user: mockStudent,
    notifications: [{ title: 'New Test', message: 'Test available', type: 'info', createdAt: new Date() }]
  },
  'student/documents.ejs': {
    title: 'Documents',
    currentUser: mockStudent,
    user: mockStudent,
    docs: [{ fileName: 'doc_1.pdf', originalName: 'Aadhaar.pdf', filePath: '/uploads/documents/doc_1.pdf', fileSize: 102400, createdAt: new Date() }]
  },
  'student/practice.ejs': {
    title: 'Practice Test',
    currentUser: mockStudent,
    user: mockStudent,
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    topics: [],
    history: []
  },
  'student/practice-attempt.ejs': {
    title: 'Practice Attempt',
    currentUser: mockStudent,
    user: mockStudent,
    questions: [mockQuestion],
    attempt: { _id: 'pa_001', subject: 'Physics', answers: {}, questionCount: 1, startedAt: new Date() }
  },
  'student/practice-result.ejs': {
    title: 'Practice Result',
    currentUser: mockStudent,
    user: mockStudent,
    questions: [mockQuestion],
    attempt: { _id: 'pa_001', subject: 'Physics', answers: { q_001: 'A' }, score: 1, correct: 1, wrong: 0, unattempted: 0, questionCount: 1, startedAt: new Date(), submittedAt: new Date() }
  },
  
  // Exam views
  'exam/instructions.ejs': {
    title: 'Instructions',
    currentUser: mockStudent,
    user: mockStudent,
    test: mockTest,
    questionCount: 1,
    inProgress: false,
    cetSectionFlow: true,
    sectionSummary: [{ subject: 'Physics', questionCount: 1, totalMarks: 1 }]
  },
  'exam/question.ejs': {
    title: 'Exam Question',
    currentUser: mockStudent,
    user: mockStudent,
    test: mockTest,
    question: mockQuestion,
    options: [
      { key: 'A', value: mockQuestion.optionA, image: null },
      { key: 'B', value: mockQuestion.optionB, image: null },
      { key: 'C', value: mockQuestion.optionC, image: null },
      { key: 'D', value: mockQuestion.optionD, image: null }
    ],
    questionNumber: 1,
    totalQuestions: 1,
    remaining: 3600,
    paletteStatus: [{ num: 1, qId: mockQuestion._id, status: 'not-visited', subject: 'Physics', locked: false }],
    selectedAnswer: null,
    isMarked: false,
    resultId: mockResult._id,
    violations: 0,
    result: mockResult,
    cetSectionFlow: true,
    sectionState: {
      phase1Submitted: false,
      sections: [{ name: 'Physics', locked: false, questionNumbers: [1] }]
    },
    currentSection: { name: 'Physics', questionNumbers: [1] },
    sectionQuestionNumber: 1
  },
  'exam/result.ejs': {
    title: 'Result Details',
    currentUser: mockStudent,
    user: mockStudent,
    result: mockResult,
    percentage: 82.5,
    topperResult: mockResult,
    trend: [mockResult],
    totalAttempted: 1
  },
  'exam/leaderboard.ejs': {
    title: 'Leaderboard',
    currentUser: mockStudent,
    user: mockStudent,
    test: mockTest,
    results: [mockResult]
  },

  // Admin views
  'admin/dashboard.ejs': {
    title: 'Admin Dashboard',
    stats: { students: 50, tests: 5, groups: 2, questions: 100, submittedResults: 45, studentCount: 50, testCount: 5, groupCount: 2, questionCount: 100 },
    recentResults: [mockResult],
    recentUsers: [mockStudent],
    COURSES: ['CET', 'JEE', 'NEET']
  },
  'admin/organization.ejs': {
    title: 'Organization',
    collegeName: baseLocals.collegeName,
    collegeShort: baseLocals.collegeShort,
    collegeAddress: baseLocals.collegeAddress,
    academicYear: baseLocals.academicYear
  },
  'admin/analytics.ejs': {
    title: 'Analytics',
    stats: { testsCount: 5, studentsCount: 50, totalSubmissions: 45, avgAccuracy: 78.4 },
    results: [mockResult],
    tests: [mockTest],
    groups: [mockGroup]
  },
  'admin/monitor.ejs': {
    title: 'Live Monitor',
    activeTests: [mockTest]
  },
  'admin/test-monitor.ejs': {
    title: 'Test Live Monitor',
    test: mockTest,
    activeSessions: [{ student: mockStudent, startedAt: new Date(), answeredCount: 15, currentQuestion: 16, tabSwitches: 0, lastSeen: new Date() }]
  },
  'admin/content.ejs': {
    title: 'Content Hub',
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    questionCount: 100,
    topicsCount: 20
  },
  'admin/students.ejs': {
    title: 'Students Management',
    students: [mockStudent],
    groups: [mockGroup],
    whatsappTemplate: 'Hello {student_name}'
  },
  'admin/student-info.ejs': {
    title: 'Student Directory',
    students: [{ ...mockStudent, groupId: mockGroup }],
    groups: [mockGroup],
    filters: { classLevel: '', division: '', groupId: '', search: '' },
    allClasses: ['11th', '12th'],
    allDivisions: ['A', 'B', 'C', 'D'],
    whatsappTemplate: 'Hello {student_name}'
  },
  'admin/student-profile.ejs': {
    title: 'Student Profile',
    student: mockStudent,
    memberships: [{ groupId: mockGroup }],
    results: [mockResult],
    documents: [],
    stats: { tests: 1, averageScore: 82.5 }
  },
  'admin/groups.ejs': {
    title: 'Batches / Groups',
    groups: [{ ...mockGroup, memberCount: 1, members: [mockStudent] }],
    courses: ['CET', 'JEE', 'NEET']
  },
  'admin/group-detail.ejs': {
    title: 'Batch Details',
    group: { ...mockGroup, memberCount: 1 },
    members: [{ ...mockStudent, userId: mockStudent }],
    availableStudents: [],
    otherGroups: []
  },
  'admin/topics.ejs': {
    title: 'Syllabus Manager',
    topics: [{ _id: 'top_001', name: 'Optics', course: 'CET', subject: 'Physics', subtopics: ['Wave Optics', 'Ray Optics'], isActive: true }],
    courses: ['CET', 'JEE', 'NEET'],
    subjectsByCourse: { CET: ['Physics', 'Chemistry', 'Mathematics', 'Biology'] },
    selectedCourse: 'CET',
    selectedSubject: 'Physics'
  },
  'admin/subjects.ejs': {
    title: 'Subjects',
    courses: ['CET', 'JEE', 'NEET'],
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology']
  },
  'admin/questions.ejs': {
    title: 'Question Bank',
    questions: [mockQuestion],
    total: 1,
    page: 1,
    totalPages: 1,
    currentPage: 1,
    filters: {},
    SUBJECTS: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    topics: ['Optics'],
    subtopics: ['Wave Optics']
  },
  'admin/question-edit.ejs': {
    title: 'Edit Question',
    question: mockQuestion,
    SUBJECTS: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    topics: ['Optics'],
    subtopics: ['Wave Optics']
  },
  'admin/smart-import.ejs': {
    title: 'Smart Question Scan',
    drafts: []
  },
  'admin/smart-import-review.ejs': {
    title: 'Smart Scan Review',
    draft: {
      _id: 'drf_001',
      defaults: { subject: 'Physics', topic: 'Optics', difficulty: 'Medium', marks: 1 },
      questions: [{ ...mockQuestion, isSelected: true }],
      warnings: [],
      sourceFiles: [{ name: 'paper.pdf', size: 102400 }]
    }
  },
  'admin/tests.ejs': {
    title: 'Tests Management',
    tests: [mockTest],
    view: 'all',
    filterSubject: '',
    SUBJECTS: ['Physics', 'Chemistry', 'Mathematics', 'Biology']
  },
  'admin/test-detail.ejs': {
    title: 'Test Details',
    test: mockTest,
    results: [mockResult],
    resultCount: 1
  },
  'admin/edit-test.ejs': {
    title: 'Edit Test',
    test: mockTest,
    groups: [mockGroup],
    questions: [mockQuestion],
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology']
  },
  'admin/create-test.ejs': {
    title: 'Create Test',
    groups: [mockGroup],
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    courses: ['CET', 'JEE', 'NEET']
  },
  'admin/combine-test.ejs': {
    title: 'Combine Tests',
    groups: [mockGroup],
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    courses: ['CET', 'JEE', 'NEET'],
    tests: [mockTest]
  },
  'admin/test-workflow.ejs': {
    title: 'Test Workflow',
    test: mockTest
  },
  'admin/marking-template.ejs': {
    title: 'Marking Template',
    test: mockTest,
    questions: [mockQuestion]
  },
  'admin/publish-test-setup.ejs': {
    title: 'Publish Test Setup',
    test: mockTest,
    groups: [mockGroup]
  },
  'admin/upload-test.ejs': {
    title: 'Upload Test',
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    activeTab: 'upload',
    messages: {}
  },
  'admin/upload-test-review.ejs': {
    title: 'Upload Test Review',
    sessionId: 'sess_001',
    uploadSession: {
      _id: 'sess_001',
      totalQuestionPages: 1,
      duplicateCount: 0,
      questions: [
        {
          _id: 'q_001',
          question: mockQuestion.question,
          optionA: mockQuestion.optionA,
          optionB: mockQuestion.optionB,
          optionC: mockQuestion.optionC,
          optionD: mockQuestion.optionD,
          correctAnswer: 'A',
          difficulty: 'Medium',
          marks: 1,
          negativeMarks: 0,
          includeInTest: true
        }
      ]
    }
  },
  'admin/upload-test-details.ejs': {
    title: 'Upload Test Details',
    sessionId: 'sess_001',
    uploadSession: {
      _id: 'sess_001',
      duplicateCount: 0,
      defaultSubject: 'Physics',
      defaultTopic: 'Optics'
    },
    questionCount: 1,
    totalMarks: 1,
    groups: [mockGroup],
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
    COURSES: ['JEE', 'CET', 'NEET']
  },
  'admin/results.ejs': {
    title: 'Results & Leaderboard',
    groups: [mockGroup],
    tests: [mockTest],
    selectedGroupId: mockGroup._id,
    selectedTestId: mockTest._id,
    summary: { completed: 1, averagePct: 82.5, passCount: 1, topPct: 82.5 },
    results: [mockResult],
    isPcm: true,
    isPcb: false
  },
  'admin/combine-result.ejs': {
    title: 'Combined Results',
    groups: [mockGroup],
    allTests: [mockTest],
    selectedGroupId: mockGroup._id,
    selectedTestIds: [mockTest._id],
    combinedData: {
      group: mockGroup,
      tests: [mockTest],
      subjects: ['Physics'],
      totalMarksPossible: 200,
      totalStudents: 1,
      appearedCount: 1,
      absentCount: 0,
      averageCombinedPct: 82.5,
      studentRows: [{
        student: mockStudent,
        rollNo: mockStudent.rollNo,
        name: mockStudent.name,
        subjectMarks: { Physics: 45 },
        total: 165,
        percentage: 82.5,
        percentile: '100.00%',
        rank: 1,
        hasAbsent: false
      }]
    }
  },
  'admin/leaderboard.ejs': {
    title: 'Admin Leaderboard',
    test: mockTest,
    results: [mockResult]
  },
  'admin/question-analysis.ejs': {
    title: 'Question Analysis',
    test: mockTest,
    analysis: [{
      questionNumber: 1,
      question: mockQuestion,
      attemptedCount: 1,
      correctCount: 1,
      wrongCount: 0,
      skippedCount: 0,
      accuracyPct: 100,
      optionDistribution: { A: 1, B: 0, C: 0, D: 0 }
    }]
  },
  'admin/documents.ejs': {
    title: 'Uploaded Documents',
    documents: [{
      _id: 'doc_001',
      studentId: mockStudent,
      originalName: 'Aadhaar.pdf',
      filePath: '/uploads/documents/doc_001.pdf',
      fileSize: 102400,
      createdAt: new Date()
    }]
  }
};

let passed = 0;
let failed = 0;
const failures = [];

for (const relView of allViews) {
  // skip partials from standalone rendering (they are included by parent views)
  if (relView.startsWith('partials/')) {
    continue;
  }

  const fullPath = path.join(viewsDir, relView);
  const fixture = viewFixtures[relView] || { title: path.basename(relView, '.ejs') };
  const data = {
    ...baseLocals,
    filename: fullPath,
    ...fixture
  };

  try {
    const template = fs.readFileSync(fullPath, 'utf8');
    const html = ejs.render(template, data);
    passed++;
    console.log(`✓ [PASS] views/${relView} (${html.length} chars)`);
  } catch (err) {
    failed++;
    failures.push({ view: relView, error: err.message });
    console.error(`✗ [FAIL] views/${relView}: ${err.message}`);
  }
}

console.log(`\n========================================`);
console.log(`View Render Results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) {
  console.error('\nFailures detail:');
  failures.forEach(f => console.error(`- ${f.view}: ${f.error}`));
  process.exit(1);
} else {
  console.log('\nAll standalone view templates rendered with 100% success!');
  process.exit(0);
}
