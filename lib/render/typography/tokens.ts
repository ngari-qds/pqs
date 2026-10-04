/**
 * Turns text with *emphasis* markup into paragraphs of word tokens.
 * Hard line breaks (\n) start a new paragraph and are always preserved.
 */

export interface RawToken {
  text: string;
  em: boolean;
}

export function tokenize(text: string): RawToken[][] {
  const paragraphs: RawToken[][] = [];
  let em = false;
  for (const para of text.replace(/\r/g, "").split("\n")) {
    const tokens: RawToken[] = [];
    for (const word of para.split(/[ \t]+/).filter(Boolean)) {
      let out = "";
      let emphasised = false;
      for (const ch of word) {
        if (ch === "*") {
          em = !em;
          continue;
        }
        out += ch;
        // A word counts as emphasised if any letter/number inside it is;
        // trailing punctuation simply follows the word's style.
        if (em && /[\p{L}\p{N}]/u.test(ch)) emphasised = true;
      }
      if (out) tokens.push({ text: out, em: emphasised });
    }
    paragraphs.push(tokens);
  }
  while (paragraphs.length && paragraphs[0].length === 0) paragraphs.shift();
  while (paragraphs.length && paragraphs[paragraphs.length - 1].length === 0) paragraphs.pop();
  return paragraphs;
}

export const stripMarkup = (s: string) => s.replace(/\*/g, "");
