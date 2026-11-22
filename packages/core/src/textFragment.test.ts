import assert from "node:assert/strict";
import { test } from "node:test";
import { chooseTextFragment, withTextFragment, type TextFragment } from "./textFragment.ts";

const squeeze = (text: string) => text.replace(/­/g, "").replace(/\s+/g, " ").trim().toLowerCase();

const asSearched = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');

function highlighted(link: string, pageText: string): { from: number; text: string } | null {
  const lines = pageText.split(/[\n\t]+/).map(squeeze).filter(Boolean).map(asSearched);
  const page = lines.join(" ");
  const breaks = new Set<number>();
  lines.reduce((at, line) => (breaks.add(at + line.length), at + line.length + 1), 0);
  const wordy = (i: number) => /[\p{L}\p{N}_]/u.test(page[i] ?? "");
  const dense = (i: number) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(page[i] ?? "");
  const joins = (i: number) => /[.':]/.test(page[i] ?? "") && wordy(i - 1) && wordy(i + 1);
  const edge = (i: number) => dense(i - 1) !== dense(i) || !((wordy(i - 1) && wordy(i)) || joins(i - 1) || joins(i));
  const matches = (term: string, i: number, startsWord: boolean, endsWord: boolean) => {
    if (!page.startsWith(term, i) || (startsWord && !edge(i)) || (endsWord && !edge(i + term.length))) return false;
    for (let k = i + 1; k < i + term.length; k++) if (breaks.has(k)) return false;
    return true;
  };
  const skipSpace = (i: number) => (page[i] === " " ? i + 1 : i);
  const terms = link.split(":~:text=")[1]!.split(",");
  const read = (term: string) => asSearched(squeeze(decodeURIComponent(term)));
  const prefix = terms[0]!.endsWith("-") ? read(terms.shift()!.slice(0, -1)) : "";
  const suffix = terms.at(-1)!.startsWith("-") ? read(terms.pop()!.slice(1)) : "";
  const [start, end] = terms.map(read);
  const followed = (to: number) => !suffix || matches(suffix, skipSpace(to), false, true);
  for (let i = 0; i < page.length; i++) {
    if (prefix && !matches(prefix, i, true, false)) continue;
    const from = prefix ? skipSpace(i + prefix.length) : i;
    if (!matches(start!, from, !prefix, !!end || !suffix)) continue;
    if (!end) {
      if (followed(from + start!.length)) return { from, text: page.slice(from, from + start!.length) };
      continue;
    }
    let j = from + start!.length;
    while (j < page.length) {
      if (!matches(end, j, true, !suffix)) j++;
      else if (followed(j + end.length)) return { from, text: page.slice(from, j + end.length) };
      else j += end.length;
    }
    return null;
  }
  return null;
}

type Case = { head?: string; selected: string; tail?: string; before?: string; after?: string };

function choose({ head = "", selected, tail = "", before = "", after = "" }: Case) {
  const pageText = head + selected + tail;
  const fragment = chooseTextFragment({ selected, before, after, pageText });
  const above = asSearched(squeeze(head));
  return { pageText, from: above.length + (above && /\s$/.test(head) ? 1 : 0), fragment };
}

function assertHighlights(c: Case): TextFragment {
  const { pageText, from, fragment } = choose(c);
  assert.ok(fragment, "a link is made");
  const link = withTextFragment("https://example.com/page", fragment);
  const shown = highlighted(link, pageText);
  assert.equal(shown?.text, asSearched(squeeze(c.selected)), link);
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
  assertHighlights({ head: "The category list.\nA ", selected: "cat", tail: " sleeps.", before: "A ", after: " sleeps." });
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

for (const [what, c] of Object.entries<Case>({
  "a prefix that touches the start inside an earlier word": { head: "Take a nap.\nA catnap is short.\nA cat ", selected: "nap", tail: " is great.", before: "A cat ", after: " is great." },
  "a suffix that touches the start inside an earlier word": { head: "See cat here.\nSee catfish there.\nWe see ", selected: "cat", tail: " fish there.", before: "We see ", after: " fish there." },
  "hot dog under hotdog": { head: "dog\nhotdog stall\nhot ", selected: "dog", tail: " stand", before: "hot ", after: " stand" },
  "a straight quote above a curly one": { head: "Don't stop believing today.\n", selected: "Don’t stop believing", tail: " ever.", after: " ever." },
  "a word above the same word with soft hyphens": { head: "The internet is big.\nAn ", selected: "in­ter­net", tail: " is wide.", before: "An ", after: " is wide." },
  "a combining accent below the plain word": { head: "Cafe menu today\n", selected: "Café menu", tail: " tonight", after: " tonight" },
  "voiced kana below the unvoiced word": { head: "かき\n", selected: "がき", tail: "\n次" },
  "a whole line that two lines above spell out too": { head: "Hello\nworld\n", selected: "Hello world", tail: "\nBye" },
  "Latin inside Japanese": { head: "私は", selected: "Ardia", tail: "を使っています。", before: "私は", after: "を使っています。" },
})) {
  test(`Chromium's matching: ${what}`, () => void assertHighlights(c));
}

test("a selection inside a dotted word stays the selection, held by the suffix", () => {
  const pageText = "Visit example.com for info.\nFor example, see below.";
  const fragment = chooseTextFragment({ selected: "example", before: "Visit ", after: ".com for info.", pageText });
  assert.equal(fragment?.start, "example");
  assert.ok(fragment?.suffix?.startsWith(".com"));
  assert.equal(highlighted(withTextFragment("https://example.com/", fragment!), pageText)?.from, 6);
});

test("a decimal's first digit needs the rest as its suffix", () => {
  const fragment = chooseTextFragment({ selected: "3", before: "Pi is ", after: ".14 today.", pageText: "Pi is 3.14 today.\nThere are 3 apples." });
  assert.equal(fragment?.start, "3");
  assert.ok(fragment?.suffix?.startsWith(".14"));
});

test("a range that ends before a possessive takes it as the suffix", () => {
  const selected = "The long and detailed report that the committee published last week was written by Alice";
  const fragment = chooseTextFragment({ selected, before: "", after: "'s team.", pageText: `Intro.\n${selected}'s team.` });
  assert.equal(fragment?.end, "written by Alice");
  assert.ok(fragment?.suffix?.startsWith("'s"));
});

test("an edge ICU may join across takes a prefix or suffix", () => {
  for (const joiner of ["\u200c", "\u200d", "\uff07", "\ufe52", "\u0387", "\u055f", "\u203f", "\uff3f"]) {
    const pageText = `Read Bob${joiner}Alice first then ask Alice today.`;
    const first = chooseTextFragment({ selected: "Alice", before: `Read Bob${joiner}`, after: " first then ask Alice today.", pageText });
    assert.ok(first?.prefix, `U+${joiner.charCodeAt(0).toString(16)} before`);
    const flipped = `Read Alice${joiner}Bob first then ask Alice today.`;
    const second = chooseTextFragment({ selected: "Alice", before: "Read ", after: `${joiner}Bob first then ask Alice today.`, pageText: flipped });
    assert.ok(second?.suffix, `U+${joiner.charCodeAt(0).toString(16)} after`);
  }
});

test("a word the page text's cap cut is never part of a term", () => {
  const tail = `\nRead Alice's${"x".repeat(50)}\ud83d`;
  const pageText = "ab\n".repeat(1_000_001).slice(0, 3_000_000 - tail.length) + tail;
  const fragment = chooseTextFragment({ selected: "Alice", before: "Read ", after: `'s${"x".repeat(50)}\ud83d\ude80 end`, pageText });
  assert.equal(fragment, null);
});

test("a suffix starts at its word, however wide the gap", () => {
  const fragment = chooseTextFragment({ selected: "Alpha", before: "", after: "\u00a0 beta", pageText: "first\nAlpha one\nfirst\nAlpha\u00a0 beta" });
  assert.equal(fragment?.suffix, "beta");
});

test("a short suffix still pairs with a longer prefix", () => {
  const fragment = chooseTextFragment({ selected: "Alice", before: "Carol saw ", after: "'s", pageText: "Bob saw Alice's\nCarol saw Alice's" });
  assert.deepEqual(fragment, { prefix: "Carol saw", start: "Alice", suffix: "'s" });
});

test("hiragana and katakana are seen as an earlier match", () => {
  for (const [above, selected] of [["かたかな", "カタカナ"], ["カタカナ", "かたかな"], ["かたかな", "ｶﾀｶﾅ"], ["colŀegi", "collegi"]] as const) {
    const fragment = chooseTextFragment({ selected, before: "", after: "", pageText: `${above}\n${selected}` });
    assert.ok(!fragment || fragment.prefix || fragment.suffix, `${above} would match first`);
  }
});

test("context the page shows in capitals still places the selection", () => {
  const pageText = "CHAPTER ONE: THE BEGINNING\nCHAPTER TWO: THE BEGINNING";
  assert.equal(chooseTextFragment({ selected: "THE BEGINNING", before: "Chapter two: ", after: "", pageText })?.prefix, "TWO:");
});

test("a term never holds a run of spaces, which an image leaves in the page's text", () => {
  const fragment = chooseTextFragment({ selected: "Ship it  today", before: "", after: "", pageText: "Intro.\nShip it  today" });
  assert.deepEqual(fragment, { start: "Ship it", end: "today" });
});

test("what differs early in a long paragraph still places the selection", () => {
  const rest = "release of the product, which shipped in early spring of the year, the team ";
  const tail = " when opening very large files from the network.";
  const pageText = `In the first ${rest}fixed a crash${tail}\nIn the second ${rest}fixed a crash${tail}`;
  assert.deepEqual(chooseTextFragment({ selected: "fixed a crash", before: `In the first ${rest}`, after: tail, pageText }), { start: "fixed a crash" });
});

test("Hebrew finals, Arabic letters and digits are seen as an earlier match", () => {
  for (const [above, selected] of [["שלומ", "שלום"], ["مدرسه", "مدرسة"], ["علي", "على"], ["كـتاب", "كتاب"], ["٤٢", "42"]] as const) {
    const fragment = chooseTextFragment({ selected, before: "", after: "", pageText: `${above}\n${selected}` });
    assert.ok(!fragment || fragment.prefix || fragment.suffix, `${above} would match first`);
  }
});

test("a selection repeated later takes context, so a miss can't land on the copy", () => {
  const pageText = "Please read carefully now\nPlease read carefully later";
  const fragment = chooseTextFragment({ selected: "Please read carefully", before: "", after: " now", pageText });
  assert.deepEqual(fragment, { start: "Please read carefully", suffix: "now" });
});

test("a term doesn't end at a fullwidth stop inside a number", () => {
  const selected = "The version 1．2 is out right now with many new features and fixes for everyone";
  assert.equal(chooseTextFragment({ selected, before: "", after: "", pageText: selected })?.start, "The version 1．2");
});

test("a wide space between the words is still an earlier match", () => {
  const fragment = chooseTextFragment({ selected: "bar", before: "foo ", after: " baz", pageText: "bar\nfoo \u205f bar\nfoo bar baz" });
  assert.equal(fragment?.suffix, "baz");
});

test("a selection not on a page of a million lines is no link, not a crash", () => {
  assert.equal(chooseTextFragment({ selected: "a\nmissing", before: "", after: "", pageText: "a\n".repeat(1_050_000) }), null);
});

test("a word repeated through the whole page gives up instead of scoring every copy", () => {
  const started = Date.now();
  assert.equal(chooseTextFragment({ selected: "x", before: "x ".repeat(100), after: " end", pageText: `${"x ".repeat(1_400_000)}x end` }), null);
  assert.ok(Date.now() - started < 3000);
});

test("a joined edge whose context Chrome can't reach is no link, not a dead one", () => {
  for (const joiner of ["\u2060", "\u202f"]) {
    const pageText = `Read Bob${joiner}Alice first then ask Alice today.`;
    assert.equal(chooseTextFragment({ selected: "Alice", before: `Read Bob${joiner}`, after: " first then ask Alice today.", pageText }), null);
  }
});

test("a zero-width space is a word edge, so a heading's hash link needs no context", () => {
  const pageText = "Requirements\u200b\nInstall Node first.";
  assert.deepEqual(chooseTextFragment({ selected: "Requirements", before: "", after: "\u200b", pageText }), { start: "Requirements" });
});

test("a range ending before a zero-width space takes no suffix of it", () => {
  const selected = "Before installing anything on a production server you should always read the manual";
  const pageText = `Intro.\n${selected}\u200bbefore use.\nBeginners should read the manual before use.`;
  const fragment = chooseTextFragment({ selected, before: "", after: "\u200bbefore use.", pageText });
  assert.equal(fragment?.end, "read the manual");
  assert.equal(fragment?.suffix, undefined);
});

test("a first copy doesn't borrow the line above to be unique", () => {
  const pageText = "Installation\u200b\nRun the command\nBody text.\nLater, again: Run the command";
  assert.deepEqual(chooseTextFragment({ selected: "Run the command", before: "", after: "", pageText }), { start: "Run the command" });
});

test("a long run of squared katakana folds without overflowing the stack", () => {
  const pageText = `${"\u3347".repeat(32768)}\nzebra`;
  assert.deepEqual(chooseTextFragment({ selected: "zebra", before: "", after: "", pageText }), { start: "zebra" });
});

const intro = "An old protocol for documents.";
const otherSection = "Historyedit\nIts history is short.";
const body = "The system was released by the university in the spring.";

test("a heading with a glued edit link is linked, not its contents entry", () => {
  const pageText = `Contents\nUsage\n\n${intro}\n\nUsageedit\n\n${body}\n${otherSection}`;
  assert.deepEqual(chooseTextFragment({ selected: "Usage", before: "", after: "[edit]", pageText }), { prefix: "documents.", start: "Usage" });
  assert.equal(chooseTextFragment({ selected: "Usage\n", before: "", after: body.slice(0, 48), pageText }), null);
});

test("a heading with a glued edit link and its paragraph are found", () => {
  const pageText = `${intro}\n\nUsageedit\n\n${body}\n${otherSection}`;
  const fragment = chooseTextFragment({ selected: `Usage\n${body}`, before: "", after: "", pageText });
  assert.equal(fragment?.start, "Usage");
  assert.equal(fragment?.end, "in the spring.");
});

test("a glued heading that can't be told from a copy is no link, never the copy", () => {
  const pageText = `${intro}\nUsageedit\n${body}\nUsage\n${body}\n${otherSection}`;
  assert.equal(chooseTextFragment({ selected: `Usage\n${body}`, before: "", after: "", pageText }), null);
});

test("a copy doesn't win over the selection's own place inside a glued word", () => {
  const pageText = `${intro}\nUsages vary.\nUsage`;
  assert.equal(chooseTextFragment({ selected: "Usage", before: "", after: "(s) vary.", pageText }), null);
});

test("a longer line isn't a heading with a glued link", () => {
  const pageText = `${intro}\nUsage guide\n${body}\nUsage\nThe system was released xby the university.`;
  assert.equal(chooseTextFragment({ selected: `Usage\n${body}`, before: "", after: "", pageText }), null);
});

test("a double-clicked glued heading with nothing after it is linked only when it is the only copy", () => {
  const glued = `${intro}\n\nUsageedit\n\n${body}\n${otherSection}`;
  assert.deepEqual(chooseTextFragment({ selected: "Usage\n", before: "", after: "", pageText: glued }), { start: "Usage" });
  assert.equal(chooseTextFragment({ selected: "Usage\n", before: "", after: "", pageText: `Contents\nUsage\n\n${glued}` }), null);
});

test("a glued heading with part of its paragraph wins over a copy by its context", () => {
  const pageText = `${intro}\nUsageedit\n${body} Later it grew.\nSecond intro.\nUsage\n${body} Different ending.\n${otherSection}`;
  const fragment = chooseTextFragment({ selected: `Usage\n${body}`, before: "", after: " Later it grew.", pageText });
  assert.equal(fragment?.start, "Usage");
  assert.notEqual(fragment?.prefix, "Second intro.");
  assert.ok(fragment);
});

test("a joined copy doesn't win over a glued heading and its paragraph", () => {
  const pageText = `${intro}\nUsageedit\n${body}\nSecond intro.\nUsage ${body}\n${otherSection}`;
  assert.equal(chooseTextFragment({ selected: `Usage\n${body}`, before: "", after: "", pageText }), null);
});

test("a prefix that also ends right before a later copy isn't unique", () => {
  const pageText = "Wait Alphaedit\nAlphaedit\nAlpha";
  assert.deepEqual(chooseTextFragment({ selected: "Alpha", before: "", after: "[edit]", pageText }), { prefix: "Wait Alphaedit", start: "Alpha" });
});

test("a longer line isn't taken for a glued label", () => {
  const title = "Fixed a crash when opening a new window on a Mac running macOS 1";
  const next = "Thanks to everyone who reported it.";
  for (const [chrome, after] of [["\n2d", next], ["", `# ${next}`]] as const) {
    const pageText = `${title}${chrome}\n\n${next}\n\nOlder notes.\n\n${title}5\n\n${next}\n\nWe also tested on a Mac running macOS 1 beta.`;
    const fragment = chooseTextFragment({ selected: `${title}\n\n`, before: "", after, pageText });
    assert.notEqual(fragment?.prefix, "notes.");
  }
});

test("a trailer on a middle line is never skipped", () => {
  const head = "Release notes for the desktop app";
  const run = "Run the installer.";
  const pageText = `${head} beta this week\nInstall\n${run}\nOlder.\n${head} this week\nInstalls\n${run}`;
  assert.equal(chooseTextFragment({ selected: `${head} this week\nInstall\n${run}`, before: "", after: "", pageText }), null);
});

test("a lone glued heading still keeps a copy from winning", () => {
  const pageText = `${intro}\nUsageedit\n${body}\nSecond intro.\nUsage ${body}`;
  assert.equal(chooseTextFragment({ selected: `Usage\n${body}`, before: "", after: "", pageText }), null);
});

test("words split by a comma are words of their own", () => {
  assert.equal(chooseTextFragment({ selected: "world", before: "hello,", after: "", pageText: "hello,world" })?.start, "world");
});

test("a character inside an unspaced run is linked only with what precedes it", () => {
  const fragment = chooseTextFragment({ selected: "京", before: "東", after: "", pageText: "東京" });
  assert.deepEqual(fragment, { prefix: "東", start: "京" });
});

test("letters Chromium searches alike are seen as an earlier match", () => {
  for (const [above, selected] of [["cœur", "coeur"], ["Øresund", "Oresund"]] as const) {
    const fragment = chooseTextFragment({ selected, before: "", after: "", pageText: `${above}\n${selected}` });
    assert.ok(!fragment || fragment.prefix || fragment.suffix, `${above} would match first`);
  }
});

test("a selection past the page text's cap isn't taken for the copy that was read", () => {
  const pageText = `Read the manual.\n${"x".repeat(3_000_000)}`.slice(0, 3_000_000);
  assert.equal(chooseTextFragment({ selected: "manual", before: "Open the ", after: " here.", pageText }), null);
});

test("a whole paragraph isn't taken for the same words inside another line", () => {
  const selected = "the launch is planned for June.";
  const pageText = `Summary: ${selected}\nthe launch* is planned for June.`;
  assert.equal(chooseTextFragment({ selected, before: "", after: "", pageText }), null);
});

test("a range whose last words also end an earlier line is exact, or isn't made", () => {
  const c = { head: "", selected: "Start of section\na a a a x\na a a a", tail: " b", after: " b" };
  if (choose(c).fragment) assertHighlights(c);
});

test("a selection whose middle isn't in the page's text gets no link rather than a shorter one", () => {
  assert.equal(chooseTextFragment({ selected: "Title\nFirst End\nEnd", before: "", after: "", pageText: "Title\nEdit\nFirst End\nEnd" }), null);
});

test("a word no prefix or suffix can tell from one inside an earlier word gets no link", () => {
  assert.equal(choose({ head: "See cat here.\nSee catfish there.\nSee ", selected: "cat", tail: " fish there.", before: "See ", after: " fish there." }).fragment, null);
});

test("repetitive pages stay linear", () => {
  const word = "x ".repeat(200_000);
  const lines = "a x\n".repeat(100_000);
  const started = performance.now();
  chooseTextFragment({ selected: "x", before: word.slice(-400), after: " end", pageText: `${word}x end` });
  chooseTextFragment({ selected: "a\nmissing", before: "", after: "", pageText: lines });
  assert.ok(performance.now() - started < 1000);
});
