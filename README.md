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

- Voice lines are measured and laid end to end (0.3 s gaps, no dead air).
- Word timings from local whisper. Scenes, actions and sounds anchor to **words**: `"at": "L3:pushes-0.2"`.
- 1-2 word punch captions with hot-word colour and pop-in, kept clear of the action and the platform buttons.
- Sound design by plain words (`"sfx": "metal clank"`): free CC0/CC BY sounds, measured, placed so the hit
  lands one frame after the picture. Cut whooshes, caption pops, risers and ambience beds. Credits file
  written for you. Non-commercial licences blocked.
- Character rigs (`stick`, `bean`) with walk, talk, blink, breathe, look, squash, plus a smootherstep camera,
  per-scene creep (no frozen frames) and impact kicks.
- QA: black frames, frozen picture, dead air, loudness (-14 LUFS) and true peak.

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
node engine/toonshorts.mjs init my-short --rig bean
```

Edit `my-short/short.json` and `my-short/scenes/*.html`, then:

```bash
node engine/toonshorts.mjs make my-short
```

```bash
node engine/toonshorts.mjs stills my-short --at 1,8,20
```

```bash
node engine/toonshorts.mjs render my-short
```

| command | does |
|---|---|
| `setup .` | one-time install of the free local voice |
| `init <dir>` | scaffold `short.json` + `scenes/` |
| `voice <dir>` | free local voice (Kokoro) for lines with no audio |
| `words <dir>` | word timings (local whisper) |
| `sfx <dir>` | find, measure and lock every sound |
| `build <dir>` | write `index.html` (a HyperFrames composition you can open in HyperFrames Studio) |
| `check <dir>` / `stills <dir>` / `mix <dir>` | lint / snapshots / audio-only preview |
| `render <dir>` | render, normalise to -14 LUFS, QA report |
| `make <dir>` | voice + words + sfx + build + check + mix |

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
