import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
await import("../../test-native/index.ts");
globalThis.fetch = async () => ({ status: 503 });
const client = await import("../telemetry/client.ts");
client.loadChoice();
client.setSharing(true, "settings");
after(() => client.setSharing(false, "settings"));
const { useBrowser } = await import("../browser/store.ts");
const { downloadsIn } = await import("./downloadsSlice.ts");
const { useDownloadProgress, withLiveProgress } = await import("./progress.ts");
const { takeDownloadsPanelCounts } = await import("../telemetry/downloadsPanelCounts.ts");

const S = () => useBrowser.getState();
const download = (id, extra = {}) => ({
  id, url: `https://dl.example/${id}`, filename: id, path: `/tmp/${id}`, state: "finished", paused: false, received: 10, total: 10, speed: 0, mimeType: "", profile: "", ...extra,
});
const running = (id, extra = {}) => download(id, { state: "downloading", received: 3, ...extra });
const add = (...rows) => rows.forEach((row) => S().upsertDownload(row));
const finished = (count) => Array.from({ length: count }, (_, i) => download(`file-${i}`));
const ids = () => S().downloads.map((d) => d.id);
const newestFirst = (rows) => rows.map((d) => d.id).reverse();
const capCounts = () => {
  const { downloads_kept_past_cap, downloads_live_evicted } = takeDownloadsPanelCounts();
  return { downloads_kept_past_cap, downloads_live_evicted };
};

let windowId;
beforeEach(() => {
  client.setSharing(true, "settings");
  S().hydrate({});
  windowId = S().createWindow({ url: "https://a.example/" });
  useDownloadProgress.setState({}, true);
  takeDownloadsPanelCounts();
});

test("a paused download keeps its row and its bytes past 100 later downloads, and outlasts Clear", () => {
  add(running("large.iso", { paused: true }));
  for (const row of finished(100)) add({ ...row, state: "downloading" }, row);
  assert.deepEqual(ids(), [...newestFirst(finished(100).slice(1)), "large.iso"]);
  S().clearDownloads(windowId);
  const [left] = withLiveProgress(downloadsIn(S(), windowId));
  assert.deepEqual([left?.id, left?.paused, left?.received], ["large.iso", true, 3]);
});

test("paused, running and held downloads stay in their order while ended ones make room, oldest first", () => {
  const kept = [running("paused-1", { paused: true }), running("running"), running("paused-2", { paused: true }), running("held", { dangerous: true })];
  const ended = ["failed", "cancelled", "finished"].map((state) => download(state, { state }));
  const recent = finished(93);
  add(kept[0], ended[0], kept[1], ended[1], kept[2], ended[2], kept[3], ...recent);
  assert.equal(ids().length, 100);
  for (const [i, evicted] of ended.entries()) {
    const before = ids();
    add(running(`new-${i}`));
    assert.deepEqual(ids(), [`new-${i}`, ...before.filter((id) => id !== evicted.id)]);
  }
  assert.deepEqual(Object.keys(useDownloadProgress.getState()).sort(), [...kept.map((d) => d.id), "new-0", "new-1", "new-2"].sort());
});

test("99 running downloads make room with the one that ended, even when it is the newest", () => {
  const live = Array.from({ length: 99 }, (_, i) => running(`running-${i}`));
  add(...live, download("ended"), running("new"));
  assert.deepEqual(ids(), ["new", ...newestFirst(live)]);
  assert.deepEqual(Object.keys(useDownloadProgress.getState()).sort(), [...ids()].sort());
});

test("a full list of unfinished downloads still caps at 100 and forgets only the oldest one's progress", () => {
  for (const newest of [running("new"), download("new")]) {
    S().hydrate({});
    useDownloadProgress.setState({}, true);
    const live = Array.from({ length: 100 }, (_, i) => running(`running-${i}`, { paused: i % 2 === 0 }));
    add(...live, newest);
    assert.deepEqual(ids(), ["new", ...newestFirst(live.slice(1))]);
    const withProgress = S().downloads.filter((d) => d.state === "downloading").map((d) => d.id);
    assert.deepEqual(Object.keys(useDownloadProgress.getState()).sort(), withProgress.sort());
  }
});

test("with only ended downloads, or one that has ended since, the oldest row goes", () => {
  add(running("large.iso", { paused: true }), ...finished(99), download("large.iso"), download("new"));
  assert.deepEqual(ids(), ["new", ...newestFirst(finished(99))]);
  assert.deepEqual(capCounts(), { downloads_kept_past_cap: 0, downloads_live_evicted: 0 });
});

test("updating a row in a full list evicts nothing", () => {
  add(running("large.iso"), ...finished(99));
  const before = ids();
  add(running("large.iso", { paused: true, received: 4 }));
  assert.deepEqual(ids(), before);
  assert.equal(useDownloadProgress.getState()["large.iso"].received, 4);
});

test("the cap counts the live rows it kept and the ones it had to drop", () => {
  add(running("large.iso", { paused: true }), ...finished(101));
  assert.deepEqual(capCounts(), { downloads_kept_past_cap: 2, downloads_live_evicted: 0 });
  S().hydrate({});
  add(...Array.from({ length: 101 }, (_, i) => running(`running-${i}`)));
  assert.deepEqual(capCounts(), { downloads_kept_past_cap: 0, downloads_live_evicted: 1 });
});

test("the cap counts nothing while sharing is off", () => {
  client.setSharing(false, "settings");
  add(running("large.iso", { paused: true }), ...finished(101));
  client.setSharing(true, "settings");
  assert.deepEqual(capCounts(), { downloads_kept_past_cap: 0, downloads_live_evicted: 0 });
});
