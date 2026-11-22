// Quality checks.
//   mixPreview(dir, out)  : mixes every <audio> clip of index.html with ffmpeg (no render needed) -> loudness numbers
//   qaVideo(dir, mp4)     : black frames, frozen picture (>= 12 frames), loudness, true peak, long silences -> qa-report.md
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export const TARGET = { lufs: -14, lufsTol: 1, truePeak: -1, freezeFrames: 12, silence: 1.5 };

function audioTags(html) {
  return [...html.matchAll(/<audio ([^>]+)>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]])));
}
const rootDuration = (html) => Number((html.match(/data-composition-id="main"[^>]*data-duration="([\d.]+)"/) || [])[1] || 0);

function loudness(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const s = r.stderr || "";
  const sum = s.slice(s.lastIndexOf("Summary:"));
  const num = (re) => { const m = sum.match(re); return m ? Number(m[1]) : NaN; };
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), truePeak: num(/Peak:\s+(-?[\d.]+) dBFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/) };
}

export function mixPreview(dir, out = join(dir, "snaps", "mix-preview.wav")) {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const tags = audioTags(html);
  if (!tags.length) throw new Error("index.html has no <audio> clips");
  const args = ["-v", "error", "-y"], f = [];
  tags.forEach((a, i) => {
    args.push("-i", join(dir, a.src));
    const ms = +(a["data-media-start"] || 0), d = +a["data-duration"], st = +a["data-start"], v = +(a["data-volume"] ?? 1);
    const fi = a["data-fade-in"] ? `,afade=t=in:st=0:d=${a["data-fade-in"]}` : "";
    const fo = a["data-fade-out"] ? `,afade=t=out:st=${Math.max(0, d - +a["data-fade-out"])}:d=${a["data-fade-out"]}` : "";
    f.push(`[${i}]aresample=48000,aformat=channel_layouts=stereo,atrim=${ms}:${ms + d},asetpts=PTS-STARTPTS${fi}${fo},volume=${v},adelay=${Math.round(st * 1000)}:all=1[a${i}]`);
  });
  f.push(tags.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${tags.length}:normalize=0[m]`);
  args.push("-filter_complex", f.join(";"), "-map", "[m]", "-t", String(rootDuration(html) || 600), out);
  execFileSync("ffmpeg", args, { maxBuffer: 1 << 26 });
  return { file: out, clips: tags.length, ...loudness(out) };
}

export function qaVideo(dir, mp4) {
  const vf = "blackdetect=d=0.1:pix_th=0.06,freezedetect=n=-60dB:d=0.4";
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", mp4, "-vf", vf, "-af", "silencedetect=n=-50dB:d=" + TARGET.silence, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const log = r.stderr || "";
  const black = [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  const freezeStarts = [...log.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
  const freezeEnds = [...log.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => +m[1]);
  const freezes = freezeStarts.map((s, i) => [s, freezeEnds[i] ?? NaN]);
  const silences = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const loud = loudness(mp4);

  const issues = [];
  if (black.length) issues.push(`black frames at ${black.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)}s`).join(", ")}`);
  if (freezes.length) issues.push(`frozen picture (>= ${TARGET.freezeFrames} frames) at ${freezes.map(([a, b]) => `${a.toFixed(2)}-${Number.isFinite(b) ? b.toFixed(2) : "end"}s`).join(", ")}: add creep, boil or a move`);
  if (silences.length) issues.push(`dead air (> ${TARGET.silence}s) starting at ${silences.map((s) => s.toFixed(2) + "s").join(", ")}`);
  if (!(Math.abs(loud.lufs - TARGET.lufs) <= TARGET.lufsTol)) issues.push(`loudness ${loud.lufs} LUFS (want ${TARGET.lufs} ± ${TARGET.lufsTol}): "motionframes render" normalises; re-run it`);
  if (!(loud.truePeak <= TARGET.truePeak)) issues.push(`true peak ${loud.truePeak} dBFS (want <= ${TARGET.truePeak})`);

  const md = [
    `# QA report: ${mp4}`, "",
    issues.length ? `**${issues.length} issue(s)**` : "**PASS**: no black frames, no frozen picture, no dead air, loudness on target.", "",
    ...issues.map((i) => `- ${i}`), "",
    "| check | value |", "|---|---|",
    `| integrated loudness | ${loud.lufs} LUFS |`, `| true peak | ${loud.truePeak} dBFS |`, `| loudness range | ${loud.lra} LU |`,
    `| black segments | ${black.length} |`, `| frozen segments | ${freezes.length} |`, `| silences > ${TARGET.silence}s | ${silences.length} |`, "",
    "Not checked by machine: does every action land on its word, is the first frame a strong hook, do captions stay clear of the platform buttons. Look at the stills.", "",
  ].join("\n");
  writeFileSync(join(dir, "qa-report.md"), md);
  return { pass: issues.length === 0, issues, ...loud };
}

// Two-pass loudness normalisation of a rendered mp4 to -14 LUFS / -1 dBTP (video stream copied).
export function normalize(mp4, out) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", mp4, "-af", `loudnorm=I=${TARGET.lufs}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  // ffmpeg 8 prints more lines after the loudnorm block, so cut out just the last {...}
  const err = r.stderr || "", open = err.lastIndexOf("{"), close = err.indexOf("}", open);
  if (open < 0 || close < 0) throw new Error("loudnorm: ffmpeg printed no measurement (is there an audio track?)");
  const j = JSON.parse(err.slice(open, close + 1));
  const ln = `loudnorm=I=${TARGET.lufs}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-c:v", "copy", "-af", ln, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", out]);
  return out;
}
