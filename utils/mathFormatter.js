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
  'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ',
  'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ',
  'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
  'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ',
  'K': 'ᴷ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'T': 'ᵀ',
  'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ'
};

const SUB_MAP = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
  '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ',
  'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ',
  'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
};

function toSuperscript(str) {
  return String(str).split('').map(c => SUP_MAP[c] || c).join('');
}

function toSubscript(str) {
  return String(str).split('').map(c => SUB_MAP[c] || c).join('');
}

const SUP_SUB = '\u00B2\u00B3\u00B9\u2070-\u209F';

const STOP_WORDS = new Set([
  'and', 'or', 'if', 'then', 'where', 'with', 'given', 'let', 'when',
  'for', 'the', 'is', 'as', 'to', 'in', 'of', 'by', 'on', 'at', 'not',
  'has', 'find', 'than', 'such', 'that', 'from', 'each', 'all', 'both',
  'between', 'value', 'values', 'slope', 'slopes', 'line', 'lines',
  'times', 'their', 'product', 'sum', 'difference', 'ratio', 'roots',
  'root', 'equal', 'equals', 'hence', 'but', 'only', 'solution', 'option',
  'using', 'correct', 'answer', 'explanation'
]);

function replaceBalancedFracs(str) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    const fracMatch = str.slice(i).match(/^\\(?:c|d)?frac/);
    if (fracMatch) {
      const fracLen = fracMatch[0].length;
      let p = i + fracLen;
      while (p < str.length && /\s/.test(str[p])) p++;
      if (str[p] === '{') {
        let depth = 0;
        let numStart = p + 1;
        let numEnd = -1;
        for (let j = p; j < str.length; j++) {
          if (str[j] === '{') depth++;
          else if (str[j] === '}') {
            depth--;
            if (depth === 0) { numEnd = j; break; }
          }
        }
        if (numEnd !== -1) {
          let q = numEnd + 1;
          while (q < str.length && /\s/.test(str[q])) q++;
          if (str[q] === '{') {
            let denStart = q + 1;
            let denEnd = -1;
            depth = 0;
            for (let j = q; j < str.length; j++) {
              if (str[j] === '{') depth++;
              else if (str[j] === '}') {
                depth--;
                if (depth === 0) { denEnd = j; break; }
              }
            }
            if (denEnd !== -1) {
              const num = cleanFormula(str.slice(numStart, numEnd)).trim();
              const den = cleanFormula(str.slice(denStart, denEnd)).trim();
              const nWrap = /[+\-−\s/]/.test(num) && !/^\([^()]+\)$/.test(num);
              const dWrap = (/[+\-−\s/·]/.test(den) || /[0-9]+[a-zA-Z√]/.test(den) || (den.includes('√') && !den.startsWith('√'))) && !/^\([^()]+\)$/.test(den) && !/^[0-9]+$/.test(den);
              result += (nWrap ? `(${num})` : num) + '/' + (dWrap ? `(${den})` : den);
              i = denEnd + 1;
              continue;
            }
          }
        }
      }
    }
    result += str[i];
    i++;
  }
  return result;
}

