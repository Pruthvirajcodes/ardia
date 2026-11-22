import type { BrowserState } from "../browser/store";
import type { Tab } from "../browser/types";
import { findLast, makeTab } from "../browser/model";
import { ASLEEP } from "../tabs/pageSession";
import { groupKeptOpen } from "./closeGuard";
import { orderSections, syncGroupOrder } from "./groups";

export const EMPTY_FOLDER_URL = "about:blank";
const EMPTY_FOLDER_TITLE = "Empty Folder";

export const emptyFolderRow = (windowId: string, profileId: string): Tab => ({
  ...makeTab(windowId, profileId, EMPTY_FOLDER_URL, { title: EMPTY_FOLDER_TITLE, customTitle: EMPTY_FOLDER_TITLE }),
  page: ASLEEP,
});

export function withEmptiedFoldersKept(before: BrowserState, after: BrowserState, left: ReadonlySet<string>): BrowserState {
  let next = after;
  for (const g of Object.values(before.groups)) {
    const w = next.windows[g.windowId];
    if (next.groups[g.id] || !w || !g.tabIds.some((id) => left.has(id)) || !groupKeptOpen(g.id)) continue;
    const row = emptyFolderRow(g.windowId, g.profileId);
    const was = before.windows[g.windowId]!.tabIds;
    const above = findLast(was.slice(0, was.indexOf(g.tabIds[0]!)), (id) => !left.has(id) && w.tabIds.includes(id));
    const tabIds = [...w.tabIds];
    tabIds.splice(above ? tabIds.indexOf(above) + 1 : 0, 0, row.id);
    const tabs = { ...next.tabs, [row.id]: row };
    const groups = { ...next.groups, [g.id]: { ...g, tabIds: [row.id] } };
    const window = { ...w, tabIds: orderSections(tabIds, tabs, groups) };
    next = { ...next, tabs, groups: syncGroupOrder(groups, window), windows: { ...next.windows, [w.id]: window } };
  }
  return next;
}
