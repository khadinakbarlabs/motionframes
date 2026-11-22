// Tightens a voice line for short-form pacing: shortens long pauses and speeds the delivery up
// (ffmpeg atempo, pitch kept). Word timings are remapped exactly, so every anchor still lands.
//   short.json "pace": { "speed": 1.12, "maxPause": 0.25 }      (off by default; "pace": false to disable)
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

export const pacedPath = (audio) => join("assets", "paced", basename(audio).replace(/\.[a-z0-9]+$/i, "") + ".wav");
export const pacedWords = (audio) => pacedPath(audio).replace(/\.wav$/, ".words.json");

function silences(file, minDur) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=n=-38dB:d=${minDur}`, "-f", "null", "-"], { encoding: "utf8" });
  const s = r.stderr || "", starts = [...s.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]), ends = [...s.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  return starts.map((a, i) => [a, ends[i]]).filter(([a, b]) => Number.isFinite(b));
}

// returns { audio, words } paths (relative to dir) of the paced line, building it when the source is newer
export function paceLine(dir, audio, wordsRel, { speed = 1.12, maxPause = 0.25 } = {}) {
  const src = join(dir, audio), out = join(dir, pacedPath(audio)), wout = join(dir, pacedWords(audio));
  const stamp = JSON.stringify({ speed, maxPause, src: statSync(src).mtimeMs, w: statSync(join(dir, wordsRel)).mtimeMs });
  const sp = out + ".stamp";
  if (existsSync(out) && existsSync(wout) && existsSync(sp) && readFileSync(sp, "utf8") === stamp) return { audio: pacedPath(audio), words: pacedWords(audio) };
  mkdirSync(dirname(out), { recursive: true });
  const words = JSON.parse(readFileSync(join(dir, wordsRel), "utf8"));
  const total = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src], { encoding: "utf8" }).trim());
  // keep: everything except the part of each pause longer than maxPause (only pauses between words)
  const cuts = silences(src, maxPause + 0.05)
    .filter(([a, b]) => a > words[0].start - 0.05 && b < words.at(-1).end + 0.05)
    .map(([a, b]) => [a + maxPause / 2, b - maxPause / 2]).filter(([a, b]) => b - a > 0.04);
  const keep = []; let t = 0;
  for (const [a, b] of cuts) { keep.push([t, a]); t = b; }
  keep.push([t, total]);
  const filt = keep.map(([a, b], i) => `[0]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS[k${i}]`).join(";") +
    ";" + keep.map((_, i) => `[k${i}]`).join("") + `concat=n=${keep.length}:v=0:a=1,atempo=${speed}[o]`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-filter_complex", filt, "-map", "[o]", "-ar", "48000", "-ac", "1", out]);
  const map = (x) => { let removed = 0; for (const [a, b] of cuts) { if (x >= b) removed += b - a; else if (x > a) removed += x - a; } return +((x - removed) / speed).toFixed(3); };
  writeFileSync(wout, JSON.stringify(words.map((w) => ({ ...w, start: map(w.start), end: map(w.end) })), null, 1));
  writeFileSync(sp, stamp);
  return { audio: pacedPath(audio), words: pacedWords(audio) };
}
