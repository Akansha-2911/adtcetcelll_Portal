const fs = require('fs');
const path = require('path');

let katex = null;
try {
  katex = require('katex');
} catch (_) {
  try {
    katex = require('../SPVN_CET_Portal_FINAL_PRODUCTION_READY_V5/SPVN_CET_Portal_FINAL/node_modules/katex');
  } catch (_) {}
}

const SUP_MAP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ', 'a': 'ᵃ',
  'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'k': 'ᵏ',
  'm': 'ᵐ', 'p': 'ᵖ', 't': 'ᵗ'
};

const SUB_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'i': 'ᵢ',
  'j': 'ⱼ', 'k': 'ₖ', 'm': 'ₘ', 'n': 'ₙ', 'p': 'ₚ',
  's': 'ₛ', 't': 'ₜ'
};

function toSuperscript(str) {
  return String(str).split('').map(c => SUP_MAP[c] || c).join('');
}

function toSubscript(str) {
  return String(str).split('').map(c => SUB_MAP[c] || c).join('');
}

const SUP_CHARS = '\u00B2\u00B3\u00B9\u2070-\u2079';
const SUB_CHARS = '\u2080-\u2089';
const MATH_CHARS = '0-9a-zA-Z' + SUP_CHARS + SUB_CHARS;

/**
 * Converts a raw LaTeX formula string into clean, human-readable Unicode math text.
 */
