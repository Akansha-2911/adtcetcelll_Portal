// routes/student.js

const express = require('express');

const router = express.Router();

const sc = require('../controllers/studentController');

const {
  isAuthenticated,
  requireRole,
  requirePasswordChange
} = require('../middleware/auth');


const guard = [
  isAuthenticated,
  requirePasswordChange,
  requireRole('student')
];


/* =========================================================
   DASHBOARD
========================================================= */

router.get(
  '/dashboard',
  ...guard,
  sc.getDashboard
);


/* =========================================================
   OFFICIAL TESTS
========================================================= */

router.get(
  '/tests',
  ...guard,
  sc.getTests
);


/* =========================================================
   OFFICIAL RESULTS
========================================================= */

router.get(
  '/results',
  ...guard,
  sc.getResults
);


/* =========================================================
   NOTIFICATIONS
========================================================= */

router.get(
  '/notifications',
  ...guard,
  sc.getNotifications
);


/* =========================================================
   DOCUMENTS
========================================================= */

router.get(
  '/documents',
  ...guard,
  sc.getDocuments
);


router.post(
  '/documents',
  ...guard,
  sc.uploadDocument
);


/* =========================================================
   STUDENT SELF PRACTICE TEST
========================================================= */


/*
|--------------------------------------------------------------------------
| PRACTICE BUILDER
|--------------------------------------------------------------------------
|
| Student selects:
|
| Subject
| Topic
| Subtopic optional
| Difficulty
| No. of Questions
|
*/

router.get(
  '/practice',
  ...guard,
  sc.getPracticeBuilder
);


/*
|--------------------------------------------------------------------------
| LOAD TOPICS BY SUBJECT
|--------------------------------------------------------------------------
|
| Example:
|
| /student/practice/topics?subject=Physics
|
*/

router.get(
  '/practice/topics',
  ...guard,
  sc.getPracticeTopics
);


/*
|--------------------------------------------------------------------------
| LOAD SUBTOPICS BY SUBJECT + TOPIC
|--------------------------------------------------------------------------
|
| Example:
|
| /student/practice/subtopics
| ?subject=Physics
| &topic=Current Electricity
|
*/

router.get(
  '/practice/subtopics',
  ...guard,
  sc.getPracticeSubtopics
);


/*
|--------------------------------------------------------------------------
| GET AVAILABLE QUESTION COUNT
|--------------------------------------------------------------------------
|
| Used by Practice Builder to show:
|
| "34 questions available"
|
*/

router.get(
  '/practice/count',
  ...guard,
  sc.getPracticeQuestionCount
);


/*
|--------------------------------------------------------------------------
| CREATE RANDOM PRACTICE TEST
|--------------------------------------------------------------------------
|
| Questions are randomly selected from Question Bank.
|
*/

router.post(
  '/practice/start',
  ...guard,
  sc.startPracticeTest
);


/*
|--------------------------------------------------------------------------
| OPEN PRACTICE ATTEMPT
|--------------------------------------------------------------------------
*/

router.get(
  '/practice/:attemptId',
  ...guard,
  sc.getPracticeAttempt
);


/*
|--------------------------------------------------------------------------
| SUBMIT PRACTICE TEST
|--------------------------------------------------------------------------
*/

router.post(
  '/practice/:attemptId/submit',
  ...guard,
  sc.submitPracticeTest
);


/*
|--------------------------------------------------------------------------
| PRACTICE RESULT
|--------------------------------------------------------------------------
*/

router.get(
  '/practice/:attemptId/result',
  ...guard,
  sc.getPracticeResult
);


module.exports = router;