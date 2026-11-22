// toonshorts layout audit. Runs only when the page is opened with ?ts-audit (by "toonshorts layout"),
// never during a render. It steps the timeline every 0.2 s and measures what is on screen:
//   - faces (rig heads + hats) and key art (<text>, [data-key]) per frame
//   - which caption band (high / mid / low) keeps each caption clear of faces and key art
//   - text-on-text / key-on-key overlaps, faces or key art cut off by the frame or under the platform buttons
// The result is written into <script id="ts-audit" type="application/json"> for the CLI to read.

function runLayoutAudit(tl, opts) {
  const W = opts.width, H = opts.height, DUR = opts.duration, BANDS = opts.bands, CUTS = opts.cuts || [];
  // safe area shared by TikTok, Instagram Reels and YouTube Shorts (HyperFrames' own numbers, at 1080x1920)
  const SAFE = [{ x: 120, y: 288, w: 768, h: 552 }, { x: 120, y: 840, w: 660, h: 408 }].map((r) => ({ x: r.x * W / 1080, y: r.y * H / 1920, w: r.w * W / 1080, h: r.h * H / 1920 }));
  const nearCut = (t) => CUTS.some((c) => t > c - 0.3 && t < c + 0.45); // transitions slide whole scenes off-frame on purpose
  const root = document.getElementById("root").getBoundingClientRect();
  const R = (el) => { const r = el.getBoundingClientRect(); return { x: r.left - root.left, y: r.top - root.top, w: r.width, h: r.height }; };
  const area = (a) => Math.max(0, a.w) * Math.max(0, a.h);
  const inter = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; };
  const shown = (el) => { for (let e = el; e && e.id !== "stage-svg"; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false; } return true; };
  const sceneOf = (el) => (el.closest(".scene") || {}).id || "";
  const label = (el) => el.id || (el.closest("[id]") || {}).id || el.tagName;
  const faces = [...document.querySelectorAll("#stage-svg .ts-face")];
  const bodies = [...document.querySelectorAll("#stage-svg .ts-body")];
  const SC = opts.scenes || [{ start: 0, end: DUR }];
  const keys = [...document.querySelectorAll("#stage-svg text, #stage-svg [data-key]")].filter((el) => !el.closest("[data-key]") || el.hasAttribute("data-key"));
  const caps = [...document.querySelectorAll(".cap")];
  const capInfo = caps.map((c) => ({ id: c.id, start: Number(c.dataset.start), dur: Number(c.dataset.duration), text: c.textContent.trim() }));
  // caption height at each band (span box, measured once, not animated)
  const capBox = caps.map((c) => { tl.seek(Number(c.dataset.start) + Number(c.dataset.duration) * 0.6, false); const s = c.querySelector("span"); const r = R(s); return { x: r.x, w: r.w, h: r.h, top0: R(c).y }; });

  const samples = [];
  for (let t = 0.05; t < DUR; t += 0.2) {
    tl.seek(t, false);
    const f = faces.filter(shown).map((el) => ({ id: label(el), ...R(el) })).filter((r) => r.w > 2);
    const k = keys.filter(shown).map((el) => ({ id: label(el), sc: sceneOf(el), ...R(el) })).filter((r) => r.w > 2);
    const b = bodies.filter(shown).map((el) => ({ id: label(el), ...R(el) })).filter((r) => r.w > 2);
    samples.push({ t: +t.toFixed(2), f, k, b });
  }
  tl.seek(0, false);

  const issues = [];
  const seen = new Set();
  const note = (kind, t, msg) => { const key = kind + msg; if (seen.has(key)) return; seen.add(key); issues.push({ kind, t, msg }); };

  // caption bands: one band per scene, so captions do not hop around. Cost = covered area, weighted:
  // faces x3, key art x2, bodies x1. The first band (high) wins ties; a face still covered is reported.
  const scoreAt = (i, top) => {
    const c = capInfo[i], b = capBox[i], box = { x: b.x, y: top, w: b.w, h: b.h }, A = Math.max(1, area(box));
    let cost = 0, face = 0, what = "", when = 0;
    for (const s of samples) {
      if (s.t < c.start - 0.05 || s.t > c.start + c.dur || nearCut(s.t)) continue;
      for (const [list, wgt] of [[s.f, 3], [s.k, 2], [s.b, 1]]) for (const o of list) {
        const a = inter(box, o) / A; if (!a) continue;
        if (a * wgt > cost) when = s.t;
        cost = Math.max(cost, a * wgt); if (wgt === 3 && a > face) { face = a; what = o.id; } else if (!what) what = o.id;
      }
    }
    return { top, cost, face, what, when };
  };
  // captions that repeat a label already visible in the art are dropped (the art says it bigger)
  const norm = (x) => String(x).toUpperCase().replace(/[^A-Z0-9+%]/g, "");
  const hide = [];
  capInfo.forEach((c, i) => {
    const mid = c.start + c.dur * 0.5; tl.seek(mid, false);
    const txt = keys.filter(shown).map((el) => norm(el.textContent));
    if (txt.includes(norm(c.text))) { hide.push({ start: c.start, text: c.text }); note("duplicate", c.start, `caption "${c.text}" repeats a label already on screen: dropped`); }
  });
  tl.seek(0, false);
  const chosen = capInfo.map((c) => ({ id: c.id, start: c.start, text: c.text, top: BANDS[0], moved: false }));
  for (const sc of SC) {
    const idx = capInfo.map((c, i) => i).filter((i) => capInfo[i].start >= sc.start - 0.01 && capInfo[i].start < sc.end - 0.01);
    if (!idx.length) continue;
    const per = BANDS.map((top) => ({ top, list: idx.map((i) => scoreAt(i, top)) }));
    const total = (p) => p.list.reduce((a, x) => a + x.cost, 0);
    const clean = per.find((p) => p.list.every((x) => x.cost < 0.04));
    const best = clean || per.slice().sort((a, b) => total(a) - total(b))[0];
    if (best.top !== BANDS[0]) { const hi = per[0].list.find((x) => x.cost >= 0.04); if (hi) note("moved", sc.start, `captions from ${sc.start.toFixed(1)} s moved to y ${best.top}: the high band hits ${hi.what} at ${hi.when.toFixed(1)} s`); }
    best.list.forEach((x, k) => {
      const i = idx[k]; let pick = x;
      // a caption that still covers a face in the scene band may take its own best band
      if (x.face >= 0.02) { const alt = BANDS.map((top) => scoreAt(i, top)).sort((a, b) => a.cost - b.cost)[0]; if (alt.face < x.face) pick = alt; }
      chosen[i] = { ...chosen[i], top: pick.top, moved: pick.top !== BANDS[0] };
      if (pick.face >= 0.02) note("caption", capInfo[i].start, `caption "${capInfo[i].text}" covers face ${pick.what} (${Math.round(pick.face * 100)}% of the caption) in every band`);
    });
  }

  const runs = {};
  for (const s of samples) {
    // key art on key art (same moment): labels and numbers stacked on each other
    for (let i = 0; i < s.k.length; i++) for (let j = i + 1; j < s.k.length; j++) {
      const a = s.k[i], b = s.k[j]; if (a.id === b.id || a.sc !== b.sc) continue; // two scenes overlap only during a transition
      const ov = inter(a, b) / Math.max(1, Math.min(area(a), area(b)));
      if (ov > 0.25) note("overlap", s.t, `${a.id} and ${b.id} overlap (${Math.round(ov * 100)}%)`);
    }
    for (const a of s.f) for (const b of s.k) { const ov = inter(a, b) / Math.max(1, Math.min(area(a), area(b))); if (ov > 0.25) note("overlap", s.t, `${b.id} sits on face ${a.id} (${Math.round(ov * 100)}%)`); }
    // cut off by the frame, or under the platform buttons (right edge, lower half)
    if (nearCut(s.t)) continue;
    for (const o of [...s.f, ...s.k]) {
      const vis = inter(o, { x: 0, y: 0, w: W, h: H }) / Math.max(1, area(o));
      // only when it stays cut for 0.6 s+ (a walk-in or a fly-past is fine)
      if (vis < 0.85 && vis > 0) { runs[o.id] = (runs[o.id] || 0) + 1; if (runs[o.id] === 3) note("cutoff", s.t, `${o.id} is ${Math.round((1 - vis) * 100)}% outside the frame`); }
      else runs[o.id] = 0;
    }
    // key art (labels, numbers) must sit inside the area TikTok, Reels and Shorts all keep clear of their UI
    for (const o of s.k) {
      const safe = inter(o, SAFE[0]) + inter(o, SAFE[1]);
      if (safe / Math.max(1, area(o)) < 0.97) { runs["safe" + o.id] = (runs["safe" + o.id] || 0) + 1; if (runs["safe" + o.id] === 3) note("unsafe", s.t, `${o.id} is outside the platform safe area (x 120-888, y 288-1248; x < 780 below y 840)`); }
      else runs["safe" + o.id] = 0;
    }
  }
  const out = document.createElement("script");
  out.type = "application/json"; out.id = "ts-audit";
  out.textContent = JSON.stringify({ captions: chosen, hide, issues, samples: samples.length });
  document.body.appendChild(out);
}
