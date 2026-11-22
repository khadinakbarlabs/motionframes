// Story doctor: checks the script and the shot plan against what keeps people watching a short.
// Text checks run on short.json alone; timing checks need the voice and word timings.
// Rules and the reasons behind them: skills/toonshorts/references/hooks.md.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadModel, readSpec } from "./spec.mjs";

const TRIGGER = /\b(why|how|what if|never|nobody|no one|secret|hidden|on purpose|actually|mistake|wrong|until|stop|real reason|\d+)\b/i;
const TURN = /\b(but|until|except|instead|turns out|that's why|the reason|so he|so she|so they|so it)\b/i;
const STOP = new Set("the a an and or but so of to in on at by for from with is are was were be been it its this that these those he she they we you i his her their our my your not no did does do has have had can will would could just very".split(" "));
const contentWords = (s) => (s.toLowerCase().match(/[a-z']+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w) => w.replace(/'s$/, "").replace(/(ing|es|s|ed)$/, "");

export function storyReport(dir) {
  const spec = readSpec(dir);
  const out = [];
  const add = (ok, name, msg) => out.push({ ok, name, msg });
  const L = spec.lines, first = L[0].text, last = L.at(-1).text;
  const words = L.map((l) => l.text.split(/\s+/).length), total = words.reduce((a, b) => a + b, 0);

  // 1. hook
  const hw = first.split(/\s+/).length;
  add(hw <= 10, "hook length", `${hw} words in the first line${hw > 10 ? ": cut it to 10 or fewer, the hook must land in the first 2-3 s" : ""}`);
  add(TRIGGER.test(first), "hook trigger", TRIGGER.test(first) ? `"${first}" opens a question` : `"${first}" has no curiosity trigger: add a number, a "why", "on purpose", "never", a wrong belief or a stake`);
  // 2. turn and re-hook
  const mid = L.slice(1, -1).map((l) => l.text).join(" ");
  add(TURN.test(mid), "turn", TURN.test(mid) ? "the middle has a turn (but / until / that's why)" : "no turn in the middle: add a \"but\" / \"until\" moment where the expectation flips");
  const nums = (mid.match(/\b\d+(\.\d+)?\b/g) || []).length;
  add(nums >= 1, "concrete proof", nums ? `${nums} number(s) in the middle make it believable` : "no numbers: one concrete number (\"5 cm\") beats any adjective");
  // 3. ending
  const fset = new Set(contentWords(first).map(stem));
  const shared = contentWords(last).map(stem).filter((w) => fset.has(w));
  const loopish = shared.length > 0 || /\b(again|still|now|that's why|which is why)\b/i.test(last);
  add(loopish, "loop ending", loopish ? `last line calls back to the hook${shared.length ? ` ("${[...new Set(shared)].join(", ")}")` : ""}, which invites a rewatch` : "the last line does not call back to the hook: end on a twist that echoes the first line so the loop feels seamless");
  // 4. length
  const est = total / 3.7;
  add(est >= 15 && est <= 60, "length", `${total} words ≈ ${est.toFixed(0)} s${est > 60 ? ": over 60 s loses most viewers, cut a beat" : est < 15 ? ": very short, add one proof beat" : ""}`);
  // 5. hot words + hook overlay
  const hot = (spec.captions || {}).hot || [];
  add(hot.length >= 4 && hot.length <= 10, "hot words", `${hot.length} hot caption words${hot.length < 4 ? ": mark 4-10 key words" : hot.length > 10 ? ": too many, keep the 4-10 that carry the story" : ""}`);
  add(!!spec.hook, "hook text", spec.hook ? `on-screen hook: "${spec.hook.text}"` : "no on-screen hook text: add \"hook\": { \"text\": \"...\" } (3-6 words, shown for the first ~2 s)");

  // timing checks (need voice + words)
  let model = null;
  try { model = loadModel(dir); if (model.lines.some((l) => !l.words.length)) model = null; } catch { model = null; }
  if (!model) { add(true, "timing", "voice not timed yet: shot checks run after the words step"); return { checks: out }; }
  add(model.duration <= 60, "duration", `${model.duration.toFixed(1)} s with the voice${model.spec.pace ? " after pacing" : " as recorded"}${model.duration > 60 ? ": over 60 s, tighten with \"pace\" or cut a beat" : ""}`);
  const l1 = model.lines[0];
  add(l1.end <= 3.6, "hook time", `hook line ends at ${l1.end.toFixed(1)} s${l1.end > 3.6 ? ": the hook should finish by ~3 s" : ""}`);
  const wps = model.lines.map((l) => l.words.length / Math.max(0.1, l.dur));
  const slow = model.lines.filter((_, i) => wps[i] < 2.4).map((l) => l.id);
  add(!slow.length, "pace", slow.length ? `slow delivery in ${slow.join(", ")} (< 2.4 words/s): speed up or trim` : `voice pace ${Math.min(...wps).toFixed(1)}-${Math.max(...wps).toFixed(1)} words/s`);

  // shots: length and visual events
  const shots = model.scenes.map((s) => ({ id: s.id, len: +(s.end - s.start).toFixed(1), start: s.start, end: s.end, file: s.file }));
  // jump cuts split a scene into several shots
  const cutsIn = (s) => [s.start, ...((model.scenes.find((x) => x.id === s.id).jumps || []).map((j) => model.at(typeof j === "string" ? j : j.at))), s.end].sort((a, b) => a - b);
  const pieces = shots.flatMap((s) => { const c = cutsIn(s); return c.slice(1).map((e, k) => ({ id: c.length > 2 ? `${s.id}.${k + 1}` : s.id, len: +(e - c[k]).toFixed(1) })); });
  const long = pieces.filter((s) => s.len > 6);
  const avg = pieces.reduce((a, s) => a + s.len, 0) / pieces.length;
  add(!long.length, "shot length", `${pieces.length} shots, average ${avg.toFixed(1)} s${long.length ? `; long: ${long.map((s) => `${s.id} ${s.len}s`).join(", ")}: split them or give them several visible beats` : ""}`);
  // gaps with nothing new on screen: every at("...") in scene code + every scene start
  const events = [];
  for (const s of shots) {
    events.push(s.start, ...cutsIn(s).slice(1, -1));
    const p = join(dir, "scenes", s.file); if (!existsSync(p)) continue;
    const code = readFileSync(p, "utf8");
    for (const m of code.matchAll(/at\("([^"]+)"\)\s*([+-]\s*[\d.]+)?/g)) {
      try { const t = model.at(m[1]) + (m[2] ? Number(m[2].replace(/\s/g, "")) : 0); if (t >= s.start && t < s.end) events.push(t); } catch {}
    }
    for (const m of code.matchAll(/S\.start\s*\+\s*([\d.]+)/g)) events.push(s.start + Number(m[1]));
  }
  events.sort((a, b) => a - b);
  let gap = 0, at = 0;
  for (let i = 1; i < events.length; i++) if (events[i] - events[i - 1] > gap) { gap = events[i] - events[i - 1]; at = events[i - 1]; }
  if (model.duration - events.at(-1) > gap) { gap = model.duration - events.at(-1); at = events.at(-1); }
  add(gap <= 3.5, "visual change", `longest stretch with no new action: ${gap.toFixed(1)} s from ${at.toFixed(1)} s${gap > 3.5 ? ": add a beat (face, pose, prop, camera) every 2-3 s" : ""}`);
  return { checks: out };
}
