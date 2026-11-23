import assert from "node:assert/strict";
import { test } from "node:test";
const { useBrowser } = await import("../browser/store.ts");
const { Clock, emptyScope, syncScope } = await import("@ardia/sync");
const { openTabsAdapters } = await import("./openTabs.ts");
const { noteTabClosedByUser, openTabsClosed, recordOpenTabCloses } = await import("./openTabCloses.ts");
const { holdsOpenTabs } = await import("./openTabsLocal.ts");
const { openTabCloses } = await import("./scopeAdapters.ts");
const { profileScope } = await import("./records.ts");

const S = () => useBrowser.getState();
const P = "default";
const SCOPE = profileScope("pages");
const page = (name) => `https://${name}.example/`;

function pagesKeptFor(state, run) {
  const { set } = WeakMap.prototype;
  let pages;
  try {
    WeakMap.prototype.set = function (key, value) {
      if (key === state && value instanceof Map) pages = value;
      return set.call(this, key, value);
    };
    run();
  } finally {
    WeakMap.prototype.set = set;
  }
  assert.ok(pages, "the scope's page memory was found");
  return pages;
}

function start() {
  S().hydrate({});
  S().updateProfile(P, { syncTabs: true });
  const windowId = S().createWindow({ url: page("keep") });
  const kept = S().windows[windowId].activeTabIds[P];
  const doc = { profiles: { [P]: { syncId: "pages", enabled: true } } };
  const scope = emptyScope();
  const closes = openTabCloses(doc, SCOPE);
  const clock = new Clock("devA");
  const files = new Map();
  const failing = new Set();
  let written = 0;
  const transport = {
    write: async (_scope, payload) => {
      if (failing.has("write")) throw new Error("write failed");
      const id = `f${++written}`;
      files.set(id, payload);
      return id;
    },
    read: async (_scope, known) => {
      if (failing.has("read")) throw new Error("read failed");
      const shown = [...files].filter(([id]) => !known.includes(id)).map(([id, payload]) => ({ id, payload }));
      return { files: shown, present: [...files.keys()], pending: [], damaged: [] };
    },
    remove: async (_scope, ids) => ids.forEach((id) => files.delete(id)),
  };
  const adapters = () => openTabsAdapters(P, scope, "on", closes, () => undefined);
  return {
    windowId,
    kept,
    closes,
    failing,
    pages: pagesKeptFor(scope, () => adapters()[0].extract(() => undefined, () => false, 0, () => false, () => undefined)),
    open: (name) => S().newTab(windowId, { url: page(name), background: true }),
    published: (key) => scope.records[`otab:t:${key}`]?.v?.u ?? null,
    compactAway(key) {
      const records = Object.fromEntries(Object.entries(scope.records).filter(([k]) => k !== `otab:t:${key}`));
      const snapshot = { v: 1, kind: "snapshot", device: "devB", at: Date.now(), vv: { ...scope.vv }, seen: {}, records };
      files.set("snapshot", JSON.stringify(snapshot));
    },
    edit(change) {
      const before = S();
      change();
      recordOpenTabCloses(doc, openTabsClosed(S(), before));
    },
    sync: () => syncScope({ scope: SCOPE, state: scope, transport, adapters: adapters(), clock, device: "devA" }),
    receive(key, value) {
      const payload = { v: 1, kind: "log", device: "devB", seq: 1, at: Date.now(), ops: [{ k: `otab:t:${key}`, h: clock.tick(), v: value }] };
      files.set("remote", JSON.stringify(payload));
    },
  };
}

test("tabs whose closes were published leave no page behind", async () => {
  const d = start();
  await d.sync();
  for (let round = 0; round < 12; round++) {
    const ids = Array.from({ length: 40 }, (_, i) => d.open(`visit-${round}-${i}`));
    await d.sync();
    assert.equal(d.pages.size, 41);
    d.edit(() => S().closeTabs(ids));
    await d.sync();
    assert.deepEqual(d.closes.keys(), []);
    assert.equal(d.pages.size, 1);
    assert.deepEqual([...d.pages], [[d.kept, page("keep")]]);
  }
});

