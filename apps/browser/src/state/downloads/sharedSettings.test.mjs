import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, beforeEach, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
globalThis.require = createRequire(import.meta.url);
globalThis.__DEV__ = false;

const CHROME_DEFAULT = { folder: "/Users/someone/Downloads", askWhereToSave: false, managed: false };
const LOAD_MS = 15;
let engine;
let loads;
let writes;

const answer = (verb, profile, args) => {
  if (verb !== "settings" && verb !== "setSettings") return null;
  const current = engine.get(profile) ?? CHROME_DEFAULT;
  if (verb === "settings") return current;
  if (current.managed) throw Object.assign(new Error("downloads are set by policy"), { code: "ERR_ENGINE" });
  const next = { ...current, ...args };
  engine.set(profile, next);
  writes.push(profile);
  return next;
};

globalThis.acTestNativeModules = {
  ArdiaDownloads: {
    call: (verb, profile, json) => {
      if (!loads.has(profile)) loads.set(profile, profile ? sleep(LOAD_MS) : Promise.resolve());
      return loads.get(profile).then(() => JSON.stringify(answer(verb, profile, JSON.parse(json))));
    },
    addListener: () => ({ remove() {} }),
  },
  ArdiaImport: {
    addListener: () => ({ remove() {} }),
    cancelImport() {},
    forgetUnlockedKeys() {},
    isBrowserUnlocked: () => true,
    listExtensions: async () => "[]",
    importData: async (_job, browserId, profileId) =>
      JSON.stringify({ browserId, profileId, history: [], historyCount: 0, tabs: [], tabGroups: [], credentials: [], cookieCount: 0, addressCount: 0, cardCount: 0, spaces: [], favorites: [], favicons: [], failed: [], warnings: [] }),
  },
};

const stub = await import("../../test-native/index.ts");
globalThis.fetch = async () => ({ status: 200 });
const client = await import("../telemetry/client.ts");
const usage = await import("../telemetry/usage.ts");
const { takeDownloadFolderCounts } = await import("../telemetry/downloadFolderCounts.ts");
const { useBrowser } = await import("../browser/store.ts");
const { engineProfile } = await import("../browser/model.ts");
const { engineProfiles } = await import("../profiles/engineProfiles.ts");
const { setDownloadsFor, downloadFoldersDiffer, separateIfFoldersDiffer } = await import("../settings/paneData.ts");
const { addLinkedProfile } = await import("../sync/profileLinks.ts");
const { patchImport } = await import("../import/flow.ts");
const { runImport } = await import("../import/runImport.ts");
const { createProfile } = await import("../profiles/actions.ts");
const { DOWNLOAD_METHODS } = await import("../automation/socketDownloads.ts");

const S = () => useBrowser.getState();
const engineOf = (id) => engineProfile(S(), id);
const automation = (name) => DOWNLOAD_METHODS.find((method) => method.name === name);
const socketCall = { stillServing() {} };
const settled = () => sleep(LOAD_MS * 4);
const savesTo = async (id) => {
  await settled();
  const { folder, askWhereToSave } = engine.get(engineOf(id)) ?? CHROME_DEFAULT;
  return { folder, askWhereToSave };
};
const SHARED = { folder: "/Users/someone/Shared Downloads", askWhereToSave: true };
const UNTOUCHED = { folder: CHROME_DEFAULT.folder, askWhereToSave: false };

after(() => client.setSharing(false, "settings"));

beforeEach(async () => {
  engine = new Map();
  loads = new Map();
  writes = [];
  S().hydrate({});
  assert.equal(S().settings.separateDownloadFolders, false);
  await setDownloadsFor(SHARED, engineProfiles(S()));
  writes = [];
  takeDownloadFolderCounts();
});

test("a new profile saves to the folder every profile shares, and asks as they do", async () => {
  const work = createProfile({ name: "Work" });
  assert.deepEqual(await savesTo(work), SHARED);
});

test("Settings › General opened while a new profile's engine is still loading finds one folder", async () => {
  createProfile({ name: "Work" });
  assert.equal(await downloadFoldersDiffer(engineProfiles(S())), false);
});

test("a profile that arrives by sync gets the shared folder", async () => {
  const doc = { scopes: {}, profiles: {}, setupAt: null, joining: false };
  const work = addLinkedProfile(doc, "remote-work", { n: "Work", c: "red", i: null }, null);
  assert.deepEqual(await savesTo(work), SHARED);
});

test("a profile made by an import gets the shared folder", async () => {
  const profile = (id, name) => ({ id, name, path: `/chrome/${id}`, isDefault: id === "Default", available: ["history"], spaces: [] });
  const source = { id: "chrome", name: "Chrome", family: "chromium", requiresExport: false, needsKeychain: false, profiles: [profile("Default", "Default"), profile("Profile 1", "Imported")] };
  patchImport({ source, sourceProfiles: ["Default", "Profile 1"], spaces: [], target: "default", kinds: new Set(["history"]) });
  await runImport(new Set(["history"]));
  const imported = S().profileOrder.find((id) => S().profiles[id].name === "Imported");
  assert.ok(imported, "the import made a profile");
  assert.deepEqual(await savesTo(imported), SHARED);
});

test("several profiles made at once all get the shared folder", async () => {
  const made = ["One", "Two", "Three"].map((name) => createProfile({ name }));
  assert.equal(await downloadFoldersDiffer(engineProfiles(S())), false);
  for (const id of made) assert.deepEqual(await savesTo(id), SHARED);
});

