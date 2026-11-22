// Assembles a HyperFrames index.html from the timing model, captions, sound and the scene files.
//
// A scene file (scenes/<name>.html) is SVG markup on a 1080x1920 stage plus one <script> block:
//
//   <rect width="1080" height="1920" fill="#ffb066" />
//   <rig type="bean" id="pip" x="480" y="1500" shirt="#2ec4b6" />
//   <script>
//     // in scope: tl (the paused timeline), at("L2:filled"), fx (runtime/fx.js), S {start,end}, L (lines by id)
//     fx.walk("pip", S.start + 0.2, at("L1.end"), -200, 480);
//     fx.talk("pip", "L1");
//   </script>
//
// Each scene is wrapped as <g id="<sid>"><g id="<sid>-creep"><g id="<sid>-cam">markup</g></g></g>,
// so scene code animates "#<sid>-cam" for camera moves while the engine runs the scene's own camera move
// (short.json scene "cam": push | pull | pan-left | pan-right | rise | still | none | auto) on "#<sid>-creep",
// with parallax for every <g data-depth> layer, and the transition into the scene ("in": whip | whip-right |
// push | iris | fade | cut | auto). Every <rig> is kept alive (breathe, blink, head drift, lip sync on "talks").
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { captionCss, captionMarkup, captionBands } from "./captions.mjs";
import { expandBackdrops } from "./backdrops.mjs";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";

const RIG_DEFAULTS = {
  x: 540, y: 1500, scale: 1, shirt: "#ff6b4a", skin: "#f6c9a0", hat: "#ffc93c", prop: "clipboard",
  pants: "#34405e", shoe: "#2b2f45",
};
// attributes the engine reads for auto acting (not passed into the art)
const ACTING = ["face", "pose", "talks", "life"];

// scene camera moves the engine picks when a scene does not say ("auto")
const AUTO_CAM = ["push", "pan-left", "push", "pan-right", "rise"];

