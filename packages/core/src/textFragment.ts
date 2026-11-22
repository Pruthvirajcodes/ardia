
export type TextFragment = { prefix?: string; start: string; end?: string; suffix?: string };

export type SelectionContext = {
  selected: string;
  before: string;
  after: string;
  pageText: string;
};

type Span = { from: number; to: number };
type Page = { text: string; key: string };

const MAX_EXACT_WORDS = 10;
const MAX_EXACT_CHARS = 300;
const RANGE_WORDS = 3;
const MAX_TERM_WORDS = 12;
const MAX_CONTEXT_WORDS = 5;
const CONTEXT_CHARS = 200;

const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;
const WORD_END = /[\p{L}\p{N}_]+$/u;
const WORD_START = /^[\p{L}\p{N}_]+/u;
const TERM_WORD = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]+/gu;

function toWordBoundaries(context: SelectionContext): SelectionContext {
  const { selected, before, after } = context;
  const extendsBack = WORD_START.test(selected) && !UNSPACED.test(selected[0]!);
  const extendsOn = WORD_END.test(selected) && !UNSPACED.test(selected[selected.length - 1]!);
  const head = extendsBack ? (WORD_END.exec(before)?.[0] ?? "") : "";
  const tail = extendsOn ? (WORD_START.exec(after)?.[0] ?? "") : "";
  return {
    ...context,
    selected: head + selected + tail,
    before: before.slice(0, before.length - head.length),
    after: after.slice(tail.length),
  };
}

const withoutAccent = (char: string) => {
  const base = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return base.length === char.length ? base : char;
};

const folded = (text: string) => text.replace(/[A-Z]+/g, (upper) => upper.toLowerCase()).replace(/[^\x00-\x7f]/g, withoutAccent);

function pageOf(raw: string): Page {
  const text = raw.replace(/\s+/g, (space) => (/[\n\t]/.test(space) ? "\n" : " ")).trim();
  return { text, key: folded(text) };
}

function isBoundary(key: string, at: number): boolean {
  const left = key[at - 1] ?? "";
  const right = key[at] ?? "";
  return !WORD_CHAR.test(left) || !WORD_CHAR.test(right) || UNSPACED.test(left) || UNSPACED.test(right);
}

const matchesAt = (key: string, term: string, at: number) => key.startsWith(term, at) && isBoundary(key, at) && isBoundary(key, at + term.length);

function firstMatch(key: string, term: string, from: number, accept: (at: number) => boolean = () => true): number {
  for (let at = key.indexOf(term, from); at !== -1; at = key.indexOf(term, at + 1)) {
    if (isBoundary(key, at) && isBoundary(key, at + term.length) && accept(at)) return at;
  }
  return -1;
}

const pastSpace = (key: string, at: number) => (key[at] === " " || key[at] === "\n" ? at + 1 : at);

function firstStart(key: string, start: string, prefix: string, accept: (at: number) => boolean = () => true): number {
  if (!prefix) return firstMatch(key, start, 0, accept);
  let found = -1;
  firstMatch(key, prefix, 0, (at) => {
    const next = pastSpace(key, at + prefix.length);
    if (!matchesAt(key, start, next) || !accept(next)) return false;
    found = next;
    return true;
  });
  return found;
}

const followedBy = (key: string, at: number, suffix: string) => !suffix || matchesAt(key, suffix, pastSpace(key, at));

function occurrencesOfSelection(key: string, selected: Page): Span[] {
  const flat = key.replace(/\n/g, " ");
  const whole = selected.key.replace(/\n/g, " ");
  const spans: Span[] = [];
  firstMatch(flat, whole, 0, (from) => {
    spans.push({ from, to: from + whole.length });
    return false;
  });
  const lines = selected.key.split("\n");
  if (spans.length || lines.length < 2) return spans;
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  firstMatch(key, first, 0, (from) => {
    const end = firstMatch(key, last, from + first.length);
    if (end !== -1 && end + last.length - from <= 2 * whole.length) spans.push({ from, to: end + last.length });
    return false;
  });
  return spans;
}

const unspaced = (text: string) => text.replace(/\s+/g, "");

function sharedLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

const reversed = (text: string) => text.split("").reverse().join("");

