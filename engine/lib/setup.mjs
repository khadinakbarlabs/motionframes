// One-command setup: `motionframes setup [--agent claude|codex|gemini|other] [--test [dir]] [--no-install] [--from <src>]`
// Checks Node, FFmpeg and Python, installs what a user-level package manager can install without admin rights
// (Homebrew on macOS/Linux, winget on Windows), prints exact per-OS commands for the rest, installs the free
// Kokoro voice, warms up voice + word timing + Chrome, optionally installs the agent plugin and renders a
// test short. Prints "ready" only when every required piece works.
import { existsSync, mkdirSync, cpSync, readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { installClone, cloneLines } from "./clone.mjs";

const WIN = process.platform === "win32";
const MAC = process.platform === "darwin";
const REPO = "khadinakbarlabs/motionframes";

const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: "utf8", shell: WIN, ...opts });
const has = (cmd) => run(WIN ? "where" : "which", [cmd]).status === 0;
const versionOf = (cmd, args = ["--version"]) => { const r = run(cmd, args); return r.status === 0 ? `${r.stdout || ""}${r.stderr || ""}`.trim() : ""; };
const osKey = () => (MAC ? "mac" : WIN ? "win" : "linux");

// Exact commands per OS, printed when we cannot (or may not) install something ourselves.
export const MANUAL = {
  node: { mac: "brew install node", win: "winget install -e --id OpenJS.NodeJS.LTS", linux: "install Node 20+ from https://nodejs.org/en/download or your package manager" },
  ffmpeg: { mac: "brew install ffmpeg", win: "winget install -e --id Gyan.FFmpeg", linux: "sudo apt install ffmpeg   (Fedora: sudo dnf install ffmpeg, Arch: sudo pacman -S ffmpeg)" },
  python: { mac: "brew install python@3.12", win: "winget install -e --id Python.Python.3.12", linux: "sudo apt install python3 python3-venv   (Python 3.10-3.13)" },
};
export const manual = (what) => MANUAL[what][osKey()];

// Only package managers that install for the current user without a password prompt.
function autoInstall(what, log) {
  if (!WIN && has("brew")) {
    const pkg = { ffmpeg: "ffmpeg", python: "python@3.12" }[what];
    log(`  installing ${what}: brew install ${pkg} ...`);
    return run("brew", ["install", pkg], { stdio: "inherit" }).status === 0;
  }
  if (WIN && has("winget")) {
    const id = { ffmpeg: "Gyan.FFmpeg", python: "Python.Python.3.12" }[what];
    log(`  installing ${what}: winget install ${id} ...`);
    return run("winget", ["install", "-e", "--id", id, "--accept-source-agreements", "--accept-package-agreements"], { stdio: "inherit" }).status === 0;
  }
  return false;
}

// Kokoro runs on onnxruntime, which supports Python 3.10-3.13. Prefer 3.12.
function findPython() {
  const names = WIN ? [["py", ["-3.12"]], ["py", ["-3.11"]], ["py", ["-3.13"]], ["python", []]]
    : [["python3.12", []], ["python3.11", []], ["python3.13", []], ["python3.10", []], ["python3", []]];
  for (const [cmd, pre] of names) {
    const v = versionOf(cmd, [...pre, "--version"]).match(/Python (\d+)\.(\d+)/);
    if (v && +v[1] === 3 && +v[2] >= 10 && +v[2] <= 13) return { cmd, pre, version: `${v[1]}.${v[2]}` };
  }
  return null;
}

// npx runs the package from a temporary cache: keep a stable copy that agents and later runs can point at.
function stableHome(root, log) {
  if (!root.split(sep).includes("_npx")) return root;
  const home = join(homedir(), ".motionframes", "app");
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  for (const f of readdirSync(root)) if (f !== "node_modules") cpSync(join(root, f), join(home, f), { recursive: true });
  log(`  ok   stable copy in ${home}  (run it any time: node ${join(home, "engine", "motionframes.mjs")} <command>)`);
  return home;
}

function installAgent(agent, root, from, log) {
  const src = from || REPO;
  const step = (cmd, args) => {
    log(`  $ ${cmd} ${args.join(" ")}`);
    const r = run(cmd, args);
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    if (r.status !== 0 && !/already/i.test(out)) throw new Error(`"${cmd} ${args.slice(0, 3).join(" ")}" failed: ${out.trim().split("\n").pop()}`);
  };
  if (agent === "claude") {
    if (!has("claude")) throw new Error(`--agent claude: no "claude" command on PATH. Inside Claude Code type /plugin marketplace add ${REPO} then /plugin install motionframes@motionframes`);
    step("claude", ["plugin", "marketplace", "add", src]);
    step("claude", ["plugin", "install", "motionframes@motionframes"]);
    return "Claude Code plugin installed: start a new Claude Code session to load the skill";
  }
  if (agent === "codex") {
    if (!has("codex")) throw new Error(`--agent codex: no "codex" command on PATH. Run: codex plugin marketplace add ${REPO} && codex plugin add motionframes@motionframes`);
    step("codex", ["plugin", "marketplace", "add", src]);
    step("codex", ["plugin", "add", "motionframes@motionframes"]);
    return "Codex plugin installed: start a new Codex session to load the skill";
  }
  if (agent === "gemini") {
    if (!has("gemini")) throw new Error(`--agent gemini: no "gemini" command on PATH. Run: gemini extensions install https://github.com/${REPO}`);
    step("gemini", ["extensions", "install", from || `https://github.com/${REPO}`, "--consent"]);
    return "Gemini CLI extension installed: restart Gemini CLI";
  }
  // Cursor, Windsurf, Cline and anything else: point the agent at the skill file in the stable copy.
  return `for ${agent}: when asked for a video, read ${join(root, "skills", "motionframes", "SKILL.md")} and follow it`;
}

