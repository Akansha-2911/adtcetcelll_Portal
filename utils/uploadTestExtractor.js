const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
  createCanvas,
  loadImage
} = require('@napi-rs/canvas');

const {
  uploadRoot
} = require('./storagePaths');


/* =========================================================
   CONFIG
========================================================= */

const GEMINI_MODEL =
  process.env.GEMINI_OCR_MODEL ||
  process.env.GEMINI_MODEL ||
  'gemini-3.5-flash';

const OPENAI_MODEL =
  process.env.OPENAI_OCR_MODEL ||
  'gpt-5.6';

const OPENAI_REASONING =
  process.env.OPENAI_OCR_REASONING_EFFORT ||
  'medium';

const OCR_PRIMARY =
  String(
    process.env.OCR_PRIMARY ||
    'gemini'
  ).toLowerCase();

const BATCH_SIZE =
  Math.max(
    1,
    Math.min(
      4,
      Number(
        process.env.UPLOAD_TEST_AI_BATCH ||
        2
      )
    )
  );

const clean = value =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();


function boolTrue(value) {

  return (
    value === true ||
    String(value).toLowerCase() ===
      'true'
  );

}


function visualLetters(value) {

  return Array.isArray(value)
    ? value
        .map(item =>
          String(item || '')
            .trim()
            .toUpperCase()
        )
        .filter(item =>
          ['A', 'B', 'C', 'D']
            .includes(item)
        )
    : [];

}


/* =========================================================
   TEXT / MATH
========================================================= */

function mathClean(value) {

  let text = String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();

  if (!text) return '';

  // Preserve LaTeX structure. The browser renderer understands \(...\), \[...\]
  // and the standard math commands. Do not flatten fractions/roots/units into
  // ordinary text during extraction.
  text = text
    .replace(/\\\\([A-Za-z]+)/g, '\\$1')
    .replace(/\\\\([()[\]])/g, '\\$1')
    .replace(/\$\$([\s\S]*?)\$\$/g, '\\[$1\\]')
    .replace(/\$(?!\$)([^$\n]+)\$/g, '\\($1\\)')
    .replace(/√\s*\(([^()]*)\)/g, '\\(\\sqrt{$1}\\)')
    .replace(/√\s*([+-]?(?:\d+(?:\.\d+)?|[A-Za-z]))/g, '\\(\\sqrt{$1}\\)');

  // Normalize common OCR Unicode operators without changing their meaning.
  text = text
    .replace(/∧/g, '\\land ')
    .replace(/∨/g, '\\lor ')
    .replace(/¬/g, '\\neg ')
    .replace(/→/g, '\\to ')
    .replace(/⇒/g, '\\Rightarrow ')
    .replace(/↔/g, '\\leftrightarrow ')
    .replace(/≤/g, '\\le ')
    .replace(/≥/g, '\\ge ')
    .replace(/≠/g, '\\ne ');

  // Keep readable spacing but do not collapse deliberate display-math newlines.
  return text
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, arr) => line || (index > 0 && index < arr.length - 1))
    .join('\n')
    .trim();
}



/* =========================================================
   JSON
========================================================= */

function extractJSON(text) {

  const raw =
    String(text || '')
      .replace(
        /```json/gi,
        ''
      )
      .replace(
        /```/g,
        ''
      )
      .trim();


  try {

    return JSON.parse(raw);

  } catch (_) {}


  const start =
    raw.indexOf('{');

  const end =
    raw.lastIndexOf('}');


  if (
    start >= 0 &&
    end > start
  ) {

    try {

      return JSON.parse(
        raw.slice(
          start,
          end + 1
        )
      );

    } catch (_) {}

  }


  throw new Error(
    'AI returned invalid JSON.'
  );

}


const sleep =
  milliseconds =>
    new Promise(resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
    );


/* =========================================================
   GEMINI
========================================================= */

function geminiImagePart(buffer) {

  return {

    inlineData: {

      mimeType:
        'image/png',

      data:
        buffer.toString(
          'base64'
        )

    }

  };

}


async function geminiOCR(
  images,
  prompt,
  retries = 1
) {

  if (
    !process.env.GEMINI_API_KEY
  ) {

    throw new Error(
      'GEMINI_API_KEY is missing.'
    );

  }


  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(
      GEMINI_MODEL
    ) +
    ':generateContent?key=' +
    process.env.GEMINI_API_KEY;


  let lastError;


  for (
    let attempt = 0;
    attempt <= retries;
    attempt++
  ) {

    try {

      const response =
        await fetch(
          url,
          {

            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json'

            },

            body:
              JSON.stringify({

                contents: [
                  {

                    role:
                      'user',

                    parts: [

                      {
                        text:
                          prompt
                      },

                      ...images.map(
                        geminiImagePart
                      )

                    ]

                  }
                ],

                generationConfig: {

                  temperature:
                    0,

                  responseMimeType:
                    'application/json'

                }

              })

          }
        );


      const responseText =
        await response.text();


      if (!response.ok) {

        const error =
          new Error(
            `Gemini ${response.status}: ${responseText}`
          );

        error.status =
          response.status;

        throw error;

      }


      const result =
        JSON.parse(
          responseText
        );


      const output =
        result
          ?.candidates
          ?.[0]
          ?.content
          ?.parts
          ?.map(
            item =>
              item.text || ''
          )
          .join('') ||
        '';


      if (!output) {

        throw new Error(
          'Gemini returned empty response.'
        );

      }


      return output;


    } catch (error) {

      lastError =
        error;


      if (
        attempt < retries &&
        (
          error.status === 429 ||
          error.status >= 500
        )
      ) {

        await sleep(
          1200 *
          (
            attempt + 1
          )
        );

        continue;

      }


      break;

    }

  }


  throw lastError;

}


/* =========================================================
   OPENAI FALLBACK
========================================================= */

