# Motion, acting, camera

- **Timing**: every action is anchored to a word with `at()`. A reaction lands 0-3 frames (0-0.1 s) before
  its word; a cause lands 0.2-0.4 s before its sound.
- **Acting per beat**: each new idea in the voice gets a visible change on the character: `face` on the
  feeling word, `pose` on the action word, `look` toward what is talked about, `hop`/`squash` on surprises.
  2-4 acting beats per scene. Faces read first: change the face, then the body 0.1 s later.
- **Alive by default**: rigs breathe, blink (seeded, sometimes double) and drift their head. Lip sync only for
  lines the character actually says (`talks`, or `fx.talk(id, L, { from })` for part of a line).
- **Size**: the character is the subject. Bean rig at scale 1.0-1.3 on a full set, 0.5-0.7 only as a guide
  beside a diagram. Keep the head under the caption band (below y≈480).
- **Walks**: ~0.34 s per step, last 2 steps half-amplitude. Footstep cues `every` the step time.
- **Camera**: the scene move (`cam`) runs under everything with parallax. Add `fx.cam` glides
  (0.6-1.3 s) to push in on the payoff, `fx.punch` for a single hit word. Never zoom out and back in
  within one scene. Impacts: `fx.kick` on `#<sid>-cam`.
- **Transitions**: `whip` for a new beat in the same story line, `push` to go deeper into a detail,
  `iris` to open a new chapter or the ending, `fade` only for time passing. Voice leads the picture by
  ≈0.1-0.2 s (anchor scenes at a word minus 0.1-0.2).
- **Depth (2.5D)**: backdrop layers give far/mid/near. Ink outlines 6-10 px. One light side: shade the
  opposite side of props with ink at 15% opacity.
