import { getDownloadSettings, setDownloadSettings } from "../../platform/downloads";
import { orWarn } from "../../lib/fallback";
import type { BrowserState } from "../browser/store";
import { engineProfile } from "../browser/model";
import { engineProfiles } from "../profiles/engineProfiles";
import { consentToken } from "../telemetry/consentPeriod";
import { noteNewProfileDownloadsShared, noteNewProfileDownloadsShareFailed } from "../telemetry/downloadFolderCounts";
import { inDownloadTurn } from "./downloadTurns";

export function shareDownloadsWithNewProfile(get: () => Pick<BrowserState, "profiles" | "settings">, to: string) {
  const consent = consentToken();
  const before = get();
  const defaultThen = engineProfile(before, before.settings.defaultProfileId);
  const existedBefore = engineProfiles(before);
  const exists = (engine: string) => engineProfiles(get()).includes(engine);
  const sourceNow = () => {
    const { profiles, settings } = get();
    if (settings.separateDownloadFolders || !exists(to)) return undefined;
    return [defaultThen, engineProfile({ profiles }, settings.defaultProfileId), ...existedBefore].find((engine) => existedBefore.includes(engine) && exists(engine));
  };
  const share = async (): Promise<void> => {
    const from = sourceNow();
    if (from === undefined) return;
    const shared = await getDownloadSettings(from).catch((error: unknown) => {
      if (exists(from)) throw error;
      return null;
    });
    if (!shared || !exists(from)) return share();
    if (shared.managed || !shared.folder || sourceNow() === undefined) return;
    await setDownloadSettings({ folder: shared.folder, askWhereToSave: shared.askWhereToSave }, to);
    noteNewProfileDownloadsShared(consent);
  };
  inDownloadTurn(share).catch((error: unknown) => {
    orWarn(undefined)(error);
    noteNewProfileDownloadsShareFailed(consent);
  });
}
