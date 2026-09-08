const CET_SECTION_ORDER = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology'
];


const CET_PREREQUISITE_SUBJECTS = [
  'Physics',
  'Chemistry'
];


/* =========================================================
   NORMALIZE VALUE TO ARRAY
========================================================= */

function values(value) {

  if (!value) {
    return [];
  }

  return Array.isArray(value)
    ? value
    : [value];

}


function normalizeSubjectName(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'General';
  const lower = s.toLowerCase();
  if (lower === 'physics' || lower === 'phy') return 'Physics';
  if (lower === 'chemistry' || lower === 'chem') return 'Chemistry';
  if (lower === 'mathematics' || lower === 'maths' || lower === 'math') return 'Mathematics';
  if (lower === 'biology' || lower === 'bio') return 'Biology';
  return s;
}


/* =========================================================
   SUBJECT OF QUESTION
========================================================= */

function subjectOf(question) {

  return normalizeSubjectName(
    question?.subject ||
    'General'
  );

}


/* =========================================================
   CET SECTION TEST DETECTION
========================================================= */

function isCetSectionTest(
  test,
  questions = []
) {

  const pattern = String(test?.testPattern || '').toUpperCase();
  const courses =
    values(
      test?.course
    )
      .map(
        course =>
          String(course)
            .trim()
            .toUpperCase()
      );


  const isCet =
    courses.includes('CET') ||
    courses.includes('MHT-CET') ||
    pattern === 'MHT-CET' ||
    pattern === 'CET';

  if (!isCet) {
    return false;
  }


  const subjects =
    new Set(
      questions
        .map(subjectOf)
    );


  const hasPhysics =
    subjects.has('Physics');


  const hasChemistry =
    subjects.has('Chemistry');


  const hasFinalSubject =
    subjects.has('Mathematics') ||
    subjects.has('Biology');


  return (
    hasPhysics &&
    hasChemistry &&
    hasFinalSubject
  );

}


/* =========================================================
   SHUFFLE
========================================================= */

function shuffle(items) {

  const shuffled =
    [...items];


  for (
    let index =
      shuffled.length - 1;

    index > 0;

    index--
  ) {

    const randomIndex =
      Math.floor(
        Math.random() *
        (index + 1)
      );


    [
      shuffled[index],
      shuffled[randomIndex]
    ] = [
      shuffled[randomIndex],
      shuffled[index]
    ];

  }


  return shuffled;

}


/* =========================================================
   ORDERED SECTION NAMES
========================================================= */

function orderedSectionNames(
  questions = []
) {

  const available =
    [
      ...new Set(
        questions.map(
          subjectOf
        )
      )
    ];


  return [

    ...CET_SECTION_ORDER.filter(
      subject =>
        available.includes(
          subject
        )
    ),

    ...available.filter(
      subject =>
        !CET_SECTION_ORDER.includes(
          subject
        )
    )

  ];

}


/* =========================================================
   QUESTION ORDER

   IMPORTANT:
   Always group by sections in standard order:
   Physics -> Chemistry -> Mathematics -> Biology -> (others)
   Shuffling is strictly inside each particular section!
   Questions from different sections are NEVER mixed.
========================================================= */

function buildQuestionOrder(
  test,
  questions = []
) {

  return orderedSectionNames(
    questions
  )
    .flatMap(
      subject => {

        const sectionQuestions =
          questions.filter(
            question =>
              subjectOf(question) ===
              subject
          );

        const sectionIds =
          sectionQuestions.map(
            question =>
              (question._id || question.id || question).toString()
          );

        return test?.shuffleQuestions
          ? shuffle(sectionIds)
          : sectionIds;

      }
    );

}


/* =========================================================
   BUILD CET SECTION STATE

   Explicit section lock is controlled by Result state,
   NOT by merely visiting questions.
========================================================= */

