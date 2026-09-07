const express = require('express');

const router = express.Router();

const ec = require('../controllers/examController');

const {
  isAuthenticated,
  requirePasswordChange,
  requireRole
} = require('../middleware/auth');


const guard = [
  isAuthenticated,
  requirePasswordChange,
  requireRole('student')
];


/* =========================================================
   INSTRUCTIONS
========================================================= */

router.get(
  '/:testId/instructions',
  ...guard,
  ec.getInstructions
);


/* =========================================================
   START EXAM
========================================================= */

router.post(
  '/:testId/start',
  ...guard,
  ec.startExam
);


/* =========================================================
   QUESTION
========================================================= */

router.get(
  '/:testId/question/:qNum',
  ...guard,
  ec.getQuestion
);


/* =========================================================
   SAVE ANSWER
========================================================= */

router.post(
  '/:testId/save-answer',
  ...guard,
  ec.saveAnswer
);


/* =========================================================
   SUBMIT PHYSICS + CHEMISTRY SECTION
========================================================= */

router.post(
  '/:testId/submit-section',
  ...guard,
  ec.submitSection
);


/* =========================================================
   REPORT VIOLATION
========================================================= */

router.post(
  '/:testId/report-violation',
  ...guard,
  ec.reportViolation
);


/* =========================================================
   FINAL SUBMIT
========================================================= */

router.post(
  '/:testId/submit',
  ...guard,
  ec.submitExam
);


/* =========================================================
   AUTO SUBMIT
========================================================= */

router.get(
  '/:testId/auto-submit',
  ...guard,
  ec.autoSubmit
);


/* =========================================================
   LEAVE / REFRESH SAVE
========================================================= */

router.post(
  '/:testId/leave',
  ...guard,
  ec.leaveExam
);


module.exports = router;