test("a close whose write failed leaves no page behind after the retry", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().closeTab(id));
  d.failing.add("write");
  await assert.rejects(d.sync(), /write failed/);
  d.failing.clear();
  await d.sync();
  assert.equal(d.published(id), null);
  assert.deepEqual([...d.pages.keys()], [d.kept]);
});

test("a tab another computer closed leaves no page behind after the next sync", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.receive(id, null);
  await d.sync();
  assert.equal(S().tabs[id], undefined);
  await d.sync();
  assert.deepEqual([...d.pages.keys()], [d.kept]);
});

test("a reopened tab publishes its page under its new key and drops the closed one", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().closeTab(id));
  await d.sync();
  d.edit(() => S().reopenClosedTab(d.windowId));
  await d.sync();
  const reopened = Object.values(S().tabs).find((t) => t.url === page("mail")).id;
  assert.notEqual(reopened, id);
  assert.equal(d.published(reopened), page("mail"));
  assert.deepEqual([...d.pages.keys()].sort(), [d.kept, reopened].sort());
});

test("a tab moved to another profile keeps its page until it closes there", async () => {
  const d = start();
  const other = S().createProfile({ name: "Other" });
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().moveTabToProfile(id, other, { background: true }));
  await d.sync();
  assert.equal(d.published(id), null);
  assert.equal(d.pages.get(id), page("mail"));
  d.edit(() => S().closeTab(id));
  await d.sync();
  assert.deepEqual([...d.pages.keys()], [d.kept]);
});

test("a tab that comes back under its key publishes the page it is on", async () => {
  const d = start();
  const other = S().createProfile({ name: "Other" });
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().moveTabToProfile(id, other, { background: true }));
  await d.sync();
  S().updateTab(id, { url: page("inbox") });
  d.edit(() => S().moveTabToProfile(id, P, { background: true }));
  await d.sync();
  assert.equal(d.published(id), page("inbox"));
});

async function comesBackPinned(d, id, leave, back) {
  await d.sync();
  d.edit(leave);
  await d.sync();
  d.edit(back);
  d.edit(() => S().pinTabs([id], true));
  d.receive(id, { u: page("shared"), t: "", pos: "V", g: null, a: 0 });
  await d.sync();
  assert.equal(d.published(id), page("shared"));
  d.edit(() => S().pinTabs([id], false));
  S().updateTab(id, { url: page("inbox") });
  await d.sync();
  assert.equal(d.published(id), page("inbox"));
}

test("a tab that comes back pinned still sends its own page over a newer record once unpinned", async () => {
  const d = start();
  const other = S().createProfile({ name: "Other" });
  const id = d.open("mail");
  const move = (to) => () => S().moveTabToProfile(id, to, { background: true });
  await comesBackPinned(d, id, move(other), move(P));
});

test("a tab that took another key still sends its own page after it goes back to its id", async () => {
  const d = start();
  const id = d.open("mail");
  const rekey = (pinKey) => () => S().updateTab(id, { pinKey });
  await comesBackPinned(d, id, rekey("mirrored"), rekey(undefined));
});

test("a closed tab that comes back as a pin sends the page it went to while pinned once unpinned", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().closeTab(id));
  await d.sync();
  assert.equal(d.published(id), null);
  assert.equal(d.pages.has(id), false);
  const pin = S().newTab(d.windowId, { url: page("mail"), background: true });
  S().pinTabs([pin], true);
  S().updateTab(pin, { pinKey: id });
  await d.sync();
  d.receive(id, { u: page("shared"), t: "", pos: "V", g: null, a: 0 });
  await d.sync();
  assert.equal(d.published(id), page("shared"));
  S().updateTab(pin, { url: page("inbox") });
  d.edit(() => S().pinTabs([pin], false));
  await d.sync();
  assert.equal(d.published(id), page("inbox"));
  d.edit(() => S().closeTab(pin));
  await d.sync();
  assert.equal(d.published(id), null);
  assert.deepEqual([...d.pages], [[d.kept, page("keep")]]);
});

