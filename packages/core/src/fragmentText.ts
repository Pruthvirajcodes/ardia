const CHUNK_CHARS = 32_768;
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\u30fc\uff70]/u;
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;
const JOINABLE = /[\p{L}\p{N}\p{M}\p{Pc}\u202f]|(?!\u200b)\p{Cf}/u;
const FORMAT = /\p{Cf}/u;
const FOLDS: Record<string, string> = {
  ß: "ss", œ: "oe", æ: "ae", ø: "o", đ: "d", ð: "d", ł: "l", ħ: "h", ς: "σ", "„": '"',
  ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ", ة: "ه", ى: "ي", "\u0640": "",
};
const FOLDABLE = new RegExp(`[${Object.keys(FOLDS).join("")}]`, "g");

export function mapChunks(text: string, map: (chunk: string) => string): string {
  if (text.length <= CHUNK_CHARS) return map(text);
  const out: string[] = [];
  for (let from = 0; from < text.length; ) {
    let to = from + CHUNK_CHARS;
    if (to < text.length) {
      const uncuttable = /[\s\ud800-\udbff]*/y;
      uncuttable.lastIndex = to - 1;
      uncuttable.exec(text);
      to = Math.min(text.length, uncuttable.lastIndex + 1);
    }
    out.push(map(text.slice(from, to)));
    from = to;
  }
  return out.join("");
}

export const collapsed = (raw: string) =>
  mapChunks(raw, (chunk) =>
    chunk
      .replace(/­+/g, "")
      .replace(/[\t\r\f\v  - 　]+/g, (space) => (space.includes("\t") ? "\n" : " "))
      .replace(/[ \n]{2,}/g, "\n"),
  ).trim();

function hiraganaOf(katakana: string): string {
  const codes = new Array<number>(katakana.length);
  for (let i = 0; i < katakana.length; i++) codes[i] = katakana.charCodeAt(i) - 0x60;
  return String.fromCharCode.apply(null, codes);
}

export function looselyFolded(text: string): string {
  return mapChunks(text, (chunk) => {
    const lower = chunk.toLowerCase().replace(/\n/g, " ").replace(/ {2,}/g, " ");
    if (!/[^\x00-\x7f]/.test(lower)) return lower;
    return lower
      .replace(/\u0140/g, "l")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\p{M}\p{Cf}]+/gu, "")
      .replace(/[‘’׳]/g, "'")
      .replace(/[“”״]/g, '"')
      .replace(FOLDABLE, (char) => FOLDS[char]!)
      .replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) & 15))
      .replace(/[\u30a1-\u30f6]{1,8192}/g, hiraganaOf)
      .replace(/\s{2,}|[^\S ]/g, " ");
  });
}

export const isWordChar = (char: string | undefined) => !!char && WORD_CHAR.test(char) && !UNSPACED.test(char);

export function charBefore(text: string, at: number): string | undefined {
  return /[\udc00-\udfff]/.test(text[at - 1] ?? "") ? text.slice(at - 2, at) : text[at - 1];
}

export function charAfter(text: string, at: number): string | undefined {
  return /[\ud800-\udbff]/.test(text[at] ?? "") ? text.slice(at, at + 2) : text[at];
}

export function isInsideWord(text: string, at: number): boolean {
  return isWordChar(charBefore(text, at)) && isWordChar(charAfter(text, at));
}

export const isJoinable = (char: string | undefined) => !!char && JOINABLE.test(char);

export function isSureWordEdge(text: string, at: number): boolean {
  const left = charBefore(text, at);
  const right = charAfter(text, at);
  if (!left || !right || left === "\u200b" || right === "\u200b") return true;
  if (right === "\u202f" && !isJoinable(left)) return true;
  if (FORMAT.test(left) && (at === left.length || /\s/.test(text[at - left.length - 1]!))) return true;
  if (isJoinable(left) && isJoinable(right)) return false;
  if (isJoinable(left) && !/\s/.test(right)) return !isJoinable(charAfter(text, at + right.length));
  if (isJoinable(right) && !/\s/.test(left)) return !isJoinable(charBefore(text, at - left.length));
  return true;
}

export function wordRunBefore(text: string): string {
  let from = text.length;
  for (let char = charBefore(text, from); char && isWordChar(char); char = charBefore(text, from)) from -= char.length;
  return text.slice(from);
}

export function wordRunAfter(text: string): string {
  let to = 0;
  for (let char = charAfter(text, to); char && isWordChar(char); char = charAfter(text, to)) to += char.length;
  return text.slice(0, to);
}