function replaceBalancedRoots(str) {
  let result = '';
  let i = 0;
  while (i < str.length) {
    const isLatexSqrt = str.slice(i).startsWith('\\sqrt');
    const isPlainSqrt = str.slice(i).match(/^sqrt(?=[\[({])/i);
    if (isLatexSqrt || isPlainSqrt) {
      const matchLen = isLatexSqrt ? 5 : 4;
      let p = i + matchLen;
      let rootDeg = '';
      if (str[p] === '[') {
        const closeIdx = str.indexOf(']', p);
        if (closeIdx !== -1) {
          rootDeg = toSuperscript(str.slice(p + 1, closeIdx).trim());
          p = closeIdx + 1;
        }
      }
      while (p < str.length && /\s/.test(str[p])) p++;
      const openChar = str[p];
      const closeChar = openChar === '{' ? '}' : openChar === '(' ? ')' : null;
      if (closeChar) {
        let depth = 0;
        let bStart = p + 1;
        let bEnd = -1;
        for (let j = p; j < str.length; j++) {
          if (str[j] === openChar) depth++;
          else if (str[j] === closeChar) {
            depth--;
            if (depth === 0) { bEnd = j; break; }
          }
        }
        if (bEnd !== -1) {
          const inside = cleanFormula(str.slice(bStart, bEnd)).trim();
          const cleanInside = (inside.length === 1 && !/[+\-−/·]/.test(inside)) ? `√${inside}` : `√(${inside})`;
          result += (rootDeg || '') + cleanInside;
          i = bEnd + 1;
          continue;
        }
      }
    }
    result += str[i];
    i++;
  }
  return result;
}

const PUA_NEG = '\uE001';
const PUA_LBRACE = '\uE002';
const PUA_RBRACE = '\uE003';

const win1252ToByte = new Map([
  ['\u20AC', 0x80], ['\u201A', 0x82], ['\u0192', 0x83], ['\u201E', 0x84],
  ['\u2026', 0x85], ['\u2020', 0x86], ['\u2021', 0x87], ['\u02C6', 0x88],
  ['\u2030', 0x89], ['\u0160', 0x8A], ['\u2039', 0x8B], ['\u0152', 0x8C],
  ['\u017D', 0x8E], ['\u2018', 0x91], ['\u2019', 0x92], ['\u201C', 0x93],
  ['\u201D', 0x94], ['\u2022', 0x95], ['\u2013', 0x96], ['\u2014', 0x97],
  ['\u02DC', 0x98], ['\u2122', 0x99], ['\u0161', 0x9A], ['\u203A', 0x9B],
  ['\u0153', 0x9C], ['\u017E', 0x9E], ['\u0178', 0x9F]
]);

function decodeMojibake(str) {
  if (!str || typeof str !== 'string') return str;
  if (!/[\u00C2-\u00F4]/.test(str)) return str;

  let out = str.replace(/([\u00C2-\u00F4](?:[\u0080-\u00BF\u00A0-\u00FF]|\u2018|\u2019|\u201C|\u201D|\u2013|\u2014|\u2026|\u02C6|\u2122|\u2022|\u0152|\u0153|\u0160|\u0161|\u0178|\u017D|\u017E|\u20AC|\u201A|\u0192|\u201E|\u2020|\u2021|\u2030|\u2039|\u203A|\u02DC)+)/g, (match) => {
    try {
      const bytes = [];
      for (let i = 0; i < match.length; i++) {
        const ch = match[i];
        const code = ch.charCodeAt(0);
        if (code <= 0x7F) {
          bytes.push(code);
        } else if (win1252ToByte.has(ch)) {
          bytes.push(win1252ToByte.get(ch));
        } else if (code <= 0xFF) {
          bytes.push(code);
        } else {
          return match;
        }
      }
      const buf = Buffer.from(bytes);
      const decoded = buf.toString('utf8');
      if (!decoded.includes('\uFFFD')) {
        return decoded;
      }
    } catch (e) {}
    return match;
  });

  out = out.replace(/\u00C2[\u00A0\s]*/g, ' ')
           .replace(/Â[\u00A0\s]*/g, ' ')
           .replace(/Â/g, ' ')
           .replace(/âˆ’/g, '-')
           .replace(/â€“|â€”/g, '-');
  return out;
}

function normalizeMathUnicode(str) {
  if (!str) return '';
  let s = String(str);
  s = decodeMojibake(s);
  // Normalize Plane 1 SMP Mathematical Alphanumeric symbols (U+1D400 - U+1D7FF) to standard ASCII
  s = s.replace(/[\uD835][\uDC00-\uDFFF]/g, char => char.normalize('NFKD'));
  // Normalize mathematical tildes to ASCII ~
  s = s.replace(/[\u223C\u223D\u223E\u301C\uFF5E]/g, '~');
  // Normalize minus signs (U+2212) and dashes to standard ASCII -
  s = s.replace(/[\u2212\u2013\u2014]/g, '-');
  // Strip invisible math formatting characters that cause PDF tofu boxes
  s = s.replace(/[\u200B-\u200D\u2060-\u2064\uFEFF]/g, '');
  // Normalize non-breaking space
  s = s.replace(/\u00A0/g, ' ');
  return s;
}

function formatPiecewiseBody(body) {
  const rawRows = body.split(/\\\\|\r?\n/).map(r => r.trim()).filter(r => r.length > 0);
  const formattedRows = rawRows.map(row => {
    const cols = row.split('&').map(c => cleanFormula(c.trim())).filter(c => c.length > 0);
    if (cols.length >= 2) {
      const expr = cols[0];
      const cond = cols.slice(1).join('  ');
      if (!expr.endsWith(',') && !cond.startsWith(',')) {
        return `${expr},  ${cond}`;
      }
      return `${expr}  ${cond}`;
    }
    return cols.join('  ');
  });
  return PUA_LBRACE + ' ' + formattedRows.join(' ;  ') + ' ' + PUA_RBRACE;
}

function replacePiecewise(str) {
  if (!str) return '';
  const leftPiecewiseRegex = /\\left\s*\\?\{\s*\\begin\{(?:array|cases)\}(?:\{[^{}]*\})?([\s\S]*?)\\end\{(?:array|cases)\}\s*\\right\.?/gi;
  str = str.replace(leftPiecewiseRegex, (match, body) => formatPiecewiseBody(body));
  const casesRegex = /\\begin\{cases\}(?:\{[^{}]*\})?([\s\S]*?)\\end\{cases\}/gi;
  str = str.replace(casesRegex, (match, body) => formatPiecewiseBody(body));
  const condArrayRegex = /\\begin\{array\}(?:\{[^{}]*\})?([\s\S]*?)\\end\{array\}/gi;
  str = str.replace(condArrayRegex, (match, body) => {
    if (/\b(?:if|when|otherwise|else|text)\b/i.test(body) || body.includes('&')) {
      return formatPiecewiseBody(body);
    }
    return match;
  });
  return str;
}

function replaceMatrices(str) {
  if (!str) return '';
  const matrixRegex = /(?:\\left\s*([(\[|])\s*)?\\begin\{(bmatrix|pmatrix|matrix|vmatrix|Vmatrix|array)\}(?:\{[^{}]*\})?([\s\S]*?)\\end\{\2\}(?:\s*\\right\s*([)\]|]))?/g;
  return str.replace(matrixRegex, (match, leftWrap, env, body, rightWrap) => {
    if (env.toLowerCase() === 'array' && !leftWrap && !rightWrap && /\b(?:if|when|otherwise|else)\b/i.test(body)) {
      return match;
    }
    const rawRows = body.split(/\\\\|\r?\n/).map(r => r.trim()).filter(r => r.length > 0);
    const formattedRows = rawRows.map(row => {
      const cols = row.split('&').map(c => {
        let cell = cleanFormula(c.trim());
        cell = cell.replace(/(^|[\s;,|\[])[-−]([0-9a-zA-Z])/g, '$1' + PUA_NEG + '$2');
        return cell;
      }).filter(c => c.length > 0);
      return cols.join('  ');
    });
    const isDet = env.toLowerCase() === 'vmatrix' || leftWrap === '|' || rightWrap === '|';
    const leftBracket = isDet ? '| ' : '[ ';
    const rightBracket = isDet ? ' |' : ' ]';
    return leftBracket + formattedRows.join(' ;  ') + rightBracket;
  });
}

/**
 * Converts a raw LaTeX formula string into clean, human-readable Unicode math text.
 */
function cleanFormula(raw) {
  if (!raw) return '';
  let f = String(raw).trim();
  f = normalizeMathUnicode(f);
  // Fix corrupted \right where \r or \n got unescaped into control characters or \night
  f = f.replace(/[\r\n]+\s*ight\b/g, '\\right');
  f = f.replace(/\\+night\b/g, '\\right');

  // Prime notations for derivatives
  f = f.replace(/\^?\s*\{\s*\\prime\s*\\prime\s*\\prime\s*\}/g, '‴')
       .replace(/\^?\s*\{\s*\\prime\s*\\prime\s*\}/g, '″')
       .replace(/\^?\s*\{\s*\\prime\s*\}/g, '′')
       .replace(/\\prime\s*\\prime\s*\\prime/g, '‴')
       .replace(/\\prime\s*\\prime/g, '″')
       .replace(/\\prime/g, '′');

  // Format piecewise & matrices before stripping generic environments
  f = replacePiecewise(f);
  f = replaceMatrices(f);

  // Normalize escaped double-backslashes before commands (e.g. \\sim -> \sim, \\vee -> \vee)
  f = f.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
  f = f.replace(/\\\\([()[\]])/g, '\\$1');

  // Strip LaTeX environments
  f = f.replace(/\\begin\{(?:gathered|aligned|array|cases|matrix|split|eqnarray)\}(?:\{[^{}]*\})?/g, '');
  f = f.replace(/\\end\{(?:gathered|aligned|array|cases|matrix|split|eqnarray)\}/g, '');

  // LaTeX line breaks and column separators in multi-line equations
  f = f.replace(/\\\\/g, '\n');
  f = f.replace(/&/g, ' ');

  // Spacing commands - preserve intentional equation separation
  f = f.replace(/\\qquad\b/g, '     ')
       .replace(/\\quad\b/g, '   ')
       .replace(/\\([,;! ])/g, ' ');

  // Replace ~ only if it's non-breaking space between text words/numbers, NOT negation before variable/bracket
  f = f.replace(/(?<=[a-zA-Z0-9])~(?=[a-zA-Z0-9])/g, ' ');

  // Logic & Symbols
  f = f.replace(/\\therefore(?![a-zA-Z])/g, '∴ ')
       .replace(/\\because(?![a-zA-Z])/g, '∵ ');

  // Logic operators (Mathematical Logic: negation, disjunction, conjunction, implication, equivalence)
  f = f.replace(/\\(?:vee|lor)(?![a-zA-Z])/g, '∨')
       .replace(/\\(?:wedge|land)(?![a-zA-Z])/g, '∧')
       .replace(/\\sim(?![a-zA-Z])/g, '~')
       .replace(/\\neg(?![a-zA-Z])/g, '¬')
       .replace(/\\(?:leftrightarrow|iff|Leftrightarrow)(?![a-zA-Z])/g, '↔')
       .replace(/\\(?:longleftrightarrow|Longleftrightarrow)(?![a-zA-Z])/g, '⟺')
       .replace(/\\(?:oplus)(?![a-zA-Z])/g, '⊕')
       .replace(/\\(?:otimes)(?![a-zA-Z])/g, '⊗')
       .replace(/\\(?:top)(?![a-zA-Z])/g, '⊤')
       .replace(/\\(?:bot)(?![a-zA-Z])/g, '⊥')
       .replace(/\\(?:equiv)(?![a-zA-Z])/g, '≡');

  // Arrows
  f = f.replace(/\\longrightarrow(?![a-zA-Z])/g, ' ⟶ ')
       .replace(/\\longleftarrow(?![a-zA-Z])/g, ' ⟵ ')
       .replace(/\\Longrightarrow(?![a-zA-Z])/g, ' ⟹ ')
       .replace(/\\Longleftrightarrow(?![a-zA-Z])/g, ' ⟺ ')
       .replace(/\\(?:Rightarrow|implies)(?![a-zA-Z])/g, ' ⇒ ')
       .replace(/\\Leftarrow(?![a-zA-Z])/g, ' ⇐ ')
       .replace(/\\(?:rightarrow|to)(?![a-zA-Z])/g, ' → ')
       .replace(/\\(?:leftarrow|gets)(?![a-zA-Z])/g, ' ← ')
       .replace(/\\rightleftharpoons(?![a-zA-Z])/g, ' ⇌ ')
       .replace(/\\uparrow(?![a-zA-Z])/g, ' ↑ ')
       .replace(/\\downarrow(?![a-zA-Z])/g, ' ↓ ');

  // Isotopic / nuclear pre-subscripts: { }_{92} or {}_{92}
  f = f.replace(/\{?\s*\}?_\{?([0-9]+)\}?/g, (_, sub) => toSubscript(sub));

  // Dummy delimiters: \left. and \right.
  f = f.replace(/\\(?:left|right)\./g, '');

  // Brackets
  f = f.replace(/\\left\s*([(\[{|])/g, '$1').replace(/\\right\s*([)\]}|])/g, '$1');
  f = f.replace(/\\\{/g, '{').replace(/\\\}/g, '}');

  // Fractions with balanced braces
  f = replaceBalancedFracs(f);

  // Roots with balanced braces
  f = replaceBalancedRoots(f);

  // Comparison & math/physics operators
  f = f.replace(/\\le(?:q)?(?![a-zA-Z])/g, '≤')
       .replace(/\\ge(?:q)?(?![a-zA-Z])/g, '≥')
       .replace(/\\ne(?:q)?(?![a-zA-Z])/g, '≠')
       .replace(/\\pm(?![a-zA-Z])/g, '±')
       .replace(/\\mp(?![a-zA-Z])/g, '∓')
       .replace(/\\times(?![a-zA-Z])/g, '×')
       .replace(/\\div(?![a-zA-Z])/g, '÷')
       .replace(/\\cdot(?![a-zA-Z])/g, '·')
       .replace(/\\approx(?![a-zA-Z])/g, '≈')
       .replace(/\\equiv(?![a-zA-Z])/g, '≡')
       .replace(/\\propto(?![a-zA-Z])/g, '∝')
       .replace(/\\ll(?![a-zA-Z])/g, '≪')
       .replace(/\\gg(?![a-zA-Z])/g, '≫')
       .replace(/\\degree(?![a-zA-Z])|(?:\^\\circ(?![a-zA-Z]))|\\circ(?![a-zA-Z])/g, '°')
       .replace(/\\(?:cdots|ldots|dots)(?![a-zA-Z])/g, '...')
       .replace(/\\infty(?![a-zA-Z])/g, '∞')
       .replace(/\\angle(?![a-zA-Z])/g, '∠')
       .replace(/\\parallel(?![a-zA-Z])/g, '∥')
       .replace(/\\perp(?![a-zA-Z])/g, '⊥')
       .replace(/\\triangle(?![a-zA-Z])/g, '△')
       .replace(/\\partial(?![a-zA-Z])/g, '∂')
       .replace(/\\nabla(?![a-zA-Z])/g, '∇')
       .replace(/\\sum(?![a-zA-Z])/g, '∑')
       .replace(/\\prod(?![a-zA-Z])/g, '∏')
       .replace(/\\int(?![a-zA-Z])/g, '∫')
       .replace(/\\oint(?![a-zA-Z])/g, '∮')
       .replace(/\\in(?![a-zA-Z])/g, '∈')
       .replace(/\\notin(?![a-zA-Z])/g, '∉')
       .replace(/\\subset(?![a-zA-Z])/g, '⊂')
       .replace(/\\subseteq(?![a-zA-Z])/g, '⊆')
       .replace(/\\cup(?![a-zA-Z])/g, '∪')
       .replace(/\\cap(?![a-zA-Z])/g, '∩')
       .replace(/\\forall(?![a-zA-Z])/g, '∀')
       .replace(/\\exists(?![a-zA-Z])/g, '∃')
       .replace(/\\emptyset(?![a-zA-Z])/g, '∅');

  // Greek letters
  f = f.replace(/\\alpha(?![a-zA-Z])/g, 'α').replace(/\\beta(?![a-zA-Z])/g, 'β').replace(/\\gamma(?![a-zA-Z])/g, 'γ').replace(/\\Gamma(?![a-zA-Z])/g, 'Γ')
       .replace(/\\delta(?![a-zA-Z])/g, 'δ').replace(/\\Delta(?![a-zA-Z])/g, 'Δ').replace(/\\epsilon(?![a-zA-Z])|\\varepsilon(?![a-zA-Z])/g, 'ε')
       .replace(/\\zeta(?![a-zA-Z])/g, 'ζ').replace(/\\eta(?![a-zA-Z])/g, 'η').replace(/\\theta(?![a-zA-Z])/g, 'θ').replace(/\\Theta(?![a-zA-Z])/g, 'Θ')
       .replace(/\\iota(?![a-zA-Z])/g, 'ι').replace(/\\kappa(?![a-zA-Z])/g, 'κ').replace(/\\lambda(?![a-zA-Z])/g, 'λ').replace(/\\Lambda(?![a-zA-Z])/g, 'Λ')
       .replace(/\\mu(?![a-zA-Z])/g, 'μ').replace(/\\nu(?![a-zA-Z])/g, 'ν').replace(/\\xi(?![a-zA-Z])/g, 'ξ').replace(/\\Xi(?![a-zA-Z])/g, 'Ξ')
       .replace(/\\pi(?![a-zA-Z])/g, 'π').replace(/\\Pi(?![a-zA-Z])/g, 'Π').replace(/\\rho(?![a-zA-Z])/g, 'ρ').replace(/\\sigma(?![a-zA-Z])/g, 'σ')
       .replace(/\\Sigma(?![a-zA-Z])/g, 'Σ').replace(/\\tau(?![a-zA-Z])/g, 'τ').replace(/\\upsilon(?![a-zA-Z])/g, 'υ').replace(/\\Upsilon(?![a-zA-Z])/g, 'Υ')
       .replace(/\\phi(?![a-zA-Z])|\\varphi(?![a-zA-Z])/g, 'φ').replace(/\\Phi(?![a-zA-Z])/g, 'Φ').replace(/\\chi(?![a-zA-Z])/g, 'χ')
       .replace(/\\psi(?![a-zA-Z])/g, 'ψ').replace(/\\Psi(?![a-zA-Z])/g, 'Ψ').replace(/\\omega(?![a-zA-Z])/g, 'ω').replace(/\\Omega(?![a-zA-Z])/g, 'Ω');

  // Text formatting commands: allow optional whitespace before { (do before sub/sup so \mathrm{i} becomes i)
  f = f.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|mathbb|mathcal|mathsf|mathtt)\s*\{([^{}]*)\}/g, '$1');
  f = f.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|mathbb|mathcal|mathsf|mathtt)\s*\{([^{}]*)\}/g, '$1');

  // Vectors and accents
  f = f.replace(/\\vec\{([^{}]+)\}/g, '$1⃗')
       .replace(/\\hat\{([^{}]+)\}/g, '$1̂')
       .replace(/\\(?:bar|overline)\{([^{}]+)\}/g, '$1̄');

  // Inverse trigonometric functions: \cos^{-1}, \sin^{-1}, \tan^{-1}, etc.
  f = f.replace(/\\?(sin|cos|tan|cot|sec|csc|cosec)\s*\^\s*\{?\s*(-1)\s*\}?/gi, (_, fn) => fn.toLowerCase() + '⁻¹');

  // Powers of trigonometric functions: \sin^2, \cos^2, \tan^3, etc.
  f = f.replace(/\\?(sin|cos|tan|cot|sec|csc|cosec)\s*\^\s*\{?([0-9a-zA-Z]+)\}?/gi, (_, fn, p) => fn.toLowerCase() + toSuperscript(p));

  // Superscripts
  f = f.replace(/\^\{([^{}]+)\}/g, (_, p) => toSuperscript(p));
  f = f.replace(/\^([-+][0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p));
  f = f.replace(/\^([0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p));

  // Subscripts
  f = f.replace(/_\{([^{}]+)\}/g, (_, p) => toSubscript(p));
  f = f.replace(/_([0-9a-zA-Z+\-])/g, (_, p) => toSubscript(p));

  // Common functions
  f = f.replace(/\\(sin|cos|tan|cot|sec|csc|cosec|log|ln|det|lim|exp|min|max)\b/g, '$1');

  // Cleanup stray backslashes
  f = f.replace(/\\([a-zA-Z]+)/g, '$1');
  f = f.replace(/\\+/g, '');

  // Strip braces
  f = f.replace(/[{}]/g, '');

  // Operator spacing: clean spaces around relation and binary operators
  f = f.replace(/\s*([=<>≤≥≠≈≡⇔↔⇒→⇐←])\s*/g, ' $1 ');
  f = f.replace(/\s*([+×÷∨∧⊕⊗])\s*/g, ' $1 ');

  // Prefix negation should attach closely to variable or bracket: ~p, ~q, ¬p, ¬(p ∨ q)
  f = f.replace(/([~∼¬])\s+([a-zA-Z0-9(\[])/g, '$1$2');

  // Compact derivative primes to variable: p′ ᵢ -> p′ᵢ
  f = f.replace(/([′″‴])\s+([a-zA-Z0-9' + SUP_SUB + '])/g, '$1$2');

  // 1. Compact number + single variable: e.g. "2 c" -> "2c", "7 y²" -> "7y²", "4 m₁" -> "4m₁"
  f = f.replace(new RegExp('(?<![/0-9a-zA-Z])([0-9]+) ([a-zA-Z][' + SUP_SUB + ']?)\\b', 'g'), '$1$2');

  // 2. Compact single variable + single variable (or compacted term + single variable)
  for (let k = 0; k < 4; k++) {
    f = f.replace(new RegExp('\\b([0-9]*[a-zA-Z][' + SUP_SUB + ']?(?:[a-zA-Z][' + SUP_SUB + ']?)?) ([a-zA-Z][' + SUP_SUB + ']?)\\b', 'g'), (match, p1, p2) => {
      if (STOP_WORDS.has(p1.toLowerCase()) || STOP_WORDS.has(p2.toLowerCase())) return match;
      return p1 + p2;
    });
  }

  // Binary minus: surround with spaces (standard ASCII minus - is safe across all PDF fonts)
  f = f.replace(new RegExp('([a-zA-Z0-9' + SUP_SUB + '\\)\\]])\\s*[-−]\\s*([a-zA-Z0-9' + SUP_SUB + '\\(\\[])', 'g'), '$1 - $2');
  // Unary negation
  f = f.replace(new RegExp('(^|[=<>≤≥≠\\(\\[/\\n])\\s*[-−]\\s*([a-zA-Z0-9' + SUP_SUB + '\\(])', 'g'), '$1-$2');
  f = f.replace(/([=<>≤≥≠≈≡])\s*[-−]/g, '$1 -');
  f = f.replace(/−/g, '-');

  // Unprotect matrix negatives and braces
  f = f.replace(new RegExp(PUA_NEG, 'g'), '-');
  f = f.replace(new RegExp(PUA_LBRACE, 'g'), '{').replace(new RegExp(PUA_RBRACE, 'g'), '}');

  // Strip dollar signs
  f = f.replace(/\$/g, '').trim();

  // Normalize spacing on lines
  f = f.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');

  return f;
}

function fixMatrixNegatives(str) {
  if (!str) return '';
  return str.replace(/\[([^[\]]+)\]/g, (match, inner) => {
    if (inner.includes(';') || /\d\s+\d/.test(inner)) {
      inner = inner.replace(/(^|[\s;])[-−]\s+(\d+)/g, '$1-$2');
    }
    return '[' + inner + ']';
  });
}

/**
 * Converts any text string with LaTeX equations into clean readable text for PDF generation.
 */
function formatMathToText(str) {
  if (!str) return '';
  let text = normalizeMathUnicode(str);

  // Normalize OCR/plain radical notation before any export conversion.
  text = text.replace(/√\s*\(([^()]*)\)/g, '\\sqrt{$1}');

  // Format piecewise & matrices before delimiter parsing
  text = replacePiecewise(text);
  text = replaceMatrices(text);

  // Normalize escaped double-backslashes before commands or delimiters
  text = text.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
  text = text.replace(/\\\\([()[\]])/g, '\\$1');

  // 1. Process multi-line display math blocks across the ENTIRE text first
  const MULTILINE_DELIMITERS = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(?:gathered|aligned|array|cases|matrix|bmatrix|pmatrix|vmatrix|Vmatrix|split)\}[\s\S]*?\\end\{(?:gathered|aligned|array|cases|matrix|bmatrix|pmatrix|vmatrix|Vmatrix|split)\})/g;
  text = text.replace(MULTILINE_DELIMITERS, (match) => {
    let body = match;
    if (body.startsWith('$$') && body.endsWith('$$')) body = body.slice(2, -2);
    else if (body.startsWith('\\[') && body.endsWith('\\]')) body = body.slice(2, -2);
    return '\n' + cleanFormula(body) + '\n';
  });

  // 2. Process inline math blocks \(...\) and $...$
  const INLINE_DELIMITERS = /(\\\([\s\S]*?\\\)|(?<!\$)\$(?!\$)[^$\r\n]+\$)/g;
  text = text.replace(INLINE_DELIMITERS, (match) => {
    let body = match;
    if (body.startsWith('\\(') && body.endsWith('\\)')) body = body.slice(2, -2);
    else if (body.startsWith('$') && body.endsWith('$')) body = body.slice(1, -1);
    return cleanFormula(body);
  });

  // 3. Format remaining plain text and non-delimited equations
  text = formatPlainMathText(text);

  text = text.replace(/([~∼¬])\s+([a-zA-Z0-9(\[])/g, '$1$2');

  // Replace Unicode minus with standard ASCII minus to prevent font encoding glitches
  text = text.replace(/−/g, '-');
  text = text.replace(new RegExp(PUA_NEG, 'g'), '-');
  text = text.replace(new RegExp(PUA_LBRACE, 'g'), '{').replace(new RegExp(PUA_RBRACE, 'g'), '}');
  text = fixMatrixNegatives(text);

  // 4. Clean up multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Formats plain text that contains mathematical expressions outside of LaTeX delimiters.
 * Handles powers (sin^2 x, cos^2 x, h^2, x^2), inverse functions (cos^-1, sin^-1),
 * roots (sqrt(x)), Greek letters (pi, theta, alpha), logic operators, relations, and arrows.
 */
function formatPlainMathText(str) {
  if (!str) return '';
  let s = normalizeMathUnicode(str);

  // 1. Arrows & Relations
  s = s.replace(/<==>|<=>|<->/g, ' ⇔ ')
       .replace(/==>|=>/g, ' ⇒ ')
       .replace(/-->|->/g, ' → ')
       .replace(/\+\s*\/\s*-/g, '±')
       .replace(/-\s*\/\s*\+/g, '∓')
       .replace(/!=/g, '≠')
       .replace(/<=/g, '≤')
       .replace(/>=/g, '≥');

  // 2. Logic Operators in text
  s = s.replace(/\\(?:vee|lor)\b/g, '∨')
       .replace(/\\(?:wedge|land)\b/g, '∧')
       .replace(/\\sim\b/g, '~')
       .replace(/\\neg\b/g, '¬')
       .replace(/\\equiv\b/g, '≡')
       .replace(/\\therefore\b/g, '∴ ')
       .replace(/\\because\b/g, '∵ ');

  // Prime derivatives
  s = s.replace(/\\prime\s*\\prime\s*\\prime/g, '‴')
       .replace(/\\prime\s*\\prime/g, '″')
       .replace(/\\prime/g, '′');

  // 3. Roots: sqrt(...) or \sqrt{...}
  s = replaceBalancedRoots(s);

  // 4. Fractions: \frac{...}{...}
  s = replaceBalancedFracs(s);

  // 5. Inverse Trigonometric & Hyperbolic functions (e.g. sin^-1, cos^-1, tan^-1, \cos^{-1})
  s = s.replace(/\\?(sin|cos|tan|cot|sec|csc|cosec)\s*\^?\s*\{?\s*(-1)\s*\}?/gi, (_, fn) => fn.toLowerCase() + '⁻¹');

  // 6. Powers of Trigonometric functions (e.g. sin^2, cos^2, tan^2, cos^3)
  s = s.replace(/\\?(sin|cos|tan|cot|sec|csc|cosec)\s*\^\s*\{?([0-9a-zA-Z]+)\}?/gi, (_, fn, p) => fn.toLowerCase() + toSuperscript(p));

  // 7. Greek letters in math context
  s = s.replace(/\\theta\b|\btheta\b/gi, 'θ')
       .replace(/\\pi\b/gi, 'π')
       .replace(/(?<=[0-9nN+\-/*=(), '"]|\b)pi(?=[0-9+\-/*=(), '"]|\b)/g, 'π')
       .replace(/\\alpha\b|\balpha\b/gi, 'α')
       .replace(/\\beta\b|\bbeta\b/gi, 'β')
       .replace(/\\gamma\b|\bgamma\b/gi, 'γ')
       .replace(/\\delta\b|\bdelta\b/gi, 'δ')
       .replace(/\\lambda\b|\blambda\b/gi, 'λ')
       .replace(/\\omega\b|\bomega\b/gi, 'ω')
       .replace(/\\mu\b|\bmu\b/gi, 'μ')
       .replace(/\\sigma\b|\bsigma\b/gi, 'σ');

  // 8. Superscripts on variables/brackets: e.g. x^2, h^2, ab = 0, (cos x - 2)^2, |A|^(n-1)
  s = s.replace(/([a-zA-Z0-9)\]|])\s*\^\s*\{([^{}]+)\}/g, (_, base, exp) => base + toSuperscript(exp));
  s = s.replace(/([a-zA-Z0-9)\]|])\s*\^\s*\(([^()]+)\)/g, (_, base, exp) => base + toSuperscript(exp));
  s = s.replace(/([a-zA-Z0-9)\]|])\s*\^\s*([-+]?[0-9a-zA-Z]+)/g, (_, base, exp) => base + toSuperscript(exp));

  // 9. Math Subscripts on specific patterns:
  // Slopes: m1, m2, m_1, m_2
  s = s.replace(/\bm_?([1-4])\b/g, (_, num) => 'm' + toSubscript(num));
  // Switches: S1, S2, S3, S_1, S_2, S_3
  s = s.replace(/\bS_?([1-9])\b/g, (_, num) => 'S' + toSubscript(num));
  // Vector / Matrix elements: x1, x2, x3 or R1, R2, C1, C2
  s = s.replace(/\b([xX])_?([1-9])\b/g, (_, v, num) => v + toSubscript(num));
  s = s.replace(/\b([RC])_?([1-9])\b/g, (_, v, num) => v + toSubscript(num));

  // 10. Multiplication asterisk between math terms (e.g. 4*sqrt, 2*theta, m1 * m2, 18 * 14)
  s = s.replace(new RegExp('([0-9a-zA-Zπθαβ√' + SUP_SUB + '\\)\\]])\\s*\\*\\s*([0-9a-zA-Zπθαβ√' + SUP_SUB + '\\(\\[])', 'g'), '$1 · $2');

  // Strip dangling backslashes before common functions
  s = s.replace(/\\(sin|cos|tan|cot|sec|csc|cosec|log|ln|lim|exp)\b/g, '$1');

  // Clean double spaces
  s = s.replace(/[ \t]{2,}/g, ' ');

  return s;
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
  let raw = normalizeMathUnicode(str);

  // Normalize escaped double-backslashes before commands or delimiters
  raw = raw.replace(/\\\\([a-zA-Z]+)/g, '\\$1').replace(/\\\\([()[\]])/g, '\\$1');

  const DELIMITED_REGEX = /(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\r\n]+\$)/g;
  let result = '';
  let lastIndex = 0;
  let match;

  const formatWordText = (t) => {
    let s = formatPlainMathText(t || '');
    return escapeHtml(s).replace(/\n/g, '<br>');
  };

  while ((match = DELIMITED_REGEX.exec(raw)) !== null) {
    const prefix = raw.slice(lastIndex, match.index);
    result += formatWordText(prefix);

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
        let cleanTex = texBody.trim()
          .replace(/\\sim\s*([a-zA-Z0-9(\[])/g, '{\\sim}$1')
          .replace(/\\lor\b/g, '\\vee ')
          .replace(/\\land\b/g, '\\wedge ');
        mathOutput = katex.renderToString(cleanTex, {
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
  result += formatWordText(remainder);

  return result;
}

function findFileRecursive(dir, targetName, maxDepth = 3) {
  if (maxDepth < 0) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === targetName) {
        return full;
      }
      if (entry.isDirectory() && maxDepth > 0) {
        const sub = findFileRecursive(full, targetName, maxDepth - 1);
        if (sub) return sub;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Resolves an image URL (e.g. /uploads/questions/scans/... or relative path)
 * to an existing absolute path on the local filesystem.
 */
function resolveLocalImagePath(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return null;
  const clean = imgUrl.trim().replace(/^[/\\]+/, '');
  const rootDir = path.resolve(__dirname, '..');
  const baseName = path.basename(clean);

  let uploadRoot = null;
  try {
    uploadRoot = require('./storagePaths').uploadRoot;
  } catch (_) {
    uploadRoot = path.join(rootDir, 'uploads');
  }

  const cleanNoUploads = clean.replace(/^(?:public[/\\]+|uploads[/\\]+)+/, '');

  const candidates = [
    path.join(rootDir, 'public', clean),
    path.join(rootDir, clean),
    path.join(rootDir, 'uploads', cleanNoUploads),
    path.join(uploadRoot, cleanNoUploads),
    path.join(rootDir, 'public', 'uploads', cleanNoUploads),
    path.join(rootDir, 'public', 'uploads', 'questions', 'scans', cleanNoUploads),
    path.join(rootDir, 'public', 'uploads', 'questions', cleanNoUploads),
    path.join(uploadRoot, 'test-extracted-images', cleanNoUploads),
    path.join(uploadRoot, 'test-extracted-images', baseName),
    path.join(rootDir, 'public', 'uploads', 'test-extracted-images', baseName),
    path.join(uploadRoot, 'tests', cleanNoUploads),
    path.join(rootDir, 'public', 'uploads', 'tests', cleanNoUploads)
  ];

  if (process.env.UPLOAD_ROOT_DIR) {
    candidates.push(path.join(process.env.UPLOAD_ROOT_DIR, cleanNoUploads));
    candidates.push(path.join(process.env.UPLOAD_ROOT_DIR, 'questions', cleanNoUploads));
    candidates.push(path.join(process.env.UPLOAD_ROOT_DIR, 'test-extracted-images', baseName));
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch (_) {}
  }

  // Fallback: search by basename in known upload directories if not found by exact path
  const searchDirs = [
    path.join(rootDir, 'public', 'uploads', 'questions', 'scans'),
    path.join(uploadRoot, 'test-extracted-images'),
    path.join(uploadRoot, 'tests'),
    path.join(rootDir, 'public', 'uploads'),
    uploadRoot
  ];

  for (const dir of searchDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const found = findFileRecursive(dir, baseName, 3);
      if (found) return found;
    } catch (_) {}
  }

  return null;
}

/**
 * Resolves an image source (file path, data URI, or fallback base64) to a format
 * that PDFKit doc.image() can consume (absolute file path or Buffer).
 */
function resolveImageSource(imgUrl, fallbackData) {
  if (Buffer.isBuffer(imgUrl)) return imgUrl;
  if (Buffer.isBuffer(fallbackData)) return fallbackData;

  const dataStr = (typeof imgUrl === 'string' && imgUrl.startsWith('data:image/')) ? imgUrl
    : (typeof fallbackData === 'string' && fallbackData.startsWith('data:image/')) ? fallbackData
    : (typeof fallbackData === 'string' && fallbackData.length > 50) ? fallbackData
    : null;

  if (dataStr) {
    try {
      const b64 = dataStr.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      return Buffer.from(b64, 'base64');
    } catch (_) {}
  }

  if (typeof imgUrl === 'string') {
    const local = resolveLocalImagePath(imgUrl);
    if (local) return local;
  }
  return null;
}

/**
 * Encodes an image to a base64 Data URI <img> tag for embedding into Word documents (.doc HTML).
 */
function getBase64ImageHtml(imgUrl, style = 'max-width: 420px; max-height: 220px; height: auto;', fallbackData = null) {
  if (typeof imgUrl === 'string' && imgUrl.startsWith('data:image/')) {
    return `<div style="margin: 6px 0;"><img src="${imgUrl}" style="${style}" /></div>`;
  }
  if (typeof fallbackData === 'string' && fallbackData.startsWith('data:image/')) {
    return `<div style="margin: 6px 0;"><img src="${fallbackData}" style="${style}" /></div>`;
  }
  if (typeof fallbackData === 'string' && fallbackData.length > 50) {
    return `<div style="margin: 6px 0;"><img src="data:image/jpeg;base64,${fallbackData}" style="${style}" /></div>`;
  }
  const localPath = resolveLocalImagePath(imgUrl);
  if (!localPath) return '';
  try {
    const ext = path.extname(localPath).toLowerCase().replace('.', '') || 'jpeg';
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const b64 = fs.readFileSync(localPath).toString('base64');
    return `<div style="margin: 6px 0;"><img src="data:${mime};base64,${b64}" style="${style}" /></div>`;
  } catch (err) {
    console.error('getBase64ImageHtml error:', err.message);
    return '';
  }
}

/**
 * Configures PDFKit document with Unicode-capable TrueType fonts.
 * Prioritizes bundled DejaVuSans fonts in public/fonts (accessible across all platforms including Linux/Render/Docker),
 * followed by Windows fonts (Segoe UI Symbol / Cambria) and Linux system fonts.
 */
function setupPdfFonts(doc) {
  const rootDir = path.resolve(__dirname, '..');
  const bundledRegular = path.join(rootDir, 'public', 'fonts', 'DejaVuSans.ttf');
  const bundledBold = path.join(rootDir, 'public', 'fonts', 'DejaVuSans-Bold.ttf');

  const fontCandidates = [
    { regular: bundledRegular, bold: bundledBold, name: 'DejaVuSans' },
    { regular: 'C:/Windows/Fonts/seguisym.ttf', bold: 'C:/Windows/Fonts/seguisym.ttf', name: 'SegoeUISymbol' },
    { regular: 'C:/Windows/Fonts/cambria.ttc', regularSubfont: 'Cambria', bold: 'C:/Windows/Fonts/cambria.ttc', boldSubfont: 'Cambria', name: 'Cambria' },
    { regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', name: 'DejaVuSansLinux' },
    { regular: 'C:/Windows/Fonts/calibri.ttf', bold: 'C:/Windows/Fonts/calibrib.ttf', name: 'Calibri' },
    { regular: 'C:/Windows/Fonts/arial.ttf', bold: 'C:/Windows/Fonts/arialbd.ttf', name: 'Arial' },
    { regular: 'C:/Windows/Fonts/segoeui.ttf', bold: 'C:/Windows/Fonts/segoeuib.ttf', name: 'SegoeUI' }
  ];

  for (const c of fontCandidates) {
    if (fs.existsSync(c.regular)) {
      try {
        if (c.regularSubfont) {
          doc.registerFont('MathFont', c.regular, c.regularSubfont);
        } else {
          doc.registerFont('MathFont', c.regular);
        }
        if (c.boldSubfont) {
          doc.registerFont('MathFont-Bold', c.bold, c.boldSubfont);
        } else if (c.bold && fs.existsSync(c.bold)) {
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

function cleanQuestionText(text) {
  if (!text) return '';
  let str = String(text).trim();
  str = str.replace(/^(?:\[[^\]]+\]\s*)+/i, '');
  str = str.replace(/^(?:(?:Question|Q)\s*\.?\s*)?\d+[\s.:)\-–—]+\s*/i, '');
  str = str.replace(/^(?:\[[^\]]+\]\s*)+/i, '');
  str = str.replace(/^(?:(?:Question|Q)\s*\.?\s*)?\d+[\s.:)\-–—]+\s*/i, '');
  return str.trim();
}

module.exports = {
  formatMathToText,
  formatPlainMathText,
  formatMathToWordHtml,
  cleanFormula,
  cleanQuestionText,
  setupPdfFonts,
  resolveLocalImagePath,
  resolveImageSource,
  getBase64ImageHtml,
  escapeHtml
};
