import { getDownloadSettings, setDownloadSettings } from "../../platform/downloads";
import { orWarn } from "../../lib/fallback";
import type { BrowserState } from "../browser/store";
import { engineProfiles } from "../profiles/engineProfiles";
import { consentToken } from "../telemetry/consentPeriod";
import { noteNewProfileDownloadsShared, noteNewProfileDownloadsShareFailed } from "../telemetry/downloadFolderCounts";

let sharing: Promise<void> = Promise.resolve();

export const downloadSharingSettled = () => sharing;

export function shareDownloadsWithNewProfile(get: () => Pick<BrowserState, "profiles" | "settings">, from: string, to: string) {
  const consent = consentToken();
  const wanted = () => {
    const s = get();
    if (s.settings.separateDownloadFolders) return false;
    const engines = engineProfiles(s);
    return engines.includes(from) && engines.includes(to);
  };
  const share = async () => {
    if (!wanted()) return;
    const { folder, askWhereToSave, managed } = await getDownloadSettings(from);
    if (managed || !folder || !wanted()) return;
    await setDownloadSettings({ folder, askWhereToSave }, to);
    noteNewProfileDownloadsShared(consent);
  };
  sharing = sharing.then(share).catch((error: unknown) => {
    orWarn(undefined)(error);
    noteNewProfileDownloadsShareFailed(consent);
  });
}
