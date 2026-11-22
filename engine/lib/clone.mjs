// Free, local voice clone: short.json "voice": { "clone": "my-voice.wav" } speaks every line in that voice.
// Engine: Chatterbox (Resemble AI, MIT) in its own venv under ~/.cache/motionframes/clone, installed only
// when a spec asks for it or with `motionframes setup --clone`. Kokoro stays the small default.
import { existsSync, mkdirSync, writeFileSync, rmSync, statSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheDir } from "./paths.mjs";

const WIN = process.platform === "win32";
export const CLONE_VENV = cacheDir("clone");
export const CLONE_PY = join(CLONE_VENV, WIN ? join("Scripts", "python.exe") : join("bin", "python"));
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "runtime", "clone_tts.py");
// chatterbox-tts pulls torch; perth's watermarker fails to import with setuptools 81+ (pkg_resources removed).
const PACKAGES = ["chatterbox-tts", "setuptools<81"];
export const MIN_SAMPLE_S = 8;

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", shell: WIN, ...opts });
const has = (cmd) => run(WIN ? "where" : "which", [cmd]).status === 0;

export const cloneInstalled = () => existsSync(CLONE_PY) && existsSync(join(CLONE_VENV, ".motionframes-ok"));

// Chatterbox is tested on Python 3.11; 3.10 and 3.12 also work. uv can fetch 3.11 by itself.
function findPython() {
  for (const cmd of WIN ? ["py -3.11", "py -3.12", "py -3.10"] : ["python3.11", "python3.12", "python3.10"]) {
    const [c, ...pre] = cmd.split(" ");
    if (run(c, [...pre, "--version"]).status === 0) return { cmd: c, pre };
  }
  return null;
}

export function installClone(log) {
  if (cloneInstalled()) return false;
  log(`  installing the free voice-clone engine (Chatterbox, about 1 GB, one time) into ${CLONE_VENV} ...`);
  rmSync(CLONE_VENV, { recursive: true, force: true });
  mkdirSync(dirname(CLONE_VENV), { recursive: true });
  const quiet = { stdio: ["ignore", "inherit", "inherit"] };
  if (has("uv")) {
    if (run("uv", ["venv", "-q", "--python", "3.11", CLONE_VENV], quiet).status !== 0) throw new Error("uv could not create a Python 3.11 venv for the voice clone");
    if (run("uv", ["pip", "install", "-q", "--python", CLONE_PY, ...PACKAGES], quiet).status !== 0) throw new Error("could not install chatterbox-tts: check the network, then run again");
  } else {
    const py = findPython();
    if (!py) throw new Error("the voice clone needs Python 3.10-3.12 (3.11 best). macOS: brew install python@3.11 · Windows: winget install -e --id Python.Python.3.11 · or install uv (https://docs.astral.sh/uv/) and run again");
    if (run(py.cmd, [...py.pre, "-m", "venv", CLONE_VENV], quiet).status !== 0) throw new Error("could not create a Python venv for the voice clone");
    if (run(CLONE_PY, ["-m", "pip", "install", "-q", "--disable-pip-version-check", ...PACKAGES], quiet).status !== 0) throw new Error("could not install chatterbox-tts: check the network, then run again");
  }
  const probe = run(CLONE_PY, ["-c", "from chatterbox.tts import ChatterboxTTS; print('ok')"]);
  if (!/ok/.test(probe.stdout || "")) throw new Error(`the voice-clone engine installed but does not import: ${(probe.stderr || "").trim().split("\n").pop()}`);
  writeFileSync(join(CLONE_VENV, ".motionframes-ok"), PACKAGES.join("\n") + "\n");
  log("  ok   voice-clone engine installed");
  return true;
}

export function sampleSeconds(file) {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return r.status === 0 ? Number(r.stdout.trim()) : NaN;
}

// Resolves and checks the sample. Returns its absolute path.
export function checkSample(dir, clone) {
  const ref = resolve(dir, String(clone));
  if (!existsSync(ref)) throw new Error(`voice clone sample not found: ${ref}. Put a clean recording of the voice (8-30 s, one speaker, no music) there, or fix "voice": { "clone": "..." } in short.json`);
  const s = sampleSeconds(ref);
  if (!(s >= MIN_SAMPLE_S)) throw new Error(`voice clone sample is ${Number.isFinite(s) ? s.toFixed(1) + " s" : "unreadable"}: it needs at least ${MIN_SAMPLE_S} s of clean speech (10-30 s works best)`);
  return ref;
}

// Identifies the voice that made a line, so changing the voice re-voices the lines it generated.
export function cloneKey(ref, opts = {}) {
  const st = statSync(ref);
  return `clone:${ref}:${st.size}:${Math.round(st.mtimeMs)}:${opts.exaggeration ?? 0.5}`;
}

// Speaks lines [{id, text, out}] in the sample's voice. Streams progress through log().
export function cloneLines(ref, lines, { exaggeration = 0.5, log }) {
  const job = join(tmpdir(), `motionframes-clone-${process.pid}.json`);
  writeFileSync(job, JSON.stringify({ ref, exaggeration, lines }));
  return new Promise((done, fail) => {
    const p = spawn(CLONE_PY, [SCRIPT, job], { stdio: ["ignore", "pipe", "pipe"] });
    let err = "", buf = "";
    p.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const s = buf.slice(0, i); buf = buf.slice(i + 1);
        try {
          const e = JSON.parse(s);
          if (e.event === "load") log(`  voice clone model ready on ${e.device} (${e.seconds}s)`);
          if (e.event === "line") log(`  cloned ${e.id}: ${e.audio}s of audio in ${e.seconds}s`);
        } catch { /* library chatter */ }
      }
    });
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => {
      rmSync(job, { force: true });
      if (code === 0) return done();
      const last = err.split("\n").map((l) => l.trim()).filter((l) => l && !/warn|deprecat|futurewarning/i.test(l)).slice(-2).join(" | ");
      fail(new Error(`voice clone failed: ${last || `exit ${code}`}`));
    });
  });
}
