// Shared names and cache paths. The project was called toonshorts before 0.3.1: old TOONSHORTS_* env vars
// and an existing ~/.cache/toonshorts (voice runtime, sound library) keep working, so nothing re-downloads.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const env = (name) => process.env[`MOTIONFRAMES_${name}`] ?? process.env[`TOONSHORTS_${name}`];

export function cacheDir(sub) {
  const now = join(homedir(), ".cache", "motionframes", sub);
  const old = join(homedir(), ".cache", "toonshorts", sub);
  return !existsSync(now) && existsSync(old) ? old : now;
}
