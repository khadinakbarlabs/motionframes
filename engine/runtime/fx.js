// toonshorts acting + camera helpers, inlined into every built short.
// All helpers write tweens onto the one paused timeline `tl`, so every frame is a
// function of time (no timers, no unseeded random, no infinite repeats).
// Rules behind the numbers: references/motion.md.

function makeFx(tl, opts) {
  const FPS = opts.fps || 30, F = 1 / FPS;
  const W = opts.width || 1080, H = opts.height || 1920;

  // seeded random (mulberry32) so "random" blinks/boil are identical every render
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const smoother = (p) => p * p * p * (p * (p * 6 - 15) + 10); // smootherstep ease for camera glides

  const fx = {
    rng,
    smoother,

    // pop in: small + transparent -> overshoot -> settle
    pop(sel, t, { from = 0.5, dur = 0.32, origin = "50% 50%" } = {}) {
      tl.fromTo(sel, { scale: from, opacity: 0, transformOrigin: origin }, { scale: 1, opacity: 1, duration: dur, ease: "back.out(2.2)" }, t);
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
      tl.to(sel, { scaleY: 1 - amt, scaleX: 1 + amt / 2, transformOrigin: origin, duration: 0.16, ease: "power2.in" }, t)
        .to(sel, { scaleY: 1 + amt / 2.5, scaleX: 1 - amt / 4, duration: 0.18, ease: "power2.out" }, t + 0.16)
        .to(sel, { scaleY: 1, scaleX: 1, duration: 0.34, ease: "back.out(2)" }, t + 0.34);
    },

    // blink: 4 frames shut
    blink(sel, t) {
      tl.to(sel, { scaleY: 0.1, transformOrigin: "50% 50%", duration: 2 * F }, t).to(sel, { scaleY: 1, duration: 2 * F }, t + 2 * F);
    },
    // seeded blinks every 0.5-2.3 s between t0 and t1
    blinks(sel, t0, t1, seed = 7) {
      const r = rng(seed); for (let t = t0 + 0.4 + r(); t < t1 - 0.2; t += 0.5 + r() * 1.8) fx.blink(sel, t);
    },

    // idle breathing (finite repeats only)
    breathe(sel, t0, t1, { amt = 0.012, period = 3.2, origin = "50% 100%" } = {}) {
      const n = Math.max(1, Math.floor((t1 - t0) / period));
      tl.fromTo(sel, { scaleY: 1, transformOrigin: origin }, { scaleY: 1 + amt, duration: period / 2, ease: "sine.inOut", yoyo: true, repeat: n * 2 - 1 }, t0);
    },

    // hand-drawn "boil": tiny seeded jitter held for 1/12 s (12 fps on twos)
    boil(sel, t0, t1, { px = 1.2, seed = 3 } = {}) {
      const r = rng(seed); for (let t = t0; t < t1; t += 1 / 12) tl.set(sel, { x: (r() - 0.5) * 2 * px, y: (r() - 0.5) * 2 * px }, t);
      tl.set(sel, { x: 0, y: 0 }, t1);
    },

    // walk a rig from x0 to x1 (constant speed, legs swing opposite arms, body dips at contact)
    // rig parts follow the naming of rigs/*.svg: <id>-legL/-legR/-armL/-armR/-body. Returns the step times.
    walk(id, t0, t1, x0, x1, { stepT = 0.36, amp = 22, bob = 8 } = {}) {
      const n = Math.max(2, Math.round((t1 - t0) / stepT)), st = (t1 - t0) / n, steps = [];
      tl.fromTo(`#${id}`, { x: x0 }, { x: x1, duration: t1 - t0, ease: "none" }, t0);
      tl.set([`#${id}-legL`, `#${id}-legR`, `#${id}-armL`, `#${id}-armR`], { transformOrigin: "50% 0%" }, t0);
      for (let i = 0; i < n; i++) {
        const t = t0 + i * st, s = i % 2 ? 1 : -1, a = i >= n - 2 ? amp * 0.5 : amp;
        tl.to(`#${id}-legL`, { rotation: a * s, duration: st, ease: "sine.inOut" }, t)
          .to(`#${id}-legR`, { rotation: -a * s, duration: st, ease: "sine.inOut" }, t)
          .to(`#${id}-armL`, { rotation: -0.7 * a * s, duration: st, ease: "sine.inOut" }, t + 0.04)
          .to(`#${id}-armR`, { rotation: 0.7 * a * s, duration: st, ease: "sine.inOut" }, t + 0.04)
          .to(`#${id}-body`, { y: -bob, duration: st / 2, ease: "sine.out" }, t)
          .to(`#${id}-body`, { y: 0, duration: st / 2, ease: "sine.in" }, t + st / 2);
        steps.push(+(t + st).toFixed(3));
      }
      tl.to([`#${id}-legL`, `#${id}-legR`, `#${id}-armL`, `#${id}-armR`], { rotation: 0, duration: 0.25, ease: "power2.out" }, t1);
      return steps;
    },

    // mouth flaps on the words of a voice line (rig has <id>-mouthO open + <id>-mouth closed)
    talk(id, lineId) {
      const line = (opts.lines || []).find((l) => l.id === lineId); if (!line) return;
      for (const w of line.words || []) {
        const shut = Math.max(w.start + 2 * F, w.end - F);
        tl.set(`#${id}-mouthO`, { opacity: 1 }, w.start).set(`#${id}-mouth`, { opacity: 0 }, w.start)
          .set(`#${id}-mouthO`, { opacity: 0 }, shut).set(`#${id}-mouth`, { opacity: 1 }, shut);
      }
    },

    // look: turn head + eyes toward a side (-1 left, 1 right, 0 front)
    look(id, dir, t, dur = 0.4) {
      tl.to(`#${id}-head`, { rotation: 8 * dir, transformOrigin: "50% 100%", duration: dur, ease: "power2.inOut" }, t)
        .to(`#${id}-eyes`, { x: 6 * dir, duration: dur * 0.7, ease: "power2.out" }, t);
    },

    // camera: smootherstep glide to a framing. origin = point that stays put ("x y" in stage px)
    cam(sel, { scale = 1, x = 0, y = 0, rotation = 0 }, t, dur = 1.0, origin = `${W / 2} ${H / 2}`) {
      tl.to(sel, { scale, x, y, rotation, svgOrigin: origin, duration: dur, ease: smoother }, t);
    },
    camSet(sel, { scale = 1, x = 0, y = 0, rotation = 0 }, t = 0, origin = `${W / 2} ${H / 2}`) {
      tl.set(sel, { scale, x, y, rotation, svgOrigin: origin }, t);
    },

    // impact kick: offset flips sign every frame and decays over 7 frames (apply to a wrapper, not the cam)
    kick(sel, t, amp = 16) {
      for (let i = 0; i < 7; i++) tl.set(sel, { x: (i % 2 ? -1 : 1) * amp * (1 - i / 7), y: (i % 2 ? 1 : -1) * amp * 0.4 * (1 - i / 7) }, t + i * F);
      tl.set(sel, { x: 0, y: 0 }, t + 7 * F);
    },
    // white/colour flash
    flash(sel, t, dur = 0.12) { tl.set(sel, { opacity: 0.85 }, t).to(sel, { opacity: 0, duration: dur, ease: "power1.out" }, t + F); },

    // parallax drift for layers during a scene
    drift(sel, fromX, toX, t0, t1) { tl.fromTo(sel, { x: fromX }, { x: toX, duration: t1 - t0, ease: "none" }, t0); },

    // grow a bar/fill from an edge (thermometer, ruler, progress)
    grow(sel, t, dur = 0.8, { axis = "Y", origin = "50% 100%", from = 0, to = 1 } = {}) {
      tl.fromTo(sel, { [`scale${axis}`]: from, transformOrigin: origin }, { [`scale${axis}`]: to, duration: dur, ease: "power2.out" }, t);
    },
  };
  return fx;
}
