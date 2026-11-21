---
name: toonshorts
description: Make an animated vertical short (YouTube Shorts, Reels, TikTok) from a topic or script. Use when the user asks for an animated short, reel, cartoon explainer, stick-figure video, "hidden reason" short or character story under ~90 s. Claude writes the story and the scene art; the toonshorts engine times scenes, captions, mouth flaps and sound effects to the voice and renders with HyperFrames.
---

# toonshorts

One spec file (`short.json`) + one small SVG/GSAP file per scene -> finished 1080x1920 short.
You do the creative work (story, picture, acting). The engine does all the timing work.

Engine: `node <plugin>/engine/toonshorts.mjs <command> <dir>` (Node 20+, ffmpeg, npx). `<plugin>` is this skill's
plugin root (two folders up from this file).

## The loop

1. **Story first** (`references/story.md`). Pick a beat formula, write 110-200 words (≈3.7 words/s → 30-55 s).
   Split into voice lines L1..Ln at beat changes. Show the user the script and stop for an OK.
2. **Scaffold**: `toonshorts init <dir> --rig bean|stick`, then write `short.json` (`references/spec.md`):
   lines, scenes anchored to words (`"at": "L3:pushes-0.2"`), captions, cues.
3. **Voice + words**: `toonshorts voice <dir>` (free local Kokoro; skip if the user brings their own audio,
   set `"audio"` per line) then `toonshorts words <dir>` (local whisper word timings).
4. **Scenes**: write `scenes/*.html`: SVG markup + one `<script>` using `at()` and `fx` (`references/spec.md`,
   acting and camera rules in `references/motion.md`). Anchor every action to a word, never a guessed second.
5. **Sound**: add `cues` for every visible action (`references/sound.md`), then `toonshorts sfx <dir>`.
6. **Build + check**: `toonshorts build <dir>`, `toonshorts check <dir>`: fix every error, weigh warnings.
7. **Look**: `toonshorts stills <dir> --at <one time per scene>` and read the contact sheet. `toonshorts mix <dir>` for
   an audio preview. Fix, rebuild, repeat.
8. **Render only after the user approves**: `toonshorts render <dir>` (renders, normalises to -14 LUFS, runs QA:
   black/frozen frames, dead air, loudness → `qa-report.md`).
9. Give the user `SOUND-CREDITS.md`: CC BY sounds must be credited in the video description.

`toonshorts make <dir>` runs steps 3, 5, 6 and the mix in one go once the spec and scenes exist.

## Non-negotiables

- Frame 0 is already the hook picture. No title card, no fade from black.
- Nothing is ever static: the engine adds a slow creep per scene; characters also breathe/blink/boil.
- Reactions land 0-3 frames **before** the word they answer; sounds peak 1 frame after the picture (engine does this).
- Captions: 1-2 words, high band (y≈330) by default so they never cover the action. Hot words in `captions.hot`.
- Keep key art inside x 100-980, y 288-1500; nothing important behind the platform buttons on the right.
- Ids are unique across the whole short (prefix with the scene: `s3-bar`). Each scene's camera is `#<sid>-cam`.
- Deterministic: no `Math.random()` (use `fx.rng(seed)`), no `Date.now()`, no `repeat: -1`.
- No NC/ND sounds (engine blocks them). No copyrighted characters or footage. Do not call 2.5D art "3D".
- Never render, publish or spend paid credits without the user's OK.

## Styles

`references/styles.md`: ink-cartoon (bean rig), stickman explainer (stick rig), line-art, minimal shapes.
