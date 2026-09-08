const path = require('path');
const fs = require('fs');

const candidateModuleDirs = [
  path.join(__dirname, '..', 'node_modules'),
  path.join(__dirname, '..', 'SPVN_CET_Portal_FINAL_PRODUCTION_READY_V5', 'SPVN_CET_Portal_FINAL', 'node_modules'),
  path.join('C:', 'Users', 'akans', 'Downloads', 'SPVN_CET_Portal_FINAL', 'node_modules'),
];
for (const dir of candidateModuleDirs) {
  if (fs.existsSync(dir)) module.paths.push(dir);
}

const ejs = require('ejs');
const viewsDir = path.join(__dirname, '..', 'views');

const mockUser = { id: 'admin1', name: 'Admin', role: 'admin' };
const mockStudent = { id: 'stu1', name: 'Student 1', role: 'student' };

const testsToRender = [
  {
    name: 'admin/student-info',
    data: {
      user: mockUser,
      currentUser: mockUser,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Student Information',
      students: [
        {
          _id: 's1',
          name: 'Rahul Patil',
          rollNo: '2024CE001',
          classLevel: '12th',
          division: 'A',
          parentContact: '9876543210',
          phone: '9876543210',
          email: 'rahul@example.com',
          groupId: { _id: 'g1', name: 'Batch A 2024' },
          createdAt: new Date()
        }
      ],
      groups: [{ _id: 'g1', name: 'Batch A 2024' }],
      filters: { classLevel: '12th', division: 'A', groupId: '', search: '' },
      allClasses: ['11th', '12th'],
      allDivisions: ['A', 'B', 'C', 'D'],
      whatsappTemplate: 'Dear Parent, {student_name} ({roll_no}) update.'
    }
  },
  {
    name: 'admin/combine-result',
    data: {
      user: mockUser,
      currentUser: mockUser,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Combine Results',
      groups: [{ _id: 'g1', name: 'Batch A 2024' }],
      allTests: [
        { _id: 't1', title: 'Physics Test 1', subject: 'Physics', totalMarks: 100, createdAt: new Date() },
        { _id: 't2', title: 'Chemistry Test 1', subject: 'Chemistry', totalMarks: 100, createdAt: new Date() }
      ],
      selectedGroupId: 'g1',
      selectedTestIds: ['t1', 't2'],
      combinedData: {
        group: { _id: 'g1', name: 'Batch A 2024' },
        tests: [
          { _id: 't1', title: 'Physics Test 1', subject: 'Physics', totalMarks: 100 },
          { _id: 't2', title: 'Chemistry Test 1', subject: 'Chemistry', totalMarks: 100 }
        ],
        subjects: ['Physics', 'Chemistry'],
        totalMarksPossible: 200,
        totalStudents: 2,
        appearedCount: 2,
        absentCount: 0,
        averageCombinedPct: 75,
        studentRows: [
          {
            student: { _id: 's1', rollNo: '101', name: 'Student 1', classLevel: '12th', division: 'A' },
            rollNo: '101',
            name: 'Student 1',
            subjectMarks: { Physics: 85, Chemistry: 'A' },
            total: 85,
            percentage: 42.5,
            percentile: '50.00%',
            rank: 1,
            hasAbsent: true
          }
        ]
      }
    }
  },
  {
    name: 'admin/students',
    data: {
      user: mockUser,
      currentUser: mockUser,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Manage Students',
      students: [
        { id: 's1', name: 'Aarav Sharma', rollNo: '2024CE001', classLevel: '12th', division: 'A', phone: '9876543201', parentContact: '9876543201', createdAt: new Date() }
      ],
      groups: [{ _id: 'g1', name: 'Batch A 2024' }],
      whatsappTemplate: 'Dear Parent, {student_name} ({roll_no}) status.'
    }
  },
  {
    name: 'admin/tests',
    data: {
      user: mockUser,
      currentUser: mockUser,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Tests',
      view: 'draft',
      filterSubject: '',
      SUBJECTS: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
      tests: [
        { _id: 't1', title: 'Sample Draft Test', subject: 'Physics', totalMarks: 100, duration: 60, status: 'draft', questions: [{}], groups: [{}], createdAt: new Date() }
      ]
    }
  },
  {
    name: 'admin/test-detail',
    data: {
      user: mockUser,
      currentUser: mockUser,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Test Details',
      test: {
        id: 't1',
        _id: 't1',
        title: 'Sample Test',
        status: 'draft',
        duration: 60,
        totalMarks: 100,
        course: 'CET',
        subject: 'Physics',
        questions: [{ question: 'What is \\(x\\)?', correctAnswer: 'A', subject: 'Physics' }]
      },
      results: []
    }
  },
  {
    name: 'admin/questions',
    data: {
      user: mockUser,
      currentUser: mockUser,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Question Bank',
      questions: [],
      total: 0,
      totalPages: 1,
      currentPage: 1,
      filters: {},
      SUBJECTS: ['Physics', 'Chemistry', 'Mathematics', 'Biology']
    }
  },
  {
    name: 'admin/results',
    data: {
      user: mockUser,
      currentUser: mockUser,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Batch-wise Results',
      groups: [{ _id: 'g1', name: 'Batch A 2024' }],
      tests: [],
      selectedGroupId: '',
      selectedTestId: '',
      summary: { completed: 10, averagePct: 65.4, passCount: 8, topPct: 92.0 },
      isPcm: true,
      isPcb: false,
      results: [
        {
          id: 'res1',
          student: { name: 'Aarav Sharma', rollNo: '2024CE001', subject: 'PCM' },
          test: { title: 'CET Full Mock 1' },
          score: 165,
          totalMarks: 200,
          percentile: '98.50%',
          rank: 1,
          isAbsent: false,
          subjectScores: {
            Physics: { marks: 45, total: 50 },
            Chemistry: { marks: 40, total: 50 },
            Mathematics: { marks: 80, total: 100 },
          }
        },
        {
          id: 'absent_s2',
          student: { name: 'Neha Gupta', rollNo: '2024CE002', subject: 'PCB' },
          test: { title: 'CET Full Mock 1' },
          score: 0,
          totalMarks: 200,
          percentile: 'A',
          rank: '—',
          isAbsent: true,
          status: 'ABSENT',
          subjectScores: {
            Physics: { marks: 0, status: 'ABSENT' },
            Chemistry: { marks: 0, status: 'ABSENT' },
            Biology: { marks: 0, status: 'ABSENT' },
          }
        }
      ]
    }
  },
  {
    name: 'admin/upload-test',
    data: {
      user: mockUser,
      currentUser: mockUser,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      collegeLogo: '/spvn-logo.png',
      title: 'Upload Test',
      subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
      activeTab: 'upload',
      messages: {}
    }
  },
  {
    name: 'student/practice-attempt',
    data: {
      user: mockStudent,
      currentUser: mockStudent,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Practice Attempt',
      questions: [
        {
          _id: 'q1',
          question: 'Calculate force: $F = m \\times a$',
          optionA: 'Option 1',
          optionB: 'Option 2',
          optionC: 'Option 3',
          optionD: 'Option 4'
        }
      ],
      attempt: { _id: 'att1', answers: {}, subject: 'Physics' }
    }
  },
  {
    name: 'student/practice-result',
    data: {
      user: mockStudent,
      currentUser: mockStudent,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Practice Result',
      attempt: {
        _id: 'att1',
        subject: 'Physics',
        score: 4,
        answers: { 'q1': 'A' }
      },
      questions: [
        {
          _id: 'q1',
          question: 'What is energy? $E=mc^2$',
          optionA: 'Einstein',
          optionB: 'Newton',
          optionC: 'Bohr',
          optionD: 'Curie',
          correctAnswer: 'A',
          detailedSolution: 'Theory of Relativity.'
        }
      ]
    }
  },
  {
    name: 'exam/question',
    data: {
      user: mockStudent,
      currentUser: mockStudent,
      collegeShort: 'SPVN',
      collegeName: 'SPVN Institute',
      title: 'Q1 — Grand CET Mock Test',
      test: {
        id: 't1',
        _id: 't1',
        title: 'Grand CET Mock Test',
        totalMarks: 200,
        negativeMarking: 0,
        noTimeLimit: false,
        autoSubmitOnViolation: true,
        maxTabSwitches: 3,
        maxFocusLosses: 5,
        blockCopyPaste: true,
        requireFullscreen: false
      },
      question: {
        id: 'q1',
        _id: 'q1',
        question: 'If the slope is $m_1+m_2=-\\frac{2c}{7}$, find $c$?',
        subject: 'Physics',
        topic: 'Optics',
        difficulty: 'Medium',
        marks: 2,
        optionA: '1',
        optionB: '-1',
        optionC: '2',
        optionD: '-2',
        optionAImage: null,
        optionBImage: null,
        optionCImage: null,
        optionDImage: null
      },
      options: [
        { key: 'A', value: '1', image: null },
        { key: 'B', value: '-1', image: null },
        { key: 'C', value: '2', image: null },
        { key: 'D', value: '-2', image: null }
      ],
      questionNumber: 1,
      totalQuestions: 150,
      remaining: 5400,
      selectedAnswer: null,
      isMarked: false,
      violations: 0,
      cetSectionFlow: false,
      sectionQuestionNumber: 1,
      currentSection: {
        name: 'Physics',
        index: 0,
        questionIds: ['q1', 'q2'],
        questionNumbers: [1, 2]
      },
      sectionState: {
        sections: [
          { name: 'Physics', index: 0, questionIds: ['q1', 'q2'], questionNumbers: [1, 2], answeredCount: 1, totalQuestions: 50, locked: false },
          { name: 'Chemistry', index: 1, questionIds: ['q3', 'q4'], questionNumbers: [3, 4], answeredCount: 0, totalQuestions: 50, locked: false },
          { name: 'Mathematics', index: 2, questionIds: ['q5', 'q6'], questionNumbers: [5, 6], answeredCount: 0, totalQuestions: 50, locked: false }
        ]
      },
      paletteStatus: [
        { num: 1, qId: 'q1', status: 'not-visited', subject: 'Physics', locked: false },
        { num: 2, qId: 'q2', status: 'not-visited', subject: 'Physics', locked: false },
        { num: 3, qId: 'q3', status: 'not-visited', subject: 'Chemistry', locked: false },
        { num: 4, qId: 'q4', status: 'not-visited', subject: 'Chemistry', locked: false },
        { num: 5, qId: 'q5', status: 'not-visited', subject: 'Mathematics', locked: false },
        { num: 6, qId: 'q6', status: 'not-visited', subject: 'Mathematics', locked: false }
      ],
      result: {
        _id: 'r1',
        cheatingFlags: { tabSwitches: 0, fullscreenExits: 0, focusLosses: 0 }
      }
    }
  },
  {
    name: 'admin/dashboard',
    data: {
      title: 'Admin Dashboard',
      stats: { studentCount: 120, testCount: 15, groupCount: 4, questionCount: 450 },
      recentResults: [],
      recentUsers: [],
      COURSES: ['CET', 'NEET', 'JEE']
    }
  },
  {
    name: 'student/dashboard',
    data: {
      title: 'My Dashboard',
      pendingTests: [],
      completedResults: [],
      allResultsCount: 0,
      notifications: [],
      chartData: JSON.stringify({ labels: [], datasets: [] }),
      subjectStats: [],
      upcomingTest: null,
      bestResult: null,
      stats: { pending: 2, completed: 5, avgScore: 78, accuracy: 82, totalMarks: 100, earnedMarks: 78 }
    }
  },
  {
    name: 'auth/portal-select',
    data: {
      title: 'Choose Portal'
    }
  },
  {
    name: 'auth/login',
    data: {
      title: 'Student Login'
    }
  },
  {
    name: 'auth/admin-login',
    data: {
      title: 'Admin Login'
    }
  }
];

let allPassed = true;

const appLocals = {
  collegeLogo: '/spvn-logo.png',
  collegeShort: 'SPVN',
  collegeName: 'SPVN Institute',
  collegeAddress: 'Shardanagar, Baramati, Dist. Pune - 413115',
  academicYear: '2026-2027',
  currentUser: mockUser,
  user: mockUser,
  topicRows: [],
  subtopicRows: [],
  subtopicList: [],
  groups: [],
  requestPath: '/',
  messages: { success: [], error: [], info: [] }
};

for (const t of testsToRender) {
  const filePath = path.join(viewsDir, `${t.name}.ejs`);
  try {
    const template = fs.readFileSync(filePath, 'utf8');
    const html = ejs.render(template, {
      ...appLocals,
      ...t.data,
      filename: filePath,
    });
    console.log(`✓ Render success: ${t.name} (Output size: ${html.length} chars)`);
  } catch (err) {
    allPassed = false;
    console.error(`✗ Render failed: ${t.name}`, err.message);
  }
}

if (!allPassed) process.exit(1);
console.log('\nAll key view rendering tests succeeded.');
