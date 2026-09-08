// controllers/examController.js — MongoDB / Mongoose

const {
  Test,
  Question,
  Result,
  GroupMember,
  User
} = require('../models');

const {
  CET_SECTION_ORDER,
  CET_PREREQUISITE_SUBJECTS,
  buildQuestionOrder,
  buildSectionState,
  isCetSectionTest,
  orderedSectionNames,
  isPhase1Subject,
  isFinalSubject
} = require('../utils/cetExam');


const shuffle = arr => {

  const a = [...arr];

  for (
    let i = a.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() *
        (i + 1)
      );

    [
      a[i],
      a[j]
    ] = [
      a[j],
      a[i]
    ];

  }

  return a;

};


/* ==========================================================================
   CHECK STUDENT ACCESS
============================================================================ */

async function studentCanAccessTest(
  studentId,
  test
) {

  if (
    !test ||
    !studentId
  ) {
    return false;
  }


  const assignedGroupIds =
    (test.groups || [])
      .map(
        value =>
          String(
            value?._id ||
            value
          )
      );


  if (
    !assignedGroupIds.length
  ) {
    return false;
  }


  const membership =
    await GroupMember.findOne({

      userId:
        studentId,

      role:
        'student',

      groupId: {
        $in:
          assignedGroupIds
      }

    })
      .select('_id');


  return Boolean(
    membership
  );

}


/* ==========================================================================
   TEST WINDOW
============================================================================ */

function testWindowState(
  test,
  now = new Date()
) {

  if (
    test?.startTime &&
    new Date(
      test.startTime
    ) > now
  ) {

    return 'upcoming';

  }


  if (
    test?.endTime &&
    new Date(
      test.endTime
    ) < now
  ) {

    return 'ended';

  }


  return 'open';

}


/* ==========================================================================
   REMAINING TIME
============================================================================ */

function effectiveRemainingSeconds(
  test,
  result,
  nowMs = Date.now()
) {

  if (
    !result?.startedAt
  ) {

    return 0;

  }


  let remaining =
    test.noTimeLimit
      ? Number.MAX_SAFE_INTEGER
      : Math.max(
          0,
          Math.floor(
            (
              Number(
                test.duration || 0
              ) *
              60 *
              1000 -
              (
                nowMs -
                new Date(
                  result.startedAt
                ).getTime()
              )
            ) /
            1000
          )
        );


  if (
    test.endTime
  ) {

    const untilScheduledEnd =
      Math.max(
        0,
        Math.floor(
          (
            new Date(
              test.endTime
            ).getTime() -
            nowMs
          ) /
          1000
        )
      );


    remaining =
      Math.min(
        remaining,
        untilScheduledEnd
      );

  }


  return remaining;

}


/* ==========================================================================
   INSTRUCTIONS
============================================================================ */