test("a pin sync moved while asleep keeps the newer record of another computer once unpinned without navigating", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().pinTabs([id], true));
  S().updateTab(id, { page: { kind: "asleep" } });
  await d.sync();
  S().updateTab(id, { url: page("news"), page: { kind: "asleep" } });
  d.receive(id, { u: page("shared"), t: "", pos: "V", g: null, a: 0 });
  await d.sync();
  assert.equal(d.published(id), page("shared"));
  d.edit(() => S().pinTabs([id], false));
  await d.sync();
  assert.equal(d.published(id), page("shared"));
});

test("a pin that sleeps after a local navigation still sends that page once unpinned", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().pinTabs([id], true));
  await d.sync();
  S().updateTab(id, { url: page("inbox") });
  await d.sync();
  S().updateTab(id, { page: { kind: "asleep" } });
  d.receive(id, { u: page("shared"), t: "", pos: "V", g: null, a: 0 });
  await d.sync();
  d.edit(() => S().pinTabs([id], false));
  await d.sync();
  assert.equal(d.published(id), page("inbox"));
});

test("a closed tab that comes back as a sleeping pin sends a page it went to after the first sync once unpinned", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().closeTab(id));
  await d.sync();
  const pin = S().newTab(d.windowId, { url: page("mail"), background: true });
  S().pinTabs([pin], true);
  S().updateTab(pin, { pinKey: id, page: { kind: "asleep" } });
  await d.sync();
  d.receive(id, { u: page("shared"), t: "", pos: "V", g: null, a: 0 });
  await d.sync();
  S().updateTab(pin, { url: page("inbox"), page: { kind: "loaded", nav: { url: page("inbox"), seq: 1 } } });
  d.edit(() => S().pinTabs([pin], false));
  await d.sync();
  assert.equal(d.published(id), page("inbox"));
  d.edit(() => S().closeTab(pin));
  await d.sync();
  assert.deepEqual([...d.pages], [[d.kept, page("keep")]]);
});

test("a closed tab that comes back as a pin and navigates before the first sync never overwrites the newer record", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().closeTab(id));
  await d.sync();
  const pin = S().newTab(d.windowId, { url: page("mail"), background: true });
  S().pinTabs([pin], true);
  S().updateTab(pin, { pinKey: id, url: page("inbox"), page: { kind: "loaded", nav: { url: page("inbox"), seq: 1 } } });
  d.receive(id, { u: page("shared"), t: "", pos: "V", g: null, a: 0 });
  await d.sync();
  d.edit(() => S().pinTabs([pin], false));
  await d.sync();
  assert.equal(d.published(id), page("shared"));
});

test("a key that still has a published page keeps its last page through a failed round", async () => {
  const d = start();
  const other = S().createProfile({ name: "Other" });
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().pinTabs([id], true));
  d.edit(() => S().moveTabToProfile(id, other, { background: true }));
  assert.deepEqual(d.closes.keys(), []);
  d.failing.add("read");
  await assert.rejects(d.sync(), /read failed/);
  assert.equal(d.pages.get(id), page("mail"));
  d.edit(() => S().moveTabToProfile(id, P, { background: true }));
  d.edit(() => S().pinTabs([id], false));
  S().updateTab(id, { url: page("inbox") });
  d.failing.clear();
  await d.sync();
  assert.equal(d.published(id), page("inbox"));
});

test("an open tab on a page that doesn't sync keeps its last page until it navigates back to the web", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  S().updateTab(id, { url: "file:///tmp/notes.txt" });
  await d.sync();
  assert.equal(d.published(id), page("mail"));
  assert.equal(d.pages.get(id), page("mail"));
  S().updateTab(id, { url: page("inbox") });
  await d.sync();
  assert.equal(d.published(id), page("inbox"));
});

test("a parked pin keeps its page and publishes the page it is on once unpinned", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().pinTabs([id], true));
  await d.sync();
  d.edit(() => S().closeWindow(d.windowId));
  assert.deepEqual(S().parkedPins[P].tabs.map((p) => p.id), [id]);
  await d.sync();
  assert.equal(d.pages.get(id), page("mail"));
  S().createWindow({});
  await d.sync();
  d.edit(() => S().pinTabs([id], false));
  S().updateTab(id, { url: page("inbox") });
  await d.sync();
  assert.equal(d.published(id), page("inbox"));
});

