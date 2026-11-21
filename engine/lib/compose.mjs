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
// so scene code animates "#<sid>-cam" for camera moves while the engine keeps a slow creep running.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { captionCss, captionMarkup } from "./captions.mjs";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const GSAP = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js";

const RIG_DEFAULTS = {
  x: 540, y: 1500, scale: 1, shirt: "#ff6b4a", skin: "#f6c9a0", hat: "#ffc93c", prop: "clipboard",
};

function parseAttrs(s) {
  return Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]));
}

function loadRig(type) {
  const p = join(ENGINE, "rigs", `${type}.svg`);
  if (!existsSync(p)) throw new Error(`unknown rig type "${type}" (have: stick, bean)`);
  return readFileSync(p, "utf8").replace(/<!--[\s\S]*?-->\s*/g, "");
}

export function expandRigs(markup, palette) {
  return markup.replace(/<rig\s+([^>]*?)\/?>(?:\s*<\/rig>)?/g, (_, attrStr) => {
    const a = { ink: palette.ink, limb: palette.ink, ...RIG_DEFAULTS, ...parseAttrs(attrStr) };
    if (!a.type) throw new Error(`<rig> needs a type: <rig ${attrStr}>`);
    if (!a.id) throw new Error(`<rig> needs an id: <rig ${attrStr}>`);
    let svg = loadRig(a.type).replace(/\{\{(\w+)\}\}/g, (m, k) => (a[k] !== undefined ? a[k] : m));
    svg = svg.replace(/<g id="[^"]*-(?:hat|prop)" data-(?:hat|prop)="none">[\s\S]*?<\/g>\s*/g, "");
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

  const parts = scenes.map((s) => ({ s, ...readScene(model.dir, s) }));
  const svgBody = parts.map(({ s, markup }, i) =>
    `<g id="${s.id}" class="scene" opacity="${i === 0 ? 1 : 0}"><g id="${s.id}-creep"><g id="${s.id}-cam">\n${indent(expandRigs(markup, palette), 2)}\n</g></g></g>`
  ).join("\n");
  checkIds(svgBody);

  const cap = captionMarkup(captions);
  const voice = lines.map((l) =>
    `      <audio id="vo-${l.id}" class="clip" src="${l.audio}" data-start="${l.start}" data-duration="${l.dur}" data-volume="${l.volume}" data-track-index="2"></audio>`
  ).join("\n");

  // scene switching + creep (no frame is ever fully static)
  const sceneJs = parts.map(({ s, code }, i) => {
    const len = +(s.end - s.start).toFixed(3);
    const creep = s.creep ?? spec.creep ?? 1.04;
    const sw = i === 0 ? "" : s.cut === "fade"
      ? `      fx.swap("#${parts[i - 1].s.id}", "#${s.id}", ${Math.max(0, s.start - 0.2)}, 0.4);\n`
      : `      tl.set("#${parts[i - 1].s.id}", { opacity: 0 }, ${s.start}).set("#${s.id}", { opacity: 1 }, ${s.start});\n`;
    const cr = creep === 1 ? "" : `      tl.fromTo("#${s.id}-creep", { scale: 1, svgOrigin: "${W / 2} ${H / 2}" }, { scale: ${creep}, duration: ${len}, ease: "none" }, ${s.start});\n`;
    return `      // ---------- ${s.id} (${s.file}) ${s.start}s - ${s.end}s ----------\n${sw}${cr}` +
      `      (function (tl, at, fx, S, L) {\n${indent(code.trim(), 8)}\n      })(tl, at, fx, SCENES_BY_ID["${s.id}"], LINES_BY_ID);`;
  }).join("\n\n");

  const lean = lines.map(({ id, start, end, words }) => ({ id, start, end, words }));
  const scn = scenes.map(({ id, start, end }) => ({ id, start, end }));
  const font = spec.font || "Archivo Black";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <!-- built by toonshorts from short.json: edit the spec and scenes/, then run "toonshorts build" -->
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
${indent(svgBody, 10)}
        </svg>
      </div>
${cap.html}
${voice}
${music}
${sfxClips.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
${indent(runtime("anchor.js"), 6)}
${indent(runtime("fx.js"), 6)}
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

      tl.set({}, {}, DUR);
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
`;
}
