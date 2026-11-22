// Sound design: finds free sounds by plain-word intent, measures where each one hits,
// and places every cue so its loudest moment lands one frame after the picture.
//
// short.json "cues":  [{ "at": "L2:phone", "sfx": "slide whistle", "vol": 0.5 },
//                      { "at": "0.3", "sfx": ["footstep", "gravel step"], "every": 0.36, "count": 9, "vol": 0.35 },
//                      { "at": "L2:filled", "sfx": "sand pour", "align": "onset", "len": 1.2 }]
// short.json "beds":  [{ "sfx": "river", "from": "0", "to": "s2", "vol": 0.1 }]   (looped, faded)
// short.json "sound": { "cutWhoosh": true, "captionPops": "hot" | "all" | "none", "riser": "s4:BUMP" }
//   cutWhoosh follows each scene's transition (whip/push -> whoosh, iris -> swish, cut/fade -> none);
//   caption pops skip moments that already have a sound; long sounds and beds duck 30% under the voice.
// short.json "music": { "file": "assets/music.mp3", "vol": 0.14 }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { env, cacheDir } from "./paths.mjs";
import { join, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { copyFileSync } from "node:fs";

// Shared library of every sound motionframes has found before (with its licence), so a new short
// reuses "whoosh" and "pop" instead of searching the web again. Override with MOTIONFRAMES_SOUNDS.
export const LIBRARY = env("SOUNDS") || cacheDir("sounds");
const libIndex = () => join(LIBRARY, "index.json");
function readLibrary() { try { return JSON.parse(readFileSync(libIndex(), "utf8")); } catch { return {}; } }
function saveToLibrary(dir, intent, rec) {
  try {
    mkdirSync(LIBRARY, { recursive: true });
    const lib = readLibrary(), name = `${slug(intent)}.mp3`;
    copyFileSync(join(dir, rec.file), join(LIBRARY, name));
    lib[intent] = { ...rec, file: name };
    writeFileSync(libIndex(), JSON.stringify(lib, null, 2) + "\n");
  } catch { /* library is a cache: never fail a build over it */ }
}

const HF = env("HF") || "hyperframes@0.9.74";
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const BLOCKED = /\bnc\b|non-?commercial|\bnd\b|no-?deriv/i;

// --- measuring -----------------------------------------------------------------
export function measure(file) {
  const SR = 8000, WIN = 80; // 10 ms windows
  const buf = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  const pcm = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  const env = [];
  for (let i = 0; i < pcm.length; i += WIN) {
    let m = 0; for (let j = i; j < Math.min(i + WIN, pcm.length); j++) m = Math.max(m, Math.abs(pcm[j]));
    env.push(m);
  }
  const mx = Math.max(...env, 1e-9);
  const onsetIdx = env.findIndex((v) => v >= 0.2 * mx);
  const peakIdx = env.indexOf(mx);
  return { onset: +(onsetIdx * WIN / SR).toFixed(3), peak: +(peakIdx * WIN / SR).toFixed(3), dur: +(pcm.length / SR).toFixed(3) };
}

// --- finding -------------------------------------------------------------------
function ledger(dir) {
  const p = join(dir, ".media", "manifest.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function lockPath(dir) { return join(dir, "sfx.lock.json"); }
export function readLock(dir) { return existsSync(lockPath(dir)) ? JSON.parse(readFileSync(lockPath(dir), "utf8")) : {}; }

function searchOnline(dir, intent) {
  const run = (args) => execFileSync("npx", ["-y", HF, "media-use", "resolve", "--type", "sfx", "--intent", intent, "--project", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
  let out;
  try { out = run([]); } catch (e) {
    const why = String(e.stderr || e.message);
    // media-use refuses to fetch when a similar sound is already cached: reuse the best-named candidate
    if (!/similar cached asset/i.test(why)) throw new Error(why.split("\n").filter((l) => /media-use|error/i.test(l)).slice(-2).join(" ") || why.slice(0, 200));
    const list = execFileSync("npx", ["-y", HF, "media-use", "resolve", "--candidates", "--type", "sfx", "--intent", intent, "--project", dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const words = intent.toLowerCase().split(/\s+/);
    const cands = [...list.matchAll(/--reuse\s+(\w+)\s*\n\s*\[\w+\]\s+(.+)/g)].map((m) => ({ sha: m[1], name: m[2].toLowerCase() }));
    const pick = cands.find((c) => words.every((w) => c.name.includes(w))) || cands.find((c) => words.some((w) => w.length > 3 && c.name.includes(w)));
    if (!pick) throw new Error(`only unrelated cached sounds exist and the online search is unavailable`);
    out = run(["--reuse", pick.sha]);
  }
  const m = out.match(/resolved\s+(\S+)\s+\S+\s+(.+?)\s+\(/);
  if (!m) throw new Error(`could not read media-use output: ${out.slice(0, 160)}`);
  const [, id, rel] = m;
  const rec = ledger(dir).find((r) => r.id === id) || {};
  const prov = rec.provenance || {};
  return { id, src: isAbsolute(rel) ? rel : join(dir, rel), license: String(prov.license || rec.license || "unknown"), credit: prov.credit || "", source: prov.source_url || "", title: rec.description || "" };
}

// project lock -> shared library -> online search (media-use). Failures are reported, not fatal:
// the build drops cues whose sound is missing and says which.
export function resolveSfx(dir, intents, log = console.log) {
  const lock = readLock(dir);
  const lib = readLibrary();
  const missing = [];
  mkdirSync(join(dir, "assets", "sfx"), { recursive: true });
  const save = () => { writeFileSync(lockPath(dir), JSON.stringify(lock, null, 2) + "\n"); writeCredits(dir, lock); };
  for (const intent of [...new Set(intents)]) {
    const file = `assets/sfx/${slug(intent)}.mp3`;
    if (lock[intent] && existsSync(join(dir, lock[intent].file))) { if (!lib[intent]) saveToLibrary(dir, intent, lock[intent]); continue; }
    if (lib[intent] && existsSync(join(LIBRARY, lib[intent].file)) && !BLOCKED.test(lib[intent].license)) {
      copyFileSync(join(LIBRARY, lib[intent].file), join(dir, file));
      lock[intent] = { ...lib[intent], file };
      log(`  sound "${intent}": from library (${lib[intent].license})`);
      save(); continue;
    }
    try {
      const r = searchOnline(dir, intent);
      if (BLOCKED.test(r.license)) throw new Error(`only found a ${r.license} sound (not allowed on monetised videos)`);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", r.src, "-ar", "48000", "-ac", "2", "-b:a", "192k", join(dir, file)]);
      lock[intent] = { file, id: r.id, ...measure(join(dir, file)), license: r.license, credit: r.credit, source: r.source, title: r.title };
      log(`  sound "${intent}": found online (${r.license})`);
      saveToLibrary(dir, intent, lock[intent]);
      save();
    } catch (e) {
      missing.push(intent);
      log(`  sound "${intent}": NOT FOUND (${String(e.message).slice(0, 140)})`);
    }
  }
  save();
  return { lock, missing };
}

export function writeCredits(dir, lock) {
  const rows = Object.entries(lock).map(([intent, s]) => ({ intent, ...s }));
  const needs = rows.filter((r) => !/^cc0|public ?domain|pdm/i.test(r.license));
  const md = [
    "# Sound credits", "",
    needs.length ? "Paste this block into the video description:" : "All sounds are CC0 / public domain: no credit required (credit is still kind).", "",
    ...needs.map((r) => `- ${r.credit || `${r.title} (${r.license})`}${r.source ? ` ${r.source}` : ""}`),
    "", "## Every sound in this short", "",
    "| intent | file | license | source |", "|---|---|---|---|",
    ...rows.map((r) => `| ${r.intent} | ${r.file} | ${r.license} | ${r.source} |`), "",
  ].join("\n");
  writeFileSync(join(dir, "SOUND-CREDITS.md"), md);
}

// --- planning ------------------------------------------------------------------
// Expands short.json cues + automatic cues into a flat list of [t, intent, vol, len, align].
export function planCues(model, captions) {
  const { spec, at, scenes } = model;
  const snd = { cutWhoosh: true, captionPops: "hot", ...(spec.sound || {}) };
  const list = [];
  const takes = (sfx, i) => (Array.isArray(sfx) ? sfx[i % sfx.length] : sfx);

  for (const c of spec.cues || []) {
    const t0 = at(c.at), n = c.count ?? 1;
    for (let i = 0; i < n; i++) {
      const jitter = n > 1 ? (i % 2 ? -0.04 : 0.04) * (c.vol ?? 0.4) : 0; // tiny level variation for repeats
      list.push({ t: t0 + i * (c.every ?? 0), sfx: takes(c.sfx, i), vol: +((c.vol ?? 0.4) + jitter).toFixed(3), len: c.len ?? (c.every ? +(c.every * 1.2).toFixed(2) : undefined), align: c.align || "peak" });
    }
  }
  // transition sounds follow the picture move: whip = fast whoosh peaking mid-move, push = whoosh, iris = swish
  const TSFX = { whip: "whoosh", "whip-left": "whoosh", "whip-right": "whoosh", push: "whoosh", iris: "swish", fade: null, cut: null };
  if (snd.cutWhoosh) scenes.slice(1).forEach((s) => {
    const sfx = TSFX[s.inType ?? "cut"]; if (!sfx) return;
    list.push({ t: s.inType === "iris" ? s.start + 0.1 : s.start, sfx, vol: s.inType === "push" ? 0.32 : 0.28, len: 0.9, align: "peak", auto: true });
  });
  if (snd.riser) list.push({ t: at(snd.riser) - 1.0, sfx: "riser", vol: 0.32, len: 1.0, align: "peak", auto: true });
  if (snd.captionPops !== "none") {
    const busy = (t) => list.some((c) => !c.auto && Math.abs(c.t - t) < 0.3);
    captions.filter((g) => snd.captionPops === "all" || g.hot).filter((g) => !busy(g.start))
      .forEach((g, i) => list.push({ t: g.start, sfx: i % 2 ? "bubble pop" : "pop", vol: 0.14, len: 0.3, align: "peak", auto: true }));
  }
  for (const b of spec.beds || []) list.push({ bed: true, from: at(b.from ?? 0), to: at(b.to ?? model.duration), sfx: b.sfx, vol: b.vol ?? 0.1 });
  return list;
}

// Turns planned cues into <audio> clips on non-overlapping lanes (tracks from firstTrack up).
export function placeCues(model, cues, lock, firstTrack = 3) {
  const F = 1 / model.spec.fps;
  const clips = [];
  // long sounds under the voice sit 30% lower so words stay clear (beds too)
  const duck = (t0, t1) => (model.lines.some((l) => l.start < t1 && l.end > t0) ? 0.7 : 1);
  for (const c of cues) {
    const s = lock[c.sfx];
    if (!s) continue; // missing sounds were reported by the sfx step
    const ms = Math.max(0, +(s.onset - 0.02).toFixed(3));
    if (c.bed) {
      // loop the bed by chaining copies with short overlaps; fade the ends
      const piece = Math.max(1, s.dur - ms - 0.3);
      for (let t = c.from; t < c.to - 0.2; t += piece) {
        const d = Math.min(piece + 0.3, c.to - t);
        clips.push({ start: t, sfx: c.sfx, file: s.file, vol: +(c.vol * duck(t, t + d)).toFixed(3), ms, dur: d, fadeIn: 0.3, fadeOut: 0.3 });
      }
      continue;
    }
    const start = c.align === "onset" ? c.t : c.t + F - (s.peak - ms);
    const left = s.dur - ms;
    const dur = Math.min(c.len ?? left, left);
    const vol = dur > 0.8 ? +(c.vol * duck(start, start + dur)).toFixed(3) : c.vol;
    clips.push({ start: Math.max(0, start), sfx: c.sfx, file: s.file, vol, ms, dur, fadeOut: dur > 1 ? 0.3 : 0 });
  }
  clips.sort((a, b) => a.start - b.start);
  const lanes = [];
  return clips.map((c, i) => {
    let lane = lanes.findIndex((end) => end <= c.start);
    if (lane < 0) { lanes.push(0); lane = lanes.length - 1; }
    lanes[lane] = c.start + c.dur;
    const f = (c.fadeIn ? ` data-fade-in="${c.fadeIn}"` : "") + (c.fadeOut ? ` data-fade-out="${c.fadeOut}"` : "");
    return `      <audio id="sfx${i + 1}" class="clip" src="${c.file}" data-start="${c.start.toFixed(3)}" data-duration="${c.dur.toFixed(3)}" data-media-start="${c.ms}" data-volume="${c.vol}"${f} data-track-index="${firstTrack + lane}"></audio>`;
  });
}

export function musicClip(model) {
  const m = model.spec.music;
  if (!m || !m.file) return "";
  return `      <audio id="music" class="clip" src="${m.file}" data-start="${m.start ?? 0}" data-duration="${model.duration}" data-media-start="${m.from ?? 0}" data-volume="${m.vol ?? 0.14}" data-fade-in="0.5" data-fade-out="1.2" data-track-index="3"></audio>`;
}

export const intentsOf = (cues) => [...new Set(cues.map((c) => c.sfx))];
