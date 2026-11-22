#!/usr/bin/env node
// motionframes: one spec (short.json) + scene files -> a finished vertical short, rendered by HyperFrames.
//
//   motionframes go      <dir> [--draft] [--no-render]   EVERYTHING: voice, words, sounds, build, check, preview, render, QA
//   motionframes story   <dir>                          score the script + shot plan: hook, turn, loop ending, pacing, shots
//   motionframes layout  <dir>                          headless check: captions over faces/art (auto-moved), overlaps, cut-offs
//   motionframes preview <dir>                          build + one still per scene -> snaps/preview/sheet.jpg
//   motionframes init    <dir> [--rig bean|stick]        scaffold short.json + scenes/
//   motionframes setup   [--agent claude|codex|gemini|other] [--test] [--clone]   one-time: tools, free voice, plugin, test
//   motionframes doctor                                 check node, ffmpeg, HyperFrames, voice, sound library
//   single steps: voice [--voice am_michael --speed 1 --force] | words [--force] | sfx | build | check
//                 stills [--at 1,5,9] | mix | render [--draft] | qa <file.mp4>
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, cpSync, rmSync, readdirSync } from "node:fs";
import { env, cacheDir, HF, hfArgs, cleanNpxEnv } from "./lib/paths.mjs";
import { setup as runSetup, manual } from "./lib/setup.mjs";
import { installClone, cloneInstalled, checkSample, cloneKey, cloneLines, CLONE_VENV } from "./lib/clone.mjs";
const require_fs = { readdirSync };
import { join, resolve, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { loadModel, readSpec, wordsPathFor } from "./lib/spec.mjs";
import { captionGroups, applyLayout } from "./lib/captions.mjs";
import { planCues, placeCues, resolveSfx, readLock, intentsOf, musicClip, LIBRARY } from "./lib/sfx.mjs";
import { compose } from "./lib/compose.mjs";
import { storyReport } from "./lib/story.mjs";
import { mixPreview, qaVideo, normalize } from "./lib/qa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const [cmd, ...argv] = process.argv.slice(2);
// setup and doctor need no folder: "motionframes setup --test" works
const dirArg = argv[0] && !argv[0].startsWith("--") ? argv.shift() : ["setup", "doctor"].includes(cmd) ? "." : undefined;
const rest = argv;
const flag = (name, dflt) => { const i = rest.indexOf(`--${name}`); return i < 0 ? dflt : rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : true; };
const log = (...a) => console.log(...a);
const VENV = cacheDir("kokoro");
const VPY = join(VENV, process.platform === "win32" ? join("Scripts", "python.exe") : join("bin", "python"));
const rel = (p) => { const r = relative(process.cwd(), p) || "."; return r.startsWith("../..") ? p : r; };
const secs = (ms) => (ms / 1000).toFixed(1) + "s";

// npm needs a writable cache for npx. Inside a sandbox ~/.npm is often read-only: fall back to a temp cache.
function npmEnv() {
  const env = cleanNpxEnv();
  if (existsSync(VPY) && !env.HYPERFRAMES_PYTHON) env.HYPERFRAMES_PYTHON = VPY;
  if (!env.npm_config_cache) {
    try { const p = join(homedir(), ".npm", "_cacache", "tmp"); mkdirSync(p, { recursive: true }); writeFileSync(join(p, ".motionframes-probe"), ""); }
    catch { env.npm_config_cache = join(tmpdir(), "motionframes-npm"); env.MOTIONFRAMES_NPM_FALLBACK = "1"; }
  }
  return env;
}
const ENV = npmEnv();

// Turns a failed HyperFrames call into the real reason plus what to do about it.
function explain(out) {
  const s = String(out || "");
  if (/EPERM|root-owned files|EACCES/.test(s) && /npm/.test(s)) return "npm cannot write its cache folder. Run outside the sandbox, or set npm_config_cache to a writable folder.";
  if (/ENOTFOUND|EAI_AGAIN|network/i.test(s)) return "no network: HyperFrames is downloaded by npx on first use.";
  if (/whisper|transcri/i.test(s) && /not found|No module/i.test(s)) return "local whisper is missing: run \"motionframes setup .\" once.";
  const lines = s.split("\n").map((l) => l.trim()).filter((l) => l && !/trust settings|^\[INFO\]|^npm (notice|warn)/.test(l));
  return lines.slice(-4).join(" | ").slice(0, 400) || "no output";
}
function hf(args, { cwd, quiet = true } = {}) {
  if (existsSync(VPY) && !process.env.HYPERFRAMES_PYTHON) ENV.HYPERFRAMES_PYTHON = VPY; // setup may have just installed it
  const r = spawnSync("npx", hfArgs(...args), { cwd, env: ENV, shell: process.platform === "win32", encoding: "utf8", maxBuffer: 1 << 28, stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit" });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status !== 0) { const e = new Error(`hyperframes ${args[0]} failed: ${explain(out)}`); e.out = out; throw e; }
  return out;
}

function writeSpec(dir, spec) {
  const raw = JSON.parse(readFileSync(join(dir, "short.json"), "utf8"));
  writeFileSync(join(dir, "short.json"), JSON.stringify({ ...raw, lines: spec.lines }, null, 2) + "\n");
}

// one sheet, frames in time order, 5 per row (HyperFrames splits big sets into several sheets)
function contactSheet(folder) {
  const { readdirSync } = require_fs;
  const frames = readdirSync(folder).filter((f) => /^frame-.*\.png$/.test(f)).sort();
  if (!frames.length) return null;
  const cols = Math.min(5, frames.length), rows = Math.ceil(frames.length / cols), out = join(folder, "sheet.jpg");
  const args = ["-v", "error", "-y"];
  frames.forEach((f) => args.push("-i", join(folder, f)));
  const pads = cols * rows - frames.length;
  const chain = frames.map((_, i) => `[${i}]scale=324:-1[f${i}]`).join(";") +
    (pads ? ";" + Array.from({ length: pads }, (_, k) => `color=c=#16181f:s=324x576:d=1[p${k}]`).join(";") : "") + ";" +
    frames.map((_, i) => `[f${i}]`).join("") + Array.from({ length: pads }, (_, k) => `[p${k}]`).join("") +
    `xstack=inputs=${cols * rows}:layout=${Array.from({ length: cols * rows }, (_, i) => `${(i % cols) * 324}_${Math.floor(i / cols) * 576}`).join("|")}[o]`;
  execFileSync("ffmpeg", [...args, "-filter_complex", chain, "-map", "[o]", "-frames:v", "1", "-q:v", "3", out]);
  return out;
}

function findChrome() {
  if (env("CHROME")) return env("CHROME");
  const base = join(homedir(), ".cache", "hyperframes", "chrome", "chrome-headless-shell");
  const found = [];
  try {
    for (const v of readdirSync(base)) for (const sub of readdirSync(join(base, v))) {
      const p = join(base, v, sub, "chrome-headless-shell"); if (existsSync(p)) found.push(p);
    }
  } catch {}
  if (!found.length) throw new Error(`no headless Chrome found in ${base}: run one "motionframes preview" first (HyperFrames downloads it), or set MOTIONFRAMES_CHROME`);
  return found.sort().pop();
}

const commands = {
  setup() {
    return runSetup({ hf, log, flag, rest, commands, VENV, VPY, root: resolve(HERE, "..") });
  },

  doctor() {
    const row = (ok, what, fix = "") => log(`  ${ok ? "ok  " : "MISS"} ${what}${ok || !fix ? "" : `  -> ${fix}`}`);
    row(Number(process.versions.node.split(".")[0]) >= 20, `node ${process.versions.node}`, "install Node 20+");
    const ff = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
    row(ff.status === 0, `ffmpeg ${(ff.stdout || "").split(" ")[2] || ""}`, manual("ffmpeg"));
    let ver = ""; try { ver = hf(["--version"]).trim().split("\n").pop(); } catch (e) { ver = ""; }
    row(!!ver, `HyperFrames ${ver || HF}`, "needs network once for npx");
    row(existsSync(VPY), "Kokoro voice", "motionframes setup");
    log(`  ${cloneInstalled() ? "ok  " : "opt "} voice clone (Chatterbox)${cloneInstalled() ? `: ${CLONE_VENV}` : ": not installed, added on first use or with \"motionframes setup --clone\""}`);
    let n = 0; try { n = Object.keys(JSON.parse(readFileSync(join(LIBRARY, "index.json"), "utf8"))).length; } catch {}
    row(true, `sound library: ${n} sounds in ${LIBRARY}`);
    if (ENV.MOTIONFRAMES_NPM_FALLBACK) row(true, `npm cache: using ${ENV.npm_config_cache} (~/.npm is read-only here)`);
    return "doctor done";
  },

  init(dir) {
    if (existsSync(join(dir, "short.json"))) throw new Error(`${rel(dir)}/short.json already exists`);
    const rig = flag("rig", "bean");
    cpSync(join(HERE, "..", "templates", "starter"), dir, { recursive: true });
    for (const f of ["s1.html", "s2.html"]) { const p = join(dir, "scenes", f); if (existsSync(p)) writeFileSync(p, readFileSync(p, "utf8").replaceAll("__RIG__", rig)); }
    return `scaffolded ${rel(dir)}: edit short.json (lines + scenes) and scenes/*.html, then "motionframes go ${rel(dir)}"`;
  },

  // Kokoro by default ("voice": "am_michael"); a free local clone with "voice": { "clone": "my-voice.wav" }.
  // Each generated line remembers which voice made it, so changing the voice re-voices those lines (and their
  // word timings). Audio you recorded yourself is never replaced.
  async voice(dir) {
    const spec = readSpec(dir);
    const v = spec.voice;
    const clone = v && typeof v === "object" && v.clone ? v : null;
    const kokoro = String(flag("voice", typeof v === "string" ? v : (v && v.kokoro) || "am_michael"));
    const speed = flag("speed", spec.speed || 1);
    const ref = clone ? checkSample(dir, clone.clone) : null;
    const key = clone ? cloneKey(ref, clone) : `kokoro:${kokoro}:${speed}`;
    mkdirSync(join(dir, "assets"), { recursive: true });
    const ours = (l) => l.voiced || l.audio === `assets/vo-${l.id}.wav`;
    const todo = spec.lines.filter((l) => flag("force", false) || !l.audio || !existsSync(join(dir, l.audio)) || (ours(l) && l.voiced !== key));
    if (!todo.length) return `${spec.lines.length} lines already have audio`;
    for (const l of todo) { const old = l.audio && join(dir, wordsPathFor(l.audio)); if (old && existsSync(old)) rmSync(old); }
    const audioOf = (l) => (l.audio && !ours(l) && !flag("force", false) ? l.audio : `assets/vo-${l.id}.wav`);
    if (clone) {
      installClone(log);
      log(`  voicing ${todo.length} line(s) with your cloned voice (${rel(ref)}): the first run downloads the model`);
      await cloneLines(ref, todo.map((l) => ({ id: l.id, text: l.text, out: resolve(dir, audioOf(l)) })), { exaggeration: clone.exaggeration ?? 0.5, log });
    } else {
      for (const l of todo) {
        log(`  voicing ${l.id} (${kokoro}): "${l.text.slice(0, 50)}${l.text.length > 50 ? "..." : ""}"`);
        try { hf(["tts", l.text, "--voice", kokoro, "--speed", String(speed), "-o", join(dir, audioOf(l))]); }
        catch (e) { throw new Error(`voice failed for ${l.id}: ${e.message}\n  First time? Run "motionframes setup" once, or record your own lines and set "audio".`); }
      }
    }
    const done = new Set(todo.map((l) => l.id));
    writeSpec(dir, { lines: spec.lines.map((l) => (done.has(l.id) ? { ...l, audio: audioOf(l), voiced: key } : l)) });
    return `${todo.length} line(s) voiced${clone ? " with the cloned voice" : ""}`;
  },

  words(dir) {
    const spec = readSpec(dir);
    let made = 0;
    for (const l of spec.lines) {
      if (!l.audio || !existsSync(join(dir, l.audio))) throw new Error(`line ${l.id} has no audio: run "motionframes voice ${rel(dir)}" or set "audio"`);
      const wp = join(dir, wordsPathFor(l.audio));
      if (existsSync(wp) && !flag("force", false)) continue;
      log(`  timing words: ${l.id}`);
      const work = join(tmpdir(), `motionframes-words-${l.id}-${process.pid}`);
      mkdirSync(work, { recursive: true });
      const out = hf(["transcribe", resolve(dir, l.audio), "--json", "-d", work]);
      const objs = out.split("\n").filter((x) => x.trim().startsWith("{")).map((x) => { try { return JSON.parse(x); } catch { return null; } });
      const res = objs.filter((o) => o && "ok" in o).pop() || {};
      if (!res.ok) throw new Error(`transcribe failed for ${l.id}: ${explain(out)}`);
      copyFileSync(res.transcriptPath, wp);
      made++;
    }
    return made ? `timed words for ${made} line(s)` : `all ${spec.lines.length} lines already timed`;
  },

  sfx(dir) {
    const model = loadModel(dir);
    const cues = planCues(model, captionGroups(model));
    const { lock, missing } = resolveSfx(dir, intentsOf(cues.filter((c) => c.sfx && !c.bed).concat(cues.filter((c) => c.bed))), (m) => log(m));
    const n = Object.keys(lock).length;
    if (missing.length) log(`  warn: ${missing.length} sound(s) not found, their cues are skipped: ${missing.join(", ")}`);
    return `${n} sounds ready (credits in SOUND-CREDITS.md)${missing.length ? `, ${missing.length} missing` : ""}`;
  },

  build(dir) {
    const model = loadModel(dir);
    const lp = join(dir, "layout.json");
    const captions = applyLayout(captionGroups(model), existsSync(lp) ? JSON.parse(readFileSync(lp, "utf8")) : null);
    const cues = planCues(model, captions);
    const lock = readLock(dir);
    const sfxClips = placeCues(model, cues, lock, 4);
    const html = compose(model, { captions, sfxClips, music: musicClip(model) });
    model.warnings.forEach((w) => log(`  warn: ${w}`));
    writeFileSync(join(dir, "index.html"), html);
    if (!existsSync(join(dir, "hyperframes.json"))) writeFileSync(join(dir, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" } }, null, 2) + "\n");
    const tr = model.scenes.slice(1).map((s) => s.inType);
    return `${model.duration}s, ${model.scenes.length} scenes (${[...new Set(tr)].join("/")}), ${captions.length} captions, ${sfxClips.length} sound clips`;
  },

  story(dir) {
    const { checks } = storyReport(dir);
    for (const c of checks) log(`  ${c.ok ? "ok  " : "FIX "} ${c.name.padEnd(14)} ${c.msg}`);
    const bad = checks.filter((c) => !c.ok).length;
    return `${checks.length - bad}/${checks.length} story checks pass${bad ? " (fix the FIX lines before rendering)" : ""}`;
  },

  // Opens the built short in headless Chrome, steps through it and checks the layout: captions over faces or key
  // art (moves those captions to a clear band and rebuilds), text on text, things cut off or under the buttons.
  layout(dir) {
    commands.build(dir);
    const chrome = findChrome();
    const url = "file://" + join(resolve(dir), "index.html").split("/").map(encodeURIComponent).join("/") + "?ts-audit";
    const r = spawnSync(chrome, ["--headless", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--window-size=1080,1920",
      "--virtual-time-budget=60000", "--run-all-compositor-stages-before-draw", "--dump-dom", url], { encoding: "utf8", maxBuffer: 1 << 28, timeout: 180000 });
    const m = (r.stdout || "").match(/<script type="application\/json" id="ts-audit">([\s\S]*?)<\/script>/);
    if (!m) throw new Error(`layout audit produced no result (is GSAP reachable from the network?): ${explain(r.stderr)}`);
    const res = JSON.parse(m[1]);
    const lp = join(dir, "layout.json");
    const before = existsSync(lp) ? readFileSync(lp, "utf8") : "";
    const prevHide = before ? (JSON.parse(before).hide || []) : [];
    const hide = [...prevHide, ...res.hide.filter((h) => !prevHide.some((p) => p.start === h.start && p.text === h.text))];
    const after = JSON.stringify({ captions: res.captions.map(({ start, text, top }) => ({ start, text, top })), hide }, null, 2) + "\n";
    const moved = res.captions.filter((c) => c.moved);
    if (after !== before) { writeFileSync(lp, after); commands.build(dir); }
    writeFileSync(join(dir, "layout-report.json"), JSON.stringify(res.issues, null, 2) + "\n");
    const by = {}; for (const i of res.issues) (by[i.kind] = by[i.kind] || []).push(i);
    for (const [k, list] of Object.entries(by)) if (k !== "duplicate") for (const i of list.slice(0, 6)) log(`  warn  [${k}] ${i.t.toFixed(1)}s  ${i.msg}`);
    for (const [k, list] of Object.entries(by)) if (list.length > 6) log(`  ...   [${k}] ${list.length - 6} more in layout-report.json`);
    const cap = (by.caption || []).length;
    if (cap) throw new Error(`${cap} caption(s) cover a face or key art in every band: move the art or the character, then run again`);
    const dup = (by.duplicate || []).length, other = res.issues.length - dup;
    return `${res.samples} frames checked, ${moved.length} caption(s) moved clear of faces/art, ${dup} duplicate caption(s) dropped, ${other} warning(s)`;
  },

  check(dir) {
    if (!existsSync(join(dir, "index.html"))) throw new Error(`no index.html yet: run "motionframes build ${rel(dir)}" first`);
    const r = spawnSync("npx", hfArgs("check", "--json"), { cwd: dir, env: ENV, encoding: "utf8", maxBuffer: 1 << 26 });
    const out = r.stdout || "";
    let j; try { j = JSON.parse(out.slice(out.indexOf("{"))); } catch { throw new Error(`hyperframes check gave no report: ${explain(out + r.stderr)}`); }
    const sections = ["lint", "runtime", "layout", "motion", "contrast", "craft", "audio"].filter((k) => j[k]);
    const NOISE = ["composition_file_too_large", "timeline_track_too_dense", "nested_structure_needs_subcomposition"]; // expected for one-file shorts
    const finds = sections.flatMap((k) => (j[k].findings || []).map((f) => ({ k, ...f }))).filter((f) => !NOISE.includes(f.code));
    const errs = finds.filter((f) => f.severity === "error"), warns = finds.filter((f) => f.severity === "warning");
    for (const f of [...errs, ...warns]) log(`  ${f.severity === "error" ? "ERROR" : "warn "} [${f.k}/${f.code}] ${(f.message || "").slice(0, 160)}`);
    if (!j.ok) throw new Error(errs.length ? "fix the errors above, then build again" : `check failed without findings: ${explain(out + r.stderr)}`);
    return `${errs.length} errors, ${warns.length} warnings`;
  },

  stills(dir) {
    const at = flag("at", null);
    rmSync(join(dir, "snaps", "stills"), { recursive: true, force: true });
    hf(["snapshot", ...(at ? ["--at", String(at)] : ["--frames", "8"]), "-o", "snaps/stills"], { cwd: dir });
    return `contact sheet: ${rel(contactSheet(join(dir, "snaps", "stills")))}`;
  },

  preview(dir) {
    commands.build(dir);
    const model = loadModel(dir);
    const at = model.scenes.map((s) => +(s.start + Math.min(s.end - s.start, 6) * 0.6).toFixed(2));
    rmSync(join(dir, "snaps", "preview"), { recursive: true, force: true });
    hf(["snapshot", "--at", at.join(","), "-o", "snaps/preview"], { cwd: dir });
    return `one still per scene: ${rel(contactSheet(join(dir, "snaps", "preview")))}`;
  },

  mix(dir) {
    mkdirSync(join(dir, "snaps"), { recursive: true });
    const r = mixPreview(dir);
    if (r.truePeak > -1) log("  warn: mix clips above -1 dBFS: lower the loudest cues");
    return `${r.clips} clips, ${r.lufs} LUFS before normalising, peak ${r.truePeak} dBFS`;
  },

  async render(dir) {
    mkdirSync(join(dir, "renders"), { recursive: true });
    const raw = join(dir, "renders", "raw.mp4");
    const q = flag("draft", false) ? "draft" : String(flag("quality", "delivery"));
    const tty = process.stdout.isTTY;
    const once = () => new Promise((ok) => {
      let shown = -1, tail = "";
      const p = spawn("npx", hfArgs("render", "-o", raw, "-q", q), { cwd: dir, env: ENV });
      const onData = (b) => {
        const s = b.toString(); tail = (tail + s).slice(-6000);
        const ms = [...s.matchAll(/(\d{1,3})%/g)]; if (!ms.length) return;
        const pct = Math.min(100, Number(ms.at(-1)[1])), step = Math.floor(pct / 10) * 10;
        if (step > shown) { shown = step; tty ? process.stdout.write(`\r  rendering ${"#".repeat(step / 5).padEnd(20, ".")} ${step}%`) : log(`  rendering ${step}%`); }
      };
      p.stdout.on("data", onData); p.stderr.on("data", onData);
      p.on("close", (code) => { if (tty) process.stdout.write("\n"); ok({ code, tail }); });
    });
    let r = await once();
    // the headless browser sometimes drops its local connection: one clean retry fixes it
    if (r.code !== 0 && /CAPTURE|ERR_SOCKET|ERR_CONNECTION|Target closed|timeout/i.test(r.tail)) { log("  render: browser capture dropped, retrying once"); r = await once(); }
    if (r.code !== 0) throw new Error(`render failed: ${explain(r.tail)}`);
    const final = join(dir, "renders", `${basename(resolve(dir))}.mp4`);
    normalize(raw, final);
    rmSync(raw, { force: true });
    return `${rel(final)} (${q})`;
  },

  qa(dir, file = rest[0]) {
    if (!file) throw new Error("usage: motionframes qa <dir> <file.mp4>");
    const r = qaVideo(dir, file);
    if (!r.pass) { r.issues.forEach((i) => log(`  - ${i}`)); throw new Error(`QA found ${r.issues.length} issue(s): see ${rel(join(dir, "qa-report.md"))}`); }
    return `PASS: ${r.lufs} LUFS, peak ${r.truePeak} dBFS, no black/frozen/silent stretches`;
  },

  async go(dir) {
    const steps = ["voice", "words", "story", "sfx", "build", "layout", "check", "preview", "mix"];
    if (!flag("no-render", false)) steps.push("render", "qa");
    log(`motionframes go ${rel(dir)}`);
    const times = [];
    const t0 = Date.now();
    for (const [i, step] of steps.entries()) {
      const label = `${i + 1}/${steps.length} ${step.padEnd(7)}`;
      if (process.stdout.isTTY) process.stdout.write(`  ${label} ...`); else log(`  ${label} ...`);
      const s = Date.now();
      let msg;
      try { msg = step === "qa" ? commands.qa(dir, join(dir, "renders", `${basename(resolve(dir))}.mp4`)) : await commands[step](dir); }
      catch (e) { log(`  ${label} FAILED after ${secs(Date.now() - s)}`); throw e; }
      times.push([step, Date.now() - s]);
      if (process.stdout.isTTY) process.stdout.write("\r\x1b[2K");
      log(`  ${label} done ${secs(Date.now() - s).padStart(6)}  ${msg}`);
    }
    writeFileSync(join(dir, "snaps", "timings.json"), JSON.stringify(Object.fromEntries(times.map(([k, v]) => [k, +(v / 1000).toFixed(1)])), null, 2) + "\n");
    return `finished in ${secs(Date.now() - t0)}${flag("no-render", false) ? " (no render: look at the preview, then run go again without --no-render)" : ""}`;
  },

  // kept for older notes: everything except render
  make(dir) { rest.push("--no-render"); return commands.go(dir); },
};

if (!commands[cmd] || !dirArg) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(cmd ? 1 : 0);
}
try {
  const msg = await commands[cmd](resolve(dirArg));
  if (msg) log(cmd === "go" ? `motionframes: ${msg}` : `  ${cmd}: ${msg}`);
} catch (e) {
  console.error(`motionframes ${cmd}: ${e.message}`);
  process.exit(1);
}
