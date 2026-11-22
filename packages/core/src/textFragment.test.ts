import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseTextFragment, withTextFragment, type TextFragment } from "./textFragment.ts";

const squeeze = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();

function highlighted(link: string, pageText: string): { from: number; text: string } | null {
  const lines = pageText.split(/[\n\t]+/).map(squeeze).filter(Boolean);
  const page = lines.join(" ");
  const ends: number[] = [];
  lines.reduce((at, line) => (ends.push(at + line.length), at + line.length + 1), 0);
  const wordy = (i: number) => /[\p{L}\p{N}_]/u.test(page[i] ?? "");
  const dense = (i: number) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(page[i] ?? "");
  const edge = (i: number) => !wordy(i - 1) || !wordy(i) || dense(i - 1) || dense(i);
  const matches = (term: string, i: number) => page.startsWith(term, i) && edge(i) && edge(i + term.length) && !ends.some((end) => end > i && end < i + term.length);
  const skipSpace = (i: number) => (page[i] === " " ? i + 1 : i);
  const terms = link.split(":~:text=")[1]!.split(",");
  const prefix = terms[0]!.endsWith("-") ? squeeze(decodeURIComponent(terms.shift()!.slice(0, -1))) : "";
  const suffix = terms.at(-1)!.startsWith("-") ? squeeze(decodeURIComponent(terms.pop()!.slice(1))) : "";
  const [start, end] = terms.map((term) => squeeze(decodeURIComponent(term)));
  const followed = (to: number) => !suffix || matches(suffix, skipSpace(to));
  for (let i = 0; i < page.length; i++) {
    if (prefix && !matches(prefix, i)) continue;
    const from = prefix ? skipSpace(i + prefix.length) : i;
    if (!matches(start!, from)) continue;
    if (!end) {
      if (followed(from + start!.length)) return { from, text: page.slice(from, from + start!.length) };
      continue;
    }
    for (let j = from + start!.length; j < page.length; j++) {
      if (matches(end, j) && followed(j + end.length)) return { from, text: page.slice(from, j + end.length) };
    }
    return null;
  }
  return null;
}

type Case = { head?: string; selected: string; tail?: string; before?: string; after?: string };

function choose({ head = "", selected, tail = "", before = "", after = "" }: Case) {
  const pageText = head + selected + tail;
  const fragment = chooseTextFragment({ selected, before, after, pageText });
  return { pageText, from: squeeze(head).length + (squeeze(head) ? 1 : 0), fragment };
}

function assertHighlights(c: Case): TextFragment {
  const { pageText, from, fragment } = choose(c);
  assert.ok(fragment, "a link is made");
  const link = withTextFragment("https://example.com/page", fragment);
  const shown = highlighted(link, pageText);
  assert.equal(shown?.text, squeeze(c.selected), link);
  assert.equal(shown?.from, from, `${link} highlights another occurrence`);
  return fragment;
}

const CONTENTS = "Jump to content\nContents hide\nHistory\nNomenclature\nFunction\nToggle Function subsection\nHTML\nLinking\nWorld Wide Web\nIt is not the same thing as the Internet.\n\n";
const NOMENCLATURE = "The World Wide Web is the only thing I know of whose shortened form takes three times longer to say than what it's short for\".[43]\n\n";
const PARAGRAPH = "The terms Internet and World Wide Web are often used without much distinction. However, the two terms do not mean the same thing. The Internet is a global system of computer networks interconnected through telecommunications and optical networking. In contrast, the World Wide Web";
const REST = " is a global collection of documents and other resources.\n\nViewing a web page on the World Wide Web begins with a URL.";

test("four sentences whose last words also appear inside them highlight all four", () => {
  assertHighlights({ head: `${CONTENTS}${NOMENCLATURE}Function\n`, selected: PARAGRAPH, tail: REST, after: REST.split("\n")[0] });
});

test("a heading and its paragraphs link to that section, not to the table of contents", () => {
  const selected = "Function\nMain articles: HTTP and HTML\nThe World Wide Web functions as an application layer protocol.\n\nThe terms Internet and World Wide Web are often used without much distinction. However, the two terms do not mean the same thing.";
  assertHighlights({ head: CONTENTS + NOMENCLATURE, selected, tail: " The Internet is a global system.", after: " The Internet is a global system." });
});