function selectionSpan(key: string, selected: Page, before: string, after: string): Span | null {
  const spans = occurrencesOfSelection(key, selected);
  if (spans.length < 2) return spans[0] ?? null;
  const left = reversed(unspaced(folded(before.slice(-CONTEXT_CHARS))));
  const right = unspaced(folded(after.slice(0, CONTEXT_CHARS)));
  let best: Span | null = null;
  let bestScore = -1;
  for (const span of spans) {
    const startsLine = span.from === 0 || key[span.from - 1] === "\n";
    const endsLine = span.to === key.length || key[span.to] === "\n";
    const score =
      (left ? sharedLength(left, reversed(unspaced(key.slice(Math.max(0, span.from - 2 * CONTEXT_CHARS), span.from)))) : Number(startsLine)) +
      (right ? sharedLength(right, unspaced(key.slice(span.to, span.to + 2 * CONTEXT_CHARS))) : Number(endsLine));
    if (score === bestScore) best = null;
    if (score <= bestScore) continue;
    best = span;
    bestScore = score;
  }
  return best;
}

function wordsIn({ text }: Page, { from, to }: Span): Span[] {
  return Array.from(text.slice(from, to).matchAll(TERM_WORD), (word) => ({ from: from + word.index, to: from + word.index + word[0].length }));
}

function prefixesFor(page: Page, from: number): Span[] {
  const to = /\s/.test(page.text[from - 1] ?? "") ? from - 1 : from;
  if (to <= 0) return [];
  const line = { from: page.text.lastIndexOf("\n", to - 1) + 1, to };
  return wordsIn(page, line).slice(-MAX_CONTEXT_WORDS).reverse().map((word) => ({ from: word.from, to }));
}

function suffixesFor(page: Page, to: number): Span[] {
  const from = pastSpace(page.key, to);
  const lineEnd = page.text.indexOf("\n", from);
  const line = { from, to: lineEnd === -1 ? page.text.length : lineEnd };
  return wordsIn(page, line).slice(0, MAX_CONTEXT_WORDS).map((word) => ({ from, to: word.to }));
}

const keyOf = (page: Page, span: Span | undefined) => (span ? page.key.slice(span.from, span.to) : "");
const textOf = (page: Page, span: Span) => page.text.slice(span.from, span.to);

function exactFragment(page: Page, target: Span): TextFragment | null {
  const prefixes = prefixesFor(page, target.from);
  const suffixes = suffixesFor(page, target.to);
  const start = keyOf(page, target);
  for (let n = 0; n <= MAX_CONTEXT_WORDS; n++) {
    const prefix = prefixes[n - 1];
    const suffix = suffixes[n - 1];
    for (const [before, after] of [[prefix, undefined], [undefined, suffix], [prefix, suffix]]) {
      const found = firstStart(page.key, start, keyOf(page, before), (at) => followedBy(page.key, at + start.length, keyOf(page, after)));
      if (found === target.from)
        return { ...(before && { prefix: textOf(page, before) }), start: textOf(page, target), ...(after && { suffix: textOf(page, after) }) };
    }
  }
  return null;
}

function rangeStart(page: Page, target: Span, words: Span[]): { term: Span; prefix?: Span } | null {
  const most = Math.min(MAX_TERM_WORDS, words.length);
  for (const prefix of [undefined, ...prefixesFor(page, target.from)]) {
    for (let n = Math.min(RANGE_WORDS, most); n >= 1 && n <= most; n++) {
      const term = { from: target.from, to: words[n - 1]!.to };
      if (firstStart(page.key, keyOf(page, term), keyOf(page, prefix)) === target.from) return { term, prefix };
    }
  }
  return null;
}

function rangeEnd(page: Page, target: Span, searchFrom: number, words: Span[]): { term: Span; suffix?: Span } | null {
  const most = Math.min(MAX_TERM_WORDS, words.length);
  for (const suffix of [undefined, ...suffixesFor(page, target.to)]) {
    for (let n = Math.min(RANGE_WORDS, most); n >= 1 && n <= most; n++) {
      const term = { from: words[words.length - n]!.from, to: target.to };
      const end = keyOf(page, term);
      if (firstMatch(page.key, end, searchFrom, (at) => followedBy(page.key, at + end.length, keyOf(page, suffix))) === term.from) return { term, suffix };
    }
  }
  return null;
}

function rangeFragment(page: Page, target: Span): TextFragment | null {
  const selection = page.key.slice(target.from, target.to);
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
  const end = start && rangeEnd(page, target, start.term.to, endWords);
  if (!start || !end) return null;
  return {
    ...(start.prefix && { prefix: textOf(page, start.prefix) }),
    start: textOf(page, start.term),
    end: textOf(page, end.term),
    ...(end.suffix && { suffix: textOf(page, end.suffix) }),
  };
}

export function chooseTextFragment(context: SelectionContext): TextFragment | null {
  const { selected, before, after, pageText } = toWordBoundaries(context);
  const selection = pageOf(selected);
  if (!selection.text) return null;
  const page = pageOf(pageText);
  const target = selectionSpan(page.key, selection, before, after);
  if (!target) return null;
  if (page.key.slice(target.from, target.to).includes("\n")) return rangeFragment(page, target);
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
