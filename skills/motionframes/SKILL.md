---
name: motionframes
description: Make an animated vertical short (YouTube Shorts, Reels, TikTok) from a topic or script. Use when the user asks for an animated short, reel, cartoon explainer, stick-figure video, "hidden reason" short or character story under ~90 s. Claude writes the story and the scene art; the motionframes engine times scenes, captions, lip sync, camera, transitions and sound effects to the voice and renders with HyperFrames.
---

# MotionFrames

One spec file (`short.json`) + one small file per scene -> finished, checked 1080x1920 mp4.
You do the creative work (story, picture, acting beats). The engine does the timing, the camera, the
transitions, keeping characters alive, the captions, the sound and the QA.

Engine: `node <plugin>/engine/motionframes.mjs <command> <dir>` (Node 20+, ffmpeg, npx). `<plugin>` is this
skill's plugin root (two folders up from this file). Run `motionframes doctor .` once if anything fails.

## The loop

1. **Story and hook first** (`references/hooks.md`, `references/story.md`). Write the picture hook, the
   text hook and a spoken hook of 10 words or fewer, then the beats (open loop, turn, proof, re-hook,
   loop ending). 90-160 words. Split into voice lines L1..Ln at beat changes. Plan one shot per 2-4 s.
   Show the user the script and stop for an OK.
2. **Scaffold**: `motionframes init <dir>`, then write `short.json` (`references/spec.md`): lines,
   scenes anchored to words (`"at": "L3:pushes-0.2"`), `"in"` transition per scene, captions, cues.
3. **Scenes** (`references/spec.md`, acting rules in `references/motion.md`). A scene is usually 10-25 lines:
   - `<backdrop preset="sunset" horizon="1260" ground="water" />` for the world (layered, parallax, alive).
   - `<rig type="bean" id="pip" ... face="happy" talks="L2" />` for the character (alive automatically).
   - the props that tell this beat, drawn in SVG with 6-10 px ink outlines.
   - a `<script>` with the acting beats, each anchored to a word: `fx.face`, `fx.pose`, `fx.look`,
     `fx.hop`, `fx.pop`, `fx.cam`, `fx.punch`, `fx.kick`. Never a guessed second.
4. **Preview**: `motionframes go <dir> --no-render` (about 30 s). It runs, in order: voice, word timings,
   **story** (hook, turn, loop ending, shot length, gaps with no new action, pace), sounds, build,
   **layout** (headless pass over every 0.2 s: moves each scene's captions to a band clear of faces and key
   art, flags labels on labels, art cut off by the frame or under the platform buttons), HyperFrames check,
   one still per scene, audio mix. Fix every `FIX` story line and every layout warning, then read
   `snaps/preview/sheet.jpg` yourself: the machine cannot judge whether a joke lands.
5. **Render only after the user approves**: `motionframes go <dir>` (everything above + render + -14 LUFS +
   QA; about 2 minutes for 60 s). QA failures stop the run with the reason.
6. Give the user `renders/<dir>.mp4` and `SOUND-CREDITS.md` (CC BY sounds must be credited in the description).

Single steps exist for debugging: `voice words sfx build check preview stills mix render qa`.

## Non-negotiables

- Frame 0 is already the hook picture. No title card, no fade from black.
- The character fills the frame: bean rig scale 1.0-1.3 on a bridge/street, feet near y 1260-1560.
  Keep heads below y≈480 (captions sit at y 330-520) and key art inside x 100-980.
- Every beat changes something on screen: a face, a pose, a prop, a camera move. Characters are kept
  alive by the engine; you add the acting.
- Reactions land 0-3 frames **before** the word they answer; sounds peak 1 frame after the picture (engine).
- Captions: the engine groups by meaning, gives hot words (`captions.hot`) their own punch-in, and the layout
  step picks one caption band per scene that stays clear of faces. Keep the hot list to 4-10 key words.
- Stable layout: mark labels and numbers in the art `data-key` (any `<text>` counts already). A layout
  warning is a real defect: move the art, the character or the camera, not the check.
- Ids are unique across the whole short (prefix with the scene: `s3-bar`). Each scene's camera is `#<sid>-cam`.
- Deterministic: no `Math.random()` (use `fx.rng(seed)`), no `Date.now()`, no `repeat: -1`.
  A `fromTo` that starts visible needs `immediateRender: false` (the build warns).
- No NC/ND sounds (engine blocks them). No music unless the user supplies it. Original characters only,
  never copy a channel's look. Call the style "2.5D ink cartoon", never "3D".
- Never render, publish or spend paid credits without the user's OK.

## Styles

`references/styles.md`: ink cartoon (bean rig), stickman explainer (stick rig), line-art, minimal shapes.
Worked example: `examples/bridge-gaps/` (9 scenes, 64 s).