test("the shared folder is the default profile's, whichever profile that is", async () => {
  const work = createProfile({ name: "Work" });
  await settled();
  const own = { folder: "/Users/someone/Work Downloads", askWhereToSave: false };
  await setDownloadsFor(own, [engineOf(work)]);
  S().setDefaultProfile(work);
  assert.deepEqual(await savesTo(createProfile({ name: "Side" })), own);
});

test("the shared folder follows a default profile that was itself just made", async () => {
  S().setDefaultProfile(createProfile({ name: "Work" }));
  assert.deepEqual(await savesTo(createProfile({ name: "Side" })), SHARED);
});

test("with a folder for each profile, a new profile keeps Chrome's", async () => {
  S().updateSettings({ separateDownloadFolders: true });
  const work = createProfile({ name: "Work" });
  assert.deepEqual(await savesTo(work), UNTOUCHED);
  assert.deepEqual(writes, []);
});

test("turning on a folder for each profile before the copy lands leaves the new profile alone", async () => {
  const work = createProfile({ name: "Work" });
  S().updateSettings({ separateDownloadFolders: true });
  assert.deepEqual(await savesTo(work), UNTOUCHED);
});

test("a folder chosen while the new profile loads wins over the one it was made with", async () => {
  const work = createProfile({ name: "Work" });
  await sleep(1);
  const chosen = { folder: "/Users/someone/Chosen", askWhereToSave: false };
  await setDownloadsFor(chosen, engineProfiles(S()));
  assert.deepEqual(await savesTo(work), chosen);
});

test("a folder chosen in the same moment a profile is made wins", async () => {
  const work = createProfile({ name: "Work" });
  await Promise.resolve();
  const chosen = { folder: "/Users/someone/Chosen", askWhereToSave: false };
  await setDownloadsFor(chosen, engineProfiles(S()));
  assert.deepEqual(await savesTo(work), chosen);
});

test("automation reads the shared folder right after making a profile", async () => {
  const work = createProfile({ name: "Work" });
  const read = await automation("downloads.settings").run({ profile: work }, socketCall);
  assert.deepEqual({ folder: read.folder, askWhereToSave: read.askWhereToSave }, SHARED);
});

test("a folder automation sets right after making a profile is kept", async () => {
  const work = createProfile({ name: "Work" });
  await automation("downloads.setSettings").run({ profile: work, folder: "/Users/someone/Scripted" }, socketCall);
  assert.equal((await savesTo(work)).folder, "/Users/someone/Scripted");
});

test("a profile that shares another's data is never written to", async () => {
  createProfile({ name: "Shares", shareWith: "default" });
  await settled();
  assert.deepEqual(writes, []);
});

test("a profile deleted before the copy lands is never loaded for it", async () => {
  const work = createProfile({ name: "Work" });
  const workEngine = engineOf(work);
  S().deleteProfile(work);
  await settled();
  assert.equal(loads.has(workEngine), false);
});

test("a folder set by policy isn't copied as a choice", async () => {
  engine.set("", { ...CHROME_DEFAULT, ...SHARED, managed: true });
  const work = createProfile({ name: "Work" });
  await settled();
  assert.equal(loads.has(engineOf(work)), false);
});

test("a refused copy doesn't stop the next profile's", async () => {
  const work = createProfile({ name: "Work" });
  engine.set(engineOf(work), { ...CHROME_DEFAULT, managed: true });
  const side = createProfile({ name: "Side" });
  assert.deepEqual(await savesTo(side), SHARED);
});

test("opening General after a new profile keeps Separate folder for each profile off and unchosen", async () => {
  createProfile({ name: "Work" });
  await separateIfFoldersDiffer(engineProfiles(S()), () => true);
  assert.equal(S().settings.separateDownloadFolders, false);
  assert.equal(S().settingsMeta.chosen.includes("separateDownloadFolders"), false);
});

test("folders set apart on purpose still turn Separate folder for each profile on, only while General shows", async () => {
  const work = createProfile({ name: "Work" });
  await settled();
  await setDownloadsFor({ folder: "/Users/someone/Work Downloads" }, [engineOf(work)]);
  await separateIfFoldersDiffer(engineProfiles(S()), () => false);
  assert.equal(S().settings.separateDownloadFolders, false);
  await separateIfFoldersDiffer(engineProfiles(S()), () => true);
  assert.equal(S().settings.separateDownloadFolders, true);
});

async function oneOfEach() {
  const work = createProfile({ name: "Work" });
  await settled();
  const refused = createProfile({ name: "Refused" });
  engine.set(engineOf(refused), { ...CHROME_DEFAULT, managed: true });
  await settled();
  await separateIfFoldersDiffer([engineOf(work), engineOf(refused)], () => true);
}

test("a copy, a failed copy and the switch turning on by itself are sent in usage_counts while sharing is on", async () => {
  client.setSharing(true, "onboarding");
  await oneOfEach();
  usage.emitWindowUsage(client.consentToken());
  await client.saveQueueNow();
  const sent = JSON.parse(stub.docs.get("telemetry-queue.json") ?? '{"events":[]}').events.filter((e) => e.event === "usage_counts").at(-1)?.properties;
  assert.equal(sent?.new_profile_downloads_shared, 1);
  assert.equal(sent?.new_profile_downloads_share_failed, 1);
  assert.equal(sent?.download_folders_found_separate, 1);
});

test("none of them is counted with sharing off", async () => {
  client.setSharing(false, "settings");
  await oneOfEach();
  assert.ok(Object.values(takeDownloadFolderCounts()).every((n) => n === 0));
});

test("a copy that began before sharing went on isn't counted", async () => {
  client.setSharing(false, "settings");
  createProfile({ name: "Work" });
  client.setSharing(true, "onboarding");
  await settled();
  assert.equal(takeDownloadFolderCounts().new_profile_downloads_shared, 0);
});
