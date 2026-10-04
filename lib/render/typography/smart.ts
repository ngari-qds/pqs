/**
 * Typographic clean-up: curly quotes and apostrophes, real ellipses and
 * dashes, and (for equations) true multiplication and minus signs.
 */

export function smartQuotes(input: string): string {
  let s = input;
  s = s.replace(/\.\.\./g, "…");
  s = s.replace(/ -- /g, " — ").replace(/--/g, "—");
  s = s.replace(/(\s)-(\s)/g, "$1–$2");
  // Apostrophes inside words and decade abbreviations ('90s).
  s = s.replace(/(\w)'(\w)/g, "$1’$2");
  s = s.replace(/(^|[\s(\[{—])'(?=\d{2}s)/g, "$1’");
  // Opening quotes: start of string or after whitespace / opening brackets / dashes.
  s = s.replace(/(^|[\s(\[{—–])"/g, "$1“");
  s = s.replace(/(^|[\s(\[{—–“])'/g, "$1‘");
  // Everything left is closing.
  s = s.replace(/"/g, "”").replace(/'/g, "’");
  return s;
}

/** Equation typography: × for x/* between terms, − for hyphen-minus, ÷ for /. */
export function mathSymbols(input: string): string {
  return input
    .replace(/\s[x*]\s/g, " × ")
    .replace(/\s-\s/g, " − ")
    .replace(/\s\/\s/g, " ÷ ")
    .replace(/<=/g, "≤")
    .replace(/>=/g, "≥")
    .replace(/!=/g, "≠");
}

export const OPENING_PUNCTUATION = /^[“‘"'«„(\[]/;