function cleanFormula(raw) {
  if (!raw) return '';
  let f = String(raw).trim();

  // Spacing commands
  f = f.replace(/\\quad\b/g, '  ')
       .replace(/\\qquad\b/g, '    ')
       .replace(/\\([,;! ])/g, ' ')
       .replace(/~/g, ' ');

  // Arrows
  f = f.replace(/\\(?:Rightarrow|implies)\b/g, '⇒')
       .replace(/\\Leftarrow\b/g, '⇐')
       .replace(/\\(?:Leftrightarrow|iff)\b/g, '⇔')
       .replace(/\\(?:rightarrow|to)\b/g, '→')
       .replace(/\\(?:leftarrow|gets)\b/g, '←');

  // Fractions: recursively format \frac{num}{den}
  for (let iter = 0; iter < 5; iter++) {
    if (!/\\(?:c|d)?frac\{/.test(f)) break;
    f = f.replace(/\\(?:c|d)?frac\{([^{}]+)\}\{([^{}]+)\}/g, (_, num, den) => {
      let n = cleanFormula(num).trim();
      let d = cleanFormula(den).trim();
      const nNeedWrap = n.includes('+') || n.includes('-') || n.includes('−') || n.includes(' ');
      const dNeedWrap = d.includes('+') || d.includes('-') || d.includes('−') || d.includes(' ');
      return (nNeedWrap ? `(${n})` : n) + '/' + (dNeedWrap ? `(${d})` : d);
    });
  }

  // Square roots
  f = f.replace(/\\sqrt\[([^\]]+)\]\{([^{}]+)\}/g, (_, n, b) => `${toSuperscript(n)}√(${cleanFormula(b).trim()})`)
       .replace(/\\sqrt\{([^{}]+)\}/g, (_, b) => `√(${cleanFormula(b).trim()})`);

  // Text formatting commands
  f = f.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g, '$1');

  // Bracket sizing commands
  f = f.replace(/\\left\s*([(\[{|])/g, '$1').replace(/\\right\s*([)\]}|])/g, '$1');
  f = f.replace(/\\\{/g, '{').replace(/\\\}/g, '}');

  // Operators & comparisons
  f = f.replace(/\\le(?:q)?\b/g, '≤')
       .replace(/\\ge(?:q)?\b/g, '≥')
       .replace(/\\ne(?:q)?\b/g, '≠')
       .replace(/\\pm\b/g, '±')
       .replace(/\\mp\b/g, '∓')
       .replace(/\\times\b/g, '×')
       .replace(/\\div\b/g, '÷')
       .replace(/\\cdot\b/g, '·')
       .replace(/\\approx\b/g, '≈')
       .replace(/\\equiv\b/g, '≡')
       .replace(/\\sim\b/g, '∼')
       .replace(/\\propto\b/g, '∝')
       .replace(/\\degree\b|(?:\^\\circ\b)|\\circ\b/g, '°')
       .replace(/\\(?:cdots|ldots|dots)\b/g, '...')
       .replace(/\\leftrightarrow\b/g, '↔')
       .replace(/\\infty\b/g, '∞')
       .replace(/\\angle\b/g, '∠')
       .replace(/\\parallel\b/g, '∥')
       .replace(/\\perp\b/g, '⊥')
       .replace(/\\triangle\b/g, '△')
       .replace(/\\partial\b/g, '∂')
       .replace(/\\nabla\b/g, '∇')
       .replace(/\\sum\b/g, '∑')
       .replace(/\\prod\b/g, '∏')
       .replace(/\\int\b/g, '∫')
       .replace(/\\in\b/g, '∈')
       .replace(/\\notin\b/g, '∉')
       .replace(/\\subset\b/g, '⊂')
       .replace(/\\subseteq\b/g, '⊆')
       .replace(/\\cup\b/g, '∪')
       .replace(/\\cap\b/g, '∩')
       .replace(/\\forall\b/g, '∀')
       .replace(/\\exists\b/g, '∃');

  // Greek letters
  f = f.replace(/\\alpha\b/g, 'α').replace(/\\beta\b/g, 'β').replace(/\\gamma\b/g, 'γ').replace(/\\Gamma\b/g, 'Γ')
       .replace(/\\delta\b/g, 'δ').replace(/\\Delta\b/g, 'Δ').replace(/\\epsilon\b|\\varepsilon\b/g, 'ε')
       .replace(/\\theta\b/g, 'θ').replace(/\\Theta\b/g, 'Θ').replace(/\\lambda\b/g, 'λ').replace(/\\Lambda\b/g, 'Λ')
       .replace(/\\mu\b/g, 'μ').replace(/\\pi\b/g, 'π').replace(/\\Pi\b/g, 'Π').replace(/\\sigma\b/g, 'σ')
       .replace(/\\Sigma\b/g, 'Σ').replace(/\\omega\b/g, 'ω').replace(/\\Omega\b/g, 'Ω').replace(/\\phi\b/g, 'φ')
       .replace(/\\eta\b/g, 'η').replace(/\\rho\b/g, 'ρ').replace(/\\tau\b/g, 'τ').replace(/\\psi\b/g, 'ψ');

  // Vector / accents
  f = f.replace(/\\vec\{([^{}]+)\}/g, '$1⃗');
  f = f.replace(/\\hat\{([^{}]+)\}/g, '$1̂');
  f = f.replace(/\\(?:bar|overline)\{([^{}]+)\}/g, '$1̄');

  // Superscripts: ^{...} or ^x
  f = f.replace(/\^\{([^{}]+)\}/g, (_, p) => toSuperscript(p));
  f = f.replace(/\^([0-9a-zA-Z+-])/g, (_, p) => toSuperscript(p));

  // Subscripts: _{...} or _x
  f = f.replace(/_\{([^{}]+)\}/g, (_, p) => toSubscript(p));
  f = f.replace(/_([0-9a-zA-Z+-])/g, (_, p) => toSubscript(p));

  // Functions
  f = f.replace(/\\(sin|cos|tan|cot|sec|csc|log|ln|det|lim|exp|min|max)\b/g, '$1');

  // Stray backslashes
  f = f.replace(/\\([a-zA-Z]+)/g, '$1');
  f = f.replace(/\\+/g, '');

  // Braces
  f = f.replace(/[{}]/g, '');

  // Operator spacing
  f = f.replace(/([=<>≤≥≠≈])/g, ' $1 ');
  f = f.replace(/\s*([+×÷])\s*/g, ' $1 ');

  // Compact variable products: e.g. "2 c x y" -> "2cxy", "7 y²" -> "7y²", "4 m₁ m₂" -> "4m₁m₂"
  for (let k = 0; k < 4; k++) {
    f = f.replace(new RegExp('([' + MATH_CHARS + '])\\s+([a-zA-Z])', 'g'), '$1$2');
    f = f.replace(new RegExp('([a-zA-Z])\\s+([a-zA-Z][' + SUP_CHARS + SUB_CHARS + '])', 'g'), '$1$2');
  }

  // Format subtraction vs negation
  const subRegex = new RegExp('([' + MATH_CHARS + ')])\\s*[-−]\\s*([' + MATH_CHARS + '(])', 'g');
  f = f.replace(subRegex, '$1 − $2');
  f = f.replace(/(^|[(/=\s])\s*[-−]\s*([0-9a-zA-Z(])/g, '$1−$2');
  f = f.replace(/=\s*−/g, '= −');

  // Collapse consecutive spaces
  f = f.replace(/[ \t]{2,}/g, ' ').trim();

  // Strip dollar signs
  f = f.replace(/\$/g, '');

  return f;
}

/**
 * Converts any text string with LaTeX equations into clean readable text for PDF generation.
 */
function formatMathToText(str) {
  if (!str) return '';
  const lines = String(str).split('\n');

  const formattedLines = lines.map(line => {
    let l = line;

    // First replace standard delimited math on this line
    const DELIMITED_ON_LINE = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\r\n]+\$)/g;
    l = l.replace(DELIMITED_ON_LINE, (match) => {
      let body = match;
      if (body.startsWith('\\(') && body.endsWith('\\)')) body = body.slice(2, -2);
      else if (body.startsWith('\\[') && body.endsWith('\\]')) body = body.slice(2, -2);
      else if (body.startsWith('$$') && body.endsWith('$$')) body = body.slice(2, -2);
      else if (body.startsWith('$') && body.endsWith('$')) body = body.slice(1, -1);
      return cleanFormula(body);
    });

    // If an odd number of '$' remains on this line (e.g. single unclosed '$' or broken delimiter)
    const dollarCount = (l.match(/\$/g) || []).length;
    if (dollarCount % 2 !== 0) {
      l = l.replace(/\$([^$]+)$/, (_, mathPart) => {
        if (/[0-9^_\\=+\-*/≤≥≠]/.test(mathPart)) {
          return cleanFormula(mathPart);
        }
        return mathPart;
      });
    }

    // Replace any remaining standalone LaTeX symbols without altering English text
    l = l.replace(/\\(?:Rightarrow|implies)\b/g, '⇒')
         .replace(/\\(?:rightarrow|to)\b/g, '→')
         .replace(/\\(?:Leftarrow)\b/g, '⇐')
         .replace(/\\(?:Leftrightarrow|iff)\b/g, '⇔')
         .replace(/\\(?:pm)\b/g, '±')
         .replace(/\\(?:mp)\b/g, '∓')
         .replace(/\\(?:times)\b/g, '×')
         .replace(/\\(?:div)\b/g, '÷')
         .replace(/\\(?:cdot)\b/g, '·')
         .replace(/\\(?:le|leq)\b/g, '≤')
         .replace(/\\(?:ge|geq)\b/g, '≥')
         .replace(/\\(?:ne|neq)\b/g, '≠')
         .replace(/\\(?:approx)\b/g, '≈')
         .replace(/\\(?:infty)\b/g, '∞')
         .replace(/\\(?:alpha)\b/g, 'α')
         .replace(/\\(?:beta)\b/g, 'β')
         .replace(/\\(?:gamma)\b/g, 'γ')
         .replace(/\\(?:delta)\b/g, 'δ')
         .replace(/\\(?:theta)\b/g, 'θ')
         .replace(/\\(?:pi)\b/g, 'π')
         .replace(/\\(?:sigma)\b/g, 'σ')
         .replace(/\\(?:omega)\b/g, 'ω')
         .replace(/\\(?:lambda)\b/g, 'λ')
         .replace(/\\(?:mu)\b/g, 'μ')
         .replace(/\\quad\b/g, ' ')
         .replace(/\\qquad\b/g, '  ')
         .replace(/\$/g, '')
         .replace(/\\+/g, '');

    return l;
  });

  return formattedLines.join('\n');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Converts any text string with LaTeX equations into Word-compatible HTML with MathML.
 * When MS Word opens this HTML (.doc), it natively parses the MathML into real equations.
 */
