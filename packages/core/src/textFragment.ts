
export type TextFragment = { prefix?: string; start: string; end?: string; suffix?: string };

export type SelectionContext = {
  selected: string;
  before: string;
  after: string;
  pageText: string;
};

type Span = { from: number; to: number };
type Page = { text: string; key: string };
type Target = Span & { keyFrom: number };

const MAX_EXACT_WORDS = 10;
const MAX_EXACT_CHARS = 300;
const RANGE_WORDS = 3;
const MAX_TERM_WORDS = 12;
const MAX_CONTEXT_WORDS = 5;
const CONTEXT_CHARS = 200;
const CAPPED_CONTEXT_CHARS = 48;
const PAGE_TEXT_CAP = 3_000_000;
const MAX_SCORING_WORK = 3_000_000;
const MATCH_COST = 16;
const MAX_SCANNED_CHARS = 2 * CONTEXT_CHARS;
const CHUNK_CHARS = 32_768;

const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\u30fc\uff70]/u;
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;
const JOINABLE = /[\p{L}\p{N}\p{M}\p{Cf}\p{Pc}\u202f]/u;
const FOLDS: Record<string, string> = {
  ß: "ss", œ: "oe", æ: "ae", ø: "o", đ: "d", ð: "d", ł: "l", ħ: "h", ς: "σ", "„": '"',
  ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ", ة: "ه", ى: "ي", "\u0640": "",
};
const FOLDABLE = new RegExp(`[${Object.keys(FOLDS).join("")}]`, "g");
const TERM_WORD = /(?:[^\s。、，．！？：；「」『』（）]|\u202f|[，．：；](?=[0-9A-Za-z\uff10-\uff19]))+[。、，．！？：；「」『』（）]*|[。、，．！？：；「」『』（）]+/g;

function mapChunks(text: string, map: (chunk: string) => string): string {
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

const collapsed = (raw: string) =>
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

function looselyFolded(text: string): string {
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
      .replace(/[\u30a1-\u30f6]+/g, hiraganaOf)
      .replace(/\s{2,}|[^\S ]/g, " ");
  });
}

const isWordChar = (char: string | undefined) => !!char && WORD_CHAR.test(char) && !UNSPACED.test(char);

function charBefore(text: string, at: number): string | undefined {
  return /[\udc00-\udfff]/.test(text[at - 1] ?? "") ? text.slice(at - 2, at) : text[at - 1];
}

function charAfter(text: string, at: number): string | undefined {
  return /[\ud800-\udbff]/.test(text[at] ?? "") ? text.slice(at, at + 2) : text[at];
}

function isInsideWord(text: string, at: number): boolean {
  return isWordChar(charBefore(text, at)) && isWordChar(charAfter(text, at));
}

const isJoinable = (char: string | undefined) => !!char && JOINABLE.test(char);

function isSureWordEdge(text: string, at: number): boolean {
  const left = charBefore(text, at);
  const right = charAfter(text, at);
  if (!left || !right) return true;
  if (isJoinable(left) && isJoinable(right)) return false;
  if (isJoinable(left) && !/\s/.test(right)) return !isJoinable(charAfter(text, at + right.length));
  if (isJoinable(right) && !/\s/.test(left)) return !isJoinable(charBefore(text, at - left.length));
  return true;
}

function wordRunBefore(text: string): string {
  let from = text.length;
  for (let char = charBefore(text, from); char && isWordChar(char); char = charBefore(text, from)) from -= char.length;
  return text.slice(from);
}

function wordRunAfter(text: string): string {
  let to = 0;
  for (let char = charAfter(text, to); char && isWordChar(char); char = charAfter(text, to)) to += char.length;
  return text.slice(0, to);
}

