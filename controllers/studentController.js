// controllers/studentController.js

const {
  User,
  Test,
  Question,
  Group,
  GroupMember,
  Result,
  Notification,
  StudentDocument
} = require('../models');

const fs = require('fs');
const path = require('path');
const { documentDir: DOC_DIR } = require('../utils/storagePaths');


// ============================================================
// STUDENT DASHBOARD
// ============================================================

exports.getDashboard = async (req, res) => {

  try {

    const studentId =
      req.session.user.id;


    const [
      memberships,
      allResults,
      notifications
    ] = await Promise.all([

      GroupMember.find(
        {
          userId: studentId,
          role: 'student'
        },
        'groupId'
      ),


      Result.find({
        studentId,

        status: {
          $in: [
            'submitted',
            'auto_submitted'
          ]
        }

      })
        .populate(
          'testId',
          'title totalMarks subject course duration'
        )
        .sort({
          submittedAt: -1
        }),


      Notification.find({
        userId: studentId,
        isRead: false
      })
        .sort({
          createdAt: -1
        })
        .limit(8)

    ]);


    const groupIds =
      memberships.map(
        m => m.groupId
      );


    const [
      availableTests,
      inProgressResults
    ] = await Promise.all([

      groupIds.length

        ? Test.find(
          {

            groups: {
              $in: groupIds
            },

            status: {
              $in: [
                'published',
                'active'
              ]
            },

            isActive: {
              $ne: false
            }

          },

          'id title duration totalMarks subject startTime endTime'

        )
          .sort({
            startTime: 1
          })

        : Promise.resolve([]),


      Result.find(
        {
          studentId,
          status: 'in_progress'
        },
        'testId'
      )

    ]);


    const completedIds =
      new Set(
        allResults.map(
          r =>
            r.testId?._id?.toString()
        )
      );


    const inProgressIds =
      new Set(
        inProgressResults.map(
          r =>
            r.testId?.toString()
        )
      );


    const pendingTests =
      availableTests.filter(
        t =>
          !completedIds.has(
            t._id.toString()
          ) &&
          !inProgressIds.has(
            t._id.toString()
          )
      );


    // Chart data
    const chartResults =
      [...allResults]
        .reverse()
        .slice(-10);


    const chartData =
      chartResults.map(
        r => ({

          label:
            r.testId?.title
              ? r.testId.title.substring(
                0,
                18
              ) +
              (
                r.testId.title.length > 18
                  ? '…'
                  : ''
              )
              : 'Test',

          pct:
            r.totalMarks > 0
              ? parseFloat(
                (
                  (
                    r.score /
                    r.totalMarks
                  ) *
                  100
                ).toFixed(1)
              )
              : 0,

          score:
            r.score,

          total:
            r.totalMarks,

          date:
            r.submittedAt
              ? new Date(
                r.submittedAt
              ).toLocaleDateString(
                'en-IN',
                {
                  day: '2-digit',
                  month: 'short'
                }
              )
              : ''

        })
      );


    // ========================================================
    // SUBJECT PERFORMANCE
    // ========================================================

    const subjectMap = {};


    allResults.forEach(r => {

      const subj =
        r.testId?.subject ||
        'General';


      if (!subjectMap[subj]) {

        subjectMap[subj] = {

          marks: 0,
          maxMarks: 0,
          count: 0

        };

      }


      subjectMap[subj].marks +=
        r.score;


      subjectMap[subj].maxMarks +=
        r.totalMarks;


      subjectMap[subj].count++;

    });


    const subjectStats =
      Object.entries(
        subjectMap
      )
        .map(
          ([name, d]) => ({

            name,

            pct:
              d.maxMarks > 0
                ? parseFloat(
                  (
                    (
                      d.marks /
                      d.maxMarks
                    ) *
                    100
                  ).toFixed(1)
                )
                : 0,

            count:
              d.count,

            marks:
              d.marks,

            maxMarks:
              d.maxMarks

          })
        )
        .sort(
          (a, b) =>
            b.pct - a.pct
        );


    const avgScore =
      allResults.length

        ? parseFloat(
          (
            allResults.reduce(
              (s, r) =>
                s +
                (
                  r.totalMarks > 0
                    ? (
                      r.score /
                      r.totalMarks
                    ) * 100
                    : 0
                ),
              0
            ) /
            allResults.length
          ).toFixed(1)
        )

        : 0;


    let scoreTrend =
      'neutral';


    if (
      allResults.length >= 2
    ) {

      const last =
        allResults[0].totalMarks > 0

          ? (
            allResults[0].score /
            allResults[0].totalMarks
          ) * 100

          : 0;


      const prev =
        allResults[1].totalMarks > 0

          ? (
            allResults[1].score /
            allResults[1].totalMarks
          ) * 100

          : 0;


      scoreTrend =
        last > prev
          ? 'up'
          : last < prev
            ? 'down'
            : 'neutral';

    }


    const totalCorrect =
      allResults.reduce(
        (s, r) =>
          s +
          (
            r.correctAnswers ||
            0
          ),
        0
      );


    const totalAttempted =
      allResults.reduce(
        (s, r) =>
          s +
          (
            r.correctAnswers ||
            0
          ) +
          (
            r.wrongAnswers ||
            0
          ),
        0
      );


    const accuracy =
      totalAttempted > 0

        ? parseFloat(
          (
            (
              totalCorrect /
              totalAttempted
            ) *
            100
          ).toFixed(1)
        )

        : 0;


    const now =
      new Date();


    const upcomingTest =
      pendingTests.find(
        t =>
          t.startTime &&
          new Date(
            t.startTime
          ) > now
      ) || null;


    res.render(
      'student/dashboard',
      {

        title:
          'My Dashboard',

        pendingTests,

        completedResults:
          allResults.slice(
            0,
            5
          ),

        allResultsCount:
          allResults.length,

        notifications,

        chartData:
          JSON.stringify(
            chartData
          ),

        subjectStats,

        upcomingTest,

        bestResult:
          null,

        stats: {

          pending:
            pendingTests.length,

          completed:
            allResults.length,

          avgScore,

          scoreTrend,

          accuracy,

          totalCorrect,

          totalAttempted

        }

      }
    );

  } catch (err) {

    console.error(err);

    req.flash(
      'error',
      'Failed to load dashboard.'
    );

    res.redirect(
      '/auth/login'
    );

  }

};


