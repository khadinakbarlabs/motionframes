// Sound design: finds free sounds by plain-word intent, measures where each one hits,
// and places every cue so its loudest moment lands one frame after the picture.
//
// short.json "cues":  [{ "at": "L2:phone", "sfx": "slide whistle", "vol": 0.5 },
//                      { "at": "0.3", "sfx": ["footstep", "gravel step"], "every": 0.36, "count": 9, "vol": 0.35 },
//                      { "at": "L2:filled", "sfx": "sand pour", "align": "onset", "len": 1.2 }]
// short.json "beds":  [{ "sfx": "river", "from": "0", "to": "s2", "vol": 0.1 }]   (looped, faded)
// short.json "sound": { "cutWhoosh": true, "captionPops": "hot" | "all" | "none", "riser": "s4:BUMP" }
// short.json "music": { "file": "assets/music.mp3", "vol": 0.14 }
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";

const HF = process.env.TOONSHORTS_HF || "hyperframes@0.9.74";
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

export function resolveSfx(dir, intents, log = console.log) {
  const lock = readLock(dir);
  mkdirSync(join(dir, "assets", "sfx"), { recursive: true });
  for (const intent of [...new Set(intents)]) {
    if (lock[intent] && existsSync(join(dir, lock[intent].file))) continue;
    log(`  finding sound: "${intent}"`);
    let out;
    try {
      out = execFileSync("npx", ["-y", HF, "media-use", "resolve", "--type", "sfx", "--intent", intent, "--project", dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
      throw new Error(`no sound found for "${intent}": ${(e.stderr || e.message).toString().slice(0, 300)}\n  Try simpler words ("pop", "splash", "whoosh").`);
    }
    const m = out.match(/resolved\s+(\S+)\s+\S+\s+(.+?)\s+\(/);
    if (!m) throw new Error(`could not read media-use output for "${intent}": ${out.slice(0, 200)}`);
    const [, id, rel] = m;
    const rec = ledger(dir).find((r) => r.id === id) || {};
    const prov = rec.provenance || {};
    const license = String(prov.license || rec.license || "unknown");
    if (BLOCKED.test(license)) throw new Error(`"${intent}" resolved to a ${license} sound (not allowed on monetized videos). Re-word the intent.`);
    const src = isAbsolute(rel) ? rel : join(dir, rel);
    const file = `assets/sfx/${slug(intent)}.mp3`;
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", src, "-ar", "48000", "-ac", "2", "-b:a", "192k", join(dir, file)]);
    lock[intent] = { file, id, ...measure(join(dir, file)), license, credit: prov.credit || "", source: prov.source_url || "", title: rec.description || "" };
  }
  writeFileSync(lockPath(dir), JSON.stringify(lock, null, 2) + "\n");
  writeCredits(dir, lock);
  return lock;
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
      list.push({ t: t0 + i * (c.every ?? 0), sfx: takes(c.sfx, i), vol: +((c.vol ?? 0.4) + jitter).toFixed(3), len: c.len, align: c.align || "peak" });
    }
  }
  if (snd.cutWhoosh) scenes.slice(1).forEach((s, i) => list.push({ t: s.start, sfx: i % 2 ? "swish" : "whoosh", vol: 0.3, len: 1.3, align: "peak" }));
  if (snd.riser) list.push({ t: at(snd.riser) - 1.0, sfx: "riser", vol: 0.32, len: 1.0, align: "peak" });
  if (snd.captionPops !== "none") {
    captions.filter((g) => snd.captionPops === "all" || g.hot).forEach((g, i) => list.push({ t: g.start, sfx: i % 2 ? "bubble pop" : "pop", vol: 0.16, len: 0.3, align: "peak" }));
  }
  for (const b of spec.beds || []) list.push({ bed: true, from: at(b.from ?? 0), to: at(b.to ?? model.duration), sfx: b.sfx, vol: b.vol ?? 0.1 });
  return list;
}

// Turns planned cues into <audio> clips on non-overlapping lanes (tracks from firstTrack up).
export function placeCues(model, cues, lock, firstTrack = 3) {
  const F = 1 / model.spec.fps;
  const clips = [];
  for (const c of cues) {
    const s = lock[c.sfx];
    if (!s) throw new Error(`sound "${c.sfx}" is not resolved yet: run "toonshorts sfx ${model.dir}"`);
    const ms = Math.max(0, +(s.onset - 0.02).toFixed(3));
    if (c.bed) {
      // loop the bed by chaining copies with short overlaps; fade the ends
      const piece = Math.max(1, s.dur - ms - 0.3);
      for (let t = c.from; t < c.to - 0.2; t += piece) {
        const d = Math.min(piece + 0.3, c.to - t);
        clips.push({ start: t, sfx: c.sfx, file: s.file, vol: c.vol, ms, dur: d, fadeIn: 0.3, fadeOut: 0.3 });
      }
      continue;
    }
    const start = c.align === "onset" ? c.t : c.t + F - (s.peak - ms);
    const left = s.dur - ms;
    const dur = Math.min(c.len ?? left, left);
    clips.push({ start: Math.max(0, start), sfx: c.sfx, file: s.file, vol: c.vol, ms, dur, fadeOut: dur > 1 ? 0.3 : 0 });
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