exports.getInstructions = async (
  req,
  res
) => {

  try {

    const studentId =
      req.session.user.id;


    const {
      testId
    } = req.params;


    const [
      test,
      submitted,
      inProgress
    ] =
      await Promise.all([

        Test.findOne({

          _id:
            testId,

          status: {
            $in: [
              'published',
              'active'
            ]
          },

          isActive: {
            $ne: false
          }

        })
          .populate(
            'questions'
          )
          .populate(
            'groups',
            'name'
          ),


        Result.findOne({

          studentId,

          testId,

          status: {
            $in: [
              'submitted',
              'auto_submitted'
            ]
          }

        }),


        Result.findOne({

          studentId,

          testId,

          status:
            'in_progress'

        })

      ]);


    if (!test) {

      req.flash(
        'error',
        'Test not available.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    if (
      !(
        await studentCanAccessTest(
          studentId,
          test
        )
      )
    ) {

      req.flash(
        'error',
        'This test is not assigned to your batch.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    const windowState =
      testWindowState(
        test
      );


    if (
      windowState ===
      'upcoming'
    ) {

      req.flash(
        'info',
        'This test has not started yet.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    if (
      windowState ===
        'ended' &&
      !inProgress
    ) {

      req.flash(
        'info',
        'This test has ended.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    if (
      submitted
    ) {

      req.flash(
        'info',
        'Already submitted.'
      );

      return res.redirect(
        `/results/${submitted._id}`
      );

    }


    const cetSectionFlow =
      isCetSectionTest(
        test,
        test.questions
      );


    const sectionSummary =
      orderedSectionNames(
        test.questions
      )
        .map(
          subject => {

            const questions =
              test.questions.filter(
                question => {
                  const s = String(question.subject || '').trim().toLowerCase();
                  if (subject === 'Physics') return s === 'physics' || s === 'phy';
                  if (subject === 'Chemistry') return s === 'chemistry' || s === 'chem';
                  if (subject === 'Mathematics') return s === 'mathematics' || s === 'maths' || s === 'math';
                  if (subject === 'Biology') return s === 'biology' || s === 'bio';
                  return question.subject === subject;
                }
              );


            return {

              subject,

              questionCount:
                questions.length,

              totalMarks:
                questions.reduce(
                  (
                    sum,
                    question
                  ) =>
                    sum +
                    Number(
                      question.marks ||
                      0
                    ),
                  0
                )

            };

          }
        );


    return res.render(
      'exam/instructions',
      {

        title:
          `${test.title} — Instructions`,

        test,

        questionCount:
          test.questions.length,

        inProgress:
          !!inProgress,

        cetSectionFlow,

        sectionSummary

      }
    );


  } catch (e) {

    console.error(
      e
    );

    req.flash(
      'error',
      'Failed.'
    );

    return res.redirect(
      '/student/tests'
    );

  }

};


/* ==========================================================================
   START EXAM
============================================================================ */

exports.startExam = async (
  req,
  res
) => {

  try {

    const studentId =
      req.session.user.id;


    const {
      testId
    } = req.params;


    const [
      test,
      submitted
    ] =
      await Promise.all([

        Test.findOne({

          _id:
            testId,

          status: {
            $in: [
              'published',
              'active'
            ]
          },

          isActive: {
            $ne: false
          }

        })
          .populate(
            'questions',
            '_id subject'
          )
          .populate(
            'groups',
            'name'
          ),


        Result.findOne({

          studentId,

          testId,

          status: {
            $in: [
              'submitted',
              'auto_submitted'
            ]
          }

        })

      ]);


    if (!test) {

      req.flash(
        'error',
        'Test not available.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    if (
      !(
        await studentCanAccessTest(
          studentId,
          test
        )
      )
    ) {

      req.flash(
        'error',
        'This test is not assigned to your batch.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    const windowState =
      testWindowState(
        test
      );


    if (
      windowState ===
      'upcoming'
    ) {

      req.flash(
        'info',
        'This test has not started yet.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    if (
      windowState ===
      'ended'
    ) {

      req.flash(
        'info',
        'This test has ended.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    if (
      submitted
    ) {

      req.flash(
        'info',
        'Already submitted.'
      );

      return res.redirect(
        `/results/${submitted._id}`
      );

    }


    let result =
      await Result.findOne({

        studentId,

        testId,

        status:
          'in_progress'

      });


    if (
      !result &&
      test.testPassword &&
      String(
        req.body.testPassword ||
        ''
      ) !==
      String(
        test.testPassword
      )
    ) {

      req.flash(
        'error',
        'Invalid test password.'
      );


      return res.redirect(
        `/exam/${testId}/instructions`
      );

    }


    if (!result) {

      const questionIds =
        buildQuestionOrder(
          test,
          test.questions
        );


      result =
        await Result.create({

          studentId,

          testId,

          score:
            0,

          totalMarks:
            test.totalMarks,

          fullTotalMarks:
            test.totalMarks,

          answers:
            {},

          questionTimings:
            {},

          cheatingFlags: {

            tabSwitches:
              0,

            fullscreenExits:
              0,

            focusLosses:
              0

          },

          violationCount:
            0,

          status:
            'in_progress',

          startedAt:
            new Date(),

          questionOrder:
            questionIds,

          markedForReview:
            [],

          visitedQuestionIds:
            [],

          section1Submitted:
            false,

          section1SubmittedAt:
            null,

          finalSectionUnlocked:
            false,

          currentExamPhase:
            'phase1'

        });

    }


    return res.redirect(
      `/exam/${testId}/question/1`
    );


  } catch (e) {

    console.error(
      e
    );

    req.flash(
      'error',
      'Failed to start.'
    );

    return res.redirect(
      '/student/tests'
    );

  }

};


/* ==========================================================================
   GET QUESTION
============================================================================ */

exports.getQuestion = async (
  req,
  res
) => {

  try {

    const studentId =
      req.session.user.id;


    const {
      testId,
      qNum
    } = req.params;


    const questionNumber =
      parseInt(
        qNum,
        10
      );


    const [
      result,
      test
    ] =
      await Promise.all([

        Result.findOne({

          studentId,

          testId,

          status:
            'in_progress'

        }),


        Test.findById(
          testId
        )
          .populate(
            'groups',
            'name'
          )

      ]);


    if (!result) {

      const submitted =
        await Result.findOne({

          studentId,

          testId,

          status: {
            $in: [
              'submitted',
              'auto_submitted'
            ]
          }

        });


      if (
        submitted
      ) {

        return res.redirect(
          `/results/${submitted._id}`
        );

      }


      return res.redirect(
        `/exam/${testId}/instructions`
      );

    }


    if (!test) {

      req.flash(
        'error',
        'Test not found.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    if (
      test.status ===
      'closed'
    ) {

      req.body = {
        auto: 'true'
      };

      return exports.submitExam(
        req,
        res
      );

    }


    const remaining =
      effectiveRemainingSeconds(
        test,
        result
      );


    if (
      remaining <= 0
    ) {

      req.body = {
        auto: 'true'
      };

      return exports.submitExam(
        req,
        res
      );

    }


    const questionIds =
      result.questionOrder || [];


    const totalQuestions =
      questionIds.length;


    if (
      questionNumber < 1 ||
      questionNumber > totalQuestions
    ) {

      return res.redirect(
        `/exam/${testId}/question/1`
      );

    }


    const questionRows =
      await Question.find(

        {
          _id: {
            $in:
              questionIds
          }
        },

        '_id subject'

      );


    const cetSectionFlow =
      isCetSectionTest(
        test,
        questionRows
      );


    const sectionState =
      buildSectionState(
        questionIds,
        questionRows,
        result.answers ||
          {},
        result.visitedQuestionIds ||
          [],
        result,
        cetSectionFlow
      );


    const currentQuestionId =
      questionIds[
        questionNumber - 1
      ];


    const requestedSubject =
      sectionState
        ?.subjectById
        .get(
          String(
            currentQuestionId
          )
        );


    const requestedSection =
      sectionState
        ?.sections
        .find(
          section =>
            section.name ===
            requestedSubject
        );


    /*
     * SERVER SIDE SECTION LOCK
     *
     * Before Phase 1 submission:
     * Physics/Chemistry = open
     * Mathematics/Biology = locked
     *
     * After Phase 1 submission:
     * Physics/Chemistry = locked
     * Mathematics/Biology = open
     */

    if (
      cetSectionFlow &&
      requestedSection?.locked
    ) {

      return res.redirect(
        `/exam/${testId}/question/${sectionState.firstPendingQuestionNumber}`
      );

    }


    const visitedQuestionIds =
      new Set(

        (
          result.visitedQuestionIds ||
          []
        )
          .map(
            questionId =>
              String(
                questionId
              )
          )

      );


    const currentQuestionKey =
      String(
        currentQuestionId
      );


    if (
      !visitedQuestionIds.has(
        currentQuestionKey
      )
    ) {

      visitedQuestionIds.add(
        currentQuestionKey
      );


      await Result.updateOne(

        {
          _id:
            result._id
        },

        {
          $addToSet: {
            visitedQuestionIds:
              currentQuestionKey
          }
        }

      );

    }


    const question =
      await Question.findById(
        currentQuestionId
      );


    if (!question) {

      req.flash(
        'error',
        'Question not found.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    let options = [

      {
        key:
          'A',

        value:
          question.optionA,

        image:
          question.optionAImage
      },

      {
        key:
          'B',

        value:
          question.optionB,

        image:
          question.optionBImage
      },

      {
        key:
          'C',

        value:
          question.optionC,

        image:
          question.optionCImage
      },

      {
        key:
          'D',

        value:
          question.optionD,

        image:
          question.optionDImage
      }

    ];


    /*
     * Existing option shuffle retained.
     *
     * Note:
     * this still shuffles on every GET.
     * We can persist option order later if required.
     */

    if (
      test.shuffleOptions
    ) {

      options =
        shuffle(
          options
        );

    }


    const answers =
      result.answers ||
      {};


    const markedForReview =
      (
        result.markedForReview ||
        []
      )
        .map(
          value =>
            String(
              value
            )
        );


    const paletteStatus =
      questionIds.map(
        (
          questionId,
          questionIndex
        ) => {

          const id =
            String(
              questionId
            );


          const answered =
            !!(
              answers[id]
                ?.answer
            );


          const marked =
            markedForReview
              .includes(
                id
              );


          const subject =
            sectionState
              ?.subjectById
              .get(
                id
              ) ||
            question.subject;


          let sectionIndex =
            sectionState
              ?.sections
              .findIndex(
                section =>
                  section.name ===
                  subject
              );


          if (
            typeof sectionIndex !==
              'number' ||
            sectionIndex < 0
          ) {

            sectionIndex =
              0;

          }


          let status =
            'not-visited';


          if (
            answered &&
            marked
          ) {

            status =
              'answered-marked';

          } else if (
            answered
          ) {

            status =
              'answered';

          } else if (
            marked
          ) {

            status =
              'marked';

          } else if (
            visitedQuestionIds
              .has(
                id
              )
          ) {

            status =
              'not-answered';

          }


          return {

            num:
              questionIndex +
              1,

            qId:
              questionId,

            status,

            subject,

            locked:
              Boolean(
                cetSectionFlow &&
                sectionState
                  ?.sections[
                    sectionIndex
                  ]
                  ?.locked
              )

          };

        }
      );


    const currentSection =
      sectionState?.sections
        ? sectionState.sections
            .find(
              section =>
                section.name ===
                requestedSubject ||
                section.name ===
                question.subject
            )
        : null;


    const sectionQuestionNumber =
      currentSection
        ? currentSection
            .questionNumbers
            .indexOf(
              questionNumber
            ) +
          1
        : questionNumber;


    return res.render(
      'exam/question',
      {

        title:
          `Q${questionNumber} — ${test.title}`,

        test,

        question,

        options,

        questionNumber,

        totalQuestions,

        remaining,

        paletteStatus,

        selectedAnswer:
          answers[
            String(
              currentQuestionId
            )
          ]?.answer ||
          null,

        isMarked:
          markedForReview
            .includes(
              String(
                currentQuestionId
              )
            ),

        resultId:
          result._id,

        violations:
          result.violationCount ||
          0,

        result,

        cetSectionFlow,

        sectionState,

        currentSection,

        sectionQuestionNumber

      }
    );


  } catch (e) {

    console.error(
      e
    );

    req.flash(
      'error',
      'Failed.'
    );

    return res.redirect(
      '/student/tests'
    );

  }

};


/* ==========================================================================
   SAVE ANSWER
============================================================================ */

exports.saveAnswer = async (
  req,
  res
) => {

  try {

    const studentId =
      req.session.user.id;


    const {
      testId
    } = req.params;


    const {
      questionId,
      answer,
      markForReview,
      timeSpent
    } = req.body;


    const result =
      await Result.findOne({

        studentId,

        testId,

        status:
          'in_progress'

      });


    if (!result) {

      return res.json({

        success:
          false,

        message:
          'Session expired'

      });

    }


    const [
      test,
      questionRows
    ] =
      await Promise.all([

        Test.findById(
          testId
        )
          .select(
            'course'
          ),


        Question.find(

          {
            _id: {
              $in:
                result.questionOrder
            }
          },

          '_id subject'

        )

      ]);


    const cetSectionFlow =
      isCetSectionTest(
        test,
        questionRows
      );


    const sectionState =
      cetSectionFlow
        ? buildSectionState(

            result.questionOrder,

            questionRows,

            result.answers ||
              {},

            result.visitedQuestionIds ||
              [],

            result

          )
        : null;


    const questionSubject =
      sectionState
        ?.subjectById
        .get(
          String(
            questionId
          )
        );


    const questionSection =
      sectionState
        ?.sections
        .find(
          section =>
            section.name ===
            questionSubject
        );


    /*
     * SERVER AUTHORITY:
     * Locked section cannot be edited.
     */

    if (
      questionSection
        ?.locked
    ) {

      return res
        .status(403)
        .json({

          success:
            false,

          message:
            result.section1Submitted
              ? 'Physics and Chemistry have already been submitted and are locked.'
              : 'Mathematics/Biology will unlock after Physics and Chemistry are submitted.'

        });

    }


    const answers = {
      ...(result.answers || {})
    };


    const questionTimings = {
      ...(result.questionTimings || {})
    };


    const markedForReview =
      (
        result.markedForReview ||
        []
      )
        .map(
          value =>
            String(
              value
            )
        );


    answers[
      String(
        questionId
      )
    ] = {

      answer:
        answer
          ?.trim() ||
        null,

      savedAt:
        new Date()

    };


    if (
      timeSpent &&
      !isNaN(
        timeSpent
      )
    ) {

      questionTimings[
        String(
          questionId
        )
      ] =
        (
          questionTimings[
            String(
              questionId
            )
          ] ||
          0
        ) +
        parseInt(
          timeSpent,
          10
        );

    }


    const idx =
      markedForReview
        .indexOf(
          String(
            questionId
          )
        );


    if (
      markForReview ===
        'true' ||
      markForReview ===
        true
    ) {

      if (
        idx === -1
      ) {

        markedForReview.push(
          String(
            questionId
          )
        );

      }

    } else {

      if (
        idx !== -1
      ) {

        markedForReview.splice(
          idx,
          1
        );

      }

    }


    const visitedQuestionIds =
      [
        ...new Set([

          ...(
            result.visitedQuestionIds ||
            []
          )
            .map(
              value =>
                String(
                  value
                )
            ),

          String(
            questionId
          )

        ])
      ];


    await Result.findByIdAndUpdate(

      result._id,

      {

        answers,

        questionTimings,

        markedForReview,

        visitedQuestionIds

      }

    );


    return res.json({

      success:
        true,

      answeredCount:
        Object.values(
          answers
        )
          .filter(
            row =>
              row?.answer
          )
          .length

    });


  } catch (e) {

    console.error(
      e
    );


    return res.json({

      success:
        false,

      message:
        e.message

    });

  }

};


/* ==========================================================================
   SUBMIT CET PHASE 1
   Physics + Chemistry
============================================================================ */

exports.submitSection = async (
  req,
  res
) => {

  try {

    const studentId =
      req.session.user.id;


    const {
      testId
    } = req.params;


    const [
      result,
      test
    ] =
      await Promise.all([

        Result.findOne({

          studentId,

          testId,

          status:
            'in_progress'

        }),


        Test.findById(
          testId
        )

      ]);


    if (!result) {

      const done =
        await Result.findOne({

          studentId,

          testId,

          status: {
            $in: [
              'submitted',
              'auto_submitted'
            ]
          }

        });


      if (
        done
      ) {

        return res.redirect(
          `/results/${done._id}`
        );

      }


      req.flash(
        'error',
        'Exam session not found.'
      );


      return res.redirect(
        '/student/tests'
      );

    }


    if (!test) {

      req.flash(
        'error',
        'Test not found.'
      );

      return res.redirect(
        '/student/tests'
      );

    }


    const questionRows =
      await Question.find(

        {
          _id: {
            $in:
              result.questionOrder
          }
        },

        '_id subject'

      );


    const cetSectionFlow =
      isCetSectionTest(
        test,
        questionRows
      );


    if (
      !cetSectionFlow
    ) {

      req.flash(
        'error',
        'Section submission is not applicable to this test.'
      );


      return res.redirect(
        `/exam/${testId}/question/1`
      );

    }


    const sectionState =
      buildSectionState(

        result.questionOrder,

        questionRows,

        result.answers ||
          {},

        result.visitedQuestionIds ||
          [],

        result

      );


    /*
     * Already submitted?
     * Just redirect to final section.
     */

    if (
      result.section1Submitted
    ) {

      const finalQuestionNumber =
        sectionState
          .finalSection
          ?.questionNumbers
          ?.[0] ||
        sectionState
          .firstPendingQuestionNumber ||
        1;


      return res.redirect(
        `/exam/${testId}/question/${finalQuestionNumber}`
      );

    }


    const now =
      new Date();


    await Result.findByIdAndUpdate(

      result._id,

      {

        section1Submitted:
          true,

        section1SubmittedAt:
          now,

        finalSectionUnlocked:
          true,

        currentExamPhase:
          'phase2'

      },

      {
        new: true
      }

    );


    /*
     * Rebuild with new state.
     */

    const refreshedState =
      buildSectionState(

        result.questionOrder,

        questionRows,

        result.answers ||
          {},

        result.visitedQuestionIds ||
          [],

        {

          section1Submitted:
            true,

          finalSectionUnlocked:
            true

        }

      );


    const finalQuestionNumber =
      refreshedState
        .finalSection
        ?.questionNumbers
        ?.[0];


    if (
      !finalQuestionNumber
    ) {

      req.flash(
        'error',
        'Mathematics/Biology section was not found in this CET test.'
      );


      return res.redirect(
        `/exam/${testId}/question/1`
      );

    }


    req.flash(
      'success',
      'Physics and Chemistry submitted. Final section unlocked.'
    );


    return res.redirect(
      `/exam/${testId}/question/${finalQuestionNumber}`
    );


  } catch (e) {

    console.error(
      'submitSection error:',
      e
    );


    req.flash(
      'error',
      'Could not submit Physics and Chemistry section.'
    );


    return res.redirect(
      '/student/tests'
    );

  }

};


/* ==========================================================================
   REPORT VIOLATION
============================================================================ */

exports.reportViolation = async (
  req,
  res
) => {

  try {

    const studentId =
      req.session.user.id;


    const {
      testId
    } = req.params;


    const {
      type
    } = req.body;


    const [
      result,
      test
    ] =
      await Promise.all([

        Result.findOne({

          studentId,

          testId,

          status:
            'in_progress'

        }),


        Test.findById(
          testId
        )
          .select(
            'autoSubmitOnViolation maxTabSwitches maxFocusLosses'
          )

      ]);


    if (
      !result
    ) {

      return res.json({
        success: false
      });

    }


    const flags =
      result.cheatingFlags || {

        tabSwitches:
          0,

        fullscreenExits:
          0,

        focusLosses:
          0

      };


    if (
      type ===
      'tabSwitch'
    ) {

      flags.tabSwitches =
        (
          flags.tabSwitches ||
          0
        ) +
        1;

    } else if (
      type ===
      'fullscreenExit'
    ) {

      flags.fullscreenExits =
        (
          flags.fullscreenExits ||
          0
        ) +
        1;

    } else if (
      type ===
      'focusLoss'
    ) {

      flags.focusLosses =
        (
          flags.focusLosses ||
          0
        ) +
        1;

    }


    const violations =
      (
        flags.tabSwitches ||
        0
      ) +
      (
        flags.fullscreenExits ||
        0
      ) +
      (
        flags.focusLosses ||
        0
      );


    await Result.findByIdAndUpdate(

      result._id,

      {

        cheatingFlags:
          flags,

        violationCount:
          violations

      }

    );


    const maxSwitches =
      test?.maxTabSwitches ??
      3;


    const maxFocusLosses =
      test?.maxFocusLosses ??
      5;


    const shouldAutoSubmit =
      Boolean(
        test
          ?.autoSubmitOnViolation
      ) &&
      (

        (
          type ===
            'tabSwitch' &&
          flags.tabSwitches >=
            maxSwitches
        ) ||

        (
          type ===
            'focusLoss' &&
          flags.focusLosses >=
            maxFocusLosses
        ) ||

        (
          type ===
            'fullscreenExit' &&
          flags.fullscreenExits >=
            3
        )

      );


    const remaining =
      Math.max(
        0,
        maxSwitches -
        (
          flags.tabSwitches ||
          0
        )
      );


    const warningLevel =
      remaining <= 1
        ? 'danger'
        : 'warning';


    const warningMsg =
      shouldAutoSubmit
        ? 'Exam auto-submitted due to too many violations.'
        : `⚠ Tab switch detected! ${remaining} more allowed.`;


    return res.json({

      success:
        true,

      violations,

      tabSwitches:
        flags.tabSwitches ||
        0,

      focusLosses:
        flags.focusLosses ||
        0,

      autoSubmit:
        shouldAutoSubmit,

      warningLevel,

      warningMsg

    });


  } catch (e) {

    console.error(
      e
    );


    return res.json({
      success: false
    });

  }

};


/* ==========================================================================
   SUBMIT FINAL EXAM
============================================================================ */

exports.submitExam = async (
  req,
  res
) => {

  try {

    const studentId =
      req.session.user.id;


    const {
      testId
    } = req.params;


    const isAutoSubmit =
      req.body?.auto ===
      'true';


    const result =
      await Result.findOne({

        studentId,

        testId,

        status:
          'in_progress'

      });


    if (!result) {

      const done =
        await Result.findOne({

          studentId,

          testId,

          status: {
            $in: [
              'submitted',
              'auto_submitted'
            ]
          }

        });


      if (
        done
      ) {

        return res.redirect(
          `/results/${done._id}`
        );

      }


      return res.redirect(
        '/student/tests'
      );

    }


    const test =
      await Test.findById(
        testId
      )
        .populate(
          'questions'
        );


    if (!test) {

      req.flash(
        'error',
        'Test not found.'
      );


      return res.redirect(
        '/student/tests'
      );

    }


    const cetSectionFlow =
      isCetSectionTest(
        test,
        test.questions
      );


    /*
     * Manual final submit is NOT allowed
     * before Physics + Chemistry submission.
     *
     * Auto submit must still work.
     */

    if (
      cetSectionFlow &&
      !isAutoSubmit &&
      !result.section1Submitted
    ) {

      req.flash(
        'error',
        'Submit Physics and Chemistry first before final exam submission.'
      );


      const questionRows =
        test.questions.map(
          question => ({

            _id:
              question._id,

            subject:
              question.subject

          })
        );


      const sectionState =
        buildSectionState(

          result.questionOrder,

          questionRows,

          result.answers ||
            {},

          result.visitedQuestionIds ||
            [],

          result

        );


      const firstPhase1Question =
        sectionState
          .phase1QuestionNumbers
          ?.[0] ||
        1;


      return res.redirect(
        `/exam/${testId}/question/${firstPhase1Question}`
      );

    }


    const answers =
      result.answers ||
      {};


    let score =
      0;

    let correct =
      0;

    let wrong =
      0;

    let skipped =
      0;


    const subjectScores =
      {};


    const topicScores =
      {};


    const negativeMarking =
      parseFloat(
        test.negativeMarking
      ) ||
      0;


    const markingMap =
      new Map(

        (
          test.questionSettings ||
          []
        )
          .map(
            row => [

              String(
                row.questionId
              ),

              row

            ]
          )

      );


    for (
      const question of
      test.questions
    ) {

      const marking =
        markingMap.get(
          String(
            question._id
          )
        );


      const positiveMarks =
        Number(
          marking?.positiveMarks ??
          question.marks ??
          1
        );


      const negativeMarks =
        Number(
          marking?.negativeMarks ??
          negativeMarking ??
          0
        );


      const answerKey =
        marking?.answerKey ||
        question.correctAnswer;


      const subj =
        question.subject ||
        'General';


      const topic =
        question.topic ||
        'General';


      if (
        !subjectScores[subj]
      ) {

        subjectScores[subj] = {

          correct:
            0,

          wrong:
            0,

          skipped:
            0,

          marks:
            0,

          total:
            0,

          attempted:
            false,

          status:
            'NOT_ATTEMPTED'

        };

      }


      if (
        !topicScores[topic]
      ) {

        topicScores[topic] = {

          correct:
            0,

          wrong:
            0,

          skipped:
            0

        };

      }


      subjectScores[
        subj
      ].total +=
        positiveMarks;


      const given =
        answers[
          String(
            question._id
          )
        ]?.answer;


      if (!given) {

        skipped++;

        subjectScores[
          subj
        ].skipped++;

        topicScores[
          topic
        ].skipped++;

      } else if (
        given ===
        answerKey
      ) {

        subjectScores[
          subj
        ].attempted =
          true;


        subjectScores[
          subj
        ].status =
          'ATTEMPTED';


        score +=
          positiveMarks;


        correct++;


        subjectScores[
          subj
        ].correct++;


        subjectScores[
          subj
        ].marks +=
          positiveMarks;


        topicScores[
          topic
        ].correct++;

      } else {

        subjectScores[
          subj
        ].attempted =
          true;


        subjectScores[
          subj
        ].status =
          'ATTEMPTED';


        score -=
          negativeMarks;


        wrong++;


        subjectScores[
          subj
        ].marks -=
          negativeMarks;


        subjectScores[
          subj
        ].wrong++;


        topicScores[
          topic
        ].wrong++;

      }

    }


    const attemptedSubjects =
      [];


    const absentSubjects =
      [];


    let attemptedTotalMarks =
      0;


    Object.entries(
      subjectScores
    )
      .forEach(
        (
          [
            subject,
            data
          ]
        ) => {

          data.marks =
            parseFloat(
              Number(
                data.marks ||
                0
              )
                .toFixed(2)
            );


          if (
            cetSectionFlow &&
            !data.attempted
          ) {

            data.status =
              'ABSENT';


            absentSubjects.push(
              subject
            );


            return;

          }


          if (
            data.attempted
          ) {

            attemptedSubjects.push(
              subject
            );

          }


          attemptedTotalMarks +=
            data.total;

        }
      );


    score =
      Math.max(
        0,
        parseFloat(
          Number(
            score
          )
            .toFixed(2)
        )
      );


    const resultTotalMarks =
      cetSectionFlow
        ? attemptedTotalMarks
        : test.totalMarks;


    const timeTaken =
      Math.floor(
        (
          Date.now() -
          new Date(
            result.startedAt
          ).getTime()
        ) /
        1000
      );


    await Result.findByIdAndUpdate(

      result._id,

      {

        score,

        totalMarks:
          resultTotalMarks,

        fullTotalMarks:
          test.totalMarks,

        correctAnswers:
          correct,

        wrongAnswers:
          wrong,

        skippedAnswers:
          skipped,

        timeTaken,

        subjectScores,

        topicScores,

        attemptedSubjects,

        absentSubjects,

        status:
          isAutoSubmit
            ? 'auto_submitted'
            : 'submitted',

        currentExamPhase:
          'completed',

        submittedAt:
          new Date()

      }

    );


    await updateRanks(
      testId
    );


    if (
      test.hideImmediateResults
    ) {

      req.flash(
        'success',
        'Test submitted successfully. Results will be released by the administrator.'
      );


      return res.redirect(
        '/student/tests'
      );

    }


    return res.redirect(
      `/results/${result._id}`
    );


  } catch (e) {

    console.error(
      e
    );


    req.flash(
      'error',
      'Submit failed.'
    );


    return res.redirect(
      '/student/tests'
    );

  }

};


/* ==========================================================================
   AUTO SUBMIT
============================================================================ */

exports.autoSubmit = async (
  req,
  res
) => {

  req.body = {
    auto:
      'true'
  };


  return exports.submitExam(
    req,
    res
  );

};


/* ==========================================================================
   LEAVE EXAM / BEACON SAVE
============================================================================ */

exports.leaveExam = async (
  req,
  res
) => {

  try {

    const studentId =
      req.session
        ?.user
        ?.id;


    const {
      testId
    } = req.params;


    if (
      !studentId
    ) {

      return res
        .sendStatus(
          204
        );

    }


    const body =
      req.body ||
      {};


    const {
      questionId,
      answer,
      markForReview,
      timeSpent
    } = body;


    const result =
      await Result.findOne({

        studentId,

        testId,

        status:
          'in_progress'

      });


    if (
      !result
    ) {

      return res
        .sendStatus(
          204
        );

    }


    /*
     * Save current answer.
     *
     * IMPORTANT:
     * Apply same CET lock rules as saveAnswer.
     */

    if (
      questionId
    ) {

      const [
        test,
        questionRows
      ] =
        await Promise.all([

          Test.findById(
            testId
          )
            .select(
              'course'
            ),


          Question.find(

            {
              _id: {
                $in:
                  result.questionOrder
              }
            },

            '_id subject'

          )

        ]);


      const cetSectionFlow =
        isCetSectionTest(
          test,
          questionRows
        );


      if (
        cetSectionFlow
      ) {

        const sectionState =
          buildSectionState(

            result.questionOrder,

            questionRows,

            result.answers ||
              {},

            result.visitedQuestionIds ||
              [],

            result

          );


        const questionSubject =
          sectionState
            .subjectById
            .get(
              String(
                questionId
              )
            );


        const questionSection =
          sectionState
            .sections
            .find(
              section =>
                section.name ===
                questionSubject
            );


        /*
         * Locked section cannot be modified
         * using sendBeacon either.
         */

        if (
          questionSection
            ?.locked
        ) {

          return res
            .sendStatus(
              204
            );

        }

      }


      const answers = {
        ...(result.answers || {})
      };


      const questionTimings = {
        ...(result.questionTimings || {})
      };


      const markedForReview =
        (
          result.markedForReview ||
          []
        )
          .map(
            value =>
              String(
                value
              )
          );


      answers[
        String(
          questionId
        )
      ] = {

        answer:
          answer
            ?.trim() ||
          null,

        savedAt:
          new Date()

      };


      if (
        timeSpent &&
        !isNaN(
          timeSpent
        )
      ) {

        questionTimings[
          String(
            questionId
          )
        ] =
          (
            questionTimings[
              String(
                questionId
              )
            ] ||
            0
          ) +
          parseInt(
            timeSpent,
            10
          );

      }


      const idx =
        markedForReview
          .indexOf(
            String(
              questionId
            )
          );


      if (
        markForReview ===
        'true'
      ) {

        if (
          idx === -1
        ) {

          markedForReview.push(
            String(
              questionId
            )
          );

        }

      } else {

        if (
          idx !== -1
        ) {

          markedForReview.splice(
            idx,
            1
          );

        }

      }


      const visitedQuestionIds =
        [
          ...new Set([

            ...(
              result.visitedQuestionIds ||
              []
            )
              .map(
                value =>
                  String(
                    value
                  )
              ),

            String(
              questionId
            )

          ])
        ];


      await Result.findByIdAndUpdate(

        result._id,

        {

          answers,

          questionTimings,

          markedForReview,

          visitedQuestionIds

        }

      );

    }


    /*
     * DO NOT SUBMIT ON PAGE UNLOAD.
     */

    return res
      .sendStatus(
        204
      );


  } catch (e) {

    console.error(
      'leaveExam error:',
      e
    );


    return res
      .sendStatus(
        204
      );

  }

};


/* ==========================================================================
   UPDATE RANKS
============================================================================ */

async function updateRanks(
  testId
) {

  const results =
    await Result.find({

      testId,

      status: {
        $in: [
          'submitted',
          'auto_submitted'
        ]
      }

    })
      .sort({

        score:
          -1,

        timeTaken:
          1

      });


  const n =
    results.length;


  if (
    !n
  ) {
    return;
  }


  await Promise.all(

    results.map(
      (
        result,
        index
      ) => {

        return Result.findByIdAndUpdate(

          result._id,

          {

            rank:
              index +
              1,

            percentile:
              parseFloat(

                (
                  (
                    (
                      n -
                      index
                    ) /
                    n
                  ) *
                  100
                )
                  .toFixed(
                    2
                  )

              )

          }

        );

      }
    )

  );

}


/* ==========================================================================
   GET RESULT
============================================================================ */

exports.getResult = async (
  req,
  res
) => {

  try {

    const result =
      await Result.findById(
        req.params.resultId
      )
        .populate(
          'studentId',
          'name rollNo email'
        )
        .populate({

          path:
            'testId',

          populate: {
            path:
              'questions'
          }

        });


    if (!result) {

      req.flash(
        'error',
        'Not found.'
      );


      return res.redirect(
        '/student/dashboard'
      );

    }


    const viewer =
      req.session.user;


    if (
      viewer.role ===
        'student' &&
      result
        .studentId
        ._id
        .toString() !==
        viewer.id
    ) {

      req.flash(
        'error',
        'Access denied.'
      );


      return res.redirect(
        '/student/dashboard'
      );

    }


    if (
      viewer.role ===
        'student' &&
      result
        .testId
        ?.hideImmediateResults
    ) {

      req.flash(
        'info',
        'Results for this test are not released yet.'
      );


      return res.redirect(
        '/student/tests'
      );

    }


    const [
      topperResult,
      totalAttempted,
      trend
    ] =
      await Promise.all([

        Result.findOne({

          testId:
            result.testId._id,

          rank:
            1

        })
          .select(
            'score subjectScores'
          ),


        Result.countDocuments({

          testId:
            result.testId._id,

          status: {
            $in: [
              'submitted',
              'auto_submitted'
            ]
          }

        }),


        Result.find({

          studentId:
            result.studentId._id,

          status: {
            $in: [
              'submitted',
              'auto_submitted'
            ]
          }

        })
          .populate(
            'testId',
            'title'
          )
          .sort({
            submittedAt:
              1
          })
          .limit(
            10
          )

      ]);


    const percentage =
      result.totalMarks > 0
        ? parseFloat(
            (
              (
                result.score /
                result.totalMarks
              ) *
              100
            )
              .toFixed(
                1
              )
          )
        : 0;


    return res.render(
      'exam/result',
      {

        title:
          'Exam Result',

        result,

        percentage,

        topperResult,

        trend,

        totalAttempted

      }
    );


  } catch (e) {

    console.error(
      e
    );


    req.flash(
      'error',
      'Failed.'
    );


    return res.redirect(
      '/student/dashboard'
    );

  }

};


/* ==========================================================================
   DOWNLOAD RESULT PDF
============================================================================ */

exports.downloadResultPDF = async (
  req,
  res
) => {

  try {

    const PDFDocument =
      require(
        'pdfkit'
      );


    const result =
      await Result.findById(
        req.params.resultId
      )
        .populate(
          'studentId',
          'name rollNo email'
        )
        .populate({

          path:
            'testId',

          populate: {
            path:
              'questions'
          }

        });


    if (!result) {

      return res
        .status(404)
        .send(
          'Not found'
        );

    }


    const viewer =
      req.session.user;


    if (
      viewer.role ===
        'student' &&
      (
        result
          .studentId
          ._id
          .toString() !==
          viewer.id ||
        result
          .testId
          ?.hideImmediateResults
      )
    ) {

      return res
        .status(403)
        .send(
          'Result is not available yet.'
        );

    }


    const test =
      result.testId;


    const questionMap =
      {};


    (
      test.questions ||
      []
    )
      .forEach(
        question => {

          questionMap[
            question
              ._id
              .toString()
          ] =
            question;

        }
      );


    const answerKeyMap =
      new Map(

        (
          test.questionSettings ||
          []
        )
          .map(
            row => [

              String(
                row.questionId
              ),

              row.answerKey

            ]
          )

      );


    const orderedIds =
      result
        .questionOrder
        ?.length
        ? result.questionOrder
        : Object.keys(
            questionMap
          );


    const questions =
      orderedIds
        .map(
          id =>
            questionMap[
              id.toString()
            ]
        )
        .filter(
          Boolean
        );


    const answers =
      result.answers ||
      {};


    const safe =
      str =>
        String(
          str ||
          ''
        )
          .replace(
            /<[^>]*>/g,
            ''
          )
          .trim();


    const COLLEGE =
      process.env.COLLEGE_NAME ||
      'College';


    const pct =
      result.totalMarks >
      0
        ? (
            (
              result.score /
              result.totalMarks
            ) *
            100
          )
            .toFixed(
              1
            )
        : '0.0';


    const doc =
      new PDFDocument({

        margin:
          45,

        size:
          'A4',

        bufferPages:
          true

      });


    res.setHeader(
      'Content-Type',
      'application/pdf'
    );


    res.setHeader(
      'Content-Disposition',
      `attachment; filename=result_${result._id}.pdf`
    );


    doc.pipe(
      res
    );


    doc
      .fontSize(
        16
      )
      .font(
        'Helvetica-Bold'
      )
      .fillColor(
        '#1e293b'
      )
      .text(
        COLLEGE,
        {
          align:
            'center'
        }
      );


    doc
      .fontSize(
        10
      )
      .font(
        'Helvetica'
      )
      .fillColor(
        '#64748b'
      )
      .text(
        'CET Examination — Detailed Result Card',
        {
          align:
            'center'
        }
      );


    doc.moveDown(
      0.5
    );


    const info = [

      [
        'Name',
        result.studentId.name
      ],

      [
        'Roll No',
        result.studentId.rollNo ||
        '—'
      ],

      [
        'Test',
        test.title
      ],

      [
        'Date',
        result.submittedAt
          ? new Date(
              result.submittedAt
            )
              .toLocaleDateString(
                'en-IN'
              )
          : '—'
      ],

      [
        'Score',
        `${result.score} / ${result.totalMarks}  (${pct}%)`
      ],

      [
        'Rank',
        `#${result.rank || '—'}  ·  Correct: ${result.correctAnswers}  Wrong: ${result.wrongAnswers}  Skipped: ${result.skippedAnswers}`
      ]

    ];


    info.forEach(
      (
        [
          label,
          val
        ]
      ) => {

        doc
          .fontSize(
            9
          )
          .font(
            'Helvetica-Bold'
          )
          .fillColor(
            '#64748b'
          )
          .text(
            `${label}: `,
            {
              continued:
                true
            }
          );


        doc
          .font(
            'Helvetica'
          )
          .fillColor(
            '#1e293b'
          )
          .text(
            val
          );

      }
    );


    const subjectScores =
      result.subjectScores ||
      {};


    const subjectNames = [

      ...CET_SECTION_ORDER.filter(
        subject =>
          subjectScores[
            subject
          ]
      ),

      ...Object.keys(
        subjectScores
      )
        .filter(
          subject =>
            !CET_SECTION_ORDER.includes(
              subject
            )
        )

    ];


    if (
      subjectNames.length
    ) {

      doc.moveDown(
        0.8
      );


      doc
        .fontSize(
          10
        )
        .font(
          'Helvetica-Bold'
        )
        .fillColor(
          '#1e293b'
        )
        .text(
          'SUBJECT-WISE MARKS'
        );


      subjectNames
        .forEach(
          subject => {

            const data =
              subjectScores[
                subject
              ];


            const value =
              data.status ===
              'ABSENT'
                ? 'ABSENT'
                : `${data.marks || 0} / ${data.total || 0}`;


            doc
              .fontSize(
                9
              )
              .font(
                'Helvetica-Bold'
              )
              .fillColor(
                '#64748b'
              )
              .text(
                `${subject}: `,
                {
                  continued:
                    true
                }
              );


            doc
              .font(
                'Helvetica'
              )
              .fillColor(
                data.status ===
                  'ABSENT'
                  ? '#dc2626'
                  : '#1e293b'
              )
              .text(
                value
              );

          }
        );


      if (
        result
          .absentSubjects
          ?.length
      ) {

        doc
          .fontSize(
            8
          )
          .font(
            'Helvetica'
          )
          .fillColor(
            '#64748b'
          )
          .text(
            `Total uses attempted subjects only. Full test marks: ${result.fullTotalMarks || test.totalMarks}.`
          );

      }

    }


    doc.addPage();


    doc
      .fontSize(
        11
      )
      .font(
        'Helvetica-Bold'
      )
      .text(
        'QUESTION-BY-QUESTION ANSWERS',
        {
          align:
            'center'
        }
      );


    doc.moveDown(
      0.5
    );


    questions.forEach(
      (
        q,
        idx
      ) => {

        if (
          doc.y >
          700
        ) {

          doc.addPage();

        }


        const ans =
          answers[
            String(
              q._id
            )
          ] ||
          {};


        const given =
          ans.answer ||
          null;


        const correctAnswer =
          answerKeyMap.get(
            String(
              q._id
            )
          ) ||
          q.correctAnswer;


        const isCorrect =
          given &&
          given ===
          correctAnswer;


        const optMap = {

          A:
            q.optionA,

          B:
            q.optionB,

          C:
            q.optionC,

          D:
            q.optionD

        };


        doc
          .fontSize(
            9
          )
          .font(
            'Helvetica-Bold'
          )
          .fillColor(
            '#1e1f5e'
          )
          .text(
            `Q${idx + 1}. `,
            {
              continued:
                true
            }
          );


        doc
          .font(
            'Helvetica'
          )
          .fillColor(
            '#1e293b'
          )
          .text(
            safe(
              q.question
            )
          );


        [
          'A',
          'B',
          'C',
          'D'
        ]
          .forEach(
            key => {

              const isC =
                correctAnswer ===
                key;


              const isG =
                given ===
                key;


              const col =
                isC
                  ? '#16a34a'
                  : (
                      isG &&
                      !isC
                    )
                    ? '#dc2626'
                    : '#374151';


              doc
                .fontSize(
                  8
                )
                .font(
                  isC ||
                  isG
                    ? 'Helvetica-Bold'
                    : 'Helvetica'
                )
                .fillColor(
                  col
                )
                .text(
                  `   ${isC ? '✓' : isG ? '✗' : ' '} ${key}) ${safe(optMap[key] || '')}`,
                  {
                    width:
                      480
                  }
                );

            }
          );


        if (
          q.explanation
        ) {

          doc
            .fontSize(
              7.5
            )
            .font(
              'Helvetica-Bold'
            )
            .fillColor(
              '#6d28d9'
            )
            .text(
              'Explanation: ',
              {
                continued:
                  true
              }
            );


          doc
            .font(
              'Helvetica'
            )
            .fillColor(
              '#4b5563'
            )
            .text(
              safe(
                q.explanation
              )
            );

        }


        doc.moveDown(
          0.5
        );

      }
    );


    const totalPages =
      doc
        .bufferedPageRange()
        .count;


    for (
      let i = 0;
      i < totalPages;
      i++
    ) {

      doc.switchToPage(
        i
      );


      doc
        .fontSize(
          7
        )
        .font(
          'Helvetica'
        )
        .fillColor(
          '#94a3b8'
        )
        .text(
          `${COLLEGE} · Page ${i + 1} of ${totalPages}`,
          45,
          820,
          {
            width:
              505,

            align:
              'center'
          }
        );

    }


    doc.end();


  } catch (e) {

    console.error(
      'PDF error:',
      e
    );


    return res
      .status(500)
      .send(
        'PDF generation failed: ' +
        e.message
      );

  }

};


/* ==========================================================================
   LEADERBOARD
============================================================================ */

exports.getLeaderboard = async (
  req,
  res
) => {

  try {

    const {
      testId
    } = req.params;


    const [
      test,
      results
    ] =
      await Promise.all([

        Test.findById(
          testId
        ),


        Result.find({

          testId,

          status: {
            $in: [
              'submitted',
              'auto_submitted'
            ]
          }

        })
          .populate(
            'studentId',
            'name rollNo'
          )
          .sort({

            score:
              -1,

            timeTaken:
              1

          })
          .limit(
            50
          )

      ]);


    if (!test) {

      req.flash(
        'error',
        'Not found.'
      );


      return res.redirect(
        '/student/dashboard'
      );

    }


    if (
      req.session
        .user
        .role ===
      'student'
    ) {

      if (
        !(
          await studentCanAccessTest(
            req.session.user.id,
            test
          )
        )
      ) {

        req.flash(
          'error',
          'Access denied.'
        );


        return res.redirect(
          '/student/dashboard'
        );

      }


      if (
        test.hideImmediateResults
      ) {

        req.flash(
          'info',
          'Leaderboard is not released yet.'
        );


        return res.redirect(
          '/student/tests'
        );

      }

    }


    return res.render(
      'exam/leaderboard',
      {

        title:
          `Leaderboard — ${test.title}`,

        test,

        results

      }
    );


  } catch (e) {

    console.error(
      e
    );


    req.flash(
      'error',
      'Failed.'
    );


    return res.redirect(
      '/student/dashboard'
    );

  }

};