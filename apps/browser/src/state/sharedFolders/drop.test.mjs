import assert from "node:assert/strict";
import { test } from "node:test";
const { shellNativeModules } = await import("../../test-native/shell.ts");
globalThis.acTestNativeModules = { ArdiaSharedFolders: { location: () => ({ path: "/scratch", iCloudAvailable: true, iCloudPath: "/scratch" }) } };
await import("../../test-native/index.ts");
const { useBrowser } = await import("../browser/store.ts");
const { pinKeyOf } = await import("../browser/model.ts");
const { resolveDrop } = await import("../drag/drops.ts");
const { guardGroupClose, keepGroupsOpen } = await import("../groups/closeGuard.ts");
const { dropTabOnRow } = await import("../splits/actions.ts");
const { dropTabsOutside } = await import("../drag/windowDrop.ts");
const { bindFolder } = await import("./store.ts");
const { confirmRemovingShared, sharedFolderOfGroup } = await import("./removal.ts");
const { folderPlace } = await import("./engine.ts");
const { knownNames, localFolder } = await import("./local.ts");
const { foreignWriteHooks } = await import("../browser/foreignWriteHooks.ts");
const { devTabPresses } = await import("../telemetry/tabPresses.ts");
const { setConsentPeriod } = await import("../telemetry/consentPeriod.ts");

const S = () => useBrowser.getState();
guardGroupClose(confirmRemovingShared);
keepGroupsOpen((groupId) => !!sharedFolderOfGroup(S(), groupId));
const settle = () => new Promise(setImmediate);

function answering(t, confirmed) {
  const real = shellNativeModules.ArdiaDialogs.confirm;
  const asked = [];
  shellNativeModules.ArdiaDialogs.confirm = async (options) => (asked.push(options.title), { confirmed, suppressed: false });
  t.after(() => (shellNativeModules.ArdiaDialogs.confirm = real));
  return asked;
}

let runs = 0;
function sidebar({ shared = true, links = 1 } = {}) {
  S().hydrate({});
  runs++;
  const w = S().createWindow({ url: `https://home${runs}.example/` });
  const home = S().windows[w].tabIds[0];
  const other = S().newTab(w, { url: `https://other${runs}.example/`, background: true });
  const ids = Array.from({ length: links }, (_, i) => S().newTab(w, { url: `https://link${runs}-${i}.example/`, background: true }));
  const team = S().groupTabs(ids, { pinned: true, name: "Team" });
  const profileId = S().groups[team].profileId;
  const key = pinKeyOf(S().groups[team]);
  if (shared) bindFolder(profileId, key, `/scratch/Team ${runs}`);
  return { w, home, other, ids, team, profileId, key };
}

const rows = (groupId) => S().groups[groupId]?.tabIds.map((id) => S().tabs[id].customTitle ?? S().tabs[id].url);
const staysShared = ({ profileId, key }) => assert.equal(folderPlace(S(), profileId, key).kind, "shown", "the sync engine still finds the folder");
const dropGroup = (groupId, spot) => S().dropTabs([], resolveDrop(S(), { kind: "group", groupId }, spot));
const dropTab = (id, spot) => S().dropTabs([id], resolveDrop(S(), { kind: "tab" }, spot));

test("dragging a shared folder out of Pinned asks as Unpin does, and No leaves it pinned and shared", async (t) => {
  const asked = answering(t, false);
  const f = sidebar();
  dropGroup(f.team, { zone: "list", beforeId: null });
  assert.equal(S().groups[f.team].pinned, true, "nothing moves before the answer");
  await settle();
  assert.deepEqual(asked, ["Remove “Team” from the Sidebar?"]);
  assert.equal(S().groups[f.team].pinned, true);
  staysShared(f);
});

test("dragging a shared folder out of Pinned moves it once confirmed", async (t) => {
  const asked = answering(t, true);
  const f = sidebar();
  dropGroup(f.team, { zone: "list", beforeId: null });
  await settle();
  assert.equal(asked.length, 1);
  assert.equal(S().groups[f.team].pinned, false);
});

test("nesting a shared folder in another pinned folder asks too", async (t) => {
  const asked = answering(t, false);
  const f = sidebar();
  const outer = S().groupTabs([f.other], { pinned: true, name: "Outer" });
  dropGroup(f.team, { zone: "group", groupId: outer, beforeId: null });
  await settle();
  assert.equal(asked.length, 1);
  assert.equal(S().groups[f.team].parentId, undefined);
  staysShared(f);
});

test("reordering a shared folder inside Pinned and dragging an unshared one out ask nothing", async (t) => {
  const asked = answering(t, false);
  const f = sidebar();
  const outer = S().groupTabs([f.other], { pinned: true, name: "Outer" });
  dropGroup(f.team, { zone: "pinnedRows", beforeId: S().groups[outer].tabIds[0] });
  dropGroup(outer, { zone: "list", beforeId: null });
  await settle();
  assert.deepEqual(asked, []);
  assert.equal(S().groups[outer].pinned, false);
  staysShared(f);
});

