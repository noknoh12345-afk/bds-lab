// A test line's code (`py ...`, `lse ...`): `\n` written on the line is a line break — but only where it is code, never inside
// a string literal, where it is the string's own escape: `py return "a\nb".split("\n")` stays one statement (before, both became
// real line breaks and the line was a SyntaxError: an unterminated string). Python: ' " ''' """ (any prefix; a backslash always
// keeps the next character in the string, raw or not), # comments to the next \n. JavaScript: ' " ` and // comments.
export function lineBreaks(code, lang = 'py') {
  let out = '', i = 0, q = null;
  const quotes = lang === 'py' ? ['"""', "'''", '"', "'"] : ['"', "'", '`'], comment = lang === 'py' ? '#' : '//';
  while (i < code.length) {
    if (q) {
      if (code[i] === '\\') { out += code.slice(i, i + 2); i += 2; continue; }
      if (code.startsWith(q, i)) { out += q; i += q.length; q = null; continue; }
      out += code[i++];
      continue;
    }
    if (code.startsWith('\\n', i)) { out += '\n'; i += 2; continue; }
    if (code.startsWith(comment, i)) {   // (to the next written \n: quotes in a comment open nothing)
      const j = code.indexOf('\\n', i), end = j < 0 ? code.length : j;
      out += code.slice(i, end); i = end; continue;
    }
    const open = quotes.find((x) => code.startsWith(x, i));
    if (open) { q = open; out += open; i += open.length; continue; }
    out += code[i++];
  }
  return out;
}