// ============================================================
// NEW / UNSOLVED / SOLVED TESTS
// ============================================================

exports.getTests = async (req, res) => {

  try {

    const studentId =
      req.session.user.id;


    const now =
      new Date();


    const [
      memberships,
      results
    ] = await Promise.all([

      GroupMember.find(
        {
          userId: studentId
        },
        'groupId'
      ),


      Result.find(
        {
          studentId
        },
        'testId score totalMarks status rank submittedAt'
      )

    ]);


    const groupIds =
      memberships.map(
        m => m.groupId
      );


    const tests =
      groupIds.length

        ? await Test.find({

          groups: {
            $in: groupIds
          },

          status: {
            $in: [
              'published',
              'active',
              'closed'
            ]
          },

          isActive: {
            $ne: false
          }

        })
          .sort({
            createdAt: -1
          })

        : [];


    const resultMap = {};


    results.forEach(
      r => {

        if (r.testId) {

          resultMap[
            r.testId.toString()
          ] = r;

        }

      }
    );


    const newTests = [];

    const pendingTests = [];

    const expiredTests = [];

    const solvedTests = [];

    const upcomingTests = [];


    tests.forEach(
      test => {

        const result =
          resultMap[
          test._id.toString()
          ];


        const isDone =
          result &&
          [
            'submitted',
            'auto_submitted'
          ].includes(
            result.status
          );


        const isInProg =
          result &&
          result.status ===
          'in_progress';


        const isExpired =
          test.endTime &&
          new Date(
            test.endTime
          ) < now;


        const isOpen =
          !test.startTime ||
          new Date(
            test.startTime
          ) <= now;


        if (isDone) {

          solvedTests.push({
            test,
            result
          });

        }

        else if (
          isExpired &&
          !isInProg
        ) {

          expiredTests.push({

            test,

            result:
              result || null

          });

        }

        else if (isInProg) {

          pendingTests.push({

            test,
            result

          });

        }

        else if (isOpen) {

          newTests.push({

            test,
            result: null

          });

        }

        else {

          upcomingTests.push({

            test,
            result: null

          });

        }

      }
    );


    res.render(
      'student/tests',
      {

        title:
          'My Tests',

        newTests,

        pendingTests,

        expiredTests,

        solvedTests,

        upcomingTests,

        resultMap,

        queryTab:
          req.query.tab ||
          'new'

      }
    );

  } catch (err) {

    console.error(err);

    req.flash(
      'error',
      'Failed to load tests.'
    );

    res.redirect(
      '/student/dashboard'
    );

  }

};