for (const [where, spot] of [
  ["the tab list", () => ({ zone: "list", beforeId: null })],
  ["Pinned, outside the folder", () => ({ zone: "pinnedRows", beforeId: null })],
  ["Top Apps", () => ({ zone: "tiles", beforeId: null })],
  ["another group", (f) => ({ zone: "group", groupId: S().groupTabs([f.other], { pinned: false, name: "Reading" }), beforeId: null })],
]) {
  test(`dragging a shared folder's only link into ${where} leaves an Empty Folder row and keeps it shared`, () => {
    const f = sidebar();
    assert.equal(dropTab(f.ids[0], spot(f)), true);
    assert.deepEqual(rows(f.team), ["Empty Folder"]);
    assert.equal(S().groups[f.team].pinned, true);
    assert.equal(S().groups[f.team].tabIds.includes(f.ids[0]), false);
    staysShared(f);
  });
}

test("dropping a shared folder's only link beside a list row as a split keeps the folder", () => {
  const f = sidebar();
  dropTabOnRow(f.ids[0], f.home, "right");
  assert.equal(S().groups[f.team]?.tabIds.includes(f.ids[0]), false, "the link joined the row");
  assert.deepEqual(rows(f.team), ["Empty Folder"]);
  staysShared(f);
});

test("dropping a shared folder's only link in another profile keeps the folder in its own", () => {
  const f = sidebar();
  const work = S().createProfile({ name: "Work" });
  assert.ok(S().dropTabsInProfile([f.ids[0]], work, { type: "none" }));
  assert.equal(S().tabs[f.ids[0]].profileId, work);
  assert.deepEqual(rows(f.team), ["Empty Folder"]);
  staysShared(f);
});

test("dropping a shared folder's only link on another window keeps the folder", () => {
  const f = sidebar();
  const second = S().createWindow({ url: "https://second.example/" });
  S().moveTabsToWindow([f.ids[0]], second);
  staysShared(f);
});

test("with the folder shown in two windows, both keep it with one Empty Folder row", () => {
  const f = sidebar();
  const second = S().createWindow({ profileId: f.profileId });
  const copies = () => Object.values(S().groups).filter((g) => g.profileId === f.profileId && pinKeyOf(g) === f.key);
  assert.equal(copies().length, 2, "setup: the second window mirrors it");
  dropTab(f.ids[0], { zone: "list", beforeId: null });
  assert.deepEqual(copies().map((g) => [g.windowId === second || g.windowId === f.w, rows(g.id)]), [[true, ["Empty Folder"]], [true, ["Empty Folder"]]]);
  staysShared(f);
});

test("the Empty Folder row keeps the folder's place among pinned folders", () => {
  const f = sidebar();
  const below = S().groupTabs([f.other], { pinned: true, name: "Below" });
  dropGroup(f.team, { zone: "pinnedRows", beforeId: S().groups[below].tabIds[0] });
  dropTab(f.ids[0], { zone: "list", beforeId: null });
  const order = S().windows[f.w].tabIds;
  assert.ok(order.indexOf(S().groups[f.team].tabIds[0]) < order.indexOf(f.other));
});

test("a link that leaves others behind adds no row, and an unshared folder still goes with its last link", () => {
  const two = sidebar({ links: 2 });
  dropTab(two.ids[0], { zone: "list", beforeId: null });
  assert.deepEqual(S().groups[two.team].tabIds, [two.ids[1]]);
  const plain = sidebar({ shared: false });
  dropTab(plain.ids[0], { zone: "list", beforeId: null });
  assert.equal(S().groups[plain.team], undefined);
});

test("dragging one of two links out of a shared folder made by ⌘-click keeps the other link, and its file", () => {
  const f = sidebar({ links: 2 });
  useBrowser.setState((s) => ({ groups: { ...s.groups, [f.team]: { ...s.groups[f.team], autoUngroup: true } } }));
  dropTab(f.ids[0], { zone: "list", beforeId: null });
  assert.deepEqual(S().groups[f.team]?.tabIds, [f.ids[1]]);
  staysShared(f);
});

test("emptying two shared folders at once keeps their order", () => {
  const a = sidebar();
  const link = S().newTab(a.w, { url: `https://second-link${runs}.example/`, background: true });
  const b = S().groupTabs([link], { pinned: true, name: "Second" });
  bindFolder(a.profileId, pinKeyOf(S().groups[b]), `/scratch/Second ${runs}`);
  const rank = (groupId) => S().windows[a.w].tabIds.indexOf(S().groups[groupId].tabIds[0]);
  const first = rank(a.team) < rank(b);
  S().dropTabs([a.ids[0], link], resolveDrop(S(), { kind: "tab" }, { zone: "list", beforeId: null }));
  assert.equal(rank(a.team) < rank(b), first);
  staysShared(a);
});

