// Layered 2.5D backdrops. One tag in a scene replaces ~40 lines of hand-drawn sky, sun, hills and ground:
//
//   <backdrop preset="sunset" horizon="1180" ground="water" sun="820 760" seed="4" />
//
// presets: sunset | day | dusk | night | paper | studio      ground: water | grass | road | sand | none
// Optional colour overrides: sky="#top,#mid,#bottom" hills="#far,#near" groundcolor="#top,#bottom".
// Every layer is a <g data-depth="..."> so the engine's scene camera moves give real parallax
// (far layers barely move, near layers move with the action). Clouds drift, water ripples boil,
// stars twinkle, the sun glow breathes: all generated, all deterministic.

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PRESETS = {
  sunset: { sky: ["#ff6f45", "#ff9e62", "#ffd08a"], sun: "#ffe8a3", glow: "#fff1b8", hills: ["#e88a6a", "#c95a3c"], cloud: "#fff0dc", haze: "#ffc58a" },
  day:    { sky: ["#5ab8f0", "#9fd8f7", "#e3f5ff"], sun: "#fff1a8", glow: "#ffffff", hills: ["#9cc9a0", "#5fa86a"], cloud: "#ffffff", haze: "#d7efff" },
  dusk:   { sky: ["#3b2f6b", "#a24f86", "#ff9e7a"], sun: "#ffd6a0", glow: "#ffc6a8", hills: ["#6a4a86", "#3b2a5a"], cloud: "#f6c2c8", haze: "#c77a9a" },
  night:  { sky: ["#0e1433", "#1d2a5c", "#33427e"], sun: "#f4f1de", glow: "#9fb4ff", hills: ["#2a3566", "#18204a"], cloud: "#3a4a85", haze: "#2a3a70", stars: true },
  paper:  { paper: true, bg: "#fff3dc", grid: "#ecdcbc" },
  studio: { studio: true, bg: "#ffd27a", spot: "#fff4d6" },
};
const GROUNDS = {
  water: ["#2f9db0", "#145566"], grass: ["#8cc46a", "#4f8f3e"], road: ["#6b7080", "#3d4150"], sand: ["#f0cf8a", "#d7a95c"],
};

function parseAttrs(s) { return Object.fromEntries([...s.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g)].map((m) => [m[1], m[2]])); }

// a smooth hill line across (and past) the frame, closed down to `bottom`
function hillPath(r, y, amp, bottom, bumps = 4) {
  const xs = [], step = 1500 / bumps;
  for (let i = 0; i <= bumps; i++) xs.push([-210 + i * step, y - r() * amp]);
  let d = `M-210 ${bottom} L${xs[0][0]} ${xs[0][1].toFixed(0)}`;
  for (let i = 1; i < xs.length; i++) {
    const [px, py] = xs[i - 1], [x, yy] = xs[i], mx = (px + x) / 2;
    d += ` Q${(px + step * 0.25).toFixed(0)} ${(py - amp * 0.35).toFixed(0)} ${mx.toFixed(0)} ${((py + yy) / 2).toFixed(0)} T${x.toFixed(0)} ${yy.toFixed(0)}`;
  }
  return d + ` L1290 ${bottom} Z`;
}
function cloud(x, y, s) {
  return `<path d="M${x} ${y} a${46 * s} ${46 * s} 0 0 1 ${86 * s} ${-18 * s} a${38 * s} ${38 * s} 0 0 1 ${70 * s} ${18 * s} Z" />`;
}

