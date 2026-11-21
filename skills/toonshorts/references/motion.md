# Motion, acting, camera

- **Timing**: every action is anchored to a word with `at()`. A reaction lands 0-3 frames (0-0.1 s) before
  its word; a cause lands 0.2-0.4 s before its sound.
- **Never static**: each scene creeps (default 1.04x over the scene). Characters breathe and blink whenever
  on screen; props that "strain" boil. No hold longer than 12 frames without some motion (QA flags it).
- **Acting**: anticipation before every big move (squash first), overshoot on arrival (`back.out`),
  settle. Eyes lead the head, head leads the body. One clear pose per beat, readable as a silhouette.
- **Walks**: feet planted, ~0.36 s per step, last 2 steps half-amplitude. Footstep cues `every` the step time.
- **Camera**: glide with `fx.cam` (smootherstep, 18-40 frames = 0.6-1.3 s), push in on the payoff word, never
  zoom out and back in within one scene. Impacts: `fx.kick` on the scene root, not the camera.
- **Cuts**: hard cut on a new beat (default), `cut: "fade"` only for time passing. Voice leads the picture
  by ≈0.1-0.3 s (anchor scenes at a word minus 0.1-0.3).
- **Depth (2.5D)**: 3 layers: far (soft colour, drifts slowly), mid (the action), near (dark foreground edge,
  drifts faster). Ink outlines 6-10 px. Light comes from one side.
