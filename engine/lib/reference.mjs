// reference study: a link or a video file -> shot rhythm, pace, opening words and a contact sheet.
// The agent reads reference/reference.md and looks at reference/sheet.jpg, then borrows the FORMAT only.
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { tmpdir } from "node:os";

const MAX_STUDY = 180;      // seconds of the reference that get studied
const MAX_FRAMES = 15;      // stills on the contact sheet
const CUT_SCORE = 0.08;     // ffmpeg scene-change score that counts as a cut (animation cuts are soft)
const MIN_SHOT = 0.8;       // cuts closer than this are one cut
const MIN_STILLS = 10;      // fewer shots than this: the sheet samples evenly through time instead

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
const r1 = (n) => Math.round(n * 10) / 10;

function fetchLink(url, out, VPY, log) {
  const format = ["-f", "bv*[height<=720]+ba/b[height<=720]/b", "--merge-output-format", "mp4", "--no-playlist", "--quiet", "--no-warnings", "-o", out, url];
  // a fresh yt-dlp in the MotionFrames Python first (old system copies are often blocked), then one on PATH
  const tries = [];
  // python.org builds on macOS ship without root certificates: point Python at the system bundle
  const sslEnv = !process.env.SSL_CERT_FILE && existsSync("/etc/ssl/cert.pem") ? { ...process.env, SSL_CERT_FILE: "/etc/ssl/cert.pem" } : process.env;
  if (existsSync(VPY)) {
    if (run(VPY, ["-c", "import yt_dlp"]).status !== 0) { log("  adding the video fetcher (yt-dlp) to the MotionFrames Python"); run(VPY, ["-m", "pip", "install", "-q", "-U", "--disable-pip-version-check", "yt-dlp"], { timeout: 180000, env: sslEnv }); }
    tries.push([VPY, ["-m", "yt_dlp", ...format]]);
  }
  tries.push(["yt-dlp", format]);
  let why = "no video fetcher found";
  for (const [cmd, args] of tries) {
    const r = run(cmd, args, { timeout: 300000, env: sslEnv });
    if (r.status === 0 && existsSync(out)) return;
    if (r.stderr || r.error) why = String(r.stderr || r.error.message).trim().split("\n").pop().slice(0, 200);
  }
  throw new Error(`could not fetch that link (${why}). Save the video to this computer and give the file instead: motionframes reference <dir> <file.mp4>`);
}

function cutTimes(file, dur) {
  const r = run("ffmpeg", ["-hide_banner", "-t", String(dur), "-i", file, "-vf", `select='gt(scene,${CUT_SCORE})',showinfo`, "-an", "-f", "null", "-"]);
  const times = [...String(r.stderr).matchAll(/pts_time:([\d.]+)/g)].map((m) => Number(m[1]));
  const cuts = [];
  for (const t of times) if (t > MIN_SHOT && t < dur - MIN_SHOT && (!cuts.length || t - cuts[cuts.length - 1] >= MIN_SHOT)) cuts.push(t);
  return cuts;
}

function sheet(file, shots, folder) {
  const step = Math.max(1, Math.ceil(shots.length / MAX_FRAMES));
  const end = shots[shots.length - 1][1];
  const picks = shots.length >= MIN_STILLS ? shots.filter((_, i) => i % step === 0).slice(0, MAX_FRAMES)
    : Array.from({ length: MIN_STILLS }, (_, i) => [(i * end) / MIN_STILLS, ((i + 1) * end) / MIN_STILLS]);
  picks.forEach(([a, b], i) => execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String((a + b) / 2), "-i", file, "-frames:v", "1",
    "-vf", "scale=324:576:force_original_aspect_ratio=decrease,pad=324:576:(ow-iw)/2:(oh-ih)/2:color=#16181f", join(folder, `ref-${String(i).padStart(2, "0")}.jpg`)]));
  const cols = Math.min(5, picks.length), rows = Math.ceil(picks.length / cols), out = join(folder, "sheet.jpg");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-i", join(folder, "ref-%02d.jpg"), "-vf", `tile=${cols}x${rows}:color=#16181f`, "-frames:v", "1", "-q:v", "3", out]);
  for (const f of readdirSync(folder)) if (/^ref-\d\d\.jpg$/.test(f)) rmSync(join(folder, f));
  return { out, times: picks.map(([a, b]) => r1((a + b) / 2)) };
}

