import { bracketGlue, COMPARED_CHARS_PER_COST, CONTEXT_CHARS, GLUE_COST, isRepeatedLabel, MATCH_COST, MAX_SCORING_WORK, sharedAfter, sharedBefore, sharedPastGlue, spanPastTrailers, type Found, type Span } from "./fragmentGlue.ts";
import { charAfter, charBefore, collapsed, isInsideWord, isSureWordEdge, isWordChar, looselyFolded, mapChunks, wordRunAfter, wordRunBefore } from "./fragmentText.ts";

export type TextFragment = { prefix?: string; start: string; end?: string; suffix?: string };

export type SelectionContext = {
  selected: string;
  before: string;
  after: string;
  pageText: string;
};

type Page = { text: string; key: string };
type Target = Found & { keyFrom: number };

const MAX_EXACT_WORDS = 10;
const MAX_EXACT_CHARS = 300;
const RANGE_WORDS = 3;
const MAX_TERM_WORDS = 12;
const MAX_CONTEXT_WORDS = 5;
const CAPPED_CONTEXT_CHARS = 48;
const PAGE_TEXT_CAP = 3_000_000;
const SEARCHED_HEAD_CHARS = 256;

const ONLY_FORMAT = /^\p{Cf}+$/u;
const UNREACHABLE_EDGE = /(?![\u200c\u200d])\p{Cf}/u;
const UNSKIPPED_GAP = /[\u202f\ufeff]/;
const ENDS_LINE = /\n\s*$/;
const TERM_WORD = /(?:[^\s。、，．！？：；「」『』（）]|\u202f|[，．：；](?=[0-9A-Za-z\uff10-\uff19]))+[。、，．！？：；「」『』（）]*|[。、，．！？：；「」『』（）]+/g;

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

const withoutBreaks = (text: string) => mapChunks(text, (chunk) => chunk.replace(/\n/g, " "));

function selectionSpan(text: string, context: SelectionContext, truncated: boolean): Found | null {
  const { selected, before, after } = context;
  const wanted = collapsed(selected);
  if (!wanted) return null;
  const left = collapsed(before.slice(-CONTEXT_CHARS)).replace(/\s/g, "");
  const right = collapsed(after.slice(0, CONTEXT_CHARS)).replace(/\s/g, "");
  const endsLine = !truncated && ENDS_LINE.test(selected);
  const glue = bracketGlue(after);
  const mayBeGlued = !truncated && (endsLine || (!!right && !!glue));
  const bestIn = (haystack: string, needle: string): Found | null | undefined => {
    let best: Found | null | undefined;
    let bestScore = -1;
    let rejectedScore = -1;
    let hasPlain = false;
    let work = 0;
    const head = needle.slice(0, SEARCHED_HEAD_CHARS);
    const last = haystack.length - needle.length;
    for (let from = haystack.indexOf(head); from !== -1 && from <= last; from = haystack.indexOf(head, from + 1)) {
      if (head.length < needle.length) {
        work += needle.length / COMPARED_CHARS_PER_COST;
        if (work > MAX_SCORING_WORK && from > 0) return null;
        if (!haystack.startsWith(needle, from)) continue;
      }
      const to = from + needle.length;
      if (!left && from > 0 && text[from - 1] !== "\n") continue;
      if (!right && to < text.length && text[to] !== "\n") {
        if (!endsLine) continue;
        work += MATCH_COST;
        if (work > MAX_SCORING_WORK) return null;
        if (!isInsideWord(text, to)) continue;
      }
      const leftShared = left ? sharedBefore(text, from, left) : 0;
      const rightShared = right ? sharedAfter(text, to, right) : 0;
      if (endsLine && !hasPlain) hasPlain = !isInsideWord(text, from) && !isInsideWord(text, to);
      let pastGlue: number | null = null;
      if (mayBeGlued && isInsideWord(text, to)) {
        work += GLUE_COST;
        pastGlue = sharedPastGlue(text, to, endsLine, right, glue);
      }
      const score = leftShared + (pastGlue ?? rightShared);
      work += score + MATCH_COST;
      if (work > MAX_SCORING_WORK) return null;
      if (score < bestScore) continue;
      if (truncated && (!score || leftShared < Math.min(CAPPED_CONTEXT_CHARS, left.length) || rightShared < Math.min(CAPPED_CONTEXT_CHARS, right.length))) continue;
      if (isInsideWord(text, from) || (pastGlue === null && isInsideWord(text, to))) {
        rejectedScore = Math.max(rejectedScore, score);
        continue;
      }
      best = score === bestScore ? null : { from, to, score, glued: pastGlue !== null };
      bestScore = score;
    }
    if (!best) return best;
    if (rejectedScore >= bestScore) return null;
    return best.glued && endsLine && (hasPlain || !isRepeatedLabel(text, best.to)) ? null : best;
  };
  const exact = bestIn(text, wanted);
  const found = exact === undefined ? bestIn(withoutBreaks(text), withoutBreaks(wanted)) : exact;
  if (found === null) return null;
  const past = truncated ? undefined : spanPastTrailers(text, wanted, left, right, found?.score ?? 0);
  if (past === undefined) return found ?? null;
  if (found === undefined) return past;
  if (!past || found.score === past.score) return null;
  return found.score > past.score ? found : past;
}