export function expandBackdrops(markup, sid, { width: W = 1080, height: H = 1920, ink = "#0f1220" } = {}) {
  const layers = []; let js = ""; let n = 0;
  const out = markup.replace(/<backdrop\s+([^>]*?)\/?>(?:\s*<\/backdrop>)?/g, (_, attrStr) => {
    const a = parseAttrs(attrStr);
    const id = a.id || `${sid}-bg${n ? n + 1 : ""}`; n++;
    const P = { ...(PRESETS[a.preset || "sunset"] || PRESETS.sunset) };
    if (!PRESETS[a.preset || "sunset"]) throw new Error(`<backdrop preset="${a.preset}">: use one of ${Object.keys(PRESETS).join(", ")}`);
    if (a.sky) P.sky = a.sky.split(",");
    if (a.hills) P.hills = a.hills.split(",");
    const r = rng(Number(a.seed || 3));
    const hz = Number(a.horizon || 1180);
    const parts = [];
    const L = (name, depth, body, extra = "") => { const lid = `${id}-${name}`; layers.push([`#${lid}`, depth]); parts.push(`<g id="${lid}" data-depth="${depth}"${extra}>${body}</g>`); return lid; };

    if (P.paper) {
      parts.push(`<rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="${a.bg || P.bg}" />`);
      L("grid", 0.3, `<defs><pattern id="${id}-gridp" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0 H0 V60" fill="none" stroke="${a.grid || P.grid}" stroke-width="3" /></pattern></defs><rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="url(#${id}-gridp)" />`);
      L("spot", 0.5, `<defs><radialGradient id="${id}-spotg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55" /><stop offset="1" stop-color="#ffffff" stop-opacity="0" /></radialGradient></defs><rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="url(#${id}-spotg)" />`);
      return `<g id="${id}">${parts.join("\n")}</g>`;
    }
    if (P.studio) {
      parts.push(`<defs><radialGradient id="${id}-g" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="${a.spot || P.spot}" /><stop offset="1" stop-color="${a.bg || P.bg}" /></radialGradient></defs><rect x="-200" y="-200" width="${W + 400}" height="${H + 400}" fill="url(#${id}-g)" />`);
      L("floor", 0.9, `<path d="M-200 ${hz} H${W + 200} V${H + 200} H-200 Z" fill="${ink}" opacity="0.12" /><path d="M-200 ${hz} H${W + 200}" stroke="${ink}" stroke-width="6" opacity="0.4" />`);
      return `<g id="${id}">${parts.join("\n")}</g>`;
    }

    // sky
    parts.push(`<defs><linearGradient id="${id}-skyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.sky[0]}" /><stop offset="0.62" stop-color="${P.sky[1]}" /><stop offset="1" stop-color="${P.sky[2]}" /></linearGradient>` +
      `<radialGradient id="${id}-glowg"><stop offset="0" stop-color="${P.glow}" stop-opacity="0.75" /><stop offset="1" stop-color="${P.glow}" stop-opacity="0" /></radialGradient></defs>` +
      `<rect x="-200" y="-300" width="${W + 400}" height="${hz + 500}" fill="url(#${id}-skyg)" />`);
    if (P.stars) {
      let stars = ""; for (let i = 0; i < 46; i++) stars += `<circle cx="${(r() * (W + 200) - 100).toFixed(0)}" cy="${(r() * (hz - 260)).toFixed(0)}" r="${(1.5 + r() * 3).toFixed(1)}" />`;
      const sl = L("stars", 0.05, stars, ` fill="#ffffff"`);
      js += `      tl.to("#${sl}", { opacity: 0.55, duration: 1.3, ease: "sine.inOut", yoyo: true, repeat: Math.max(1, Math.floor((S.end - S.start) / 1.3)) }, S.start);\n`;
    }
    const [sx, sy] = (a.sun || `${W * 0.78} ${hz - 380}`).split(/\s+/).map(Number);
    if (a.sun !== "none") {
      const sun = L("sun", 0.08, `<circle id="${id}-glow" cx="${sx}" cy="${sy}" r="260" fill="url(#${id}-glowg)" /><circle cx="${sx}" cy="${sy}" r="104" fill="${P.sun}" />` +
        (P.stars ? `<circle cx="${sx + 34}" cy="${sy - 22}" r="96" fill="${P.sky[1]}" opacity="0.55" />` : ""));
      js += `      tl.fromTo("#${id}-glow", { scale: 0.94, transformOrigin: "50% 50%" }, { scale: 1.06, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: Math.max(1, Math.floor((S.end - S.start) / 2.2)) }, S.start);\n`;
      void sun;
    }
    // clouds (two depths so they drift at different speeds)
    let c1 = "", c2 = "";
    for (let i = 0; i < 3; i++) c1 += cloud(-100 + r() * (W + 100), 380 + r() * (hz - 760), 0.8 + r() * 0.6);
    for (let i = 0; i < 2; i++) c2 += cloud(-60 + r() * W, 260 + r() * (hz - 620), 1.3 + r() * 0.5);
    const cf = L("clouds-far", 0.15, c1, ` fill="${P.cloud}" opacity="0.7"`);
    const cn = L("clouds", 0.3, c2, ` fill="${P.cloud}" opacity="0.92"`);
    js += `      fx.drift("#${cf}", -20, 50, S.start, S.end);\n      fx.drift("#${cn}", -30, 110, S.start, S.end);\n`;
    // hills: far (hazy), near
    L("hills-far", 0.25, `<path d="${hillPath(r, hz - 70, 150, hz + 40, 3)}" fill="${P.hills[0]}" />` +
      `<rect x="-210" y="${hz - 120}" width="${W + 420}" height="160" fill="${P.haze}" opacity="0.35" />`);
    L("hills", 0.5, `<path d="${hillPath(r, hz - 10, 110, hz + 40, 4)}" fill="${P.hills[1]}" stroke="${ink}" stroke-width="5" stroke-opacity="0.35" />`);
    // ground
    const g = a.ground || "water";
    if (g !== "none") {
      const gc = a.groundcolor ? a.groundcolor.split(",") : GROUNDS[g] || GROUNDS.water;
      let deco = "";
      if (g === "water") {
        let rip = ""; for (let i = 0; i < 9; i++) { const y = hz + 80 + r() * (H - hz - 120); rip += `M${(r() * W).toFixed(0)} ${y.toFixed(0)} h${(60 + r() * 120).toFixed(0)} `; }
        deco = `<path id="${id}-rip" d="${rip}" stroke="#ffffff" stroke-width="7" stroke-linecap="round" opacity="0.35" fill="none" />` +
          `<rect x="-210" y="${hz}" width="${W + 420}" height="14" fill="#ffffff" opacity="0.25" />`;
        js += `      fx.boil("#${id}-rip", S.start, S.end, { px: 4, seed: 5 });\n`;
      } else if (g === "grass") {
        let tufts = ""; for (let i = 0; i < 14; i++) { const x = r() * W, y = hz + 60 + r() * (H - hz - 100); tufts += `M${x.toFixed(0)} ${y.toFixed(0)} l-8 -22 M${(x + 10).toFixed(0)} ${y.toFixed(0)} l2 -28 M${(x + 20).toFixed(0)} ${y.toFixed(0)} l10 -20 `; }
        deco = `<path d="${tufts}" stroke="${ink}" stroke-width="5" stroke-linecap="round" opacity="0.25" fill="none" />`;
      } else if (g === "road") {
        deco = `<path d="M-210 ${hz + 160} H${W + 210}" stroke="#ffffff" stroke-width="12" stroke-dasharray="70 60" opacity="0.7" />`;
      }
      L("ground", 1, `<defs><linearGradient id="${id}-gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${gc[0]}" /><stop offset="1" stop-color="${gc[1]}" /></linearGradient></defs>` +
        `<rect x="-210" y="${hz}" width="${W + 420}" height="${H - hz + 300}" fill="url(#${id}-gg)" />${deco}`);
    }
    return `<g id="${id}">${parts.join("\n")}</g>`;
  });
  // any hand-made layer the scene marked with data-depth also joins the parallax
  for (const m of out.matchAll(/<g\s+id="([^"]+)"[^>]*\sdata-depth="([\d.]+)"/g)) {
    if (!layers.some(([sel]) => sel === `#${m[1]}`)) layers.push([`#${m[1]}`, Number(m[2])]);
  }
  return { markup: out, layers, js };
}
