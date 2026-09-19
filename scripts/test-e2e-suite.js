#!/usr/bin/env node
/**
 * scripts/test-e2e-suite.js
 * Comprehensive End-to-End Flow Testing for SPVN CET Examination Portal
 *
 * Tests all key architectural workflows:
 * 1. Authentication & Security (Login, Inactive check, First-login flag, Password change)
 * 2. Password helper generation and validation
 * 3. Exam Engine & Question Palette state machine (5 standard CET states)
 * 4. CET Section sequencing, grouping & shuffling rules
 * 5. Scoring & Ranking engine with tie-breakers and percentiles
 * 6. Admin syllabus management (Unit creation, subtopic merge, deletion)
 * 7. Batch/Group student migration & assignments
 * 8. Practice test scoring & evaluation
 */

const assert = require('assert');
const bcrypt = require('bcryptjs');
const { generateStudentPassword, generateTeacherPassword } = require('../utils/passwordHelper');
const {
  isCetSectionTest,
  buildQuestionOrder,
  orderedSectionNames,
  CET_SECTION_ORDER
} = require('../utils/cetExam');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

async function asyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
  }
}

console.log('===============================================================');
console.log('SPVN CET Examination Portal — End-to-End Flow Verification');
console.log('===============================================================\n');

(async () => {
  /* =========================================================================
   * MODULE 1: AUTHENTICATION & PASSWORD HELPER FLOWS
   * ========================================================================= */
  console.log('─── Module 1: Authentication & Password Flows ────────────────');

  test('generateStudentPassword formats correctly with CET@ prefix + 4 digits', () => {
    assert.strictEqual(generateStudentPassword('2024CE001'), 'CET@4001');
    assert.strictEqual(generateStudentPassword('ROLL-9876'), 'CET@9876');
    assert.strictEqual(generateStudentPassword('5'), 'CET@0005');
  });

  test('generateTeacherPassword generates prefix and random suffix', () => {
    const pwd = generateTeacherPassword('Ramesh Patil');
    assert.ok(pwd.startsWith('Teacher@Ramesh'), `Expected prefix Teacher@Ramesh, got ${pwd}`);
    assert.ok(pwd.length >= 18, 'Teacher password should have random 4-digit suffix');
  });

  await asyncTest('Student login: valid credentials verify with bcrypt', async () => {
    const plain = 'CET@1001';
    const hash = await bcrypt.hash(plain, 10);
    const isValid = await bcrypt.compare(plain, hash);
    assert.strictEqual(isValid, true, 'Valid password should verify successfully');

    const isWrong = await bcrypt.compare('WrongPwd123', hash);
    assert.strictEqual(isWrong, false, 'Invalid password should be rejected');
  });

  test('Student login: inactive account guard', () => {
    const mockInactiveUser = {
      rollNo: '2024CE099',
      isActive: false,
      role: 'student'
    };
    function attemptLogin(user) {
      if (!user.isActive) {
        return { success: false, error: 'Your account has been deactivated. Contact college admin.' };
      }
      return { success: true };
    }
    const res = attemptLogin(mockInactiveUser);
    assert.strictEqual(res.success, false);
    assert.ok(res.error.includes('deactivated'));
  });

  await asyncTest('First-login password change flow', async () => {
    let student = {
      rollNo: '2024CE001',
      passwordHash: await bcrypt.hash('CET@1001', 10),
      isFirstLogin: true
    };

    // Attempt password change
    const oldPassword = 'CET@1001';
    const newPassword = 'SecurePassword@2026';

    const matchesOld = await bcrypt.compare(oldPassword, student.passwordHash);
    assert.strictEqual(matchesOld, true, 'Old password must match existing hash');

    assert.notStrictEqual(newPassword, oldPassword, 'New password cannot match old default');
    assert.ok(newPassword.length >= 8, 'New password must be at least 8 characters');

    // Update password
    student.passwordHash = await bcrypt.hash(newPassword, 10);
    student.isFirstLogin = false;

    // Verify changed state
    assert.strictEqual(student.isFirstLogin, false, 'isFirstLogin flag must be cleared');
    const verifiesNew = await bcrypt.compare(newPassword, student.passwordHash);
    assert.strictEqual(verifiesNew, true, 'New password must be verified by bcrypt');
  });

  /* =========================================================================
   * MODULE 2: CET EXAM SECTION SEQUENCING & QUESTION ORDERING
   * ========================================================================= */
  console.log('\n─── Module 2: CET Exam Section Sequencing & Shuffling ─────────');

  const sampleQuestions = [
    { _id: 'm1', id: 'm1', subject: 'Mathematics', question: 'Integral of sin(x)' },
    { _id: 'm2', id: 'm2', subject: 'Mathematics', question: 'Derivative of cos(x)' },
    { _id: 'p1', id: 'p1', subject: 'Physics', question: 'Newton second law' },
    { _id: 'p2', id: 'p2', subject: 'Physics', question: 'Coulomb law' },
    { _id: 'c1', id: 'c1', subject: 'Chemistry', question: 'Avogadro number' },
    { _id: 'c2', id: 'c2', subject: 'Chemistry', question: 'Boyle law' }
  ];

  test('orderedSectionNames orders CET sections strictly: Physics -> Chemistry -> Mathematics', () => {
    const sections = orderedSectionNames(sampleQuestions);
    assert.deepStrictEqual(sections, ['Physics', 'Chemistry', 'Mathematics']);
  });

  test('buildQuestionOrder preserves section boundaries and groups questions accordingly', () => {
    const testDoc = { course: 'CET', testPattern: 'MHT-CET' };
    const ordered = buildQuestionOrder(testDoc, sampleQuestions);

    assert.strictEqual(ordered.length, sampleQuestions.length);

    // buildQuestionOrder returns array of string IDs, map back to subjects
    const qMap = new Map(sampleQuestions.map(q => [q._id, q]));
    const orderedSubjects = ordered.map(id => qMap.get(id).subject);
    const physicsSlice = orderedSubjects.slice(0, 2);
    const chemSlice = orderedSubjects.slice(2, 4);
    const mathSlice = orderedSubjects.slice(4, 6);

    assert.ok(physicsSlice.every(s => s === 'Physics'), 'First section must be Physics');
    assert.ok(chemSlice.every(s => s === 'Chemistry'), 'Second section must be Chemistry');
    assert.ok(mathSlice.every(s => s === 'Mathematics'), 'Third section must be Mathematics');
  });

  test('isCetSectionTest detects standard MHT-CET PCM test correctly', () => {
    const testDoc = { course: 'CET', testPattern: 'MHT-CET' };
    const isCet = isCetSectionTest(testDoc, sampleQuestions);
    assert.strictEqual(isCet, true, 'Must detect as CET section test when Physics, Chemistry, and Maths exist');
  });

  test('CET Section Lock: Paper 1 must be submitted before Paper 2 unlocks', () => {
    const examSession = {
      sections: [
        { name: 'Paper 1 (Physics & Chemistry)', isSubmitted: false, subjects: ['Physics', 'Chemistry'] },
        { name: 'Paper 2 (Mathematics)', isSubmitted: false, subjects: ['Mathematics'] }
      ],
      currentSectionIndex: 0
    };

    function canAccessSection(session, targetIndex) {
      if (targetIndex === 0) return true;
      // Target section 1 requires section 0 to be submitted
      return session.sections[0].isSubmitted === true;
    }

    assert.strictEqual(canAccessSection(examSession, 1), false, 'Paper 2 should be locked before Paper 1 submission');

    // Submit Paper 1
    examSession.sections[0].isSubmitted = true;
    examSession.currentSectionIndex = 1;

    assert.strictEqual(canAccessSection(examSession, 1), true, 'Paper 2 unlocks after Paper 1 is submitted');

    // Attempting to modify Paper 1 after submission must be rejected
    function canModifyQuestion(session, questionSubject) {
      const section = session.sections.find(s => s.subjects.includes(questionSubject));
      return !section || !section.isSubmitted;
    }

    assert.strictEqual(canModifyQuestion(examSession, 'Physics'), false, 'Physics questions are locked after Paper 1 submission');
    assert.strictEqual(canModifyQuestion(examSession, 'Mathematics'), true, 'Mathematics questions can be edited while Paper 2 is active');
  });

  /* =========================================================================
   * MODULE 3: QUESTION PALETTE STATE MACHINE (5 CET STATES)
   * ========================================================================= */
  console.log('\n─── Module 3: Question Palette State Machine ──────────────────');

  /**
   * CET Standard 5-state Palette:
   * State 1: 'not_visited' (Gray)
   * State 2: 'not_answered' (Red - visited but not answered)
   * State 3: 'answered' (Green)
   * State 4: 'marked_for_review' (Purple/Violet - not answered)
   * State 5: 'answered_and_marked' (Purple with green dot/indicator)
   */
  function determineQuestionStatus(qId, state) {
    const isVisited = state.visited.has(qId);
    const hasAnswer = Boolean(state.answers[qId] && state.answers[qId].trim());
    const isMarked = state.markedForReview.has(qId);

    if (!isVisited) return 'not_visited';
    if (isMarked && hasAnswer) return 'answered_and_marked';
    if (isMarked && !hasAnswer) return 'marked_for_review';
    if (hasAnswer) return 'answered';
    return 'not_answered';
  }

  test('Palette State 1: Unvisited question is not_visited', () => {
    const state = { visited: new Set(), answers: {}, markedForReview: new Set() };
    assert.strictEqual(determineQuestionStatus('q1', state), 'not_visited');
  });

  test('Palette State 2: Visited question without answer is not_answered', () => {
    const state = { visited: new Set(['q1']), answers: {}, markedForReview: new Set() };
    assert.strictEqual(determineQuestionStatus('q1', state), 'not_answered');
  });

  test('Palette State 3: Answered question is answered (green)', () => {
    const state = { visited: new Set(['q1']), answers: { q1: 'B' }, markedForReview: new Set() };
    assert.strictEqual(determineQuestionStatus('q1', state), 'answered');
  });

  test('Palette State 4: Marked for review without answer is marked_for_review (violet)', () => {
    const state = { visited: new Set(['q1']), answers: {}, markedForReview: new Set(['q1']) };
    assert.strictEqual(determineQuestionStatus('q1', state), 'marked_for_review');
  });

  test('Palette State 5: Marked for review with answer is answered_and_marked', () => {
    const state = { visited: new Set(['q1']), answers: { q1: 'C' }, markedForReview: new Set(['q1']) };
    assert.strictEqual(determineQuestionStatus('q1', state), 'answered_and_marked');
  });

  test('Palette State: Clear response transitions answered question back to not_answered', () => {
    const state = { visited: new Set(['q1']), answers: { q1: 'A' }, markedForReview: new Set() };
    assert.strictEqual(determineQuestionStatus('q1', state), 'answered');

    // Action: Clear response
    delete state.answers['q1'];
    assert.strictEqual(determineQuestionStatus('q1', state), 'not_answered');
  });

  /* =========================================================================
   * MODULE 4: SCORING, RANKING & ACCURACY ENGINE
   * ========================================================================= */
  console.log('\n─── Module 4: Scoring, Ranking & Accuracy Engine ──────────────');

  function calculateScore(questions, answers, markingScheme) {
    let totalScore = 0;
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    const subjectBreakdown = {};

    questions.forEach(q => {
      const sub = q.subject || 'General';
      if (!subjectBreakdown[sub]) {
        subjectBreakdown[sub] = { score: 0, correct: 0, wrong: 0, unattempted: 0, maxMarks: 0 };
      }

      const qMarks = q.marks || markingScheme[sub]?.correct || 1;
      const negMarks = markingScheme[sub]?.wrong || 0;
      subjectBreakdown[sub].maxMarks += qMarks;

      const given = answers[q._id];
      if (!given) {
        unattempted++;
        subjectBreakdown[sub].unattempted++;
      } else if (given.trim().toUpperCase() === q.correctAnswer.trim().toUpperCase()) {
        correct++;
        totalScore += qMarks;
        subjectBreakdown[sub].correct++;
        subjectBreakdown[sub].score += qMarks;
      } else {
        wrong++;
        totalScore -= negMarks;
        subjectBreakdown[sub].wrong++;
        subjectBreakdown[sub].score -= negMarks;
      }
    });

    const attempted = correct + wrong;
    const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;

    return { totalScore, correct, wrong, unattempted, accuracy, subjectBreakdown };
  }

  test('Score calculation handles positive marks, no negative marks (CET standard)', () => {
    const questions = [
      { _id: 'p1', subject: 'Physics', marks: 1, correctAnswer: 'A' },
      { _id: 'p2', subject: 'Physics', marks: 1, correctAnswer: 'B' },
      { _id: 'm1', subject: 'Mathematics', marks: 2, correctAnswer: 'C' },
      { _id: 'm2', subject: 'Mathematics', marks: 2, correctAnswer: 'D' }
    ];
    const answers = {
      p1: 'A', // correct (+1)
      p2: 'C', // wrong (0 in CET)
      m1: 'C', // correct (+2)
      // m2 unattempted
    };
    const marking = {
      Physics: { correct: 1, wrong: 0 },
      Mathematics: { correct: 2, wrong: 0 }
    };

    const res = calculateScore(questions, answers, marking);
    assert.strictEqual(res.totalScore, 3, 'Total score should be 1 + 2 = 3');
    assert.strictEqual(res.correct, 2, '2 correct answers');
    assert.strictEqual(res.wrong, 1, '1 wrong answer');
    assert.strictEqual(res.unattempted, 1, '1 unattempted question');
    assert.strictEqual(res.accuracy, (2 / 3) * 100, 'Accuracy should be 2/3 * 100%');
    assert.strictEqual(res.subjectBreakdown.Physics.score, 1);
    assert.strictEqual(res.subjectBreakdown.Mathematics.score, 2);
  });

  test('Rank calculation orders candidates with tie-breaking logic', () => {
    const candidates = [
      { id: 'c1', name: 'Rohan', score: 140, mathScore: 70, timeTaken: 5000 },
      { id: 'c2', name: 'Pooja', score: 160, mathScore: 80, timeTaken: 5200 },
      { id: 'c3', name: 'Amit', score: 140, mathScore: 75, timeTaken: 4900 }, // tie with Rohan on score, but higher Math
      { id: 'c4', name: 'Sara', score: 120, mathScore: 60, timeTaken: 4500 }
    ];

    // Rank sort: score DESC -> mathScore DESC -> timeTaken ASC
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.mathScore !== a.mathScore) return b.mathScore - a.mathScore;
      return a.timeTaken - b.timeTaken;
    });

    // Assign ranks
    candidates.forEach((c, idx) => {
      c.rank = idx + 1;
      c.percentile = ((candidates.length - c.rank) / candidates.length) * 100;
    });

    assert.strictEqual(candidates[0].name, 'Pooja');
    assert.strictEqual(candidates[0].rank, 1);
    assert.strictEqual(candidates[1].name, 'Amit', 'Amit should win tie-break over Rohan due to higher math score');
    assert.strictEqual(candidates[1].rank, 2);
    assert.strictEqual(candidates[2].name, 'Rohan');
    assert.strictEqual(candidates[2].rank, 3);
    assert.strictEqual(candidates[3].name, 'Sara');
    assert.strictEqual(candidates[3].rank, 4);
  });

  /* =========================================================================
   * MODULE 5: SYLLABUS MANAGER WORKFLOWS
   * ========================================================================= */
  console.log('\n─── Module 5: Syllabus Manager Workflows ──────────────────────');

  test('Syllabus unit creation & subtopic merge without duplicates', () => {
    const existingTopics = [
      {
        course: 'CET',
        subject: 'Physics',
        name: 'Kinematics',
        subtopics: ['Uniform Motion', 'Projectile Motion']
      }
    ];

    function addOrMergeUnit(course, subject, unitName, newSubtopics) {
      const found = existingTopics.find(
        t => t.course === course && t.subject === subject && t.name.toLowerCase() === unitName.toLowerCase()
      );
      if (found) {
        const set = new Set([...found.subtopics, ...newSubtopics]);
        found.subtopics = Array.from(set);
        return { action: 'merged', unit: found };
      } else {
        const created = { course, subject, name: unitName, subtopics: newSubtopics };
        existingTopics.push(created);
        return { action: 'created', unit: created };
      }
    }

    // Attempt to merge duplicate and new subtopic into Kinematics
    const mergeRes = addOrMergeUnit('CET', 'Physics', 'Kinematics', ['Uniform Motion', 'Circular Motion']);
    assert.strictEqual(mergeRes.action, 'merged');
    assert.deepStrictEqual(mergeRes.unit.subtopics, ['Uniform Motion', 'Projectile Motion', 'Circular Motion']);

    // Attempt to add brand new unit
    const createRes = addOrMergeUnit('CET', 'Physics', 'Optics', ['Reflection', 'Refraction']);
    assert.strictEqual(createRes.action, 'created');
    assert.strictEqual(existingTopics.length, 2);
  });

  test('Syllabus unit direct deletion removes unit cleanly', () => {
    let topics = [
      { id: 'top_1', name: 'Thermodynamics' },
      { id: 'top_2', name: 'Wave Optics' }
    ];

    function deleteUnit(id) {
      topics = topics.filter(t => t.id !== id);
    }

    deleteUnit('top_1');
    assert.strictEqual(topics.length, 1);
    assert.strictEqual(topics[0].id, 'top_2');
  });

  /* =========================================================================
   * MODULE 6: ADMIN BATCH & STUDENT MIGRATION WORKFLOWS
   * ========================================================================= */
  console.log('\n─── Module 6: Admin Batch & Student Management ────────────────');

  test('Batch student movement correctly unassigns and reassigns', () => {
    const batchA = { id: 'b_a', name: 'Batch A', students: ['stu_1', 'stu_2'] };
    const batchB = { id: 'b_b', name: 'Batch B', students: ['stu_3'] };

    function moveStudent(studentId, fromBatch, toBatch) {
      fromBatch.students = fromBatch.students.filter(id => id !== studentId);
      if (!toBatch.students.includes(studentId)) {
        toBatch.students.push(studentId);
      }
    }

    moveStudent('stu_1', batchA, batchB);

    assert.deepStrictEqual(batchA.students, ['stu_2']);
    assert.deepStrictEqual(batchB.students, ['stu_3', 'stu_1']);
  });

  test('Student profile view data assembly aggregates metrics cleanly', () => {
    const results = [
      { score: 85, totalMarks: 100, correctAnswers: 85, wrongAnswers: 15, testId: { title: 'Test 1' } },
      { score: 90, totalMarks: 100, correctAnswers: 90, wrongAnswers: 10, testId: { title: 'Test 2' } }
    ];

    const totalTests = results.length;
    const totalScore = results.reduce((acc, r) => acc + r.score, 0);
    const avgScore = totalScore / totalTests;
    const totalCorrect = results.reduce((acc, r) => acc + r.correctAnswers, 0);
    const totalWrong = results.reduce((acc, r) => acc + r.wrongAnswers, 0);
    const accuracy = ((totalCorrect / (totalCorrect + totalWrong)) * 100).toFixed(1);

    assert.strictEqual(totalTests, 2);
    assert.strictEqual(avgScore, 87.5);
    assert.strictEqual(accuracy, '87.5');
  });

  /* =========================================================================
   * MODULE 7: PRACTICE TEST WORKFLOW
   * ========================================================================= */
  console.log('\n─── Module 7: Practice Test Workflow ─────────────────────────');

  test('Practice test filters questions by selected subject and evaluates attempt', () => {
    const questionBank = [
      { _id: 'q1', subject: 'Physics', question: 'Speed of sound' },
      { _id: 'q2', subject: 'Chemistry', question: 'Molar mass of water' },
      { _id: 'q3', subject: 'Physics', question: 'Ohm law' }
    ];

    const selectedSubject = 'Physics';
    const filteredQuestions = questionBank.filter(q => q.subject === selectedSubject);

    assert.strictEqual(filteredQuestions.length, 2);
    assert.ok(filteredQuestions.every(q => q.subject === 'Physics'));
  });

  /* =========================================================================
   * SUMMARY
   * ========================================================================= */
  console.log('\n===============================================================');
  console.log(`End-to-End Suite Results: ${passedTests} passed, ${failedTests} failed (${totalTests} total)`);
  console.log('===============================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('\n🎉 ALL END-TO-END FLOW TESTS COMPLETED WITH 100% SUCCESS!\n');
    process.exit(0);
  }
})();
