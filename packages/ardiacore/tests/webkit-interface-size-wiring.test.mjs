import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const path = (name) => fileURLToPath(new URL(name, import.meta.url));
const sources = ["../ios/WebKitTab.swift", "../ios/WebKitTab+PageTab.swift"];
const read = (name) => (existsSync(path(name)) ? readFileSync(path(name), "utf8") : "");
const tab = read("../ios/WebKitTab.swift");
const pageTab = read("../ios/WebKitTab+PageTab.swift");

const body = (source, header, closer = "\n  }\n") => {
  const start = source.indexOf(header);
  if (start < 0) return "";
  const end = source.indexOf(closer, start);
  return source.slice(start, end < 0 ? source.length : end);
};

test("every source the checks read exists", () => {
  const missing = sources.filter((name) => !existsSync(path(name)));
  assert.deepEqual(missing, []);
});

test("a WebKit page gets no autoresizing mask, so Auto Layout can't size WebKit's own layer host to the tab's unscaled frame and clip the page above 100% Interface size", () => {
  const attach = body(tab, "private func attach(_ view: WebKitWebView) {");
  assert.ok(attach.includes("view.frame = bounds"), "attach sizes the page to the tab's bounds");
  assert.ok(!/autoresizingMask/.test(tab), "WebKitTab sets no autoresizing mask on its page");
});

test("the tab sizes its page itself on every resize and layout, in its scaled bounds", () => {
  assert.match(body(tab, "override func resizeSubviews(withOldSize oldSize: NSSize)", "\n"), /fillWithPage\(\)/);
  assert.match(body(tab, "override func layout() {"), /fillWithPage\(\)/);
  assert.match(body(tab, "override func setFrameSize(_ newSize: NSSize) {"), /fitPageToInterfaceScale\(\)/);
  const fit = body(pageTab, "func fitPageToInterfaceScale() {");
  assert.ok(fit.indexOf("InterfaceScale.fitPageHost(self)") >= 0 && fit.indexOf("fillWithPage()") > fit.indexOf("InterfaceScale.fitPageHost(self)"), "the page is refilled after the tab's bounds take the scale");
  assert.match(body(pageTab, "func fillWithPage() {"), /webView\.frame = bounds/);
});
