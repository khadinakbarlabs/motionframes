#!/usr/bin/env node
// toonshorts: one spec (short.json) + scene files -> a finished vertical short, rendered by HyperFrames.
//
//   node toonshorts.mjs setup  .                         one-time: install the free local voice (Kokoro) into ~/.cache/toonshorts
//   node toonshorts.mjs init   <dir> [--rig stick|bean]   scaffold short.json + scenes/
//   node toonshorts.mjs voice  <dir> [--voice am_michael] [--speed 1] [--force]   free local voice (Kokoro) for lines with no audio
//   node toonshorts.mjs words  <dir> [--force]           word timings for every line (local whisper)
//   node toonshorts.mjs sfx    <dir>                     find + measure every sound the spec asks for (free, logged licences)
//   node toonshorts.mjs build  <dir>                     write index.html
//   node toonshorts.mjs check  <dir>                     HyperFrames lint
//   node toonshorts.mjs stills <dir> [--at 1,5,9]        snapshot frames to look at
//   node toonshorts.mjs mix    <dir>                     audio-only preview + loudness (no render)
//   node toonshorts.mjs render <dir> [--quality draft]   render mp4, normalise to -14 LUFS, run qa
//   node toonshorts.mjs qa     <dir> <file.mp4>          black / frozen / silence / loudness checks
//   node toonshorts.mjs make   <dir>                     voice + words + sfx + build + check + mix (everything but render)
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, cpSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { loadModel, readSpec, wordsPathFor } from "./lib/spec.mjs";
import { captionGroups } from "./lib/captions.mjs";
import { planCues, placeCues, resolveSfx, readLock, intentsOf, musicClip } from "./lib/sfx.mjs";
import { compose } from "./lib/compose.mjs";
import { mixPreview, qaVideo, normalize } from "./lib/qa.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const HF = process.env.TOONSHORTS_HF || "hyperframes@0.9.74";
const [cmd, dirArg, ...rest] = process.argv.slice(2);
const flag = (name, dflt) => { const i = rest.indexOf(`--${name}`); return i < 0 ? dflt : rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[i + 1] : true; };
const log = (...a) => console.log(...a);
const VENV = join(homedir(), ".cache", "toonshorts", "kokoro");
const VPY = join(VENV, "bin", "python");
const hfEnv = () => (existsSync(VPY) && !process.env.HYPERFRAMES_PYTHON ? { ...process.env, HYPERFRAMES_PYTHON: VPY } : process.env);
const hf = (args, opts = {}) => execFileSync("npx", ["-y", HF, ...args], { stdio: "inherit", env: hfEnv(), ...opts });

function writeSpec(dir, spec) {
  const raw = JSON.parse(readFileSync(join(dir, "short.json"), "utf8"));
  writeFileSync(join(dir, "short.json"), JSON.stringify({ ...raw, lines: spec.lines }, null, 2) + "\n");
}

