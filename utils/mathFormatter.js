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
              const dWrap = /[+\-−\s/]/.test(den) && !/^\([^()]+\)$/.test(den);
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
    if (str.slice(i).startsWith('\\sqrt')) {
      let p = i + 5;
      let rootDeg = '';
      if (str[p] === '[') {
        const closeIdx = str.indexOf(']', p);
        if (closeIdx !== -1) {
          rootDeg = toSuperscript(str.slice(p + 1, closeIdx));
          p = closeIdx + 1;
        }
      }
      while (p < str.length && /\s/.test(str[p])) p++;
      if (str[p] === '{') {
        let depth = 0;
        let bStart = p + 1;
        let bEnd = -1;
        for (let j = p; j < str.length; j++) {
          if (str[j] === '{') depth++;
          else if (str[j] === '}') {
            depth--;
            if (depth === 0) { bEnd = j; break; }
          }
        }
        if (bEnd !== -1) {
          const inside = cleanFormula(str.slice(bStart, bEnd)).trim();
          result += (rootDeg || '') + (inside.length === 1 && !/[+\-−/]/.test(inside) ? `√${inside}` : `√(${inside})`);
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

/**
 * Converts a raw LaTeX formula string into clean, human-readable Unicode math text.
 */
function cleanFormula(raw) {
  if (!raw) return '';
  let f = String(raw).trim();
  // Fix corrupted \right where \r or \n got unescaped into control characters or \night
  f = f.replace(/[\r\n]+\s*ight\b/g, '\\right');
  f = f.replace(/\\+night\b/g, '\\right');

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
  f = f.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g, '$1');

  // Vectors and accents
  f = f.replace(/\\vec\{([^{}]+)\}/g, '$1⃗')
       .replace(/\\hat\{([^{}]+)\}/g, '$1̂')
       .replace(/\\(?:bar|overline)\{([^{}]+)\}/g, '$1̄');

  // Superscripts
  f = f.replace(/\^\{([^{}]+)\}/g, (_, p) => toSuperscript(p));
  f = f.replace(/\^([-+][0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p));
  f = f.replace(/\^([0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p));

  // Subscripts
  f = f.replace(/_\{([^{}]+)\}/g, (_, p) => toSubscript(p));
  f = f.replace(/_([0-9a-zA-Z+\-])/g, (_, p) => toSubscript(p));

  // Common functions
  f = f.replace(/\\(sin|cos|tan|cot|sec|csc|log|ln|det|lim|exp|min|max)\b/g, '$1');

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

  // Binary minus: surround with spaces
  f = f.replace(new RegExp('([a-zA-Z0-9' + SUP_SUB + '\\)\\]])\\s*[-−]\\s*([a-zA-Z0-9' + SUP_SUB + '\\(\\[])', 'g'), '$1 − $2');
  // Unary negation
  f = f.replace(new RegExp('(^|[=<>≤≥≠\\(\\[/\\n])\\s*[-−]\\s*([a-zA-Z0-9' + SUP_SUB + '\\(])', 'g'), '$1−$2');
  f = f.replace(/=\s*−/g, '= −');

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

  // Normalize escaped double-backslashes before commands or delimiters
  text = text.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
  text = text.replace(/\\\\([()[\]])/g, '\\$1');

  // 1. Process multi-line display math blocks across the ENTIRE text first
  const MULTILINE_DELIMITERS = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\begin\{(?:gathered|aligned|array|cases|matrix|split)\}[\s\S]*?\\end\{(?:gathered|aligned|array|cases|matrix|split)\})/g;
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

  // 3. Clean remaining isolated math commands or dangling symbols
  text = text.replace(/\\(?:vee|lor)(?![a-zA-Z])/g, ' ∨ ')
             .replace(/\\(?:wedge|land)(?![a-zA-Z])/g, ' ∧ ')
             .replace(/\\sim(?![a-zA-Z])/g, '~')
             .replace(/\\neg(?![a-zA-Z])/g, '¬')
             .replace(/\\(?:leftrightarrow|iff|Leftrightarrow)(?![a-zA-Z])/g, ' ↔ ')
             .replace(/\\(?:longleftrightarrow|Longleftrightarrow)(?![a-zA-Z])/g, ' ⟺ ')
             .replace(/\\(?:oplus)(?![a-zA-Z])/g, ' ⊕ ')
             .replace(/\\(?:otimes)(?![a-zA-Z])/g, ' ⊗ ')
             .replace(/\\(?:top)(?![a-zA-Z])/g, '⊤')
             .replace(/\\(?:bot)(?![a-zA-Z])/g, '⊥')
             .replace(/\\(?:equiv)(?![a-zA-Z])/g, ' ≡ ')
             .replace(/\\longrightarrow(?![a-zA-Z])/g, ' ⟶ ')
             .replace(/\\longleftarrow(?![a-zA-Z])/g, ' ⟵ ')
             .replace(/\\Longrightarrow(?![a-zA-Z])/g, ' ⟹ ')
             .replace(/\\Longleftrightarrow(?![a-zA-Z])/g, ' ⟺ ')
             .replace(/\\therefore(?![a-zA-Z])/g, '∴ ')
             .replace(/\\because(?![a-zA-Z])/g, '∵ ')
             .replace(/\\(?:Rightarrow|implies)(?![a-zA-Z])/g, ' ⇒ ')
             .replace(/\\(?:rightarrow|to)(?![a-zA-Z])/g, ' → ')
             .replace(/\\pm(?![a-zA-Z])/g, '±')
             .replace(/\\mp(?![a-zA-Z])/g, '∓')
             .replace(/\\times(?![a-zA-Z])/g, '×')
             .replace(/\\div(?![a-zA-Z])/g, '÷')
             .replace(/\\cdot(?![a-zA-Z])/g, '·')
             .replace(/\\le(?:q)?(?![a-zA-Z])/g, '≤')
             .replace(/\\ge(?:q)?(?![a-zA-Z])/g, '≥')
             .replace(/\\ne(?:q)?(?![a-zA-Z])/g, '≠')
             .replace(/\\approx(?![a-zA-Z])/g, '≈')
             .replace(/\\infty(?![a-zA-Z])/g, '∞')
             .replace(/\\alpha(?![a-zA-Z])/g, 'α')
             .replace(/\\beta(?![a-zA-Z])/g, 'β')
             .replace(/\\gamma(?![a-zA-Z])/g, 'γ')
             .replace(/\\delta(?![a-zA-Z])/g, 'δ')
             .replace(/\\theta(?![a-zA-Z])/g, 'θ')
             .replace(/\\pi(?![a-zA-Z])/g, 'π')
             .replace(/\\sigma(?![a-zA-Z])/g, 'σ')
             .replace(/\\omega(?![a-zA-Z])/g, 'ω')
             .replace(/\\lambda(?![a-zA-Z])/g, 'λ')
             .replace(/\\mu(?![a-zA-Z])/g, 'μ')
             .replace(/\\quad\b/g, '   ')
             .replace(/\\qquad\b/g, '     ')
             .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
             .replace(/\$/g, '');

  text = text.replace(/([~∼¬])\s+([a-zA-Z0-9(\[])/g, '$1$2');

  // 4. Clean up multiple blank lines
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
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
    let s = String(t || '');
    s = s.replace(/(?<=[A-Za-z0-9)\]\}])\^\{([^{}]+)\}/g, (_, p) => toSuperscript(p))
         .replace(/(?<=[A-Za-z0-9)\]\}])\^([-+][0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p))
         .replace(/(?<=[A-Za-z0-9)\]\}])\^([0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p))
         .replace(/(?<=[A-Za-z0-9)\]\}])\s*\^\s*([0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p))
         .replace(/=>/g, '⇒')
         .replace(/<=>/g, '⇔');
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
 * Configures PDFKit document with Unicode-capable fonts (Cambria / Segoe UI Symbol / Arial)
 * Cambria on Windows contains full native support for superscripts, subscripts, Greek, and math symbols.
 */
function setupPdfFonts(doc) {
  const fontCandidates = [
    { regular: 'C:/Windows/Fonts/cambria.ttc', regularSubfont: 'Cambria', bold: 'C:/Windows/Fonts/cambriab.ttf', name: 'Cambria' },
    { regular: 'C:/Windows/Fonts/seguisym.ttf', bold: 'C:/Windows/Fonts/seguisym.ttf', name: 'SegoeUISymbol' },
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
