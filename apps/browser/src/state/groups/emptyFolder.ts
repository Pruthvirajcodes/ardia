import type { BrowserState } from "../browser/store";
import type { Tab, TabGroup } from "../browser/types";
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
  const dissolved = Object.values(before.groups).filter((g) => !after.groups[g.id] && after.windows[g.windowId] && g.tabIds.some((id) => left.has(id)) && groupKeptOpen(g.id));
  if (!dissolved.length) return after;
  const placeOf = (g: TabGroup) => before.windows[g.windowId]!.tabIds.indexOf(g.tabIds[0]!);
  let next = after;
  for (const g of dissolved.sort((a, z) => placeOf(z) - placeOf(a))) {
    const w = next.windows[g.windowId]!;
    const staying = g.tabIds.filter((id) => !left.has(id) && w.tabIds.includes(id));
    const tabs = { ...next.tabs };
    const tabIds = [...w.tabIds];
    let members = staying;
    if (!members.length) {
      const row = emptyFolderRow(g.windowId, g.profileId);
      const above = findLast(before.windows[g.windowId]!.tabIds.slice(0, placeOf(g)), (id) => !left.has(id) && w.tabIds.includes(id));
      tabIds.splice(above ? tabIds.indexOf(above) + 1 : 0, 0, row.id);
      tabs[row.id] = row;
      members = [row.id];
    }
    const groups = { ...next.groups, [g.id]: { ...g, tabIds: members } };
    const window = { ...w, tabIds: orderSections(tabIds, tabs, groups) };
    next = { ...next, tabs, groups: syncGroupOrder(groups, window), windows: { ...next.windows, [w.id]: window } };
  }
  return next;
}
