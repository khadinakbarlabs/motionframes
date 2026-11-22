# toonshorts

**Animated vertical shorts from one spec file.** Claude writes the story and draws each scene;
toonshorts times every scene cut, caption, mouth flap and sound effect to the voice, then renders
with [HyperFrames](https://github.com/heygen-com/hyperframes).

The best ideas from five open-source animation projects, merged into one free pipeline:

| from | what you get |
|---|---|
| HyperFrames | deterministic HTML→MP4 rendering, lint, snapshots, free sound and voice tools |
| line-art-animation | walk cycles with planted feet, breathing, secondary motion |
| claude-animation-skills | the stick-figure explainer script shape, 1-2 word captions |
| claude-animated-shorts | the story beat formula, reaction timing, camera glides, impact kicks, auto QA |
| remotion skills | frame-driven animation and caption ideas |

## What is automatic

- **Story doctor** (`toonshorts story`): scores the script and shot plan on what keeps people watching:
  hook length and trigger, on-screen hook text, the turn, a concrete number, a loop ending, length, voice
  pace, shot length (jump cuts count) and the longest stretch with nothing new on screen.
- **Stable layout** (`toonshorts layout`): opens the short in headless Chrome, steps through it every 0.2 s,
  picks one caption band per scene that stays clear of faces and key art, drops captions that repeat a label
  already on screen, and flags text on text, art cut off by the frame, and labels outside the area TikTok,
  Reels and Shorts all keep clear of their buttons.
- **Hooks and pacing**: an on-screen hook from frame 0, hot words that punch the picture in, jump cuts inside
  a scene, captions that never ride into the next shot, and `pace` to tighten a slow voice (pauses
  shortened, delivery sped up, every word timing remapped).

- Voice lines are measured and laid end to end (0.3 s gaps, no dead air). Word timings from local whisper.
  Scenes, actions and sounds anchor to **words**: `"at": "L3:pushes-0.2"`.
- **Characters that act**: the `bean` rig (2.5D ink cartoon) has outlined limbs with knees and elbows, hands,
  shading, brows, pupils and 6 mouth shapes. Faces (`happy`, `shocked`, `worried`, ...), poses (`point`,
  `shrug`, `cheer`, ...), vowel-shaped lip sync, knee-bend walks, hops. Every rig breathes, blinks and moves
  its head on its own.
- **Worlds in one tag**: `<backdrop preset="sunset" ground="water" />` builds sky, sun glow, drifting clouds,
  hazy far hills, near hills and rippling water as depth layers.
- **Camera and cuts**: each scene gets an eased camera move with parallax; scenes change with whip (motion
  blur), push-through, iris or fade, and the whoosh follows the move.
- **Captions** grouped by meaning (never ending on "in", "his", "the"), hot words punched in on their own.
- **Sound** by plain words (`"sfx": "metal clank"`): free CC0/CC BY sounds, a shared local library so a sound
  is only searched once, hits placed one frame after the picture, ducking under the voice, credits written
  for you. Non-commercial licences blocked. Missing sounds are reported, not fatal.
- **One command**: `toonshorts go` runs voice, words, sounds, build, check, preview stills, mix, render,
  -14 LUFS and QA (black frames, frozen picture, dead air, loudness, true peak) with a timing per step.

## Install

Needs Node 20+, ffmpeg and Chrome (HyperFrames downloads what it needs through `npx`).

```bash
claude plugin marketplace add khadinakbarlabs/toonshorts
```

```bash
claude plugin install toonshorts@toonshorts
```

One-time, for the free offline voice (Kokoro, installed into `~/.cache/toonshorts`):

```bash
node engine/toonshorts.mjs setup .
```

Then ask Claude: *"Make an animated short about why bridges have gaps."*

## Use it by hand

```bash
node engine/toonshorts.mjs init my-short
```

Edit `my-short/short.json` and `my-short/scenes/*.html`, then preview (about 30 s):

```bash
node engine/toonshorts.mjs go my-short --no-render
```

Look at `my-short/snaps/preview/sheet.jpg`, then render the checked mp4 (about 2 minutes for 60 s):

```bash
node engine/toonshorts.mjs go my-short
```

| command | does |
|---|---|
| `go <dir> [--no-render] [--draft]` | everything, with progress and a time per step |
| `story <dir>` | hook / turn / loop / pace / shot checks |
| `layout <dir>` | headless layout pass: caption bands, overlaps, cut-offs, safe area |
| `preview <dir>` | build + one still per scene -> `snaps/preview/sheet.jpg` |
| `doctor .` | check node, ffmpeg, HyperFrames, voice and sound library |
| `setup .` | one-time install of the free local voice |
| `init <dir>` | scaffold `short.json` + `scenes/` |
| `voice` / `words` / `sfx` / `build` / `check` / `stills` / `mix` / `render` / `qa` | single steps |

A full example lives in [`examples/bridge-gaps`](examples/bridge-gaps): 7 scenes, 64 s, 36 sound clips.

## How a scene looks

```html
<rect width="1080" height="1920" fill="#ffb066" />
<rig type="bean" id="pip" x="0" y="1080" scale="0.9" shirt="#2ec4b6" />
<script>
  fx.walk("pip", S.start + 0.2, at("L2:found"), -160, 470);
  fx.talk("pip", "L2");
  fx.squash("#pip", at("L2:filled") - 0.1);
  fx.cam("#s2-cam", { scale: 1.25 }, at("L2:filled") - 0.3, 0.6, "620 1100");
</script>
```

Full reference: [`skills/toonshorts/references/spec.md`](skills/toonshorts/references/spec.md).

## Licence

Apache-2.0. See [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the projects
this builds on. Sounds fetched at build time keep their own licences; `SOUND-CREDITS.md` lists them.
