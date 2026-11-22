// motionframes acting + camera helpers, inlined into every built short.
// All helpers write tweens onto the one paused timeline `tl`, so every frame is a
// function of time (no timers, no unseeded random, no infinite repeats).
// Rules behind the numbers: skills/motionframes/references/motion.md.

function makeFx(tl, opts) {
  const FPS = opts.fps || 30, F = 1 / FPS;
  const W = opts.width || 1080, H = opts.height || 1920;
  const has = (sel) => typeof document === "undefined" || !!document.querySelector(sel);
  const C = "50% 50%"; // rig joints carry pivot circles, so their bbox centre is the joint

  // seeded random (mulberry32) so "random" blinks/boil are identical every render
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const smoother = (p) => p * p * p * (p * (p * 6 - 15) + 10); // smootherstep ease for camera glides

  // ---- faces ------------------------------------------------------------------
  const MOUTHS = ["mouth", "mouthO", "mouthA", "mouthU", "mouthE", "mouthF"];
  const FACES = {
    neutral:   { bl: 0,   br: 0,   by: 0,   pupil: 1,    rest: "mouth" },
    happy:     { bl: -6,  br: 6,   by: -6,  pupil: 1,    rest: "mouthE" },
    surprised: { bl: 0,   br: 0,   by: -16, pupil: 0.75, rest: "mouthU" },
    shocked:   { bl: 0,   br: 0,   by: -20, pupil: 0.65, rest: "mouthA" },
    worried:   { bl: 14,  br: -14, by: -4,  pupil: 1,    rest: "mouthF" },
    sad:       { bl: 18,  br: -18, by: 2,   pupil: 1.05, rest: "mouthF" },
    angry:     { bl: -18, br: 18,  by: 6,   pupil: 0.9,  rest: "mouthF" },
    proud:     { bl: -4,  br: 4,   by: -8,  pupil: 1,    rest: "mouthE" },
    thinking:  { bl: 10,  br: -4,  by: -6,  pupil: 0.9,  rest: "mouthF" },
  };
  const restLog = {}; // id -> [[t, mouth]] so lip sync closes to the face that is showing

  function showMouth(id, shape, t) {
    for (const m of MOUTHS) if (has(`#${id}-${m}`)) tl.set(`#${id}-${m}`, { opacity: m === shape ? 1 : 0 }, t);
  }
  function restAt(id, t) {
    let m = "mouth"; for (const [tt, mm] of restLog[id] || []) if (tt <= t + 1e-6) m = mm; return m;
  }

  // ---- poses (degrees; upper arm about the shoulder, forearm about the elbow) ----
  const POSES = {
    idle:   { aL: 0,   fL: 0,   aR: 0,    fR: 0 },
    point:  { aL: 0,   fL: 0,   aR: -95,  fR: -6 },
    pointL: { aL: 95,  fL: 6,   aR: 0,    fR: 0 },
    cheer:  { aL: 160, fL: 12,  aR: -160, fR: -12 },
    shrug:  { aL: 48,  fL: 62,  aR: -48,  fR: -62 },
    hips:   { aL: 34,  fL: -96, aR: -34,  fR: 96 },
    think:  { aL: 0,   fL: 0,   aR: -18,  fR: 150 },
    wave:   { aL: 0,   fL: 0,   aR: -150, fR: -20 },
    present:{ aL: 30,  fL: 40,  aR: -70,  fR: -40 },
    reach:  { aL: 70,  fL: 10,  aR: -70,  fR: -10 },
  };

  const fx = {
    rng, smoother, FACES, POSES,

    // pop in: small + transparent -> overshoot -> settle
    pop(sel, t, { from = 0.5, dur = 0.32, origin = "50% 50%" } = {}) {
      tl.fromTo(sel, { scale: from, opacity: 0, transformOrigin: origin }, { scale: 1, opacity: 1, duration: dur, ease: "back.out(2.2)", immediateRender: false }, t);
      tl.set(sel, { opacity: 0 }, 0);
    },
    out(sel, t, dur = 0.2) { tl.to(sel, { opacity: 0, scale: 0.85, duration: dur, ease: "power2.in" }, t); },
    show(sel, t) { tl.set(sel, { opacity: 1 }, t); },
    hide(sel, t) { tl.set(sel, { opacity: 0 }, t); },
    swap(outSel, inSel, t, dur = 0.4) {
      tl.to(outSel, { opacity: 0, duration: dur, ease: "power1.inOut" }, t).to(inSel, { opacity: 1, duration: dur, ease: "power1.inOut" }, t);
    },

    // eased move (any GSAP vars); default ease matches a planned, weighted move
    move(sel, vars, t, dur = 0.6, ease = "power2.inOut") { tl.to(sel, { ...vars, duration: dur, ease }, t); },

    // anticipation -> squash -> stretch -> settle (the "land" or "react" beat)
    squash(sel, t, { amt = 0.08, origin = "50% 100%" } = {}) {
      tl.to(sel, { scaleY: 1 - amt, scaleX: 1 + amt / 2, transformOrigin: origin, duration: 0.14, ease: "power2.in" }, t)
        .to(sel, { scaleY: 1 + amt / 2, scaleX: 1 - amt / 4, duration: 0.16, ease: "power2.out" }, t + 0.14)
        .to(sel, { scaleY: 1, scaleX: 1, duration: 0.4, ease: "elastic.out(1, 0.45)" }, t + 0.3);
    },
    // a jump of `h` px with squash on take-off and landing
    hop(id, t, h = 90) {
      fx.squash(`#${id}`, t - 0.14, { amt: 0.1 });
      tl.to(`#${id}-body`, { y: -h, duration: 0.24, ease: "power2.out" }, t + 0.02)
        .to(`#${id}-body`, { y: 0, duration: 0.22, ease: "power2.in" }, t + 0.26);
      fx.squash(`#${id}`, t + 0.48, { amt: 0.1 });
    },

    // blink: 4 frames shut
    blink(sel, t) {
      tl.to(sel, { scaleY: 0.1, transformOrigin: "50% 50%", duration: 2 * F }, t).to(sel, { scaleY: 1, duration: 2 * F }, t + 2 * F);
    },
    // seeded blinks every 0.8-3.2 s between t0 and t1 (sometimes a double blink)
    blinks(sel, t0, t1, seed = 7) {
      const r = rng(seed);
      for (let t = t0 + 0.4 + r(); t < t1 - 0.2; t += 0.8 + r() * 2.4) { fx.blink(sel, t); if (r() < 0.2 && t + 0.25 < t1) fx.blink(sel, t + 0.22); }
    },

    // idle breathing (finite repeats only)
    breathe(sel, t0, t1, { amt = 0.015, period = 2.8, origin = "50% 100%" } = {}) {
      const n = Math.max(1, Math.floor((t1 - t0) / period));
      tl.fromTo(sel, { scaleY: 1, transformOrigin: origin }, { scaleY: 1 + amt, duration: period / 2, ease: "sine.inOut", yoyo: true, repeat: n * 2 - 1 }, t0);
    },

    // hand-drawn "boil": tiny seeded jitter held for 1/12 s (12 fps on twos)
    boil(sel, t0, t1, { px = 1.2, seed = 3 } = {}) {
      const r = rng(seed); for (let t = t0; t < t1; t += 1 / 12) tl.set(sel, { x: (r() - 0.5) * 2 * px, y: (r() - 0.5) * 2 * px }, t);
      tl.set(sel, { x: 0, y: 0 }, t1);
    },

    // expression: brows, pupils and the resting mouth. Call before talk() so lip sync closes to this face.
    face(id, name, t, dur = 0.18) {
      const f = FACES[name] || FACES.neutral;
      if (has(`#${id}-browL`)) {
        tl.to(`#${id}-browL`, { rotation: f.bl, y: f.by, transformOrigin: "50% 50%", duration: dur, ease: "back.out(2)" }, t)
          .to(`#${id}-browR`, { rotation: f.br, y: f.by, transformOrigin: "50% 50%", duration: dur, ease: "back.out(2)" }, t);
      } else if (has(`#${id}-brows`)) tl.to(`#${id}-brows`, { y: f.by, duration: dur }, t);
      if (has(`#${id}-pupils`)) tl.to(`#${id}-pupils`, { scale: f.pupil, transformOrigin: "50% 50%", duration: dur }, t);
      (restLog[id] = restLog[id] || []).push([t, f.rest]);
      restLog[id].sort((a, b) => a[0] - b[0]);
      showMouth(id, f.rest, t);
    },

    // body pose: arms (and forearms) about their joints; overshoots a touch, then settles
    pose(id, name, t, dur = 0.35) {
      const p = typeof name === "string" ? (POSES[name] || POSES.idle) : name;
      const parts = [["armL", p.aL], ["foreL", p.fL], ["armR", p.aR], ["foreR", p.fR]];
      for (const [part, deg] of parts) if (has(`#${id}-${part}`)) tl.to(`#${id}-${part}`, { rotation: deg || 0, transformOrigin: C, duration: dur, ease: "back.out(1.6)" }, t);
      if (name === "wave") for (let i = 0; i < 3; i++) tl.to(`#${id}-foreR`, { rotation: i % 2 ? -20 : 18, duration: 0.16, ease: "sine.inOut" }, t + dur + i * 0.16);
    },
    // gesture: pose, hold, back to idle
    gesture(id, name, t, hold = 0.8) { fx.pose(id, name, t); fx.pose(id, "idle", t + 0.35 + hold, 0.4); },

    nod(id, t, n = 2) {
      for (let i = 0; i < n; i++) tl.to(`#${id}-head`, { rotation: 0, y: 8, transformOrigin: C, duration: 0.1, ease: "sine.out" }, t + i * 0.22).to(`#${id}-head`, { y: 0, duration: 0.12, ease: "sine.in" }, t + i * 0.22 + 0.1);
    },

    // walk a rig from x0 to x1: thighs swing, shins bend on the passing pose, body dips at contact
    walk(id, t0, t1, x0, x1, { stepT = 0.34, amp = 20, bob = 10 } = {}) {
      const n = Math.max(2, Math.round((t1 - t0) / stepT)), st = (t1 - t0) / n, steps = [];
      const knees = has(`#${id}-shinL`);
      tl.fromTo(`#${id}`, { x: x0 }, { x: x1, duration: t1 - t0, ease: "none" }, t0);
      tl.set([`#${id}-legL`, `#${id}-legR`, `#${id}-armL`, `#${id}-armR`], { transformOrigin: C }, t0);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * st, s = i % 2 ? 1 : -1, a = i >= n - 2 ? amp * 0.5 : amp;
        tl.to(`#${id}-legL`, { rotation: a * s, duration: st, ease: "sine.inOut" }, t)
          .to(`#${id}-legR`, { rotation: -a * s, duration: st, ease: "sine.inOut" }, t)
          .to(`#${id}-armL`, { rotation: -0.8 * a * s, duration: st, ease: "sine.inOut" }, t + 0.04)
          .to(`#${id}-armR`, { rotation: 0.8 * a * s, duration: st, ease: "sine.inOut" }, t + 0.04)
          .to(`#${id}-body`, { y: -bob, duration: st / 2, ease: "sine.out" }, t)
          .to(`#${id}-body`, { y: 0, duration: st / 2, ease: "sine.in" }, t + st / 2);
        if (knees) {
          const back = s > 0 ? `#${id}-shinR` : `#${id}-shinL`;
          tl.to(back, { rotation: 22 * (s > 0 ? -1 : 1) * (a / amp), transformOrigin: C, duration: st / 2, ease: "sine.out" }, t)
            .to(back, { rotation: 0, duration: st / 2, ease: "sine.in" }, t + st / 2);
        }
        steps.push(+(t + st).toFixed(3));
      }
      tl.to([`#${id}-legL`, `#${id}-legR`, `#${id}-armL`, `#${id}-armR`], { rotation: 0, duration: 0.25, ease: "power2.out" }, t1);
      return steps;
    },

    // lip sync on the words of a voice line: vowel-shaped mouths, ~8 changes a second, closes between words
    talk(id, lineId, { from = -Infinity, to = Infinity } = {}) {
      const line = (opts.lines || []).find((l) => l.id === lineId); if (!line) return;
      const rich = has(`#${id}-mouthA`);
      const shapeOf = (ch) => (!rich ? "mouthO" : /[a]/.test(ch) ? "mouthA" : /[ouw]/.test(ch) ? "mouthU" : /[ei]/.test(ch) ? "mouthE" : "mouthO");
      const words = (line.words || []).filter((w) => w.start >= from && w.end <= to);
      words.forEach((w, wi) => {
        const vowels = (w.text.toLowerCase().match(/[aeiouyw]/g) || ["o"]);
        const n = Math.max(1, Math.round((w.end - w.start) / 0.12));
        for (let k = 0; k < n; k++) {
          const t = w.start + k * (w.end - w.start) / n;
          showMouth(id, k % 2 && n > 2 ? "mouthO" : shapeOf(vowels[Math.floor(k / 2) % vowels.length]), t);
        }
        const next = words[wi + 1];
        if (!next || next.start - w.end > 0.07) showMouth(id, restAt(id, w.end), Math.max(w.start + 2 * F, w.end - F));
      });
    },

    // look: turn head + eyes toward a side (-1 left, 1 right, 0 front)
    look(id, dir, t, dur = 0.35) {
      tl.to(`#${id}-head`, { rotation: 7 * dir, transformOrigin: C, duration: dur, ease: "power2.inOut" }, t);
      const eyes = has(`#${id}-pupils`) ? `#${id}-pupils` : `#${id}-eyes`;
      tl.to(eyes, { x: 9 * dir, duration: dur * 0.6, ease: "power2.out" }, t - 0.04);
    },

    // everything a character does when nobody tells it what to do: breathe, blink, head drift, glance
    alive(id, t0, t1, { seed = 1, talks = [], face = null, pose = null } = {}) {
      const r = rng(seed * 97 + 13);
      if (face) fx.face(id, face, t0, 0.01);
      if (pose) fx.pose(id, pose, t0, 0.01);
      fx.breathe(`#${id}-body`, t0, t1);
      fx.blinks(`#${id}-eyes`, t0, t1, seed);
      if (has(`#${id}-headbob`)) {
        for (let t = t0 + 0.2; t < t1 - 1.2; t += 1.6 + r() * 1.2) {
          tl.to(`#${id}-headbob`, { rotation: (r() - 0.5) * 5, y: (r() - 0.5) * 5, transformOrigin: "50% 80%", duration: 1.2, ease: "sine.inOut" }, t);
        }
      }
      for (const L of talks) fx.talk(id, L, { from: t0, to: t1 });
    },

    // camera: smootherstep glide to a framing. origin = point that stays put ("x y" in stage px)
    cam(sel, { scale = 1, x = 0, y = 0, rotation = 0 }, t, dur = 1.0, origin = `${W / 2} ${H / 2}`) {
      tl.to(sel, { scale, x, y, rotation, svgOrigin: origin, duration: dur, ease: smoother }, t);
    },
    camSet(sel, { scale = 1, x = 0, y = 0, rotation = 0 }, t = 0, origin = `${W / 2} ${H / 2}`) {
      tl.set(sel, { scale, x, y, rotation, svgOrigin: origin }, t);
    },
    // punch-in on a payoff word: quick 8% push that eases back over `hold`
    punch(sel, t, { amt = 0.08, hold = 0.9, origin = `${W / 2} ${H / 2}` } = {}) {
      tl.to(sel, { scale: 1 + amt, svgOrigin: origin, duration: 0.12, ease: "power3.out" }, t - 0.04)
        .to(sel, { scale: 1, duration: hold, ease: "sine.inOut" }, t + 0.08);
    },

    // impact kick: decaying shake with eased in-between frames (apply to a wrapper, not the cam)
    kick(sel, t, amp = 16) {
      const r = rng(Math.round(t * 100));
      for (let i = 0; i < 8; i++) {
        const k = amp * Math.pow(1 - i / 8, 1.6);
        tl.to(sel, { x: (r() - 0.5) * 2 * k, y: (r() - 0.5) * 1.4 * k, rotation: (r() - 0.5) * k * 0.08, duration: F * 1.5, ease: "sine.inOut" }, t + i * F * 1.5);
      }
      tl.to(sel, { x: 0, y: 0, rotation: 0, duration: F * 2, ease: "sine.out" }, t + 12 * F);
    },
    // white/colour flash
    flash(sel, t, dur = 0.12) { tl.set(sel, { opacity: 0.85 }, t).to(sel, { opacity: 0, duration: dur, ease: "power1.out" }, t + F); },

    // parallax drift for layers during a scene
    drift(sel, fromX, toX, t0, t1) { tl.fromTo(sel, { x: fromX }, { x: toX, duration: t1 - t0, ease: "none" }, t0); },

    // grow a bar/fill from an edge (thermometer, ruler, progress)
    grow(sel, t, dur = 0.8, { axis = "Y", origin = "50% 100%", from = 0, to = 1 } = {}) {
      tl.fromTo(sel, { [`scale${axis}`]: from, transformOrigin: origin }, { [`scale${axis}`]: to, duration: dur, ease: "power2.out" }, t);
    },

    // ---- engine-only: scene camera moves with depth parallax, and transitions -------------------
    sceneMove(sid, t0, t1, move, layers) {
      const len = t1 - t0, o = `${W / 2} ${H * 0.55}`;
      const m = typeof move === "string" ? { type: move } : move || { type: "push" };
      const amt = m.amt ?? 0.07;
      let from = { scale: 1, x: 0, y: 0 }, to = { scale: 1 + amt, x: 0, y: 0 };
      if (m.type === "pull") { from = { scale: 1 + amt, x: 0, y: 0 }; to = { scale: 1, x: 0, y: 0 }; }
      if (m.type === "pan-left") { from = { scale: 1.1, x: -34, y: 0 }; to = { scale: 1.12, x: 34, y: 0 }; }
      if (m.type === "pan-right") { from = { scale: 1.1, x: 34, y: 0 }; to = { scale: 1.12, x: -34, y: 0 }; }
      if (m.type === "rise") { from = { scale: 1.1, x: 0, y: 50 }; to = { scale: 1.1, x: 0, y: -40 }; }
      if (m.type === "still") { from = { scale: 1.02, x: 0, y: 0 }; to = { scale: 1.025, x: 0, y: 0 }; }
      tl.fromTo(`#${sid}-creep`, { ...from, svgOrigin: o }, { ...to, svgOrigin: o, duration: len, ease: "sine.inOut", immediateRender: false }, t0);
      // depth layers: d = 0 far (barely moves), 1 = with the action, > 1 foreground (moves more)
      for (const [sel, d] of layers) {
        const cs = (s) => Math.pow(s, d - 1), cx = (p, s) => (p * (d - 1)) / s;
        tl.fromTo(sel, { scale: cs(from.scale), x: cx(from.x, from.scale), y: cx(from.y, from.scale), svgOrigin: o },
          { scale: cs(to.scale), x: cx(to.x, to.scale) + (1 - d) * -30, y: cx(to.y, to.scale), svgOrigin: o, duration: len, ease: "sine.inOut", immediateRender: false }, t0);
      }
    },
    transition(outSel, inSel, t, type = "cut", { dur = 0.34 } = {}) {
      const a = t - dur / 2, end = a + dur + F;
      if (type === "fade") { fx.swap(outSel, inSel, t - 0.25, 0.5); return; }
      if (type === "whip" || type === "whip-left" || type === "whip-right") {
        const dir = type === "whip-right" ? 1 : -1;
        tl.set(inSel, { opacity: 1, attr: { filter: `url(${inSel}-blurf)` } }, a)
          .set(outSel, { attr: { filter: `url(${outSel}-blurf)` } }, a)
          .fromTo(outSel, { x: 0 }, { x: dir * W * 1.1, duration: dur, ease: "power3.in", immediateRender: false }, a)
          .fromTo(inSel, { x: -dir * W * 1.1 }, { x: 0, duration: dur, ease: "power3.out", immediateRender: false }, a)
          .fromTo([`${outSel}-blur`, `${inSel}-blur`], { attr: { stdDeviation: "0 0" } },
            { attr: { stdDeviation: "40 0" }, duration: dur / 2, ease: "power2.in", yoyo: true, repeat: 1, immediateRender: false }, a)
          .set(outSel, { opacity: 0, x: 0, attr: { filter: "none" } }, end)
          .set(inSel, { attr: { filter: "none" } }, end);
        return;
      }
      if (type === "push") { // zoom through: old frame rushes past camera, new one settles in
        const o = `${W / 2} ${H * 0.5}`;
        tl.set(inSel, { opacity: 0, scale: 0.84, x: 0, y: 0, svgOrigin: o, smoothOrigin: false }, a)
          .set(outSel, { svgOrigin: o, smoothOrigin: false }, a)
          .to(outSel, { scale: 1.8, opacity: 0, duration: dur, ease: "power2.in" }, a)
          .to(inSel, { scale: 1, opacity: 1, duration: dur * 1.2, ease: "power3.out" }, a + dur * 0.35)
          .set(outSel, { scale: 1 }, end + dur);
        return;
      }
      if (type === "iris") { // new scene opens in a growing circle over the old one
        const d2 = dur * 1.4;
        tl.set(inSel, { opacity: 1, attr: { "clip-path": `url(${inSel}-irisclip)` } }, a)
          .fromTo(`${inSel}-iris`, { attr: { r: 0 } }, { attr: { r: Math.hypot(W, H) * 0.62 }, duration: d2, ease: "power2.inOut", immediateRender: false }, a)
          .set(inSel, { attr: { "clip-path": "none" } }, a + d2 + F)
          .set(outSel, { opacity: 0 }, a + d2 + F);
        return;
      }
      tl.set(outSel, { opacity: 0 }, t).set(inSel, { opacity: 1 }, t); // "cut"
    },
  };
  return fx;
}