function toWordBoundaries(context: SelectionContext): SelectionContext {
  const { selected, before, after } = context;
  const head = isWordChar(charAfter(selected, 0)) ? wordRunBefore(before.slice(-CONTEXT_CHARS)) : "";
  const tail = isWordChar(charBefore(selected, selected.length)) ? wordRunAfter(after.slice(0, CONTEXT_CHARS)) : "";
  return {
    ...context,
    selected: head + selected + tail,
    before: before.slice(0, before.length - head.length),
    after: after.slice(tail.length),
  };
}

const sameLetter = (a: string, b: string) => a === b || a.toLowerCase() === b.toLowerCase();

function sharedBefore(text: string, at: number, context: string): number {
  let shared = 0;
  for (let i = at - 1, first = Math.max(0, at - MAX_SCANNED_CHARS); i >= first && shared < context.length; i--) {
    const char = text[i]!;
    if (char === " " || char === "\n" || char === "\u202f") continue;
    if (!sameLetter(char, context[context.length - 1 - shared]!)) break;
    shared++;
  }
  return shared;
}

function sharedAfter(text: string, at: number, context: string): number {
  let shared = 0;
  for (let i = at, last = Math.min(text.length, at + MAX_SCANNED_CHARS); i < last && shared < context.length; i++) {
    const char = text[i]!;
    if (char === " " || char === "\n" || char === "\u202f") continue;
    if (!sameLetter(char, context[shared]!)) break;
    shared++;
  }
  return shared;
}

const withoutBreaks = (text: string) => mapChunks(text, (chunk) => chunk.replace(/\n/g, " "));

function selectionSpan(text: string, { selected, before, after }: SelectionContext, truncated: boolean): Span | null {
  const wanted = collapsed(selected);
  if (!wanted) return null;
  const left = collapsed(before.slice(-CONTEXT_CHARS)).replace(/\s/g, "");
  const right = collapsed(after.slice(0, CONTEXT_CHARS)).replace(/\s/g, "");
  const bestIn = (haystack: string, needle: string): Span | null | undefined => {
    let best: Span | null | undefined;
    let bestScore = -1;
    let work = 0;
    for (let from = haystack.indexOf(needle); from !== -1; from = haystack.indexOf(needle, from + 1)) {
      const to = from + needle.length;
      if (!left && from > 0 && text[from - 1] !== "\n") continue;
      if (!right && to < text.length && text[to] !== "\n") continue;
      const leftShared = left ? sharedBefore(text, from, left) : 0;
      const rightShared = right ? sharedAfter(text, to, right) : 0;
      const score = leftShared + rightShared;
      work += score + MATCH_COST;
      if (work > MAX_SCORING_WORK) return null;
      if (score < bestScore) continue;
      if (truncated && (!score || leftShared < Math.min(CAPPED_CONTEXT_CHARS, left.length) || rightShared < Math.min(CAPPED_CONTEXT_CHARS, right.length))) continue;
      if (isInsideWord(text, from) || isInsideWord(text, to)) continue;
      best = score === bestScore ? null : { from, to };
      bestScore = score;
    }
    return best;
  };
  const found = bestIn(text, wanted);
  if (found !== undefined) return found;
  return bestIn(withoutBreaks(text), withoutBreaks(wanted)) ?? null;
}

function wordsIn({ text }: Page, { from, to }: Span): Span[] {
  return Array.from(text.slice(from, to).matchAll(TERM_WORD), (word) => ({ from: from + word.index, to: from + word.index + word[0].length }));
}

function prefixesFor(page: Page, from: number): Span[] {
  let to = from;
  while (to > 0 && page.text[to - 1] !== "\n" && /\s/.test(page.text[to - 1]!)) to--;
  if (page.text[to - 1] === "\n") to--;
  if (to <= 0) return [];
  const line = { from: page.text.lastIndexOf("\n", to - 1) + 1, to };
  return wordsIn(page, line).slice(-MAX_CONTEXT_WORDS).reverse().map((word) => ({ from: word.from, to }));
}