function buildSectionState(
  questionOrder = [],
  questions = [],
  answers = {},
  visitedQuestionIds = [],
  resultState = {},
  isStrictCetFlow = false
) {

  const subjectById =
    new Map(

      questions.map(
        question => [

          question._id.toString(),

          subjectOf(question)

        ]
      )

    );


  const sectionNames = [];

  const sectionMap =
    new Map();


  questionOrder.forEach(
    (
      questionId,
      questionIndex
    ) => {

      const id =
        questionId.toString();


      const subject =
        subjectById.get(id) ||
        'General';


      if (
        !sectionMap.has(
          subject
        )
      ) {

        sectionNames.push(
          subject
        );


        sectionMap.set(
          subject,
          {

            name:
              subject,

            questionIds:
              [],

            questionNumbers:
              []

          }
        );

      }


      const section =
        sectionMap.get(
          subject
        );


      section.questionIds.push(
        id
      );


      section.questionNumbers.push(
        questionIndex + 1
      );

    }
  );


  const sections =
    sectionNames.map(
      name =>
        sectionMap.get(name)
    );


  const visitedSet =
    new Set(

      visitedQuestionIds.map(
        questionId =>
          String(questionId)
      )

    );


  /*
   * Persistent Phase-1 state.
   */

  const section1Submitted =
    resultState?.section1Submitted ===
    true;


  const finalSectionUnlocked =
    resultState?.finalSectionUnlocked ===
      true ||
    section1Submitted;


  /*
   * Determine final subject.
   */

  const finalSection =
    sections.find(
      section =>
        section.name ===
          'Mathematics' ||
        section.name ===
          'Biology'
    ) || null;


  /*
   * Set section states.
   */

  sections.forEach(
    (
      section,
      sectionIndex
    ) => {

      section.index =
        sectionIndex;


      section.isPrerequisite =
        CET_PREREQUISITE_SUBJECTS.includes(
          section.name
        );


      section.isFinal =
        section.name ===
          'Mathematics' ||
        section.name ===
          'Biology';


      /*
       * Answered count.
       */

      section.answeredCount =
        section.questionIds.filter(
          questionId =>
            Boolean(
              answers?.[
                questionId
              ]?.answer
            )
        ).length;


      section.totalQuestions =
        section.questionIds.length;


      section.visitedCount =
        section.questionIds.filter(
          questionId =>
            visitedSet.has(
              questionId
            )
        ).length;


      /*
       * "Completed" here only means every question
       * has a stored answer.
       *
       * This is informational only.
       * It does NOT unlock next phase.
       */

      section.completed =
        section.questionIds.every(
          questionId =>
            Boolean(
              answers?.[
                questionId
              ]?.answer
            )
        );


      /*
       * LOCKING RULES
       *
       * BEFORE Phase 1 submit:
       * Physics = unlocked
       * Chemistry = unlocked
       * Math/Bio = locked
       *
       * AFTER Phase 1 submit:
       * Physics = locked
       * Chemistry = locked
       * Math/Bio = unlocked
       */

      if (isStrictCetFlow) {
        if (
          section.isPrerequisite
        ) {

          section.locked =
            section1Submitted;

        } else if (
          section.isFinal
        ) {

          section.locked =
            !finalSectionUnlocked;

        } else {

          section.locked =
            false;

        }
      } else {
        section.locked = false;
      }

    }
  );


  /* =======================================================
     PHASE 1 QUESTIONS
  ======================================================= */

  const phase1Sections =
    sections.filter(
      section =>
        CET_PREREQUISITE_SUBJECTS.includes(
          section.name
        )
    );


  const phase1QuestionIds =
    phase1Sections.flatMap(
      section =>
        section.questionIds
    );


  const phase1QuestionNumbers =
    phase1Sections.flatMap(
      section =>
        section.questionNumbers
    );


  const phase1AnsweredCount =
    phase1QuestionIds.filter(
      questionId =>
        Boolean(
          answers?.[
            questionId
          ]?.answer
        )
    ).length;


  /* =======================================================
     FIRST QUESTION OF CURRENT PHASE
  ======================================================= */

  let firstPendingQuestionNumber =
    1;


  if (isStrictCetFlow) {
    if (
      section1Submitted
    ) {

      if (
        finalSection &&
        finalSection.questionNumbers.length
      ) {

        firstPendingQuestionNumber =
          finalSection.questionNumbers[0];

      }

    } else {

      const firstPhase1Section =
        phase1Sections[0];


      if (
        firstPhase1Section &&
        firstPhase1Section.questionNumbers.length
      ) {

        firstPendingQuestionNumber =
          firstPhase1Section.questionNumbers[0];

      }

    }
  }


  return {

    sections,

    subjectById,

    section1Submitted,

    finalSectionUnlocked,

    finalSection,

    phase1Sections,

    phase1QuestionIds,

    phase1QuestionNumbers,

    phase1AnsweredCount,

    phase1TotalQuestions:
      phase1QuestionIds.length,

    firstPendingQuestionNumber

  };

}


/* =========================================================
   IS QUESTION IN PHASE 1
========================================================= */

function isPhase1Subject(
  subject
) {

  return CET_PREREQUISITE_SUBJECTS.includes(
    String(subject || '')
  );

}


/* =========================================================
   IS FINAL SUBJECT
========================================================= */

function isFinalSubject(
  subject
) {

  return (
    subject ===
      'Mathematics' ||
    subject ===
      'Biology'
  );

}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {

  CET_SECTION_ORDER,

  CET_PREREQUISITE_SUBJECTS,

  buildQuestionOrder,

  buildSectionState,

  isCetSectionTest,

  orderedSectionNames,

  isPhase1Subject,

  isFinalSubject

};