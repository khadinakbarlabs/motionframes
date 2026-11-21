// Loads short.json, measures the voice lines, attaches word timings and resolves scene times.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { makeAnchor } from "../runtime/anchor.js";

export const DEFAULTS = {
  width: 1080, height: 1920, fps: 30,
  lead: 0.3,   // silence before the first line (frame 0 must already be the hook picture)
  gap: 0.3,    // pause between voice lines (no dead air)
  tail: 1.0,   // hold after the last line
  palette: { ink: "#0f1220", paper: "#f3eadb", bg: "#0f1220" },
};

const r3 = (x) => Math.round(x * 1000) / 1000;

export function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const d = Number(out.trim());
  if (!Number.isFinite(d) || d <= 0) throw new Error(`could not read duration of ${file}`);
  return d;
}

export const wordsPathFor = (audio) => audio.replace(/\.[a-z0-9]+$/i, "") + ".words.json";

function validate(raw) {
  const errs = [];
  if (!Array.isArray(raw.lines) || raw.lines.length === 0) errs.push("short.json needs a non-empty \"lines\" array");
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) errs.push("short.json needs a non-empty \"scenes\" array");
  const ids = new Set();
  for (const l of raw.lines || []) {
    if (!l.id || !/^[A-Za-z][\w-]*$/.test(l.id)) errs.push(`line id "${l.id}" must start with a letter (e.g. L1)`);
    if (ids.has(l.id)) errs.push(`duplicate id "${l.id}"`); ids.add(l.id);
    if (!l.text) errs.push(`line ${l.id} has no text`);
  }
  for (const s of raw.scenes || []) {
    if (!s.id || !/^[A-Za-z][\w-]*$/.test(s.id)) errs.push(`scene id "${s.id}" must start with a letter (e.g. s1)`);
    if (ids.has(s.id)) errs.push(`duplicate id "${s.id}"`); ids.add(s.id);
    if (!s.file) errs.push(`scene ${s.id} has no "file"`);
    if (s.at === undefined) errs.push(`scene ${s.id} has no "at" anchor`);
  }
  if (errs.length) throw new Error("short.json is invalid:\n  - " + errs.join("\n  - "));
}

export function readSpec(dir) {
  const p = join(dir, "short.json");
  if (!existsSync(p)) throw new Error(`no short.json in ${dir} (run "toonshorts init ${dir}")`);
  let raw;
  try { raw = JSON.parse(readFileSync(p, "utf8")); } catch (e) { throw new Error(`short.json is not valid JSON: ${e.message}`); }
  validate(raw);
  return { ...DEFAULTS, ...raw, palette: { ...DEFAULTS.palette, ...(raw.palette || {}) } };
}

// Full timing model used by every later step.
export function loadModel(dir, { needWords = true } = {}) {
  const spec = readSpec(dir);
  let t = spec.lead;
  const warnings = [];
  const lines = spec.lines.map((l, i) => {
    if (!l.audio || !existsSync(join(dir, l.audio))) throw new Error(`line ${l.id} has no audio file yet: run "toonshorts voice ${dir}"`);
    const dur = l.duration ?? probeDuration(join(dir, l.audio));
    const start = r3(l.start ?? (i === 0 ? t : t + (l.gap ?? spec.gap)));
    const wp = join(dir, wordsPathFor(l.audio));
    let words = [];
    if (existsSync(wp)) {
      words = JSON.parse(readFileSync(wp, "utf8")).map((w) => ({ text: w.text, start: r3(start + w.start), end: r3(start + w.end) }));
    } else if (needWords) {
      warnings.push(`line ${l.id}: no word timings (${wordsPathFor(l.audio)}) — run "toonshorts words ${dir}"`);
    }
    t = start + dur;
    return { id: l.id, text: l.text, audio: l.audio, volume: l.volume ?? 1, start, end: r3(start + dur), dur: r3(dur), words };
  });
  const duration = r3(spec.duration ?? t + spec.tail);

  const atLines = makeAnchor(lines, []);
  const scenes = spec.scenes
    .map((s) => ({ ...s, start: Math.max(0, atLines(s.at)) }))
    .sort((a, b) => a.start - b.start);
  scenes[0].start = 0;
  scenes.forEach((s, i) => { s.end = scenes[i + 1]?.start ?? duration; });
  // transition into each scene: "in" (or legacy "cut"), else short.json "transition", else auto
  const AUTO_IN = ["whip", "push", "whip-right", "push"];
  const KNOWN = ["whip", "whip-left", "whip-right", "push", "iris", "fade", "cut"];
  scenes.forEach((s, i) => {
    if (i === 0) { s.inType = null; return; }
    let type = s.in ?? s.cut ?? spec.transition ?? "auto";
    if (type === "hard") type = "cut";
    if (type === "auto") type = AUTO_IN[(i - 1) % AUTO_IN.length];
    if (!KNOWN.includes(type)) throw new Error(`scene ${s.id}: unknown transition "${type}" (use ${KNOWN.join(", ")} or auto)`);
    s.inType = type;
  });
  for (const s of scenes) if (s.end - s.start < 0.5) warnings.push(`scene ${s.id} is only ${(s.end - s.start).toFixed(2)} s long`);

  return { dir, spec, lines, scenes, duration, at: makeAnchor(lines, scenes), warnings };
}