function speech(file, dur, hf, log) {
  const work = join(tmpdir(), `motionframes-ref-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const wav = join(work, "ref.wav");
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", "-t", String(dur), "-i", file, "-vn", "-ac", "1", "-ar", "16000", wav]);
    const out = hf(["transcribe", wav, "--json", "-d", work]);
    const res = out.split("\n").filter((x) => x.trim().startsWith("{")).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter((o) => o && "ok" in o).pop() || {};
    if (!res.ok) return null;
    const j = JSON.parse(readFileSync(res.transcriptPath, "utf8"));
    const words = (j.words || j).map((w) => ({ text: w.text || w.word, start: w.start, end: w.end })).filter((w) => w.text);
    if (words.length < 5) return null;
    const firstStop = words.findIndex((w, i) => i >= 3 && /[.?!]$/.test(w.text));
    const talk = words[words.length - 1].end - words[0].start;
    return { words: words.length, wpm: Math.round((words.length / talk) * 60), firstWordAt: r1(words[0].start),
      opening: words.slice(0, firstStop > 0 && firstStop < 22 ? firstStop + 1 : 14).map((w) => w.text).join(" "), text: words.map((w) => w.text).join(" ") };
  } catch (e) { log(`  speech not read (${String(e.message).slice(0, 80)}): shots and frames still studied`); return null; }
}

export function reference(dir, src, { hf, log, VPY }) {
  if (!src) throw new Error('give a link or a video file: motionframes reference <dir> <link-or-file>');
  const folder = join(dir, "reference");
  mkdirSync(folder, { recursive: true });
  const file = join(folder, "reference.mp4");
  const isLink = /^https?:\/\//i.test(src);
  if (isLink) { if (existsSync(file)) rmSync(file); log("  fetching the reference video"); fetchLink(src, file, VPY, log); }
  else { if (!existsSync(resolve(src))) throw new Error(`no such file: ${src}`); copyFileSync(resolve(src), file); }

  const full = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
  if (!(full > 1)) throw new Error("that file has no readable video");
  const dur = Math.min(full, MAX_STUDY);
  log("  finding the cuts");
  const cuts = cutTimes(file, dur);
  const edges = [0, ...cuts, dur], shots = edges.slice(0, -1).map((a, i) => [a, edges[i + 1]]);
  const lens = shots.map(([a, b]) => b - a).sort((a, b) => a - b);
  const sh = sheet(file, shots, folder);
  log("  reading the speech");
  const sp = speech(file, dur, hf, log);

  const data = { source: isLink ? src : "local file", seconds: r1(full), studiedSeconds: r1(dur), shots: shots.length, averageShot: r1(dur / shots.length), medianShot: r1(lens[Math.floor(lens.length / 2)]),
    shortestShot: r1(lens[0]), longestShot: r1(lens[lens.length - 1]), firstCutAt: cuts.length ? r1(cuts[0]) : null, cutTimes: cuts.map(r1), sheetTimes: sh.times, speech: sp };
  writeFileSync(join(folder, "reference.json"), JSON.stringify(data, null, 2) + "\n");
  writeFileSync(join(folder, "reference.md"), [
    "# Reference study", "",
    `- Source: ${data.source}`,
    `- Length: ${data.seconds} s${full > dur ? ` (first ${dur} s studied)` : ""}`,
    `- Shots: ${data.shots}, one about every ${data.averageShot} s (median ${data.medianShot} s, shortest ${data.shortestShot} s, longest ${data.longestShot} s)`,
    `- First cut: ${data.firstCutAt == null ? "none found" : `${data.firstCutAt} s`}`,
    sp ? `- Speech: ${sp.words} words at about ${sp.wpm} words a minute, first word at ${sp.firstWordAt} s` : "- Speech: not readable (music only, or no voice)",
    sp ? `- Opens with: "${sp.opening}"` : "",
    `- Stills: reference/sheet.jpg, in time order at ${sh.times.join(", ")} s. LOOK at it for caption size and position, framing, colour and how full the frame is.`,
    "", "## Borrow the format, never the content", "",
    "Match: total length, shot rhythm, speaking pace, the shape of the hook, caption density and placement, how often something new appears.",
    "Never copy: the characters, the story, the words, the art, the logo or the channel's look. Write an original story with an original character.",
    "Cuts are found by picture change, so slow camera moves inside one shot are not counted and hard flashes may be.",
    sp ? `\n## What was said (for structure only, do not reuse the wording)\n\n${sp.text}` : "", ""].filter((l) => l !== "").join("\n") + "\n");
  return `${data.seconds} s, ${data.shots} shots (one about every ${data.averageShot} s)${sp ? `, ${sp.wpm} words a minute` : ""}: read reference/reference.md and look at reference/sheet.jpg`;
}