const commands = {
  setup() {
    if (existsSync(VPY)) { log(`  voice runtime already installed: ${VENV}`); return; }
    log(`  installing Kokoro (free local voice) into ${VENV} ...`);
    mkdirSync(dirname(VENV), { recursive: true });
    execFileSync("python3", ["-m", "venv", VENV], { stdio: "inherit" });
    execFileSync(VPY, ["-m", "pip", "install", "-q", "kokoro-onnx", "soundfile"], { stdio: "inherit" });
    log("  done: \"toonshorts voice\" now works offline");
  },

  init(dir) {
    if (existsSync(join(dir, "short.json"))) throw new Error(`${dir}/short.json already exists`);
    const rig = flag("rig", "stick");
    cpSync(join(HERE, "..", "templates", "starter"), dir, { recursive: true });
    const p = join(dir, "scenes", "s1.html");
    writeFileSync(p, readFileSync(p, "utf8").replaceAll("__RIG__", rig));
    log(`scaffolded ${dir}: edit short.json (lines + scenes), write scenes/*.html, then "toonshorts make ${dir}"`);
  },

  voice(dir) {
    const spec = readSpec(dir);
    const voice = flag("voice", spec.voice || "am_michael"), speed = flag("speed", spec.speed || 1);
    mkdirSync(join(dir, "assets"), { recursive: true });
    const lines = spec.lines.map((l) => {
      if (l.audio && existsSync(join(dir, l.audio)) && !flag("force", false)) return l;
      const audio = l.audio || `assets/vo-${l.id}.wav`;
      log(`  voicing ${l.id} (${voice}): "${l.text.slice(0, 60)}${l.text.length > 60 ? "..." : ""}"`);
      try {
        hf(["tts", l.text, "--voice", String(voice), "--speed", String(speed), "-o", join(dir, audio)], { stdio: ["ignore", "ignore", "inherit"] });
      } catch {
        throw new Error(`voice failed for ${l.id}. First time? Run "toonshorts setup ." once (installs the free Kokoro voice), or record your own lines and set "audio".`);
      }
      return { ...l, audio };
    });
    writeSpec(dir, { lines });
  },

  words(dir) {
    const spec = readSpec(dir);
    for (const l of spec.lines) {
      if (!l.audio || !existsSync(join(dir, l.audio))) throw new Error(`line ${l.id} has no audio: run "toonshorts voice ${dir}" or set "audio"`);
      const wp = join(dir, wordsPathFor(l.audio));
      if (existsSync(wp) && !flag("force", false)) continue;
      log(`  timing words: ${l.id}`);
      const work = join(tmpdir(), `toonshorts-words-${l.id}-${process.pid}`);
      mkdirSync(work, { recursive: true });
      const out = execFileSync("npx", ["-y", HF, "transcribe", resolve(dir, l.audio), "--json", "-d", work], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      const res = JSON.parse(out.trim().split("\n").filter((x) => x.startsWith("{")).pop());
      if (!res.ok) throw new Error(`transcribe failed for ${l.id}: ${out.slice(0, 200)}`);
      copyFileSync(res.transcriptPath, wp);
    }
  },

  sfx(dir) {
    const model = loadModel(dir);
    const cues = planCues(model, captionGroups(model));
    const lock = resolveSfx(dir, intentsOf(cues.filter((c) => c.sfx)), log);
    log(`  ${Object.keys(lock).length} sounds locked in sfx.lock.json; credits in SOUND-CREDITS.md`);
  },

  build(dir) {
    const model = loadModel(dir);
    model.warnings.forEach((w) => log(`  warn: ${w}`));
    const captions = captionGroups(model);
    const cues = planCues(model, captions);
    const lock = readLock(dir);
    const missing = intentsOf(cues).filter((i) => !lock[i]);
    if (missing.length) throw new Error(`sounds not found yet (${missing.join(", ")}): run "toonshorts sfx ${dir}"`);
    const sfxClips = placeCues(model, cues, lock, 4);
    const html = compose(model, { captions, sfxClips, music: musicClip(model) });
    writeFileSync(join(dir, "index.html"), html);
    if (!existsSync(join(dir, "hyperframes.json"))) writeFileSync(join(dir, "hyperframes.json"), JSON.stringify({ paths: { assets: "assets" } }, null, 2) + "\n");
    log(`  built index.html: ${model.duration}s, ${model.scenes.length} scenes, ${model.lines.length} lines, ${captions.length} captions, ${sfxClips.length} sound clips`);
  },

  check(dir) {
    let out;
    try { out = hf(["check", "--json"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
    catch (e) { out = e.stdout || ""; }
    const r = JSON.parse(out.slice(out.indexOf("{")));
    const sections = ["lint", "runtime", "layout", "motion", "contrast", "craft", "audio"].filter((k) => r[k]);
    const finds = sections.flatMap((k) => (r[k].findings || []).map((f) => ({ k, ...f })));
    const errs = finds.filter((f) => f.severity === "error"), warns = finds.filter((f) => f.severity === "warning");
    log(`  check: ${r.ok ? "OK" : "FAILED"}, ${errs.length} error(s), ${warns.length} warning(s)`);
    for (const f of [...errs, ...warns]) log(`  ${f.severity === "error" ? "ERROR" : "warn "} [${f.k}/${f.code}] ${(f.message || "").slice(0, 180)}`);
    if (!r.ok) throw new Error("fix the errors above, then build again");
  },

  stills(dir) {
    const at = flag("at", null);
    hf(["snapshot", ...(at ? ["--at", String(at)] : ["--frames", "8"]), "-o", "snaps/stills"], { cwd: dir });
  },

  mix(dir) {
    mkdirSync(join(dir, "snaps"), { recursive: true });
    const r = mixPreview(dir);
    log(`  mix preview ${r.file}: ${r.clips} clips, ${r.lufs} LUFS, true peak ${r.truePeak} dBFS (render normalises to -14 LUFS)`);
    if (r.truePeak > -1) log("  warn: mix clips above -1 dBFS: lower the loudest cues");
  },

  render(dir) {
    mkdirSync(join(dir, "renders"), { recursive: true });
    const raw = join(dir, "renders", "raw.mp4");
    hf(["render", "-o", raw, "-q", String(flag("quality", "delivery"))], { cwd: dir });
    const final = join(dir, "renders", `${basename(resolve(dir))}.mp4`);
    normalize(raw, final);
    log(`  rendered ${final}`);
    commands.qa(dir, final);
  },

  qa(dir, file = rest[0]) {
    if (!file) throw new Error("usage: toonshorts qa <dir> <file.mp4>");
    const r = qaVideo(dir, file);
    log(r.pass ? "  QA PASS" : `  QA: ${r.issues.length} issue(s)\n  - ${r.issues.join("\n  - ")}`);
    log(`  report: ${join(dir, "qa-report.md")}`);
  },

  make(dir) {
    for (const step of ["voice", "words", "sfx", "build", "check", "mix"]) { log(`> ${step}`); commands[step](dir); }
  },
};

if (!commands[cmd] || !dirArg) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(cmd ? 1 : 0);
}
try {
  commands[cmd](resolve(dirArg));
} catch (e) {
  console.error(`toonshorts ${cmd}: ${e.message}`);
  process.exit(1);
}
