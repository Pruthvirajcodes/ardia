import type { BrowserState } from "../browser/store";
import { dropping, type Drop } from "../drag/drops";
import { consentToken } from "../telemetry/consentPeriod";
import { groupCloseAllowed, groupKeptOpen, noteKeptGroupDrop } from "./closeGuard";

export function keptFolderLeavingPinned(s: BrowserState, drop: Drop): string | null {
  if (drop.type !== "group" || !groupKeptOpen(drop.groupId)) return null;
  const after = dropping(s, [], drop);
  if (after === s) return null;
  const moved = after.groups[drop.groupId];
  return moved?.pinned && !moved.parentId ? null : drop.groupId;
}

export async function dropOnceAllowed(windowId: string, groupId: string, move: () => boolean) {
  const consent = consentToken();
  noteKeptGroupDrop("asked", consent);
  if (!(await groupCloseAllowed(windowId, groupId))) return;
  if (move()) noteKeptGroupDrop("confirmed", consent);
}