test("the Empty Folder row never lands inside the folder above", () => {
  const f = sidebar();
  const above = S().groupTabs([f.other], { pinned: true, name: "Above" });
  S().moveGroup(above, { pinned: true, beforeId: f.ids[0] });
  dropTab(f.ids[0], { zone: "group", groupId: above, beforeId: null });
  const order = S().windows[f.w].tabIds;
  const at = S().groups[above].tabIds.map((id) => order.indexOf(id));
  assert.equal(Math.max(...at) - Math.min(...at) + 1, at.length, "the folder above stays in one piece");
  staysShared(f);
});

for (const [where, drop] of [
  ["the tab list", (f, row) => dropTab(row, { zone: "list", beforeId: null })],
  ["a split", (f, row) => dropTabOnRow(row, f.home, "right")],
  ["another profile", (f, row) => S().dropTabsInProfile([row], S().createProfile({ name: "Elsewhere" }), { type: "none" })],
]) {
  test(`the Empty Folder row itself can't be dragged into ${where}`, () => {
    const f = sidebar();
    dropTab(f.ids[0], { zone: "list", beforeId: null });
    const row = S().groups[f.team].tabIds[0];
    drop(f, row);
    assert.deepEqual(S().groups[f.team].tabIds, [row]);
    assert.equal(S().tabs[row].profileId, f.profileId);
  });
}

test("dropping a window's last tab, a shared folder's only link, on another profile's window takes the folder along", () => {
  const f = sidebar();
  S().closeTabs([f.home, f.other]);
  const target = S().createWindow({ profileId: S().createProfile({ name: "Away" }), url: "https://away.example/" });
  S().moveTabsToWindow([f.ids[0]], target);
  staysShared(f);
  const kept = S().groups[f.team];
  assert.equal(kept.windowId, target);
  assert.deepEqual(kept.tabIds, [f.ids[0]], "the link stays in it, so its file stays too");
});

test("a folder unpinned while the question is up isn't pinned again by the answer", async (t) => {
  const f = sidebar();
  const outer = S().groupTabs([f.other], { pinned: true, name: "Outer" });
  const real = shellNativeModules.ArdiaDialogs.confirm;
  shellNativeModules.ArdiaDialogs.confirm = async () => (S().moveGroup(f.team, { pinned: false }), { confirmed: true, suppressed: false });
  t.after(() => (shellNativeModules.ArdiaDialogs.confirm = real));
  dropGroup(f.team, { zone: "group", groupId: outer, beforeId: null });
  await settle();
  assert.equal(S().groups[f.team].parentId, undefined);
  assert.equal(S().groups[f.team].pinned, false);
});

test("an answer that can't move the folder any more isn't counted as a confirmed removal", async (t) => {
  setConsentPeriod(true, "drop-test");
  t.after(() => setConsentPeriod(false, null));
  const f = sidebar();
  const outer = S().groupTabs([f.other], { pinned: true, name: "Outer" });
  const real = shellNativeModules.ArdiaDialogs.confirm;
  shellNativeModules.ArdiaDialogs.confirm = async () => (S().ungroup(outer), { confirmed: true, suppressed: false });
  t.after(() => (shellNativeModules.ArdiaDialogs.confirm = real));
  const counted = devTabPresses().drops_shared_folder_confirmed;
  dropGroup(f.team, { zone: "group", groupId: outer, beforeId: null });
  await settle();
  staysShared(f);
  assert.equal(devTabPresses().drops_shared_folder_confirmed, counted);
});

test("the confirmed move is the user's own write, not a running automation command's", async (t) => {
  answering(t, true);
  const around = foreignWriteHooks.around;
  let writes = 0;
  foreignWriteHooks.around = (write) => (writes++, around(write));
  t.after(() => (foreignWriteHooks.around = around));
  const f = sidebar();
  dropGroup(f.team, { zone: "list", beforeId: null });
  await settle();
  assert.equal(S().groups[f.team].pinned, false);
  assert.equal(writes, 1);
});

test("dragging a link out of a ⌘-click shared folder leaves its subfolder, and the files in it, alone", () => {
  const f = sidebar({ links: 2 });
  const docs = S().groupTabs([f.ids[1]], { name: "Docs" });
  assert.equal(S().groups[docs].parentId, f.team, "setup: Docs is inside the shared folder");
  useBrowser.setState((s) => ({ groups: { ...s.groups, [f.team]: { ...s.groups[f.team], autoUngroup: true } } }));
  const entries = () => localFolder(S(), f.team, knownNames([])).entries;
  const before = entries().filter((e) => e.kind === "dir");
  dropTab(f.ids[0], { zone: "list", beforeId: null });
  assert.equal(S().groups[docs].parentId, f.team);
  assert.deepEqual(S().groups[f.team].tabIds, [f.ids[1]]);
  assert.deepEqual(entries(), before, "the sync engine sees the same Docs and nothing at the root");
  staysShared(f);
});