function suffixesFor(page: Page, to: number): Span[] {
  let from = to;
  while (from < page.text.length && page.text[from] !== "\n" && /\s/.test(page.text[from]!)) from++;
  if (page.text[from] === "\n") from++;
  const lineEnd = page.text.indexOf("\n", from);
  const line = { from, to: lineEnd === -1 ? page.text.length : lineEnd };
  return wordsIn(page, line).slice(0, MAX_CONTEXT_WORDS).map((word) => ({ from, to: word.to }));
}

const keyOf = (page: Page, span: Span | undefined) => (span ? looselyFolded(page.text.slice(span.from, span.to)) : "");
const textOf = (page: Page, span: Span) => page.text.slice(span.from, span.to);

function nothingMatchesEarlier(key: string, at: number, prefix: string, start: string, suffix: string): boolean {
  for (const beforeStart of prefix ? ["", " "] : [""]) {
    for (const afterStart of suffix ? ["", " "] : [""]) {
      const found = key.indexOf(prefix + beforeStart + start + afterStart + suffix);
      if (found !== -1 && found + prefix.length + beforeStart.length < at) return false;
    }
  }
  return true;
}

function nothingMatchesLater(key: string, at: number, prefix: string, start: string, suffix: string): boolean {
  for (const beforeStart of prefix ? ["", " "] : [""]) {
    for (const afterStart of suffix ? ["", " "] : [""]) {
      if (key.indexOf(prefix + beforeStart + start + afterStart + suffix, at + 1) !== -1) return false;
    }
  }
  return true;
}

function exactFragment(page: Page, target: Target): TextFragment | null {
  const prefixes = prefixesFor(page, target.from);
  const suffixes = suffixesFor(page, target.to);
  const start = keyOf(page, target);
  const contexts: [Span | undefined, Span | undefined][] = [[undefined, undefined]];
  for (let n = 0; n < MAX_CONTEXT_WORDS; n++) {
    if (prefixes[n]) contexts.push([prefixes[n], undefined]);
    if (suffixes[n]) contexts.push([undefined, suffixes[n]]);
    const prefix = prefixes[n] ?? prefixes[prefixes.length - 1];
    const suffix = suffixes[n] ?? suffixes[suffixes.length - 1];
    if (prefix && suffix) contexts.push([prefix, suffix]);
  }
  const needsPrefix = !isSureWordEdge(page.text, target.from);
  const needsSuffix = !isSureWordEdge(page.text, target.to);
  let first: [Span | undefined, Span | undefined] | null = null;
  let chosen: [Span | undefined, Span | undefined] | null = null;
  for (const [prefix, suffix] of contexts) {
    if ((needsPrefix && !prefix) || (needsSuffix && !suffix)) continue;
    const before = keyOf(page, prefix);
    const after = keyOf(page, suffix);
    if (!nothingMatchesEarlier(page.key, target.keyFrom, before, start, after)) continue;
    first ??= [prefix, suffix];
    if (!nothingMatchesLater(page.key, target.keyFrom, before, start, after)) continue;
    chosen = [prefix, suffix];
    break;
  }
  const found = chosen ?? first;
  if (!found) return null;
  const [prefix, suffix] = found;
  return { ...(prefix && { prefix: textOf(page, prefix) }), start: textOf(page, target), ...(suffix && { suffix: textOf(page, suffix) }) };
}

function rangeStart(page: Page, target: Target, words: Span[]): { term: Span; prefix?: Span } | null {
  const most = Math.min(MAX_TERM_WORDS, words.length);
  const prefixes = prefixesFor(page, target.from);
  for (const prefix of isSureWordEdge(page.text, target.from) ? [undefined, ...prefixes] : prefixes) {
    for (let n = Math.min(RANGE_WORDS, most); n >= 1 && n <= most; n++) {
      const term = { from: target.from, to: words[n - 1]!.to };
      if (nothingMatchesEarlier(page.key, target.keyFrom, keyOf(page, prefix), keyOf(page, term), "")) return { term, prefix };
    }
  }
  return null;
}