export async function setup({ hf, log, flag, rest, commands, VENV, VPY, root }) {
  const noInstall = !!flag("no-install", false);
  const missing = [];
  const need = (what, ok, label) => { if (ok) log(`  ok   ${label}`); else { log(`  MISS ${what}`); missing.push(what); } };

  // 1-3. Node, FFmpeg, Python (auto-installed with brew/winget when available and allowed)
  need("node", Number(process.versions.node.split(".")[0]) >= 20, `node ${process.versions.node}`);
  let ff = has("ffmpeg") && has("ffprobe");
  if (!ff && !noInstall && autoInstall("ffmpeg", log)) ff = has("ffmpeg") && has("ffprobe");
  need("ffmpeg", ff, `ffmpeg ${versionOf("ffmpeg", ["-version"]).split(" ")[2] || ""}`);
  let py = existsSync(VPY) ? { version: "venv" } : findPython();
  if (!py && !noInstall && autoInstall("python", log)) py = findPython();
  need("python", !!py, existsSync(VPY) ? `Kokoro voice already installed (${VENV})` : `python ${py?.version}`);
  if (missing.length) {
    log("\n  Run these, then run setup again:");
    for (const m of missing) log(`    ${m.padEnd(7)} ${manual(m)}`);
    throw new Error(`not ready: ${missing.join(", ")} missing`);
  }

  // 4. Kokoro voice in its own venv (never touches the system Python)
  if (!existsSync(VPY)) {
    log(`  installing the free Kokoro voice into ${VENV} (one time) ...`);
    mkdirSync(VENV, { recursive: true });
    if (run(py.cmd, [...py.pre, "-m", "venv", VENV], { stdio: "inherit" }).status !== 0) throw new Error(`could not create a Python venv: ${manual("python")}`);
    if (run(VPY, ["-m", "pip", "install", "-q", "--disable-pip-version-check", "kokoro-onnx", "soundfile", "yt-dlp"], { stdio: "inherit" }).status !== 0) throw new Error("pip could not install kokoro-onnx: check the network, then run setup again");
    log("  ok   Kokoro voice installed");
  }

  // 5. Warm up everything a first short needs (downloads models and Chrome once)
  log("  checking voice, word timing and Chrome (first run downloads the models) ...");
  const warm = join(tmpdir(), `motionframes-setup-${process.pid}`);
  mkdirSync(warm, { recursive: true });
  const wav = join(warm, "ready.wav");
  hf(["tts", "MotionFrames is ready.", "--voice", "am_michael", "-o", wav]);
  if (!existsSync(wav)) throw new Error("the Kokoro voice made no audio");
  log("  ok   voice (Kokoro, runs offline)");
  if (!/"ok":\s*true/.test(hf(["transcribe", wav, "--json", "-d", warm]))) throw new Error("word timing (whisper) failed: run setup again with a network connection");
  log("  ok   word timing (whisper, runs offline)");
  hf(["browser", "ensure"]);
  log("  ok   headless Chrome for rendering");
  rmSync(warm, { recursive: true, force: true });

  // 5b. Optional free voice clone (Chatterbox): only with --clone, so the default setup stays small
  if (flag("clone", false)) {
    installClone(log);
    log("  loading the voice-clone model (first run downloads it) ...");
    await cloneLines("", [], { log });
    log("  ok   voice clone ready: set \"voice\": { \"clone\": \"my-voice.wav\" } in short.json");
  }

  // 6. Stable copy (when run through npx) + the agent's plugin
  const home = stableHome(root, log);
  const agent = flag("agent", "");
  if (agent && agent !== true && agent !== "none") log(`  ok   ${installAgent(String(agent), home, flag("from", ""), log)}`);

  // 7. A real test short, rendered and QA-checked
  const test = flag("test", false);
  if (test) {
    const dir = resolve(test === true ? "motionframes-test" : String(test));
    if (!existsSync(join(dir, "short.json"))) commands.init(dir);
    log(`  making a 7-second test short in ${dir} ...`);
    rest.push("--draft");
    await commands.go(dir);
    log(`  ok   test short: ${join(dir, "renders", `${basename(dir)}.mp4`)}`);
  }
  return "ready";
}