test("closes published while the profile has no window leave no page behind", async () => {
  const d = start();
  const ids = [d.open("mail"), d.open("docs")];
  await d.sync();
  d.edit(() => S().closeTabs(ids));
  d.edit(() => S().closeWindow(d.windowId));
  assert.equal(holdsOpenTabs(S(), P), false);
  await d.sync();
  assert.deepEqual(ids.map(d.published), [null, null]);
  assert.deepEqual([...d.pages], [[d.kept, page("keep")]], "only the tab that is still published keeps its page");
});

test("a tab another computer closes while the profile has no window leaves no page behind", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().closeWindow(d.windowId));
  assert.equal(holdsOpenTabs(S(), P), false);
  assert.deepEqual(d.closes.keys(), []);
  await d.sync();
  assert.deepEqual([...d.pages.keys()].sort(), [d.kept, id].sort());
  d.receive(id, null);
  await d.sync();
  await d.sync();
  assert.deepEqual([...d.pages.keys()], [d.kept]);
  S().createWindow({});
  await d.sync();
  await d.sync();
  assert.equal(d.published(id), null);
  assert.equal(Object.values(S().tabs).some((t) => t.url === page("mail")), false);
  assert.equal(d.published(d.kept), page("keep"));
  assert.equal(Object.values(S().tabs).some((t) => t.url === page("keep")), true);
});

test("a close another computer compacted away while the profile has no window leaves no page behind", async () => {
  const d = start();
  const id = d.open("mail");
  await d.sync();
  d.edit(() => S().closeWindow(d.windowId));
  await d.sync();
  assert.deepEqual([...d.pages.keys()].sort(), [d.kept, id].sort());
  d.compactAway(id);
  await d.sync();
  await d.sync();
  assert.equal(d.published(id), null);
  assert.deepEqual([...d.pages.keys()], [d.kept]);
});

test("a close whose write failed while the profile has no window leaves no page behind after the retry", async () => {
  const d = start();
  await d.sync();
  d.edit(() => {
    noteTabClosedByUser(d.kept);
    S().closeWindow(d.windowId);
  });
  assert.equal(holdsOpenTabs(S(), P), false);
  d.failing.add("write");
  await assert.rejects(d.sync(), /write failed/);
  d.failing.clear();
  await d.sync();
  assert.equal(d.published(d.kept), null);
  assert.equal(d.pages.size, 0);
});

test("with no window for the profile, a parked pin and a tab in another profile's window keep their pages", async () => {
  const d = start();
  const other = S().createProfile({ name: "Other" });
  const otherWindow = S().createWindow({ profileId: other });
  const [parked, moved, closed] = ["mail", "docs", "news"].map(d.open);
  await d.sync();
  d.edit(() => S().pinTabs([parked], true));
  await d.sync();
  d.edit(() => S().moveTabToProfile(moved, other, { background: true }));
  d.edit(() => S().moveTabsToWindow([moved], otherWindow, { background: true }));
  d.edit(() => S().closeTab(closed));
  d.edit(() => S().closeWindow(d.windowId));
  assert.equal(holdsOpenTabs(S(), P), false);
  await d.sync();
  await d.sync();
  assert.deepEqual([parked, moved, closed].map(d.published), [null, null, null]);
  assert.deepEqual([...d.pages.keys()].sort(), [d.kept, parked, moved].sort());
});

test("a tab that left while the profile had no window still sends its own page when it comes back pinned", async () => {
  const d = start();
  const other = S().createProfile({ name: "Other" });
  const otherWindow = S().createWindow({ profileId: other });
  const id = d.open("mail");
  const leave = () => {
    S().moveTabToProfile(id, other, { background: true });
    S().moveTabsToWindow([id], otherWindow, { background: true });
    S().closeWindow(d.windowId);
    assert.equal(holdsOpenTabs(S(), P), false);
  };
  const back = () => {
    const windowId = S().createWindow({ profileId: P });
    S().moveTabsToWindow([id], windowId, { background: true });
    S().moveTabToProfile(id, P, { background: true });
  };
  await comesBackPinned(d, id, leave, back);
});
