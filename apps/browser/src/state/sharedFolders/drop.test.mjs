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