function rangeEnd(page: Page, target: Target, start: Span, words: Span[]): { term: Span; suffix?: Span } | null {
  const suffix = isSureWordEdge(page.text, target.to) ? undefined : suffixesFor(page, target.to)[0];
  if (!suffix && !isSureWordEdge(page.text, target.to)) return null;
  const most = Math.min(MAX_TERM_WORDS, words.length);
  const searchFrom = target.keyFrom + keyOf(page, start).length;
  for (let n = Math.min(RANGE_WORDS, most); n >= 1 && n <= most; n++) {
    const term = { from: words[words.length - n]!.from, to: target.to };
    const at = target.keyFrom + keyOf(page, { from: target.from, to: term.from }).length;
    if (page.key.indexOf(keyOf(page, term), searchFrom) === at) return { term, suffix };
  }
  return null;
}

function rangeFragment(page: Page, target: Target): TextFragment | null {
  const selection = textOf(page, target);
  const firstBreak = selection.indexOf("\n");
  let startWords: Span[];
  let endWords: Span[];
  if (firstBreak === -1) {
    const words = wordsIn(page, target);
    const middle = Math.floor(words.length / 2);
    startWords = words.slice(0, middle);
    endWords = words.slice(middle);
  } else {
    startWords = wordsIn(page, { from: target.from, to: target.from + firstBreak });
    endWords = wordsIn(page, { from: target.from + selection.lastIndexOf("\n") + 1, to: target.to });
  }
  const start = rangeStart(page, target, startWords);
  const end = start && rangeEnd(page, target, start.term, endWords);
  if (!start || !end) return null;
  return {
    ...(start.prefix && { prefix: textOf(page, start.prefix) }),
    start: textOf(page, start.term),
    end: textOf(page, end.term),
    ...(end.suffix && { suffix: textOf(page, end.suffix) }),
  };
}

function withoutCutWord(text: string): string {
  let to = text.length;
  while (to > 0 && !/\s/.test(text[to - 1]!)) to--;
  return text.slice(0, to);
}

export function chooseTextFragment(context: SelectionContext): TextFragment | null {
  const truncated = context.pageText.length >= PAGE_TEXT_CAP;
  const text = collapsed(truncated ? withoutCutWord(context.pageText) : context.pageText);
  const widened = toWordBoundaries(context);
  const span =
    selectionSpan(text, widened, truncated) ?? (widened.selected === context.selected ? null : selectionSpan(text, context, truncated));
  if (!span) return null;
  const keyBefore = looselyFolded(text.slice(0, span.from));
  const page: Page = { text, key: keyBefore + looselyFolded(text.slice(span.from)) };
  const target: Target = { ...span, keyFrom: keyBefore.length };
  if (textOf(page, target).includes("\n")) return rangeFragment(page, target);
  if (wordsIn(page, target).length <= MAX_EXACT_WORDS) return exactFragment(page, target);
  return rangeFragment(page, target) ?? (target.to - target.from <= MAX_EXACT_CHARS ? exactFragment(page, target) : null);
}

const encodeTerm = (s: string) => encodeURIComponent(s).replace(/-/g, "%2D");

function textDirective({ prefix, start, end, suffix }: TextFragment): string {
  const parts = [prefix && `${encodeTerm(prefix)}-`, encodeTerm(start), end && encodeTerm(end), suffix && `-${encodeTerm(suffix)}`];
  return `text=${parts.filter(Boolean).join(",")}`;
}

export function withTextFragment(url: string, fragment: TextFragment): string {
  const hash = url.indexOf("#");
  const base = hash === -1 ? url : url.slice(0, hash);
  let ref = hash === -1 ? "" : url.slice(hash + 1);
  const directive = ref.indexOf(":~:");
  if (directive !== -1) ref = ref.slice(0, directive);
  return `${base}#${ref}:~:${textDirective(fragment)}`;
}