// ============================================================
// NOTIFICATIONS
// ============================================================

exports.getNotifications = async (
  req,
  res
) => {

  try {

    const [
      notifications
    ] = await Promise.all([

      Notification.find({
        userId:
          req.session.user.id
      })
        .sort({
          createdAt: -1
        }),


      Notification.updateMany(

        {
          userId:
            req.session.user.id
        },

        {
          isRead: true
        }

      )

    ]);


    res.render(
      'student/notifications',
      {

        title:
          'Notifications',

        notifications

      }
    );

  } catch (err) {

    req.flash(
      'error',
      'Failed.'
    );

    res.redirect(
      '/student/dashboard'
    );

  }

};


// ============================================================
// RESULTS
// ============================================================

exports.getResults = async (
  req,
  res
) => {

  try {

    const results =
      await Result.find({

        studentId:
          req.session.user.id,

        status: {
          $in: [
            'submitted',
            'auto_submitted'
          ]
        }

      })
        .populate(
          'testId',
          'title totalMarks duration subject'
        )
        .sort({
          submittedAt: -1
        });


    res.render(
      'student/results',
      {

        title:
          'My Results',

        results

      }
    );

  } catch (err) {

    req.flash(
      'error',
      'Failed.'
    );

    res.redirect(
      '/student/dashboard'
    );

  }

};


// ============================================================
// DOCUMENTS
// ============================================================

exports.getDocuments = async (
  req,
  res
) => {

  try {

    const docs =
      await StudentDocument.find({

        studentId:
          req.session.user.id

      })
        .sort({
          createdAt: -1
        });


    res.render(
      'student/documents',
      {

        title:
          'My Documents',

        docs

      }
    );

  } catch (e) {

    req.flash(
      'error',
      'Failed.'
    );

    res.redirect(
      '/student/dashboard'
    );

  }

};