function openAIImagePart(buffer) {

  return {

    type:
      'input_image',

    image_url:
      'data:image/png;base64,' +
      buffer.toString(
        'base64'
      )

  };

}


function getOpenAIText(data) {

  if (
    typeof data
      ?.output_text ===
      'string' &&
    data.output_text.trim()
  ) {

    return data
      .output_text
      .trim();

  }


  const output = [];


  for (
    const item of
    data?.output || []
  ) {

    for (
      const content of
      item?.content || []
    ) {

      if (
        typeof content
          ?.text ===
        'string'
      ) {

        output.push(
          content.text
        );

      }

    }

  }


  return output
    .join('')
    .trim();

}


async function openAIOCR(
  images,
  prompt,
  retries = 1
) {

  if (
    !process.env.OPENAI_API_KEY
  ) {

    throw new Error(
      'OPENAI_API_KEY is missing.'
    );

  }


  let lastError;


  for (
    let attempt = 0;
    attempt <= retries;
    attempt++
  ) {

    try {

      const body = {

        model:
          OPENAI_MODEL,

        input: [
          {

            role:
              'user',

            content: [

              {
                type:
                  'input_text',

                text:
                  prompt
              },

              ...images.map(
                openAIImagePart
              )

            ]

          }
        ]

      };


      if (
        OPENAI_REASONING
      ) {

        body.reasoning = {

          effort:
            OPENAI_REASONING

        };

      }


      const response =
        await fetch(
          'https://api.openai.com/v1/responses',
          {

            method:
              'POST',

            headers: {

              'Content-Type':
                'application/json',

              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`

            },

            body:
              JSON.stringify(
                body
              )

          }
        );


      const responseText =
        await response.text();


      if (!response.ok) {

        const error =
          new Error(
            `OpenAI ${response.status}: ${responseText}`
          );

        error.status =
          response.status;

        throw error;

      }


      const output =
        getOpenAIText(
          JSON.parse(
            responseText
          )
        );


      if (!output) {

        throw new Error(
          'OpenAI returned empty response.'
        );

      }


      return output;


    } catch (error) {

      lastError =
        error;


      if (
        attempt < retries &&
        (
          error.status === 429 ||
          error.status >= 500
        )
      ) {

        await sleep(
          1500 *
          (
            attempt + 1
          )
        );

        continue;

      }


      break;

    }

  }


  throw lastError;

}


/* =========================================================
   ONE PAGE VISION
========================================================= */

async function runOnePageVision(
  images,
  prompt
) {

  const errors = [];


  /*
   * GEMINI FIRST
   */

  if (
    process.env.GEMINI_API_KEY
  ) {

    try {

      console.log(
        `[Upload Test Vision] Gemini ${GEMINI_MODEL}`
      );


      return {

        provider:
          'gemini',

        text:
          await geminiOCR(
            images,
            prompt,
            1
          )

      };


    } catch (error) {

      errors.push(
        'gemini: ' +
        error.message
      );


      console.warn(
        '[Upload Test Vision] Gemini failed:',
        error.message
      );

    }

  }


  /*
   * OPENAI ONLY AS FALLBACK
   */

  if (
    process.env.OPENAI_API_KEY
  ) {

    try {

      console.log(
        `[Upload Test Vision] OpenAI fallback ${OPENAI_MODEL}`
      );


      return {

        provider:
          'openai',

        text:
          await openAIOCR(
            images,
            prompt
          )

      };


    } catch (error) {

      errors.push(
        'openai: ' +
        error.message
      );

    }

  }


  throw new Error(

    errors.length

      ? 'All vision providers failed. ' +
        errors.join(' | ')

      : 'Vision unavailable. Configure GEMINI_API_KEY.'

  );

}


/* =========================================================
   FRIENDLY AI ERROR
========================================================= */

function friendlyAIError(error) {

  const message =
    String(
      error?.message ||
      error ||
      ''
    );


  if (
    /429|quota|resource_exhausted|rate.?limit/i
      .test(message)
  ) {

    return (
      'Gemini extraction limit temporarily reached. ' +
      'Please retry or check Gemini API quota.'
    );

  }


  if (
    /401|invalid.*api.*key|authentication/i
      .test(message)
  ) {

    return (
      'AI authentication failed. ' +
      'Check GEMINI_API_KEY.'
    );

  }


  if (
    /403/i.test(
      message
    )
  ) {

    return (
      'Gemini rejected the request. ' +
      'Check API permissions and quota.'
    );

  }


  if (
    /timeout/i.test(
      message
    )
  ) {

    return (
      'AI extraction timed out. ' +
      'Please retry.'
    );

  }


  return (
    'AI could not extract this question. ' +
    'Review the original page preview.'
  );

}


/* =========================================================
   PDF
========================================================= */

async function loadPdfJs() {

  return import(
    'pdfjs-dist/legacy/build/pdf.mjs'
  );

}


function rebuildPdfText(items) {

  const rows = [];

  const tolerance = 4;


  for (
    const item of
    items || []
  ) {

    const text =
      String(
        item.str || ''
      ).trim();


    if (!text) {
      continue;
    }


    const x =
      Number(
        item.transform?.[4] ||
        0
      );

    const y =
      Number(
        item.transform?.[5] ||
        0
      );


    let row =
      rows.find(
        current =>
          Math.abs(
            current.y - y
          ) <= tolerance
      );


    if (!row) {

      row = {

        y,

        items: []

      };

      rows.push(
        row
      );

    }


    row.items.push({
      x,
      text
    });

  }


  rows.sort(
    (
      a,
      b
    ) =>
      b.y - a.y
  );


  return rows

    .map(row => {

      row.items.sort(
        (
          a,
          b
        ) =>
          a.x - b.x
      );


      return row.items

        .map(
          item =>
            item.text
        )

        .join(' ')

        .replace(
          /\s+/g,
          ' '
        )

        .trim();

    })

    .filter(Boolean)

    .join('\n');

}


async function renderPdfPages(
  filePath
) {

  const pdfjs =
    await loadPdfJs();


  const data =
    new Uint8Array(
      await fs.promises.readFile(
        filePath
      )
    );


  const pdf =
    await pdfjs
      .getDocument({
        data,
        disableWorker:
          true
      })
      .promise;


  const pages = [];


  for (
    let pageNumber = 1;
    pageNumber <=
      pdf.numPages;
    pageNumber++
  ) {

    const page =
      await pdf.getPage(
        pageNumber
      );


    const textContent =
      await page
        .getTextContent();


    const text =
      rebuildPdfText(
        textContent.items
      );


    const base =
      page.getViewport({
        scale:
          1
      });


    /*
     * Render at high enough resolution
     * for Gemini + diagram cropping.
     */

    const scale =
      Math.max(
        2.5,
        2200 /
        base.width
      );


    const viewport =
      page.getViewport({
        scale
      });


    const canvas =
      createCanvas(
        Math.ceil(
          viewport.width
        ),
        Math.ceil(
          viewport.height
        )
      );


    const context =
      canvas.getContext(
        '2d'
      );


    context.fillStyle =
      '#ffffff';


    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );


    await page.render({

      canvasContext:
        context,

      viewport

    }).promise;


    pages.push({

      image:
        canvas.toBuffer(
          'image/png'
        ),

      text

    });

  }


  return pages;

}


/* =========================================================
   LOCAL TEXT PARSER
========================================================= */

function parseOptionsFromText(
  text
) {

  const source =
    String(
      text || ''
    )
      .replace(
        /\r/g,
        '\n'
      );


  const optionRegex =
    /(?:^|\n|\s)(?:\(([ABCD])\)\.?|([ABCD])[\.\)])\s*/g;


  const matches =
    [
      ...source.matchAll(
        optionRegex
      )
    ];


  if (
    matches.length < 4
  ) {

    return null;

  }


  const normalized =
    matches.map(
      match => ({

        match,

        letter:
          match[1] ||
          match[2]

      })
    );


  const optionMap = {};


  for (
    let index = 0;
    index <
      normalized.length;
    index++
  ) {

    const current =
      normalized[index];


    const letter =
      current.letter;


    if (
      optionMap[letter] !==
      undefined
    ) {

      continue;

    }


    const start =
      current.match.index +
      current.match[0].length;


    let end =
      source.length;


    for (
      let next =
        index + 1;

      next <
        normalized.length;

      next++
    ) {

      if (
        [
          'A',
          'B',
          'C',
          'D'
        ].includes(
          normalized[next]
            .letter
        )
      ) {

        end =
          normalized[next]
            .match
            .index;

        break;

      }

    }


    optionMap[letter] =
      mathClean(
        source.slice(
          start,
          end
        )
      );

  }


  if (
    [
      'A',
      'B',
      'C',
      'D'
    ].some(
      letter =>
        optionMap[letter] ===
        undefined
    )
  ) {

    return null;

  }


  const firstA =
    normalized.find(
      item =>
        item.letter ===
        'A'
    );


  if (!firstA) {
    return null;
  }


  let question =
    source.slice(
      0,
      firstA.match.index
    );


  question =
    question

      .replace(
        /CET Practice Paper.*?Page\s*\d+/gi,
        ''
      )

      .replace(
        /Physics\s*-\s*CET Practice Question Paper/gi,
        ''
      )

      .replace(
        /Chemistry\s*-\s*CET Practice Question Paper/gi,
        ''
      )

      .replace(
        /\d+\s*Multiple Choice Questions.*$/gmi,
        ''
      )

      .replace(
        /Questions\s*\d+/gi,
        ''
      )

      .replace(
        /Suggested Time.*$/gmi,
        ''
      )

      .replace(
        /Marking.*$/gmi,
        ''
      )

      .replace(
        /\[\s*\d{4}\s*\]/g,
        ''
      )

      .replace(
        /^\s*Q\d+\.\s*/i,
        ''
      );


  question =
    mathClean(
      question
    );


  if (!question) {
    return null;
  }


  return {

    question,

    optionA:
      mathClean(
        optionMap.A
      ),

    optionB:
      mathClean(
        optionMap.B
      ),

    optionC:
      mathClean(
        optionMap.C
      ),

    optionD:
      mathClean(
        optionMap.D
      )

  };

}


/* =========================================================
   SOLUTION PARSER
========================================================= */

function parseSolutionText(
  text
) {

  const source =
    String(
      text || ''
    ).trim();


  let correctAnswer =
    '';


  const patterns = [

    /Correct\s*Answer\s*:\s*([ABCD])/i,

    /Answer\s*:\s*([ABCD])/i,

    /^\s*\(?\s*([ABCD])\s*\)?(?:\.|\s|$)/i,

    /Q\s*\d+\s*[-:]\s*([ABCD])(?:\.|\s|$)/i

  ];


  for (
    const pattern of
    patterns
  ) {

    const match =
      source.match(
        pattern
      );


    if (match) {

      correctAnswer =
        String(
          match[1]
        ).toUpperCase();

      break;

    }

  }


  let explanation =
    source

      .replace(
        /Physics CET\s*-\s*Solution Q\d+/gi,
        ''
      )

      .replace(
        /Chemistry CET\s*-\s*Solution Q\d+/gi,
        ''
      )

      .replace(
        /Correct\s*Answer\s*:\s*[ABCD]/gi,
        ''
      )

      .replace(
        /^\s*\(?\s*[ABCD]\s*\)?\s*\.?\s*/i,
        ''
      )

      .trim();


  explanation =
    mathClean(
      explanation
    );


  return {

    correctAnswer,

    explanation,

    detailedSolution:
      explanation

  };

}



function hasVisualCue(page) {

  const text =
    String(
      page?.text || ''
    );

  return /\b(as shown|shown below|shown above|diagram|graph|circuit|figure|ray diagram|venn|venn diagram|geometry|chart|structure shown|image shown|table shown)\b/i.test(text);

}

function isVisualOnlyOptionText(value) {
  const text = String(value || '').trim();

  if (!text) return false;

  // If Gemini returned bracket-style visual description, treat it as figure-only text
  if (/^\[[\s\S]*\]$/.test(text)) return true;

  // Extra safety for common visual-description patterns
  return /^(venn diagram|diagram|graph|figure|image|circuit|chart|table)\s*:/i.test(
    text.replace(/^\[|\]$/g, '').trim()
  );
}


/* =========================================================
   LOCAL PAGE COMPLETENESS
========================================================= */

function localPageIsComplete(
  parsed,
  questionPage,
  solutionPage
) {

  if (
    !parsed?.question
  ) {

    return false;

  }


  /*
   * Force Gemini whenever wording
   * clearly refers to a diagram.
   */

  if (
    hasVisualCue(
      questionPage
    ) ||
    hasVisualCue(
      solutionPage
    )
  ) {

    return false;

  }


  const options = [

    parsed.optionA,

    parsed.optionB,

    parsed.optionC,

    parsed.optionD

  ];


  /*
   * Missing option text often means
   * the option was actually an image.
   */

  if (
    options.some(
      option =>
        !clean(option)
    )
  ) {

    return false;

  }


  /*
   * Very short options can be
   * labels belonging to diagrams.
   */

  const almostEmpty =
    options.filter(
      option =>
        clean(option)
          .length < 2
    ).length;


  if (
    almostEmpty >= 2
  ) {

    return false;

  }


  if (
    clean(
      questionPage?.text
    ).length < 25
  ) {

    return false;

  }


  if (
    solutionPage &&
    !clean(
      solutionPage.text
    )
  ) {

    return false;

  }


  return true;

}


/* =========================================================
   DEFAULT QUESTION
========================================================= */

function defaults(options) {

  return {

    subject:
      options.subject ||
      '',

    topic:
      options.topic ||
      '',

    subtopic:
      options.subtopic ||
      '',

    difficulty:
      options.difficulty ||
      'Medium',

    marks:
      Number(
        options.marks
      ) ||
      1,

    negativeMarks:
      Number(
        options.negativeMarks
      ) ||
      0

  };

}


function defaultQuestion(
  page,
  defaultValues,
  message = ''
) {

  return {

    pageNumber:
      page,

    solutionPageNumber:
      null,

    question:
      '',

    questionImage:
      null,

    optionA:
      '',

    optionB:
      '',

    optionC:
      '',

    optionD:
      '',

    optionAImage:
      null,

    optionBImage:
      null,

    optionCImage:
      null,

    optionDImage:
      null,

    correctAnswer:
      '',

    explanation:
      '',

    detailedSolution:
      '',

    solutionImage:
      null,

    subject:
      defaultValues.subject,

    topic:
      defaultValues.topic,

    subtopic:
      defaultValues.subtopic,

    difficulty:
      defaultValues.difficulty,

    marks:
      defaultValues.marks,

    negativeMarks:
      defaultValues
        .negativeMarks,

    questionType:
      'Single Choice',

    hasVisualQuestion:
      false,

    hasVisualOptions:
      false,

    questionPagePreview:
      null,

    solutionPagePreview:
      null,

    extractionProvider:
      '',

    extractionStatus:
      'failed',

    extractionMessage:
      message

  };

}


/* =========================================================
   LOCAL QUESTION
========================================================= */

function makeLocalQuestion(
  parsed,
  solution,
  page,
  defaultValues
) {

  return {

    pageNumber:
      page,

    solutionPageNumber:
      solution
        ? page
        : null,

    question:
      mathClean(
        parsed.question
      ),

    questionImage:
      null,

    optionA:
      mathClean(
        parsed.optionA
      ),

    optionB:
      mathClean(
        parsed.optionB
      ),

    optionC:
      mathClean(
        parsed.optionC
      ),

    optionD:
      mathClean(
        parsed.optionD
      ),

    optionAImage:
      null,

    optionBImage:
      null,

    optionCImage:
      null,

    optionDImage:
      null,

    correctAnswer:
      [
        'A',
        'B',
        'C',
        'D'
      ].includes(
        solution?.correctAnswer
      )
        ? solution.correctAnswer
        : '',

    explanation:
      mathClean(
        solution?.explanation
      ),

    detailedSolution:
      mathClean(
        solution
          ?.detailedSolution
      ),

    solutionImage:
      null,

    subject:
      defaultValues.subject,

    topic:
      defaultValues.topic,

    subtopic:
      defaultValues.subtopic,

    difficulty:
      defaultValues
        .difficulty,

    marks:
      defaultValues.marks,

    negativeMarks:
      defaultValues
        .negativeMarks,

    questionType:
      'Single Choice',

    hasVisualQuestion:
      false,

    hasVisualOptions:
      false,

    questionPagePreview:
      null,

    solutionPagePreview:
      null,

    extractionProvider:
      'pdf_text',

    extractionStatus:
      'success',

    extractionMessage:
      ''

  };

}


/* =========================================================
   NORMALIZE AI QUESTION
========================================================= */

function normalizeQuestion(
  data,
  page,
  defaultValues
) {

  const answer =
    clean(
      data.correctAnswer
    )
      .toUpperCase()
      .replace(
        /[^ABCD]/g,
        ''
      )
      .slice(
        0,
        1
      );


  return {

    pageNumber:
      page,

    solutionPageNumber:
      null,

    question:
      mathClean(
        data.question
      ),

    questionImage:
      null,

    optionA:
      mathClean(
        data.optionA
      ),

    optionB:
      mathClean(
        data.optionB
      ),

    optionC:
      mathClean(
        data.optionC
      ),

    optionD:
      mathClean(
        data.optionD
      ),

    optionAImage:
      null,

    optionBImage:
      null,

    optionCImage:
      null,

    optionDImage:
      null,

    correctAnswer:
      [
        'A',
        'B',
        'C',
        'D'
      ].includes(answer)
        ? answer
        : '',

    explanation:
      mathClean(
        data.explanation
      ),

    detailedSolution:
      mathClean(
        data.detailedSolution
      ),

    solutionImage:
      null,

    subject:
      clean(
        data.subject ||
        defaultValues.subject
      ),

    topic:
      clean(
        data.topic ||
        defaultValues.topic
      ),

    subtopic:
      clean(
        data.subtopic ||
        defaultValues.subtopic
      ),

    difficulty:
      [
        'Easy',
        'Medium',
        'Hard'
      ].includes(
        data.difficulty
      )
        ? data.difficulty
        : defaultValues
            .difficulty,

    marks:
      Number(
        data.marks
      ) ||
      defaultValues.marks,

    negativeMarks:
      Number(
        data.negativeMarks
      ) ||
      defaultValues
        .negativeMarks,

    questionType:
      [
        'Single Choice',
        'Multiple Choice',
        'Numerical Answer'
      ].includes(
        data.questionType
      )
        ? data.questionType
        : 'Single Choice',

    hasVisualQuestion:
      boolTrue(
        data.hasVisualQuestion
      ),

    hasVisualOptions:
      boolTrue(
        data.hasVisualOptions
      ),

    questionPagePreview:
      null,

    solutionPagePreview:
      null,

    extractionProvider:
      '',

    extractionStatus:
      mathClean(
        data.question
      )
        ? 'success'
        : 'warning',

    extractionMessage:
      ''

  };

}


/* =========================================================
   IMAGE STORAGE

   IMPORTANT:
   Every generated image is stored INSIDE uploadRoot.
========================================================= */

async function saveImage(
  sourceFile,
  pageNumber,
  buffer,
  type
) {

  const extractionRoot =
    path.join(
      uploadRoot,
      'test-extracted-images'
    );


  await fs.promises.mkdir(
    extractionRoot,
    {
      recursive:
        true
    }
  );


  const sourceBase =
    path.basename(
      sourceFile,
      path.extname(
        sourceFile
      )
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      )
      .slice(
        0,
        50
      );


  const page =
    String(
      pageNumber
    )
      .replace(
        /[^a-zA-Z0-9_-]/g,
        '_'
      );


  const random =
    crypto
      .randomBytes(5)
      .toString(
        'hex'
      );


  const fileName =
    sourceBase +
    '_p' +
    page +
    '_' +
    type +
    '_' +
    random +
    '.png';


  const fullPath =
    path.join(
      extractionRoot,
      fileName
    );


  await fs.promises.writeFile(
    fullPath,
    buffer
  );


  const relativePath =
    path.relative(
      uploadRoot,
      fullPath
    )
      .replace(
        /\\/g,
        '/'
      );


  const publicPath =
    '/uploads/' +
    relativePath;


  console.log(
    '[Extracted Image Saved]',
    publicPath
  );


  return publicPath;

}


/* =========================================================
   CROP IMAGE
========================================================= */

async function cropImage(
  pageBuffer,
  region,
  sourceFile,
  pageNumber,
  type
) {

  if (
    !Array.isArray(region) ||
    region.length !== 4
  ) {

    return null;

  }


  let [
    x1,
    y1,
    x2,
    y2
  ] =
    region.map(
      Number
    );


  if (
    [
      x1,
      y1,
      x2,
      y2
    ].some(
      value =>
        !Number.isFinite(
          value
        )
    )
  ) {

    return null;

  }


  /*
   * Gemini coordinates:
   * 0 -> 1000
   */

  x1 =
    Math.max(
      0,
      Math.min(
        1000,
        x1
      )
    );

  y1 =
    Math.max(
      0,
      Math.min(
        1000,
        y1
      )
    );

  x2 =
    Math.max(
      0,
      Math.min(
        1000,
        x2
      )
    );

  y2 =
    Math.max(
      0,
      Math.min(
        1000,
        y2
      )
    );


  if (
    x2 <= x1 ||
    y2 <= y1
  ) {

    return null;

  }


  const image =
    await loadImage(
      pageBuffer
    );


  x1 =
    Math.round(
      x1 /
      1000 *
      image.width
    );

  y1 =
    Math.round(
      y1 /
      1000 *
      image.height
    );

  x2 =
    Math.round(
      x2 /
      1000 *
      image.width
    );

  y2 =
    Math.round(
      y2 /
      1000 *
      image.height
    );


  /*
   * Add a little margin around diagrams.
   */

  const horizontalMargin =
    Math.max(
      14,
      Math.round(
        image.width *
        0.01
      )
    );


  const verticalMargin =
    Math.max(
      10,
      Math.round(
        image.height *
        0.006
      )
    );


  x1 =
    Math.max(
      0,
      x1 -
      horizontalMargin
    );

  y1 =
    Math.max(
      0,
      y1 -
      verticalMargin
    );

  x2 =
    Math.min(
      image.width,
      x2 +
      horizontalMargin
    );

  y2 =
    Math.min(
      image.height,
      y2 +
      verticalMargin
    );


  const width =
    x2 - x1;

  const height =
    y2 - y1;


  if (
    width < 30 ||
    height < 30
  ) {

    return null;

  }


  const canvas =
    createCanvas(
      width,
      height
    );


  const context =
    canvas.getContext(
      '2d'
    );


  context.fillStyle =
    '#ffffff';


  context.fillRect(
    0,
    0,
    width,
    height
  );


  context.drawImage(
    image,

    x1,
    y1,
    width,
    height,

    0,
    0,
    width,
    height
  );


  return saveImage(
    sourceFile,
    pageNumber,
    canvas.toBuffer(
      'image/png'
    ),
    type
  );

}


/* =========================================================
   NORMALIZE VISUAL REGION
========================================================= */

function normalizeVisualRegion(
  region
) {

  if (
    !Array.isArray(region) ||
    region.length !== 4
  ) {

    return null;

  }


  const values =
    region.map(
      Number
    );


  if (
    values.some(
      value =>
        !Number.isFinite(
          value
        )
    )
  ) {

    return null;

  }


  let [
    x1,
    y1,
    x2,
    y2
  ] =
    values;


  x1 =
    Math.max(
      0,
      Math.min(
        1000,
        x1
      )
    );

  y1 =
    Math.max(
      0,
      Math.min(
        1000,
        y1
      )
    );

  x2 =
    Math.max(
      0,
      Math.min(
        1000,
        x2
      )
    );

  y2 =
    Math.max(
      0,
      Math.min(
        1000,
        y2
      )
    );


  if (
    x2 <= x1 ||
    y2 <= y1
  ) {

    return null;

  }


  /*
   * Ignore tiny accidental boxes.
   */

  if (
    (
      x2 - x1
    ) < 15 ||
    (
      y2 - y1
    ) < 15
  ) {

    return null;

  }


  return [
    x1,
    y1,
    x2,
    y2
  ];

}


/* =========================================================
   ATTACH VISUALS
========================================================= */

async function attachVisuals({
  q,
  raw,
  qImage,
  sImage,
  qPath,
  sPath,
  pageTag
}) {


  /* =======================================================
     QUESTION IMAGE
  ======================================================= */

  const questionRegion =
    normalizeVisualRegion(
      raw.questionRegion
    );


  if (
    (
      boolTrue(
        raw.hasVisualQuestion
      ) ||
      questionRegion
    ) &&
    questionRegion
  ) {

    try {

      q.questionImage =
        await cropImage(
          qImage,
          questionRegion,
          qPath,
          pageTag,
          'question-image'
        );


      q.hasVisualQuestion =
        Boolean(
          q.questionImage
        );


      if (
        q.questionImage
      ) {

        console.log(
          '[Visual Crop] Question image:',
          q.questionImage
        );

      }


    } catch (error) {

      console.warn(
        '[Visual Crop] Question image failed:',
        error.message
      );

      q.questionImage =
        null;

      q.hasVisualQuestion =
        false;

    }

  } else {

    q.questionImage =
      null;

    q.hasVisualQuestion =
      false;

  }


  /* =======================================================
     OPTION IMAGES
  ======================================================= */

  /* =========================================================
   OPTION VISUALS — FINAL CORRECTED VERSION
========================================================= */

const letters =
  Array.isArray(raw.visualOptionLetters)
    ? raw.visualOptionLetters
        .map(function(value) {
          return String(value || '')
            .trim()
            .toUpperCase();
        })
        .filter(function(value) {
          return ['A', 'B', 'C', 'D'].includes(value);
        })
    : [];

const options = [
  {
    letter: 'A',
    textField: 'optionA',
    regionField: 'optionARegion',
    imageField: 'optionAImage'
  },
  {
    letter: 'B',
    textField: 'optionB',
    regionField: 'optionBRegion',
    imageField: 'optionBImage'
  },
  {
    letter: 'C',
    textField: 'optionC',
    regionField: 'optionCRegion',
    imageField: 'optionCImage'
  },
  {
    letter: 'D',
    textField: 'optionD',
    regionField: 'optionDRegion',
    imageField: 'optionDImage'
  }
];

function validVisualRegion(region) {
  if (!Array.isArray(region) || region.length !== 4) {
    return false;
  }

  const values = region.map(Number);

  if (
    values.some(function(value) {
      return !Number.isFinite(value);
    })
  ) {
    return false;
  }

  const x1 = values[0];
  const y1 = values[1];
  const x2 = values[2];
  const y2 = values[3];

  return x2 > x1 && y2 > y1;
}

for (const option of options) {
  const letter = option.letter;
  const textField = option.textField;
  const regionField = option.regionField;
  const imageField = option.imageField;

  q[imageField] = null;

  const region = raw[regionField];
  const explicitlyVisual = letters.includes(letter);
  const hasValidRegion = validVisualRegion(region);

  if (!explicitlyVisual && !hasValidRegion) {
    continue;
  }

  if (!hasValidRegion) {
    console.warn(`Option ${letter}: visual detected but crop region missing.`);
    continue;
  }

  try {
    const cropped = await cropImage(
      qImage,
      region,
      qPath,
      pageTag,
      'option-' + letter.toLowerCase()
    );

    if (cropped) {
      q[imageField] = cropped;
      console.log(`[Visual Crop] Option ${letter}: ${cropped}`);

      // IMPORTANT:
      // if option text is only a generated visual explanation,
      // remove it so only the figure is shown in review UI
      if (isVisualOnlyOptionText(q[textField])) {
        q[textField] = '';
      }
    } else {
      console.warn(`Option ${letter}: crop returned empty.`);
    }
  } catch (error) {
    console.warn(`Option ${letter} crop failed:`, error.message);
    q[imageField] = null;
  }
}

q.hasVisualOptions = Boolean(
  q.optionAImage ||
  q.optionBImage ||
  q.optionCImage ||
  q.optionDImage
);

  /*
   * Gemini identified visual options,
   * but crops failed.
   */

  if (
    boolTrue(
      raw.hasVisualOptions
    ) &&
    !q.hasVisualOptions
  ) {

    q.extractionStatus =
      'warning';


    const warning =
      'Visual answer options were detected, but automatic image cropping could not create usable option images. Verify the original question page.';


    if (
      !String(
        q.extractionMessage ||
        ''
      ).trim()
    ) {

      q.extractionMessage =
        warning;

    } else {

      q.extractionMessage +=
        ' ' +
        warning;

    }

  }


  /* =======================================================
     SOLUTION IMAGE
  ======================================================= */

  const solutionRegion =
    normalizeVisualRegion(
      raw.solutionRegion
    );


  if (
    sImage &&
    sPath &&
    (
      boolTrue(
        raw.hasVisualSolution
      ) ||
      solutionRegion
    ) &&
    solutionRegion
  ) {

    try {

      q.solutionImage =
        await cropImage(
          sImage,
          solutionRegion,
          sPath,
          pageTag,
          'solution-image'
        );


    } catch (error) {

      console.warn(
        '[Visual Crop] Solution failed:',
        error.message
      );

      q.solutionImage =
        null;

    }

  } else {

    q.solutionImage =
      null;

  }


  return q;

}


/* =========================================================
   GEMINI VISUAL RULES
========================================================= */

const VISUAL_RULES = `

VISUAL RULES:

1. Mathematical expressions are TEXT, not images.

Examples that MUST remain text:
(p ∨ q) → r
(p ∧ q) → r
¬p ∨ q
x² + y²
√x
(a+b)/(c+d)

2. Treat these as real visual content:
- Venn diagrams
- graphs
- circuit diagrams
- geometry figures
- chemical structures
- pictures
- image-based options
- visual tables
- charts
- drawings

3. CRITICAL:
If option A, B, C or D contains graphical content,
you MUST return that option letter inside visualOptionLetters.

Example when all are Venn diagrams:

"hasVisualOptions":true,
"visualOptionLetters":["A","B","C","D"]

4. For EVERY visual option return a bounding region.

Example:

"optionARegion":[100,400,450,600],
"optionBRegion":[550,400,900,600],
"optionCRegion":[100,620,450,820],
"optionDRegion":[550,620,900,820]

Those values are only format examples.
Determine the actual coordinates from the page.

5. Regions use normalized coordinates from 0 to 1000.

Format:

[x1,y1,x2,y2]

Top-left:
[0,0]

Bottom-right:
[1000,1000]

6. Keep each bounding box tight around ONLY that option visual.

Do not include another option in the same region.

7. Never return:

"hasVisualOptions":true

while all option regions are null.

8. If an option is a diagram, also put a short description
inside optionA / optionB / optionC / optionD when possible.

Example:

"[Venn diagram: T inside S]"

9. If the question itself has an important diagram:
"hasVisualQuestion":true
and return questionRegion.

10. If the solution contains a graph/diagram/working image:
"hasVisualSolution":true
and return solutionRegion.

`;


/* =========================================================
   SINGLE PAGE PROMPT
========================================================= */

function buildSinglePrompt(
  page,
  defaultValues,
  hasSolution
) {

  return `

You are a highly accurate CET/JEE/NEET exam question extraction engine.

IMAGE 1:
Question Page ${page}.

${hasSolution
  ? `IMAGE 2:
Matching Solution Page ${page}.`
  : ''
}

MODE:
ONE PAGE = ONE QUESTION.

Extract exactly ONE question.

Return ONLY valid JSON.

{
  "question":"",
  "optionA":"",
  "optionB":"",
  "optionC":"",
  "optionD":"",

  "correctAnswer":"",

  "subject":"${defaultValues.subject}",
  "topic":"${defaultValues.topic}",
  "subtopic":"${defaultValues.subtopic}",

  "difficulty":"${defaultValues.difficulty}",

  "marks":${defaultValues.marks},
  "negativeMarks":${defaultValues.negativeMarks},

  "questionType":"Single Choice",

  "explanation":"",
  "detailedSolution":"",

  "hasVisualQuestion":false,
  "hasVisualOptions":false,
  "hasVisualSolution":false,

  "visualOptionLetters":[],

  "questionRegion":null,

  "optionARegion":null,
  "optionBRegion":null,
  "optionCRegion":null,
  "optionDRegion":null,

  "solutionRegion":null
}

RULES:

1. Extract the complete question exactly from IMAGE 1.

2. Extract A/B/C/D in their original order.

3. Preserve mathematical meaning and notation exactly. Put every mathematical or scientific expression inside \( and \) using valid LaTeX. Use \frac{}{}, \sqrt{}, superscripts/subscripts, vectors and Greek symbols correctly. For Physics units use \text{ } (for example \(24\text{ m/s}\)). For Chemistry preserve formulas and reaction arrows with subscripts/superscripts (for example \(H_2SO_4\), \(CaCO_3 \to CaO + CO_2\)). Never return bare LaTeX commands outside math delimiters.

4. correctAnswer must be:
A
B
C
D
or ""

5. Use IMAGE 2 only for the answer and solution belonging to IMAGE 1.

6. Never invent content.

7. Before returning JSON, inspect A/B/C/D visually.
If they are diagrams, return their regions.

${VISUAL_RULES}

`;

}


/* =========================================================
   SAVE PAGE PREVIEWS
========================================================= */

async function savePreviews(
  question,
  questionImage,
  solutionImage,
  pageTag,
  pageNumber,
  questionPath,
  solutionPath
) {

  question.questionPagePreview =
    await saveImage(
      questionPath,
      pageTag,
      questionImage,
      'question-page'
    );


  if (
    solutionImage &&
    solutionPath
  ) {

    question.solutionPageNumber =
      pageNumber;


    question.solutionPagePreview =
      await saveImage(
        solutionPath,
        pageTag,
        solutionImage,
        'solution-page'
      );

  }

}


/* =========================================================
   EXTRACT ONE PAGE
========================================================= */

async function extractOnePageHybrid(
  questionPage,
  solutionPage,
  page,
  defaultValues,
  questionPath,
  solutionPath
) {

  const parsed =
    parseOptionsFromText(
      questionPage.text
    );


  const solution =
    solutionPage
      ? parseSolutionText(
          solutionPage.text
        )
      : null;


  /*
   * FAST LOCAL PATH
   */

  if (
    parsed &&
    localPageIsComplete(
      parsed,
      questionPage,
      solutionPage
    )
  ) {

    const question =
      makeLocalQuestion(
        parsed,
        solution,
        page,
        defaultValues
      );


    await savePreviews(
      question,
      questionPage.image,
      solutionPage?.image ||
        null,
      page,
      page,
      questionPath,
      solutionPath
    );


    console.log(
      `[Upload Test] Page ${page}: PDF TEXT`
    );


    return question;

  }


  /*
   * VISUAL / GEMINI PATH
   */

  console.log(
    `[Upload Test] Page ${page}: GEMINI VISION`
  );


  const images = [
    questionPage.image
  ];


  if (
    solutionPage?.image
  ) {

    images.push(
      solutionPage.image
    );

  }


  try {

    const ai =
      await runOnePageVision(
        images,
        buildSinglePrompt(
          page,
          defaultValues,
          Boolean(
            solutionPage?.image
          )
        )
      );


    const raw =
      extractJSON(
        ai.text
      );


    const question =
      normalizeQuestion(
        raw,
        page,
        defaultValues
      );


    question.extractionProvider =
      ai.provider;


    await savePreviews(
      question,
      questionPage.image,
      solutionPage?.image ||
        null,
      page,
      page,
      questionPath,
      solutionPath
    );


    await attachVisuals({

      q:
        question,

      raw,

      qImage:
        questionPage.image,

      sImage:
        solutionPage?.image ||
        null,

      qPath:
        questionPath,

      sPath:
        solutionPath,

      pageTag:
        page

    });


    return question;


  } catch (error) {

    console.error(
      `[Upload Test] Page ${page}:`,
      error.message
    );


    const question =
      parsed

        ? makeLocalQuestion(
            parsed,
            solution,
            page,
            defaultValues
          )

        : defaultQuestion(
            page,
            defaultValues,
            friendlyAIError(
              error
            )
          );


    question.extractionStatus =
      'warning';


    question.extractionMessage =
      parsed

        ? (
            friendlyAIError(
              error
            ) +
            ' Local PDF text was kept. Check the original page for diagrams.'
          )

        : friendlyAIError(
            error
          );


    /*
     * Always retain source page preview.
     */

    try {

      await savePreviews(
        question,
        questionPage.image,
        solutionPage?.image ||
          null,
        page,
        page,
        questionPath,
        solutionPath
      );


      if (
        parsed &&
        hasVisualCue(
          questionPage
        ) &&
        question
          .questionPagePreview
      ) {

        question.questionImage =
          question
            .questionPagePreview;


        question.hasVisualQuestion =
          true;


        question.extractionMessage +=
          ' Full question page retained as visual fallback.';

      }


      if (
        parsed &&
        solutionPage &&
        hasVisualCue(
          solutionPage
        ) &&
        question
          .solutionPagePreview
      ) {

        question.solutionImage =
          question
            .solutionPagePreview;

      }


    } catch (_) {}


    return question;

  }

}


/* =========================================================
   PARALLEL MAP
========================================================= */

async function parallelMap(
  items,
  worker,
  size = BATCH_SIZE
) {

  const output = [];


  for (
    let index = 0;
    index < items.length;
    index += size
  ) {

    const batch =
      items.slice(
        index,
        index + size
      );


    const batchOutput =
      await Promise.all(

        batch.map(
          (
            item,
            batchIndex
          ) =>
            worker(
              item,
              index +
              batchIndex
            )
        )

      );


    output.push(
      ...batchOutput
    );

  }


  return output;

}


/* =========================================================
   PDF WORKFLOW
========================================================= */

async function extractPdfOnePage(
  options
) {

  const defaultValues =
    defaults(
      options
    );


  const questionPages =
    await renderPdfPages(
      options.questionFilePath
    );


  const solutionPages =
    options.solutionFilePath

      ? await renderPdfPages(
          options.solutionFilePath
        )

      : [];


  const questions =
    await parallelMap(

      questionPages,

      (
        questionPage,
        index
      ) =>
        extractOnePageHybrid(

          questionPage,

          solutionPages[index] ||
          null,

          index + 1,

          defaultValues,

          options
            .questionFilePath,

          options
            .solutionFilePath

        )

    );


  questions.forEach(
    (
      question,
      index
    ) => {

      if (
        solutionPages.length &&
        !solutionPages[index]
      ) {

        question.extractionStatus =
          question.extractionStatus ===
          'failed'

            ? 'failed'

            : 'warning';


        question.extractionMessage =
          [
            question
              .extractionMessage,

            'Matching solution page not found.'
          ]
            .filter(Boolean)
            .join(' ');

      }

    }
  );


  return {

    questions,

    questionPageCount:
      questionPages.length,

    solutionPageCount:
      solutionPages.length

  };

}


/* =========================================================
   PUBLIC
========================================================= */

async function extractUploadedTest(
  options
) {

  if (
    !options
      ?.questionFilePath
  ) {

    throw new Error(
      'Question paper is required.'
    );

  }


  if (
    path.extname(
      options.questionFilePath
    ).toLowerCase() !==
    '.pdf'
  ) {

    throw new Error(
      'Question paper must be PDF.'
    );

  }


  if (
    options.solutionFilePath &&
    path.extname(
      options.solutionFilePath
    ).toLowerCase() !==
    '.pdf'
  ) {

    throw new Error(
      'Solution paper must also be PDF.'
    );

  }


  console.log(
    '========================================'
  );

  console.log(
    '[Upload Test] ONE PAGE = ONE QUESTION'
  );

  console.log(
    '[Upload Test] Primary AI:',
    GEMINI_MODEL
  );

  console.log(
    '[Upload Test] Image directory:',
    path.join(
      uploadRoot,
      'test-extracted-images'
    )
  );

  console.log(
    '========================================'
  );


  return extractPdfOnePage(
    options
  );

}


module.exports = {
  extractUploadedTest
};