function parseAttrs(s) {
  return Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

function loadRig(type) {
  const p = join(ENGINE, "rigs", `${type}.svg`);
  if (!existsSync(p)) throw new Error(`unknown rig type "${type}" (have: stick, bean)`);
  return readFileSync(p, "utf8").replace(/<!--[\s\S]*?-->\s*/g, "");
}

export function expandRigs(markup, palette, rigs = []) {
  return markup.replace(/<rig\s+([^>]*?)\/?>(?:\s*<\/rig>)?/g, (_, attrStr) => {
    const a = { ink: palette.ink, limb: palette.ink, hot: palette.hot || "#ffc93c", ...RIG_DEFAULTS, ...parseAttrs(attrStr) };
    rigs.push(Object.fromEntries([["id", a.id], ...ACTING.map((k) => [k, a[k]])]));
    if (!a.type) throw new Error(`<rig> needs a type: <rig ${attrStr}>`);
    if (!a.id) throw new Error(`<rig> needs an id: <rig ${attrStr}>`);
    let svg = loadRig(a.type).replace(/\{\{(\w+)\}\}/g, (m, k) => (a[k] !== undefined ? a[k] : m));
    svg = svg.replace(/<g id="[^"]*-(?:hat|prop)" data-(?:hat|prop)="none"[^>]*>[\s\S]*?<\/g>\s*/g, "");
    const left = svg.match(/\{\{\w+\}\}/);
    if (left) throw new Error(`rig "${a.id}": no value for ${left[0]}`);
    return svg;
  });
}

function readScene(dir, scene) {
  const p = join(dir, "scenes", scene.file);
  if (!existsSync(p)) throw new Error(`scene ${scene.id}: missing file scenes/${scene.file}`);
  const src = readFileSync(p, "utf8");
  const scripts = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const markup = src.replace(/<script[^>]*>[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "").trim();
  return { markup, code: scripts.join("\n") };
}

function checkIds(svg) {
  const seen = new Set(), dup = new Set();
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) (seen.has(m[1]) ? dup : seen).add(m[1]);
  if (dup.size) throw new Error(`duplicate ids across scenes: ${[...dup].slice(0, 8).join(", ")} (ids must be unique in the whole short)`);
}

const runtime = (f) => readFileSync(join(ENGINE, "runtime", f), "utf8").replace(/^export\s+/gm, "");
const indent = (s, n) => s.split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");

export function compose(model, { captions, sfxClips = [], music = "" }) {
  const { spec, lines, scenes, duration: DUR } = model;
  const { width: W, height: H, fps, palette } = spec;

  const parts = scenes.map((s) => {
    const src = readScene(model.dir, s);
    const bd = expandBackdrops(src.markup, s.id, { width: W, height: H, ink: palette.ink });
    const rigs = [];
    const markup = expandRigs(bd.markup, palette, rigs);
    return { s, ...src, markup, layers: bd.layers, bdJs: bd.js, rigs };
  });
  const svgBody = parts.map(({ s, markup }, i) =>
    `<defs><filter id="${s.id}-blurf" x="-20%" y="0" width="140%" height="100%"><feGaussianBlur id="${s.id}-blur" stdDeviation="0 0" /></filter>` +
    `<clipPath id="${s.id}-irisclip"><circle id="${s.id}-iris" cx="${(s.irisAt || `${W / 2} ${H * 0.55}`).split(" ")[0]}" cy="${(s.irisAt || `${W / 2} ${H * 0.55}`).split(" ")[1]}" r="0" /></clipPath></defs>\n` +
    `<g id="${s.id}" class="scene" opacity="${i === 0 ? 1 : 0}"><g id="${s.id}-creep"><g id="${s.id}-cam">\n${indent(markup, 2)}\n</g></g></g>`
  ).join("\n");
  checkIds(svgBody);
  for (const { s, code } of parts) {
    if (!/immediateRender/.test(code) && /fromTo\([^;]*?,\s*\{[^}]*\bopacity:\s*1\b[^}]*\}\s*,\s*\{[^}]*\bopacity:\s*0/.test(code))
      model.warnings.push(`scene ${s.id}: a fromTo() starts at opacity 1, so it shows before it plays (add immediateRender: false, or use fx.pop/fx.flash)`);
  }

  const cap = captionMarkup(captions);
  const voice = lines.map((l) =>
    `      <audio id="vo-${l.id}" class="clip" src="${l.audio}" data-start="${l.start}" data-duration="${l.dur}" data-volume="${l.volume}" data-track-index="2"></audio>`
  ).join("\n");

  // scene switching + camera move with parallax + auto acting (no frame is ever fully static)
  const sceneJs = parts.map(({ s, code, layers, bdJs, rigs }, i) => {
    const prev = parts[i - 1]?.s;
    const type = s.inType;
    const sw = i === 0 ? "" : `      fx.transition("#${prev.id}", "#${s.id}", ${s.start}, ${JSON.stringify(type)});\n`;
    let cam = s.cam ?? spec.cam ?? "auto";
    if (s.creep !== undefined && s.cam === undefined) cam = s.creep === 1 ? "still" : { type: "push", amt: s.creep - 1 };
    if (cam === "auto") cam = AUTO_CAM[i % AUTO_CAM.length];
    const mv = cam === "none" ? "" : `      fx.sceneMove("${s.id}", ${s.start}, ${s.end}, ${JSON.stringify(cam)}, ${JSON.stringify(layers)});\n`;
    // jump cuts: instant reframes of the scene on a word ("jumps": [{ "at": "L3:But", "scale": 1.25, "origin": "560 1450" }])
    const jumps = (s.jumps || []).map((j, k) => {
      const J = typeof j === "string" ? { at: j, scale: k % 2 ? 1 : 1.2 } : j;
      return `      tl.set("#${s.id}", { scale: ${J.scale ?? 1.2}, x: ${J.x ?? 0}, y: ${J.y ?? 0}, svgOrigin: "${J.origin || `${W / 2} ${H / 2}`}", smoothOrigin: false }, ${model.at(J.at)});\n`;
    }).join("") + ((s.jumps || []).length ? `      tl.set("#${s.id}", { scale: 1, x: 0, y: 0 }, ${s.end});\n` : "");
    const life = rigs.filter((r) => r.life !== "off").map((r, k) =>
      `        fx.alive("${r.id}", S.start, S.end, { seed: ${i * 10 + k + 1}, talks: ${JSON.stringify((r.talks || "").split(",").map((x) => x.trim()).filter(Boolean))}, face: ${JSON.stringify(r.face || null)}, pose: ${JSON.stringify(r.pose || null)} });`
    ).join("\n");
    return `      // ---------- ${s.id} (${s.file}) ${s.start}s - ${s.end}s ----------\n${sw}${mv}${jumps}` +
      `      (function (tl, at, fx, S, L) {\n${bdJs ? indent(bdJs.trim(), 2) + "\n" : ""}${indent(code.trim(), 8)}\n${life ? life + "\n" : ""}      })(tl, at, fx, SCENES_BY_ID["${s.id}"], LINES_BY_ID);`;
  }).join("\n\n");

  // on-screen hook text from frame 0 ("hook": { "text": "WHY BRIDGES HAVE *GAPS*", "until": "L1.end" })
  const hook = spec.hook && spec.hook.text ? spec.hook : null;
  const hookEnd = hook ? Math.min(DUR, model.at(hook.until || "L1.end") + 0.15) : 0;
  const hookHtml = hook ? `      <div id="ts-hook" class="clip cap hook" data-start="0" data-duration="${hookEnd.toFixed(3)}" data-track-index="1" data-track-kind="captions"><span>${String(hook.text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\*([^*]+)\*/g, '<b class="hot">$1</b>')}</span></div>` : "";
  const hookJs = hook ? `      tl.fromTo("#ts-hook span", { scale: 1.12 }, { scale: 1, duration: 0.35, ease: "power3.out" }, 0);\n      tl.to("#ts-hook span", { scale: 0.6, opacity: 0, duration: 0.14, ease: "power2.in" }, ${(hookEnd - 0.14).toFixed(3)});` : "";
  // hot words punch the whole picture in a touch: a pattern interrupt on the words that matter
  const cuts = scenes.slice(1).map((s) => s.start);
  const punchJs = (spec.captions || {}).punch === false ? "" : captions.filter((g) => g.hot && g.start > hookEnd && !cuts.some((c) => Math.abs(c - g.start) < 0.45))
    .map((g) => `      fx.punch("#ts-punch", ${g.start}, { amt: 0.045, hold: 0.55, origin: "${W / 2} ${Math.round(H * 0.5)}" });`).join("\n");

  const lean = lines.map(({ id, start, end, words }) => ({ id, start, end, words }));
  const scn = scenes.map(({ id, start, end }) => ({ id, start, end }));
  const font = spec.font || "Archivo Black";
  // Paper grain + soft vignette over every scene, so flat fills read as printed ink, not vector defaults.
  // short.json: "texture": false to turn off, or { "grain": 0.07, "vignette": 0.28 } to tune.
  const textureOverlay = ({ grain = 0.07, vignette = 0.28 }) => `<defs>
  <filter id="ts-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" stitchTiles="stitch" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.4 -0.45" /></filter>
  <radialGradient id="ts-vig" cx="50%" cy="48%" r="75%"><stop offset="55%" stop-color="#000" stop-opacity="0" /><stop offset="100%" stop-color="#000" stop-opacity="${vignette}" /></radialGradient>
</defs>
<g id="ts-texture" pointer-events="none">
  <rect width="${W}" height="${H}" filter="url(#ts-grain)" opacity="${grain}" style="mix-blend-mode: multiply" />
  <rect width="${W}" height="${H}" fill="url(#ts-vig)" />
</g>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <!-- built by motionframes from short.json: edit the spec and scenes/, then run "motionframes build" -->
    <script src="${GSAP}"></script>
    <style>
      :root { --ink: ${palette.ink}; --paper: ${palette.paper}; --hot: ${palette.hot || "#ffc93c"}; --font-caption: "${font}", sans-serif; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${palette.bg}; }
      #root { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; background: ${palette.bg}; }
      #stage { position: absolute; inset: 0; }
      #stage-svg { width: ${W}px; height: ${H}px; display: block; }
${captionCss(spec)}
${spec.css ? indent(spec.css, 6) : ""}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="${W}" data-height="${H}" data-fps="${fps}">
      <div id="stage" class="clip" data-start="0" data-duration="${DUR}" data-track-index="0" data-track-kind="graphics" data-layout-allow-overflow data-layout-allow-overlap>
        <svg id="stage-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<g id="ts-punch">
${indent(svgBody, 12)}
</g>
${spec.texture === false ? "" : indent(textureOverlay(spec.texture || {}), 10)}
        </svg>
      </div>
${hookHtml}
${cap.html}
${voice}
${music}
${sfxClips.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
${indent(runtime("anchor.js"), 6)}
${indent(runtime("fx.js"), 6)}
${indent(runtime("layout.js"), 6)}
      const LINES = ${JSON.stringify(lean)};
      const SCENES = ${JSON.stringify(scn)};
      const LINES_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
      const SCENES_BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s]));
      const DUR = ${DUR};
      const tl = gsap.timeline({ paused: true });
      const at = makeAnchor(LINES, SCENES);
      const fx = makeFx(tl, { fps: ${fps}, width: ${W}, height: ${H}, lines: LINES });

${sceneJs}

      // ---------- captions ----------
${cap.js}
${hookJs}
${punchJs}

      tl.set({}, {}, DUR);
      window.__timelines["main"] = tl;
      tl.seek(0);
      if (/ts-audit/.test(location.search)) window.addEventListener("load", () => runLayoutAudit(tl, { width: ${W}, height: ${H}, duration: DUR, bands: ${JSON.stringify(captionBands(spec))}, scenes: ${JSON.stringify(scenes.map((s) => ({ start: s.start, end: s.end })))}, cuts: ${JSON.stringify(scenes.flatMap((s) => [s.start, ...(s.jumps || []).map((j) => model.at(typeof j === "string" ? j : j.at))]))} }));
    </script>
  </body>
</html>
`;
}
