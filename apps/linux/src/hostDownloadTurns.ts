import type { DownloadTurns } from "../../browser/src/state/downloads/downloadTurns";
import type { ArdiaHost } from "./host";
import { invokeHost, reportHostError } from "./host.ts";

const DOWNLOAD_SETTINGS_LOCK = "ardia-download-settings";

type Locks = { request<T>(name: string, job: () => Promise<T>): Promise<T> };

const hearEarlierSessionEvents = (host: ArdiaHost) => invokeHost("ArdiaShell.windowIds", { args: [] }, host);

export const linuxDownloadTurns = (locks: Locks, host: ArdiaHost, publishSession: () => Promise<void>, report: (error: unknown) => void = reportHostError): DownloadTurns => (job) =>
  locks.request(DOWNLOAD_SETTINGS_LOCK, async () => {
    await hearEarlierSessionEvents(host).catch(report);
    try {
      return await job();
    } finally {
      await publishSession().catch(report);
    }
  });
