(() => {
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

  function toSuperscript(str) {
    return String(str).split('').map(c => SUP_MAP[c] || c).join('');
  }

  const STOP_WORDS = new Set([
    'and', 'or', 'if', 'then', 'where', 'with', 'given', 'let', 'when',
    'for', 'the', 'is', 'as', 'to', 'in', 'of', 'by', 'on', 'at', 'not',
    'has', 'find', 'than', 'such', 'that', 'from', 'each', 'all', 'both',
    'between', 'value', 'values', 'slope', 'slopes', 'line', 'lines',
    'times', 'their', 'product', 'sum', 'difference', 'ratio', 'roots',
    'root', 'equal', 'equals', 'hence', 'but', 'only', 'solution', 'option',
    'options', 'using', 'correct', 'answer', 'explanation', 'we', 'get',
    'since', 'cannot', 'exceed', 'general', 'replacing', 'coincident', 'so'
  ]);

  const SUP_CHARS = '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐᵒᵖʳˢᵗᵘᵛʷˣʸᶻ';
  const COMMAND_SIGNAL = /\\[A-Za-z]+/;
  const DELIMITED_MATH = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]+\$)/;
  const DELIMITED_MATH_GLOBAL = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]+\$)/g;
  const UNICODE_MATH = new RegExp('[¬∼~∨∧→↔⇒⇔∀∃∈∉⊂⊆∪∩≤≥≠≈≡∞√∑∏∫∆θπαβγ±×÷⊕⊗' + SUP_CHARS + ']');
  const STRUCTURED_MATH = /(\[\[[\s\S]*\]\]|[A-Za-z0-9)}\]]\s*[_^]\s*(?:\{|[-+A-Za-z0-9])|(?:^|\s)[A-Za-z0-9)}\]]+\s*[=<>+*/]\s*[-+A-Za-z0-9({[])/;
  const renderOptions = {
    throwOnError: false,
    strict: 'ignore',
    trust: false,
  };

  function looksLikeMath(value) {
    const text = String(value || '').normalize('NFKC');
    return DELIMITED_MATH.test(text)
      || COMMAND_SIGNAL.test(text)
      || UNICODE_MATH.test(text)
      || STRUCTURED_MATH.test(text);
  }

  function normalizeBracketMatrices(value) {
    return value.replace(/\[\[([\s\S]*?)\]\]/g, (match, body) => {
      const rows = body.split(/\]\s*,\s*\[/);
      if (rows.length < 2) return match;
      const matrixRows = rows.map(row => row.split(/\s*,\s*/).join(' & '));
      return `\\begin{bmatrix}${matrixRows.join(' \\\\ ')}\\end{bmatrix}`;
    });
  }

  function normalizeTex(value) {
    let text = normalizeBracketMatrices(String(value || '').normalize('NFKC').trim());
    // Auto-fix corrupted \right where \r or \n got unescaped into control characters or \night
    text = text.replace(/[\r\n]+\s*ight\b/g, '\\right');
    text = text.replace(/\\+night\b/g, '\\right');
    text = text.replace(/\bnight\b/g, 'right');
    // Normalize escaped double-backslashes before commands (e.g. \\sim, \\vee, \\wedge, \\frac)
    text = text.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
    text = text.replace(/\\\\([()[\]])/g, '\\$1');
    text = text
      .replace(/\u2212/g, '-')
      .replace(/\/(theta|alpha|beta|gamma|delta|pi|infty)\b/g, (match, name) => `\\${name}`)
      .replace(/¬/g, '\\neg ')
      .replace(/∨/g, '\\vee ')
      .replace(/∧/g, '\\wedge ')
      .replace(/\\lor\b/g, '\\vee ')
      .replace(/\\land\b/g, '\\wedge ')
      .replace(/[∼~]\s*([a-zA-Z0-9(\[])/g, '{\\sim}$1')
      .replace(/[∼~]/g, '{\\sim}')
      .replace(/\\sim\s*([a-zA-Z0-9(\[])/g, '{\\sim}$1')
      .replace(/→/g, '\\to ')
      .replace(/[↔⇔]/g, '\\leftrightarrow ')
      .replace(/=>/g, '\\Rightarrow ')
      .replace(/⇒/g, '\\Rightarrow ')
      .replace(/≡/g, '\\equiv ')
      .replace(/⊕/g, '\\oplus ')
      .replace(/⊗/g, '\\otimes ')
      .replace(/∀/g, '\\forall ')
      .replace(/∃/g, '\\exists ')
      .replace(/∈/g, '\\in ')
      .replace(/∉/g, '\\notin ')
      .replace(/≤/g, '\\le ')
      .replace(/≥/g, '\\ge ')
      .replace(/≠/g, '\\ne ')
      .replace(/∞/g, '\\infty ')
      .replace(/π/g, '\\pi ')
      .replace(/±/g, '\\pm ')
      .replace(/√\s*\(([^()]*)\)/g, '\\sqrt{$1}')
      .replace(/√\s*([+-]?(?:\d+(?:\.\d+)?|[A-Za-z](?:[_^]?[A-Za-z0-9]+)?))/g, '\\sqrt{$1}')
      .replace(/√/g, '\\sqrt{}')
      .replace(/(^|[^\\])%/g, '$1\\%');

    // Negative exponents or multi-character exponents like ^-1, ^-2 -> wrap in braces: ^{-1}
    text = text.replace(/\^([-+][0-9a-zA-Z]+)/g, (m, p) => '^{' + p + '}');
    // Prefix trig/math/log functions with backslash if missing
    text = text.replace(/(?<!\\)\b(sin|cos|tan|cot|sec|csc|log|ln|det|lim)\b/g, (m, p) => '\\' + p);
    return text;
  }

  function readableMathFallback(value) {
    let text = delimiterBody(String(value || '').trim())
      .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
      .replace(/\\\\([()[\]])/g, '\\$1')
      .replace(/\\begin\{(?:b|p|v|V|small)?matrix\}/g, '[')
      .replace(/\\end\{(?:b|p|v|V|small)?matrix\}/g, ']')
      .replace(/\\\\/g, '; ')
      .replace(/\s*&\s*/g, '  ')
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
      .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
      .replace(/\\text\{([^{}]*)\}/g, '$1')
      .replace(/\\(?:left|right)\b/g, '')
      .replace(/\\neg\b/g, '¬')
      .replace(/\\sim\b/g, '~')
      .replace(/\\(?:vee|lor)\b/g, '∨')
      .replace(/\\(?:wedge|land)\b/g, '∧')
      .replace(/\\to\b/g, '→')
      .replace(/\\(?:leftrightarrow|iff)\b/g, '↔')
      .replace(/\\(?:Rightarrow|implies)\b/g, '⇒')
      .replace(/\\equiv\b/g, '≡')
      .replace(/\\oplus\b/g, '⊕')
      .replace(/\\otimes\b/g, '⊗')
      .replace(/\\forall\b/g, '∀')
      .replace(/\\exists\b/g, '∃')
      .replace(/\\in\b/g, '∈')
      .replace(/\\notin\b/g, '∉')
      .replace(/\\leq?\b/g, '≤')
      .replace(/\\geq?\b/g, '≥')
      .replace(/\\ne(?:q)?\b/g, '≠')
      .replace(/\\infty\b/g, '∞')
      .replace(/\\pi\b/g, 'π')
      .replace(/\\pm\b/g, '±')
      .replace(/\\theta\b/g, 'θ')
      .replace(/\\alpha\b/g, 'α')
      .replace(/\\beta\b/g, 'β')
      .replace(/\\gamma\b/g, 'γ')
      .replace(/\\([A-Za-z]+)/g, '$1')
      .replace(/[{}]/g, match => match === '{' ? '(' : ')');

    // Convert caret powers to Unicode superscripts in fallback text
    text = text.replace(/(?<=[A-Za-z0-9)\]\}])\^\{([^{}]+)\}/g, (_, p) => toSuperscript(p))
      .replace(/(?<=[A-Za-z0-9)\]\}])\^([-+][0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p))
      .replace(/(?<=[A-Za-z0-9)\]\}])\^([0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p))
      .replace(/(?<=[A-Za-z0-9)\]\}])\s*\^\s*([0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p));

    return text.replace(/([~∼¬])\s+([a-zA-Z0-9(\[])/g, '$1$2');
  }

  function delimiterBody(value) {
    if ((value.startsWith('\\(') && value.endsWith('\\)'))
      || (value.startsWith('\\[') && value.endsWith('\\]'))
      || (value.startsWith('$$') && value.endsWith('$$'))) return value.slice(2, -2);
    if (value.startsWith('$') && value.endsWith('$')) return value.slice(1, -1);
    return value;
  }

  function delimiterIsDisplay(value) {
    return value.startsWith('\\[') || value.startsWith('$$');
  }

  function tokenHasSeed(token) {
    const value = String(token || '').normalize('NFKC');
    return COMMAND_SIGNAL.test(value)
      || UNICODE_MATH.test(value)
      || /\[\[|\]\]/.test(value)
      || /[A-Za-z0-9)}\]]\s*[_^]/.test(value)
      || /^[=<>+*/]+$/.test(value)
      || /^[([{]*[~¬∼]?[-+A-Za-z0-9.)\]}]+[=<>+*/][-+A-Za-z0-9.(\[{]+[)\]},;:.]*$/.test(value)
      || /^[([{]*[-+A-Za-z0-9.)\]}]+-[-+A-Za-z0-9.(\[{]+[)\]},;:.]*$/.test(value);
  }

  function tokenCanJoinMath(token) {
    const clean = String(token || '').normalize('NFKC').trim().replace(/[()[\]{}]/g, '').replace(/^[,;:.!?]+|[,;:.!?]+$/g, '');
    if (!clean) return true;
    if (STOP_WORDS.has(clean.toLowerCase())) return false;
    if (tokenHasSeed(token)) return true;
    if (/^[()[\]{}.,;:+\-*/=<>!|&~∼¬∨∧↔→⇒⇔≡±]+$/.test(token)) return true;
    if (/^[-+]?\d+(?:\.\d+)?(?:[A-Za-z0-9⁰-⁹⁺⁻ⁿ²³]|sin|cos|tan)*$/i.test(clean)) return true;
    if (/^(?:\d+)?[A-Za-z]+(?:[_^](?:\{[^{}]+\}|[-+A-Za-z0-9]+)|[⁰-⁹⁺⁻ⁿ²³]+)*$/.test(clean)) return true;
    if (/^(?:sin|cos|tan|sec|csc|cot|log|ln|lim|det)/i.test(clean)) return true;
    return false;
  }

  function bareMathRanges(value) {
    const tokens = [];
    const matcher = /\S+/g;
    let tokenMatch;
    while ((tokenMatch = matcher.exec(value))) {
      tokens.push({ value: tokenMatch[0], start: tokenMatch.index, end: matcher.lastIndex });
    }
    if (!tokens.some(token => tokenHasSeed(token.value))) return [];

    const ranges = [];
    tokens.forEach((token, index) => {
      if (!tokenHasSeed(token.value)) return;
      let startIndex = index;
      let endIndex = index;
      while (startIndex > 0 && tokenCanJoinMath(tokens[startIndex - 1].value)) startIndex -= 1;
      while (endIndex + 1 < tokens.length && tokenCanJoinMath(tokens[endIndex + 1].value)) endIndex += 1;
      
      let startChar = tokens[startIndex].start;
      let endChar = tokens[endIndex].end;

      const slice = value.slice(startChar, endChar);
      const trailingPunct = slice.match(/[,;:.!?]+$/);
      if (trailingPunct) {
        endChar -= trailingPunct[0].length;
      }
      const leadingPunct = value.slice(startChar, endChar).match(/^[,;:.!?]+/);
      if (leadingPunct) {
        startChar += leadingPunct[0].length;
      }

      const range = { start: startChar, end: endChar };
      const previous = ranges[ranges.length - 1];
      if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
      else ranges.push(range);
    });
    return ranges;
  }

  function appendText(parent, value) {
    if (value) {
      const formatted = String(value)
        .replace(/(?<=[A-Za-z0-9)\]\}])\^\{([^{}]+)\}/g, (_, p) => toSuperscript(p))
        .replace(/(?<=[A-Za-z0-9)\]\}])\^([-+][0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p))
        .replace(/(?<=[A-Za-z0-9)\]\}])\^([0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p))
        .replace(/(?<=[A-Za-z0-9)\]\}])\s*\^\s*([0-9a-zA-Z]+)/g, (_, p) => toSuperscript(p))
        .replace(/=>/g, '⇒')
        .replace(/<=>/g, '⇔');
      parent.appendChild(document.createTextNode(formatted));
    }
  }

  function appendMath(parent, value, displayMode = false) {
    const span = document.createElement(displayMode ? 'div' : 'span');
    span.className = displayMode ? 'spvn-math-block' : 'spvn-math-inline';
    let success = false;
    if (window.katex) {
      const tex = normalizeTex(value);
      try {
        window.katex.render(tex, span, { ...renderOptions, displayMode, throwOnError: true });
        success = true;
      } catch {
        try {
          // Attempt auto-balancing of unclosed \left / \right
          let fixedTex = tex;
          const leftCount = (fixedTex.match(/\\left\b/g) || []).length;
          const rightCount = (fixedTex.match(/\\right\b/g) || []).length;
          if (leftCount > rightCount) {
            fixedTex += ' \\right.'.repeat(leftCount - rightCount);
          } else if (rightCount > leftCount) {
            fixedTex = ' \\left.'.repeat(rightCount - leftCount) + ' ' + fixedTex;
          }
          window.katex.render(fixedTex, span, { ...renderOptions, displayMode, throwOnError: true });
          success = true;
        } catch {
          success = false;
        }
      }
    }
    if (!success) {
      span.textContent = readableMathFallback(value);
      span.classList.add('spvn-math-fallback');
    }
    parent.appendChild(span);
  }

  function appendBareChunk(parent, value, allowDisplay = false) {
    const ranges = bareMathRanges(value);
    if (!ranges.length) {
      appendText(parent, value);
      return 0;
    }

    const trimmed = value.trim();
    const singleRange = ranges.length === 1
      && value.slice(ranges[0].start, ranges[0].end).trim() === trimmed;
    let cursor = 0;
    ranges.forEach(range => {
      appendText(parent, value.slice(cursor, range.start));
      appendMath(parent, value.slice(range.start, range.end), allowDisplay && singleRange);
      cursor = range.end;
    });
    appendText(parent, value.slice(cursor));
    return ranges.length;
  }

  function renderMixedValue(parent, value, displayMode) {
    let raw = String(value || '');
    // Normalize escaped double-backslashes before delimiters (e.g. \\( ... \\) or \\[ ... \\])
    raw = raw.replace(/\\\\([()[\]])/g, '\\$1');
    let cursor = 0;
    let renderedCount = 0;
    const matches = Array.from(raw.matchAll(DELIMITED_MATH_GLOBAL));
    const onlyDelimitedMath = matches.length === 1
      && raw.slice(0, matches[0].index).trim() === ''
      && raw.slice(matches[0].index + matches[0][0].length).trim() === '';

    matches.forEach(match => {
      renderedCount += appendBareChunk(parent, raw.slice(cursor, match.index), false);
      appendMath(parent, delimiterBody(match[0]), displayMode && onlyDelimitedMath
        ? true
        : delimiterIsDisplay(match[0]));
      renderedCount += 1;
      cursor = match.index + match[0].length;
    });
    renderedCount += appendBareChunk(parent, raw.slice(cursor), displayMode && !matches.length);
    return renderedCount;
  }

  function renderValue(element, value, displayMode = false) {
    const raw = String(value || '').trim();
    if (!raw || !looksLikeMath(raw) || !window.katex) return false;

    const fragment = document.createDocumentFragment();
    const renderedCount = renderMixedValue(fragment, raw, displayMode);
    if (!renderedCount) return false;

    element.replaceChildren(fragment);
    element.dataset.mathSource = raw;
    element.dataset.mathRendered = '1';
    return true;
  }

  function renderStaticMath(root = document) {
    root.querySelectorAll('.math-content').forEach(element => {
      const raw = element.dataset.mathSource || element.textContent;
      renderValue(element, raw, element.dataset.mathDisplay === 'block');
    });
  }

  function ensureEditorToggle(input, preview) {
    const field = input.closest('[data-math-field]') || input.parentElement;
    let button = field?.querySelector('.math-source-toggle');
    if (button || !field) return button;

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'math-source-toggle hidden mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800';
    button.textContent = '✎ Edit extracted text';
    button.addEventListener('click', () => {
      const opening = input.classList.contains('hidden');
      input.classList.toggle('hidden', !opening);
      button.textContent = opening ? '↑ Hide extracted text' : '✎ Edit extracted text';
      if (opening) input.focus();
    });
    preview.insertAdjacentElement('afterend', button);
    return button;
  }

  function bindMathInputs(root = document) {
    root.querySelectorAll('.math-input').forEach(input => {
      const preview = input.parentElement?.querySelector('.math-preview')
        || input.closest('[data-math-field]')?.querySelector('.math-preview');
      if (!preview) return;
      const button = ensureEditorToggle(input, preview);

      const update = () => {
        preview.replaceChildren();
        const rendered = renderValue(preview, input.value, true);
        preview.classList.toggle('hidden', !rendered);
        button?.classList.toggle('hidden', !rendered);
        if (rendered && !input.dataset.mathEditorOpened) input.classList.add('hidden');
        if (!rendered) input.classList.remove('hidden');
      };
      button?.addEventListener('click', () => {
        if (!input.classList.contains('hidden')) input.dataset.mathEditorOpened = '1';
        else delete input.dataset.mathEditorOpened;
      });
      input.addEventListener('input', update);
      update();
    });
  }

  function initialize() {
    renderStaticMath();
    bindMathInputs();
  }

  window.SPVNMath = {
    looksLikeMath,
    normalizeTex,
    readableMathFallback,
    renderValue,
    renderStaticMath,
    bindMathInputs,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