exports.uploadDocument = async (
  req,
  res
) => {

  try {

    if (
      !req.files?.document
    ) {

      req.flash(
        'error',
        'No file selected.'
      );

      return res.redirect(
        '/student/documents'
      );

    }


    const file =
      req.files.document;


    const fname =
      `doc_${req.session.user.id}_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;


    fs.writeFileSync(
      path.join(
        DOC_DIR,
        fname
      ),
      file.data
    );


    await StudentDocument.create({

      studentId:
        req.session.user.id,

      fileName:
        fname,

      originalName:
        file.name,

      fileType:
        file.mimetype,

      fileSize:
        file.size,

      filePath:
        '/uploads/documents/' +
        fname,

      description:
        req.body.description ||
        ''

    });


    req.flash(
      'success',
      'Document uploaded.'
    );


    res.redirect(
      '/student/documents'
    );

  } catch (e) {

    req.flash(
      'error',
      'Upload failed: ' +
      e.message
    );

    res.redirect(
      '/student/documents'
    );

  }

};


// ============================================================================
// PRACTICE TEST
// Random questions directly from Question Bank
// ============================================================================


/* ==========================================================================
   PRACTICE TEST BUILDER
============================================================================ */

exports.getPracticeBuilder = async (req, res) => {

  try {

    const { Question } = require('../models');

    const PracticeAttempt =
      require('../models/PracticeAttempt');


    const studentId =
      req.session.user.id;


    // Subjects directly from Question Bank
    const subjects =
      await Question.distinct(
        'subject',
        {
          isActive: {
            $ne: false
          }
        }
      );


    // Recent practice history
    const history =
      await PracticeAttempt.find({

        studentId,

        status:
          'submitted'

      })
        .sort({
          submittedAt: -1
        })
        .limit(10)
        .lean();


    return res.render(
      'student/practice',
      {

        title:
          'Practice Test',

        subjects:
          subjects
            .filter(Boolean)
            .map(value =>
              String(value).trim()
            )
            .filter(Boolean)
            .sort(),

        // Kept for compatibility with existing EJS
        topics: [],

        history

      }
    );


  } catch (error) {

    console.error(
      'getPracticeBuilder error:',
      error
    );


    req.flash(
      'error',
      'Unable to load Practice Test.'
    );


    return res.redirect(
      '/student/dashboard'
    );

  }

};


/* ==========================================================================
   GET TOPICS FROM QUESTION BANK
============================================================================ */

exports.getPracticeTopics = async (req, res) => {

  try {

    const { Question } =
      require('../models');


    const subject =
      String(
        req.query.subject || ''
      ).trim();


    if (!subject) {

      return res.json([]);

    }


    /*
     * Get topics DIRECTLY from Question Bank.
     */

    const topicNames =
      await Question.distinct(
        'topic',
        {

          subject,

          isActive: {
            $ne: false
          }

        }
      );


    const cleanTopics =
      [
        ...new Set(

          topicNames

            .map(value =>
              String(value || '')
                .trim()
            )

            .filter(Boolean)

        )
      ]
        .sort(
          (a, b) =>
            a.localeCompare(b)
        );


    /*
     * Existing practice.ejs expects:
     *
     * [
     *   {
     *      name: "Current Electricity",
     *      subtopics: []
     *   }
     * ]
     */

    const rows =
      cleanTopics.map(
        name => ({

          name,

          subtopics: []

        })
      );


    return res.json(rows);


  } catch (error) {

    console.error(
      'getPracticeTopics error:',
      error
    );


    return res
      .status(500)
      .json([]);

  }

};


/* ==========================================================================
   GET SUBTOPICS FROM QUESTION BANK
============================================================================ */

exports.getPracticeSubtopics = async (req, res) => {

  try {

    const { Question } =
      require('../models');


    const subject =
      String(
        req.query.subject || ''
      ).trim();


    const topic =
      String(
        req.query.topic || ''
      ).trim();


    if (
      !subject ||
      !topic
    ) {

      return res.json([]);

    }


    /*
     * Get subtopics directly from Question Bank.
     */

    const values =
      await Question.distinct(
        'subtopic',
        {

          subject,

          topic,

          isActive: {
            $ne: false
          }

        }
      );


    const subtopics =
      [
        ...new Set(

          values

            .map(value =>
              String(value || '')
                .trim()
            )

            .filter(Boolean)

        )
      ]
        .sort(
          (a, b) =>
            a.localeCompare(b)
        );


    return res.json(
      subtopics
    );


  } catch (error) {

    console.error(
      'getPracticeSubtopics error:',
      error
    );


    return res
      .status(500)
      .json([]);

  }

};


/* ==========================================================================
   AVAILABLE QUESTION COUNT
============================================================================ */

exports.getPracticeQuestionCount = async (req, res) => {

  try {

    const { Question } =
      require('../models');


    const subject =
      String(
        req.query.subject || ''
      ).trim();


    const topic =
      String(
        req.query.topic || ''
      ).trim();


    const subtopic =
      String(
        req.query.subtopic || ''
      ).trim();


    const difficulty =
      String(
        req.query.difficulty || 'All'
      ).trim();


    if (!subject) {

      return res.json({
        count: 0
      });

    }


    const match = {

      subject,

      isActive: {
        $ne: false
      }

    };


    if (topic) {

      match.topic =
        topic;

    }


    if (subtopic) {

      match.subtopic =
        subtopic;

    }


    if (
      [
        'Easy',
        'Medium',
        'Hard'
      ].includes(
        difficulty
      )
    ) {

      match.difficulty =
        difficulty;

    }


    const count =
      await Question.countDocuments(
        match
      );


    return res.json({
      count
    });


  } catch (error) {

    console.error(
      'getPracticeQuestionCount error:',
      error
    );


    return res.json({
      count: 0
    });

  }

};


/* ==========================================================================
   START PRACTICE TEST
   RANDOM QUESTIONS FROM QUESTION BANK
============================================================================ */

exports.startPracticeTest = async (req, res) => {

  try {

    const { Question } =
      require('../models');


    const PracticeAttempt =
      require('../models/PracticeAttempt');


    const studentId =
      req.session.user.id;


    const subject =
      String(
        req.body.subject || ''
      ).trim();


    const topic =
      String(
        req.body.topic || ''
      ).trim();


    const subtopic =
      String(
        req.body.subtopic || ''
      ).trim();


    const difficulty =
      String(
        req.body.difficulty || 'All'
      ).trim();


    let requestedCount =
      parseInt(
        req.body.questionCount,
        10
      );


    if (
      !Number.isFinite(
        requestedCount
      )
    ) {

      requestedCount = 20;

    }


    requestedCount =
      Math.max(
        1,
        Math.min(
          100,
          requestedCount
        )
      );


    if (!subject) {

      req.flash(
        'error',
        'Please select a subject.'
      );


      return res.redirect(
        '/student/practice'
      );

    }


    /*
     * Question Bank filter
     */

    const match = {

      subject,

      isActive: {
        $ne: false
      }

    };


    if (topic) {

      match.topic =
        topic;

    }


    if (subtopic) {

      match.subtopic =
        subtopic;

    }


    if (
      [
        'Easy',
        'Medium',
        'Hard'
      ].includes(
        difficulty
      )
    ) {

      match.difficulty =
        difficulty;

    }


    /*
     * Check available questions
     */

    const available =
      await Question.countDocuments(
        match
      );


    if (
      available <= 0
    ) {

      req.flash(
        'error',
        'No matching questions found in Question Bank.'
      );


      return res.redirect(
        '/student/practice'
      );

    }


    const count =
      Math.min(
        requestedCount,
        available
      );


    /*
     * =====================================================
     * RANDOM QUESTION SELECTION
     * =====================================================
     */

    const randomQuestions =
      await Question.aggregate([

        {
          $match:
            match
        },

        {
          $sample: {
            size:
              count
          }
        },

        {
          $project: {
            _id: 1
          }
        }

      ]);


    if (
      !randomQuestions.length
    ) {

      req.flash(
        'error',
        'Unable to select random questions.'
      );


      return res.redirect(
        '/student/practice'
      );

    }


    /*
     * Store selected random order.
     *
     * Refresh does NOT reshuffle.
     */

    const questionIds =
      randomQuestions.map(
        question =>
          question._id
      );


    const attempt =
      await PracticeAttempt.create({

        studentId,

        subject,

        topic:
          topic || null,

        subtopic:
          subtopic || null,

        difficulty:
          [
            'Easy',
            'Medium',
            'Hard'
          ].includes(
            difficulty
          )
            ? difficulty
            : 'All',

        questionCount:
          questionIds.length,

        questionIds,

        answers: {},

        status:
          'in_progress',

        startedAt:
          new Date()

      });


    return res.redirect(
      `/student/practice/${attempt._id}`
    );


  } catch (error) {

    console.error(
      'startPracticeTest error:',
      error
    );


    req.flash(
      'error',
      'Could not create Practice Test: ' +
      error.message
    );


    return res.redirect(
      '/student/practice'
    );

  }

};


/* ==========================================================================
   OPEN PRACTICE TEST
============================================================================ */

exports.getPracticeAttempt = async (req, res) => {

  try {

    const { Question } =
      require('../models');


    const PracticeAttempt =
      require('../models/PracticeAttempt');


    const attempt =
      await PracticeAttempt.findOne({

        _id:
          req.params.attemptId,

        studentId:
          req.session.user.id

      });


    if (!attempt) {

      req.flash(
        'error',
        'Practice Test not found.'
      );


      return res.redirect(
        '/student/practice'
      );

    }


    if (
      attempt.status ===
      'submitted'
    ) {

      return res.redirect(
        `/student/practice/${attempt._id}/result`
      );

    }


    /*
     * $in does not guarantee order.
     */

    const rows =
      await Question.find({

        _id: {
          $in:
            attempt.questionIds
        }

      })
        .lean();


    const byId =
      new Map(

        rows.map(
          question => [

            String(
              question._id
            ),

            question

          ]
        )

      );


    const questions =
      attempt.questionIds

        .map(
          id =>
            byId.get(
              String(id)
            )
        )

        .filter(Boolean);


    return res.render(
      'student/practice-attempt',
      {

        title:
          'Practice Test',

        attempt,

        questions

      }
    );


  } catch (error) {

    console.error(
      'getPracticeAttempt error:',
      error
    );


    req.flash(
      'error',
      'Unable to open Practice Test.'
    );


    return res.redirect(
      '/student/practice'
    );

  }

};


/* ==========================================================================
   SUBMIT PRACTICE TEST
============================================================================ */

exports.submitPracticeTest = async (req, res) => {

  try {

    const { Question } =
      require('../models');


    const PracticeAttempt =
      require('../models/PracticeAttempt');


    const attempt =
      await PracticeAttempt.findOne({

        _id:
          req.params.attemptId,

        studentId:
          req.session.user.id

      });


    if (!attempt) {

      req.flash(
        'error',
        'Practice Test not found.'
      );


      return res.redirect(
        '/student/practice'
      );

    }


    if (
      attempt.status ===
      'submitted'
    ) {

      return res.redirect(
        `/student/practice/${attempt._id}/result`
      );

    }


    const questions =
      await Question.find({

        _id: {
          $in:
            attempt.questionIds
        }

      })
        .lean();


    const answers = {};


    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    let score = 0;


    for (
      const question of
      questions
    ) {

      const key =
        String(
          question._id
        );


      const given =
        String(
          req.body[
            `answer_${key}`
          ] || ''
        )
          .trim()
          .toUpperCase();


      answers[key] =
        given || null;


      if (!given) {

        unattempted++;

        continue;

      }


      const correctAnswer =
        String(
          question.correctAnswer ||
          ''
        )
          .trim()
          .toUpperCase();


      if (
        given ===
        correctAnswer
      ) {

        correct++;

        score +=
          Number(
            question.marks ||
            1
          );

      } else {

        wrong++;

      }

    }


    attempt.answers =
      answers;


    attempt.correct =
      correct;


    attempt.wrong =
      wrong;


    attempt.unattempted =
      unattempted;


    attempt.score =
      score;


    attempt.status =
      'submitted';


    attempt.submittedAt =
      new Date();


    await attempt.save();


    return res.redirect(
      `/student/practice/${attempt._id}/result`
    );


  } catch (error) {

    console.error(
      'submitPracticeTest error:',
      error
    );


    req.flash(
      'error',
      'Practice Test submission failed.'
    );


    return res.redirect(
      '/student/practice'
    );

  }

};


/* ==========================================================================
   PRACTICE RESULT
============================================================================ */

exports.getPracticeResult = async (req, res) => {

  try {

    const { Question } =
      require('../models');


    const PracticeAttempt =
      require('../models/PracticeAttempt');


    const attempt =
      await PracticeAttempt.findOne({

        _id:
          req.params.attemptId,

        studentId:
          req.session.user.id

      })
        .lean();


    if (
      !attempt ||
      attempt.status !==
        'submitted'
    ) {

      req.flash(
        'error',
        'Practice Result not found.'
      );


      return res.redirect(
        '/student/practice'
      );

    }


    const rows =
      await Question.find({

        _id: {
          $in:
            attempt.questionIds
        }

      })
        .lean();


    const byId =
      new Map(

        rows.map(
          question => [

            String(
              question._id
            ),

            question

          ]
        )

      );


    const questions =
      attempt.questionIds

        .map(
          id =>
            byId.get(
              String(id)
            )
        )

        .filter(Boolean);


    return res.render(
      'student/practice-result',
      {

        title:
          'Practice Result',

        attempt,

        questions

      }
    );


  } catch (error) {

    console.error(
      'getPracticeResult error:',
      error
    );


    req.flash(
      'error',
      'Unable to load Practice Result.'
    );


    return res.redirect(
      '/student/practice'
    );

  }

};