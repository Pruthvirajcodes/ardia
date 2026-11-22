import { charAfter, charBefore, collapsed, isInsideWord, isJoinable, wordRunAfter } from "./fragmentText.ts";

export type Span = { from: number; to: number };
export type Found = Span & { score: number; glued?: boolean; firstLineEnd?: number };
type Glue = { word: string; rest: string };

export const CONTEXT_CHARS = 200;
export const MAX_SCORING_WORK = 3_000_000;
export const MATCH_COST = 16;
export const GLUE_COST = 32;
export const COMPARED_CHARS_PER_COST = 8;
const MAX_SCANNED_CHARS = 2 * CONTEXT_CHARS;
const MAX_TRAILER_CHARS = 64;
const TRAILER_CONTEXT_CHARS = 24;
const LABEL = /^\p{L}{3}[\p{L} |]*$/u;

const sameLetter = (a: string, b: string) => a === b || a.toLowerCase() === b.toLowerCase();

export function sharedBefore(text: string, at: number, context: string): number {
  let shared = 0;
  for (let i = at - 1, first = Math.max(0, at - MAX_SCANNED_CHARS); i >= first && shared < context.length; i--) {
    const char = text[i]!;
    if (char === " " || char === "\n" || char === "\u202f") continue;
    if (!sameLetter(char, context[context.length - 1 - shared]!)) break;
    shared++;
  }
  return shared;
}

export function sharedAfter(text: string, at: number, context: string): number {
  let shared = 0;
  for (let i = at, last = Math.min(text.length, at + MAX_SCANNED_CHARS); i < last && shared < context.length; i++) {
    const char = text[i]!;
    if (char === " " || char === "\n" || char === "\u202f") continue;
    if (!sameLetter(char, context[shared]!)) break;
    shared++;
  }
  return shared;
}

function trailerEnd(text: string, to: number): number {
  const at = text.slice(to, to + MAX_TRAILER_CHARS + 1).indexOf("\n");
  return at === -1 ? -1 : to + at;
}

export function bracketGlue(after: string): Glue | null {
  if (!/^\s*\[/.test(after)) return null;
  const unglued = after.slice(0, CONTEXT_CHARS).replace(/^[^\p{L}\p{N}\p{M}_]+/u, "");
  const word = wordRunAfter(unglued);
  return word ? { word, rest: collapsed(unglued).replace(/\s/g, "") } : null;
}

export function isRepeatedLabel(text: string, from: number): boolean {
  const lineEnd = trailerEnd(text, from);
  if (lineEnd === -1) return false;
  const label = text.slice(from, lineEnd);
  if (!LABEL.test(label)) return false;
  let work = 0;
  for (let at = text.indexOf(`${label}\n`); at !== -1 && work < MAX_SCORING_WORK; at = text.indexOf(`${label}\n`, at + 1)) {
    work += MATCH_COST;
    if (at !== from && isInsideWord(text, at)) return true;
  }
  return false;
}

export function sharedPastGlue(text: string, to: number, endsLine: boolean, right: string, glue: Glue | null): number | null {
  if (endsLine) {
    const lineEnd = trailerEnd(text, to);
    if (lineEnd === -1) return null;
    if (!right) return /^\S+$/.test(text.slice(to, lineEnd)) ? 0 : null;
    const unmarked = right.replace(/^[^\p{L}\p{N}]+/u, "");
    const shared = sharedAfter(text, lineEnd, unmarked);
    return unmarked && shared >= Math.min(TRAILER_CONTEXT_CHARS, unmarked.length) ? shared : null;
  }
  return glue && text.startsWith(glue.word, to) ? sharedAfter(text, to, glue.rest) : null;
}

function firstLineStarts(text: string, first: string, lineEnd: number): number[] | null {
  const starts: number[] = [];
  let work = 0;
  for (let to = lineEnd; to >= Math.max(first.length, lineEnd - MAX_TRAILER_CHARS); to--) {
    if (to < lineEnd && text[to] === "\n") break;
    if (text[to - first.length] !== first[0]) continue;
    work += first.length / COMPARED_CHARS_PER_COST;
    if (work > MAX_SCORING_WORK) return null;
    if (text.startsWith(first, to - first.length)) starts.push(to - first.length);
  }
  return starts;
}

export function spanPastTrailers(text: string, wanted: string, left: string, right: string, floor: number): Found | null | undefined {
  const [first, ...rest] = wanted.split("\n");
  if (!first || !rest.length) return undefined;
  let found: Found | null | undefined;
  let bestScore = floor;
  let nearMiss = false;
  let work = 0;
  const anchor = `\n${rest[0]!.slice(0, TRAILER_CONTEXT_CHARS)}`;
  for (let at = text.indexOf(anchor); at !== -1; at = text.indexOf(anchor, at + 1)) {
    work += MATCH_COST + first.length / COMPARED_CHARS_PER_COST;
    if (work > MAX_SCORING_WORK) return null;
    const starts = firstLineStarts(text, first, at);
    if (!starts) return null;
    candidates: for (const from of starts) {
      work += MATCH_COST;
      if (isInsideWord(text, from)) continue;
      const leftShared = left ? sharedBefore(text, from, left) : 0;
      work += leftShared;
      if (work > MAX_SCORING_WORK) return null;
      if (left ? !leftShared : from > 0 && text[from - 1] !== "\n") continue;
      const firstLineEnd = from + first.length;
      const glued = firstLineEnd < text.length && text[firstLineEnd] !== "\n";
      let trailed = false;
      let trailsLater = false;
      let to = firstLineEnd;
      for (const [index, line] of rest.entries()) {
        work += 1 + line.length / COMPARED_CHARS_PER_COST;
        if (work > MAX_SCORING_WORK) return null;
        const lineEnd = trailerEnd(text, to);
        if (lineEnd === -1) continue candidates;
        const trails = lineEnd > to;
        if (trails && !(isJoinable(charBefore(text, to)) && isJoinable(charAfter(text, to)))) continue candidates;
        if (trails && index > 0) trailsLater = true;
        if (!text.startsWith(line, lineEnd + 1)) {
          if (!trails && text.startsWith(line.slice(0, TRAILER_CONTEXT_CHARS), lineEnd + 1)) nearMiss = true;
          continue candidates;
        }
        trailed ||= trails;
        to = lineEnd + 1 + line.length;
      }
      if (!trailed || isInsideWord(text, to)) continue;
      const rightShared = right ? sharedAfter(text, to, right) : 0;
      work += rightShared;
      if (right ? !rightShared : to < text.length && text[to] !== "\n") continue;
      const score = leftShared + rightShared;
      if (score < bestScore) continue;
      found = found !== undefined && score === bestScore ? null : { from, to, score, firstLineEnd, glued: glued && !trailsLater };
      bestScore = score;
    }
  }
  if (!found) return found;
  return nearMiss || !found.glued || !isRepeatedLabel(text, found.firstLineEnd!) ? null : found;
}
