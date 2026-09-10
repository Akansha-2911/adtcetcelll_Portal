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

function replaceMatrices(str) {
  if (!str) return '';
  return str.replace(/\\begin\{(bmatrix|pmatrix|matrix|vmatrix|Vmatrix)\}([\s\S]*?)\\end\{\1\}/g, (match, env, body) => {
    const rawRows = body.split(/\\\\|\r?\n/).map(r => r.trim()).filter(r => r.length > 0);
    const formattedRows = rawRows.map(row => {
      const cols = row.split('&').map(c => cleanFormula(c.trim())).filter(c => c.length > 0);
      return cols.join('  ');
    });
    const isDet = env.toLowerCase() === 'vmatrix';
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
  // Fix corrupted \right where \r or \n got unescaped into control characters or \night
  f = f.replace(/[\r\n]+\s*ight\b/g, '\\right');
  f = f.replace(/\\+night\b/g, '\\right');

  // Format matrices before stripping generic environments
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

  // Text formatting commands
  f = f.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname|mathbb|mathcal|mathsf|mathtt)\{([^{}]*)\}/g, '$1');

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
  f = f.replace(/=\s*[-−]/g, '= -');
  f = f.replace(/−/g, '-');

  // Strip dollar signs
  f = f.replace(/\$/g, '').trim();

  // Normalize spacing on lines
  f = f.split('\n').map(line => line.replace(/[ \t]+/g, ' ').trim()).join('\n');

  return f;
}

/**
 * Converts any text string with LaTeX equations into clean readable text for PDF generation.
 */
function formatMathToText(str) {
  if (!str) return '';
  let text = String(str);

  // Normalize OCR/plain radical notation before any export conversion.
  text = text.replace(/√\s*\(([^()]*)\)/g, '\\sqrt{$1}');

  // Format matrices before delimiter parsing
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
  let s = String(str);

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
  let raw = String(str);

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

/**
 * Resolves an image URL (e.g. /uploads/questions/scans/... or relative path)
 * to an existing absolute path on the local filesystem.
 */
function resolveLocalImagePath(imgUrl) {
  if (!imgUrl || typeof imgUrl !== 'string') return null;
  const clean = imgUrl.trim().replace(/^[/\\]+/, '');
  const rootDir = path.resolve(__dirname, '..');
  const candidates = [
    path.join(rootDir, 'public', clean),
    path.join(rootDir, clean),
    path.join(rootDir, 'public', 'uploads', clean.replace(/^uploads[/\\]?/, '')),
    path.join(rootDir, 'public', 'uploads', 'questions', clean.replace(/^(?:uploads[/\\]+|questions[/\\]+)+/, ''))
  ];
  if (process.env.UPLOAD_ROOT_DIR) {
    candidates.push(path.join(process.env.UPLOAD_ROOT_DIR, clean.replace(/^uploads[/\\]?/, '')));
    candidates.push(path.join(process.env.UPLOAD_ROOT_DIR, 'questions', clean.replace(/^(?:uploads[/\\]+|questions[/\\]+)+/, '')));
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
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

module.exports = {
  formatMathToText,
  formatPlainMathText,
  formatMathToWordHtml,
  cleanFormula,
  setupPdfFonts,
  resolveLocalImagePath,
  resolveImageSource,
  getBase64ImageHtml,
  escapeHtml
};
