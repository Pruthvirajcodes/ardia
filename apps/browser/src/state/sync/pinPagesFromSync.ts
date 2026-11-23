const written = new Map<string, Map<string, string>>();

export function notePinPagesFromSync(profileId: string, pages: Map<string, string>) {
  if (!pages.size) return;
  let mine = written.get(profileId);
  if (!mine) written.set(profileId, (mine = new Map()));
  for (const [key, url] of pages) mine.set(key, url);
}

export function takePinPagesFromSync(profileId: string): Map<string, string> {
  const mine = written.get(profileId);
  written.delete(profileId);
  return mine ?? new Map();
}