function formatMathToWordHtml(str) {
  if (!str) return '';
  const raw = String(str);

  const DELIMITED_REGEX = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\r\n]+\$)/g;
  let result = '';
  let lastIndex = 0;
  let match;

  while ((match = DELIMITED_REGEX.exec(raw)) !== null) {
    const prefix = raw.slice(lastIndex, match.index);
    result += escapeHtml(prefix).replace(/\n/g, '<br>');

    const fullMatch = match[0];
    let texBody = fullMatch;
    let isDisplay = false;
    if (texBody.startsWith('\\(') && texBody.endsWith('\\)')) {
      texBody = texBody.slice(2, -2);
    } else if (texBody.startsWith('\\[') && texBody.endsWith('\\]')) {
      texBody = texBody.slice(2, -2);
      isDisplay = true;
    } else if (texBody.startsWith('$$') && texBody.endsWith('$$')) {
      texBody = texBody.slice(2, -2);
      isDisplay = true;
    } else if (texBody.startsWith('$') && texBody.endsWith('$')) {
      texBody = texBody.slice(1, -1);
    }

    let mathOutput = '';
    if (katex) {
      try {
        mathOutput = katex.renderToString(texBody.trim(), {
          displayMode: isDisplay,
          output: 'mathml',
          throwOnError: false
        });
      } catch (_) {}
    }

    if (!mathOutput) {
      mathOutput = `<span>${escapeHtml(cleanFormula(texBody))}</span>`;
    }

    result += mathOutput;
    lastIndex = DELIMITED_REGEX.lastIndex;
  }

  const remainder = raw.slice(lastIndex);
  result += escapeHtml(remainder).replace(/\n/g, '<br>');

  return result;
}

