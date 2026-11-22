import type { BrowserState } from "../browser/store";
import { dropping, type Drop } from "../drag/drops";
import { consentToken } from "../telemetry/client";
import { noteSharedFolderDrop } from "../telemetry/tabPresses";
import { groupCloseAllowed, groupKeptOpen } from "./closeGuard";

export function keptFolderLeavingPinned(s: BrowserState, drop: Drop): string | null {
  if (drop.type !== "group" || !groupKeptOpen(drop.groupId)) return null;
  const after = dropping(s, [], drop);
  if (after === s) return null;
  const moved = after.groups[drop.groupId];
  return moved?.pinned && !moved.parentId ? null : drop.groupId;
}

export async function dropOnceAllowed(windowId: string, groupId: string, move: () => boolean) {
  const consent = consentToken();
  noteSharedFolderDrop("asked", consent);
  if (!(await groupCloseAllowed(windowId, groupId))) return;
  if (move()) noteSharedFolderDrop("confirmed", consent);
}