function wordsIn({ text }: Page, { from, to }: Span): Span[] {
  return Array.from(text.slice(from, to).matchAll(TERM_WORD), (word) => ({ from: from + word.index, to: from + word.index + word[0].length }));
}

function prefixesFor(page: Page, from: number): Span[] {
  let to = from;
  while (to > 0 && page.text[to - 1] !== "\n" && /\s/.test(page.text[to - 1]!)) to--;
  if (page.text[to - 1] === "\n") to--;
  if (to <= 0 || UNREACHABLE_EDGE.test(charBefore(page.text, to)!) || UNSKIPPED_GAP.test(page.text.slice(to, from))) return [];
  const line = { from: page.text.lastIndexOf("\n", to - 1) + 1, to };
  const spans = wordsIn(page, line).slice(-MAX_CONTEXT_WORDS).reverse().map((word) => ({ from: word.from, to }));
  return spans.filter((span) => !ONLY_FORMAT.test(textOf(page, span)));
}

function suffixesFor(page: Page, to: number): Span[] {
  let from = to;
  while (from < page.text.length && page.text[from] !== "\n" && /\s/.test(page.text[from]!)) from++;
  if (page.text[from] === "\n") from++;
  if (UNREACHABLE_EDGE.test(charAfter(page.text, from) ?? "") || UNSKIPPED_GAP.test(page.text.slice(to, from))) return [];
  const lineEnd = page.text.indexOf("\n", from);
  const line = { from, to: lineEnd === -1 ? page.text.length : lineEnd };
  const spans = wordsIn(page, line).slice(0, MAX_CONTEXT_WORDS).map((word) => ({ from, to: word.to }));
  return spans.filter((span) => !ONLY_FORMAT.test(textOf(page, span)));
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
      const from = Math.max(0, at - prefix.length - beforeStart.length + 1);
      if (key.indexOf(prefix + beforeStart + start + afterStart + suffix, from) !== -1) return false;
    }
  }
  return true;
}

const isOnItsLine = ({ text }: Page, target: Target, prefix?: Span, suffix?: Span) =>
  !(prefix && text.slice(prefix.to, target.from).includes("\n")) && !(suffix && text.slice(target.to, suffix.from).includes("\n"));

function exactFragment(page: Page, target: Target): TextFragment | null {
  const prefixes = prefixesFor(page, target.from);
  const suffixes = target.glued ? [] : suffixesFor(page, target.to);
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
  const needsSuffix = !target.glued && !isSureWordEdge(page.text, target.to);
  let first: [Span | undefined, Span | undefined] | null = null;
  let chosen: [Span | undefined, Span | undefined] | null = null;
  for (const [prefix, suffix] of contexts) {
    if ((needsPrefix && !prefix) || (needsSuffix && !suffix)) continue;
    const before = keyOf(page, prefix);
    const after = keyOf(page, suffix);
    if (!nothingMatchesEarlier(page.key, target.keyFrom, before, start, after)) continue;
    if (first && !target.glued && !isOnItsLine(page, target, prefix, suffix)) continue;
    first ??= [prefix, suffix];
    if (!nothingMatchesLater(page.key, target.keyFrom, before, start, after)) continue;
    chosen = [prefix, suffix];
    break;
  }
  const found = target.glued ? chosen : (chosen ?? first);
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
      const before = keyOf(page, prefix);
      const start = keyOf(page, term);
      if (!nothingMatchesEarlier(page.key, target.keyFrom, before, start, "")) continue;
      if (!target.glued || nothingMatchesLater(page.key, target.keyFrom, before, start, "")) return { term, prefix };
    }
  }
  return null;
}

function rangeEnd(page: Page, target: Target, start: Span, words: Span[]): { term: Span; suffix?: Span } | null {
  const isSure = (target.glued && !target.firstLineEnd) || isSureWordEdge(page.text, target.to);
  const suffix = isSure ? undefined : suffixesFor(page, target.to)[0];
  if (!suffix && !isSure) return null;
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
    startWords = wordsIn(page, { from: target.from, to: target.firstLineEnd ?? target.from + firstBreak });
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