/**
 * Configures PDFKit document with Unicode-capable fonts (Arial / Calibri from Windows fonts)
 * so that superscripts, subscripts, Greek characters and math symbols render properly.
 */
function setupPdfFonts(doc) {
  const fontCandidates = [
    { regular: 'C:/Windows/Fonts/arial.ttf', bold: 'C:/Windows/Fonts/arialbd.ttf', name: 'Arial' },
    { regular: 'C:/Windows/Fonts/calibri.ttf', bold: 'C:/Windows/Fonts/calibrib.ttf', name: 'Calibri' },
    { regular: 'C:/Windows/Fonts/segoeui.ttf', bold: 'C:/Windows/Fonts/segoeuib.ttf', name: 'SegoeUI' }
  ];

  for (const c of fontCandidates) {
    if (fs.existsSync(c.regular)) {
      try {
        doc.registerFont('MathFont', c.regular);
        if (fs.existsSync(c.bold)) {
          doc.registerFont('MathFont-Bold', c.bold);
        } else {
          doc.registerFont('MathFont-Bold', c.regular);
        }
        return {
          font: 'MathFont',
          fontBold: 'MathFont-Bold'
        };
      } catch (_) {}
    }
  }

  return {
    font: 'Helvetica',
    fontBold: 'Helvetica-Bold'
  };
}

module.exports = {
  formatMathToText,
  formatMathToWordHtml,
  cleanFormula,
  setupPdfFonts,
  escapeHtml
};