test("a heading alone links to the heading rather than the same word inside a sentence", () => {
  assertHighlights({ head: "The function of the Web is linking.\n\n", selected: "Function", tail: "\nMain articles: HTTP and HTML" });
});

test("a heading alone that the table of contents repeats line for line gets no link rather than the wrong one", () => {
  assert.equal(choose({ head: CONTENTS + NOMENCLATURE, selected: "Function", tail: "\nMain articles: HTTP and HTML" }).fragment, null);
});

test("a short selection that is unique stays an exact link with no context", () => {
  assert.deepEqual(assertHighlights({ head: "Some intro here.\n", selected: "a quick brown fox", tail: "\nThe end." }), { start: "a quick brown fox" });
});

test("a long selection that is unique stays a short range", () => {
  const selected = "One two three four five six seven eight nine ten eleven twelve thirteen.";
  assert.deepEqual(assertHighlights({ head: "Intro.\n", selected, tail: "\nOutro." }), { start: "One two three", end: "eleven twelve thirteen." });
});

test("the second of two identical phrases is picked by the rest of its line", () => {
  assertHighlights({ head: "Free is billed monthly.\nTeam is ", selected: "billed monthly", tail: " per seat.", before: "Team is ", after: " per seat." });
});

test("a word inside a longer word earlier on the page isn't taken for the match", () => {
  assert.deepEqual(assertHighlights({ head: "The category list.\nA ", selected: "cat", tail: " sleeps.", before: "A ", after: " sleeps." }), { start: "cat" });
});

test("matching ignores case and accents, as browsers do", () => {
  assertHighlights({ head: "CAFE MENU today\n", selected: "cafe menu", tail: "\nEspresso" });
  const { fragment } = choose({ head: "Cafe menu today\n", selected: "Café menu", tail: "\nEspresso" });
  assert.ok(fragment?.prefix || fragment?.suffix, "the unaccented line above would match first");
});

test("a table row starts and ends each term inside one cell", () => {
  assertHighlights({ head: "Plan\tPrice\tSeats\n", selected: "Team\t$8\t10", tail: "\nEnterprise\tAsk us\tUnlimited" });
});

test("text without spaces between words still links", () => {
  assertHighlights({ head: "目次\n機能\n\n", selected: "機能\n用語のインターネットとウェブは区別されずに使われることが多い。", tail: "\n次の段落。" });
});

test("a selection that ends with the line break of a triple click highlights its paragraph", () => {
  const { pageText, fragment } = choose({ head: "Intro\n", selected: "The whole paragraph is selected here.\n", tail: "Next paragraph." });
  assert.equal(highlighted(withTextFragment("https://example.com/", fragment!), pageText)?.text, "the whole paragraph is selected here.");
});

test("text that isn't on the page, or can't be told apart from a copy of it, gets no link", () => {
  assert.equal(chooseTextFragment({ selected: "not here", before: "", after: "", pageText: "Something else." }), null);
  assert.equal(chooseTextFragment({ selected: "Twice", before: "", after: "", pageText: "Twice\nTwice" }), null);
});

test("generated pages: a link always highlights exactly the selection, or isn't made", () => {
  let seed = 7;
  const random = (n: number) => ((seed = (seed * 48271) % 2147483647) % n);
  const vocabulary = ["web", "the", "page", "link", "a", "site", "Web", "web.", "open", "shared", "tab,", "tabs"];
  let made = 0;
  const runs = 3000;
  for (let run = 0; run < runs; run++) {
    const lines = Array.from({ length: 2 + random(6) }, () => Array.from({ length: 1 + random(16) }, () => vocabulary[random(vocabulary.length)]!).join(" "));
    const pageText = lines.join("\n");
    const words = [...pageText.matchAll(/[^\s.,]+[.,]?/g)];
    const first = random(words.length);
    const last = first + random(words.length - first);
    const from = words[first]!.index;
    const to = words[last]!.index + words[last]![0].length;
    const c = { head: pageText.slice(0, from), selected: pageText.slice(from, to), tail: pageText.slice(to), before: pageText.slice(pageText.lastIndexOf("\n", from - 1) + 1, from), after: pageText.slice(to).split("\n")[0]! };
    const { fragment } = choose(c);
    if (!fragment) continue;
    assertHighlights(c);
    made++;
  }
  assert.ok(made > runs * 0.9, `${made} of ${runs} selections got a link`);
});
