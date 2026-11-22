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

// HyperFrames runs through npx. Always name the package and the binary: when MotionFrames itself was started
// by npx (`npx github:khadinakbarlabs/motionframes ...`), npm leaves npm_config_package set and a bare
// `npx hyperframes@x` would try to run "hyperframes@x" as a command.
export const HF = env("HF") || "hyperframes@0.9.74";
export const hfArgs = (...args) => ["-y", `--package=${HF}`, "hyperframes", ...args];
export function cleanNpxEnv(base = process.env) {
  const out = { ...base };
  for (const k of Object.keys(out)) if (/^npm_config_(package|call|yes)$/i.test(k) || /^npm_(lifecycle|package)_/i.test(k)) delete out[k];
  out.npm_config_update_notifier = "false"; // keep CLI output clean
  return out;
}
