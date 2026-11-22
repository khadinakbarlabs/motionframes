# MotionFrames

> Formerly **toonshorts**. The `toonshorts` command still works as an alias, and an existing
> `~/.cache/toonshorts` (voice and sound library) is reused.

**Animated vertical shorts from one spec file.** Claude writes the story and draws each scene;
MotionFrames times every scene cut, caption, mouth flap and sound effect to the voice, then renders
with [HyperFrames](https://github.com/heygen-com/hyperframes).

## Install

**One prompt, any coding agent** (Claude Code, Codex, Gemini CLI, Cursor, Windsurf, Cline). Paste this:

```text
Set up MotionFrames on this computer and prove it works. MotionFrames is a free, open-source (Apache-2.0)
AI animation tool: https://github.com/khadinakbarlabs/motionframes

1. Check `node --version`. If Node is missing or older than 20, install Node 20+ first
   (macOS: brew install node, Windows: winget install -e --id OpenJS.NodeJS.LTS, Linux: https://nodejs.org).
2. Run this (it needs internet; allow network access if you are asked). Replace AGENT with claude, codex or
   gemini if that is what you are, otherwise with other:
   npx -y github:khadinakbarlabs/motionframes setup --agent AGENT --test
   It checks FFmpeg and Python and installs them with Homebrew or winget when it can, installs the free
   Kokoro voice, sets up word timing and Chrome, installs the MotionFrames plugin for you, and renders a
   7-second test video.
3. If it stops and prints commands to run (for example a sudo command on Linux), run them or show them to
   me, then run step 2 again.
4. When the last line says "setup: ready", reply "ready" with the path of the test video, and
   tell me to start a new chat so the MotionFrames skill loads.
```

**Or one command per platform:**

Claude Code (type inside Claude Code, or use `claude plugin ...` in a terminal):

```text
/plugin marketplace add khadinakbarlabs/motionframes
```

```text
/plugin install motionframes@motionframes
```

Codex:

```bash
codex plugin marketplace add khadinakbarlabs/motionframes && codex plugin add motionframes@motionframes
```

Gemini CLI:

```bash
gemini extensions install https://github.com/khadinakbarlabs/motionframes
```

Then, in a new chat: *"Set up MotionFrames and make a test video."* The skill runs `setup --test` for you.

Terminal only, no agent:

```bash
npx -y github:khadinakbarlabs/motionframes setup --test
```

For a permanent `motionframes` command: `npm install -g github:khadinakbarlabs/motionframes`.

`setup` checks Node 20+, FFmpeg and Python 3.10-3.13. It installs missing ones with Homebrew (macOS) or winget
(Windows) and otherwise prints the exact command for your OS (`--no-install` only prints). Then it installs the
free Kokoro voice into `~/.cache/motionframes`, downloads the whisper model and Chrome once, and with `--test`
renders and QA-checks a 7-second video. Tested on macOS (Apple Silicon); the Windows and Linux paths are
written but not yet tested.

The best ideas from five open-source animation projects, merged into one free pipeline:

| from | what you get |
|---|---|
| HyperFrames | deterministic HTML→MP4 rendering, lint, snapshots, free sound and voice tools |
| line-art-animation | walk cycles with planted feet, breathing, secondary motion |
| claude-animation-skills | the stick-figure explainer script shape, 1-2 word captions |
| claude-animated-shorts | the story beat formula, reaction timing, camera glides, impact kicks, auto QA |
| remotion skills | frame-driven animation and caption ideas |

## What is automatic

- **Story doctor** (`motionframes story`): scores the script and shot plan on what keeps people watching:
  hook length and trigger, on-screen hook text, the turn, a concrete number, a loop ending, length, voice
  pace, shot length (jump cuts count) and the longest stretch with nothing new on screen.
- **Stable layout** (`motionframes layout`): opens the short in headless Chrome, steps through it every 0.2 s,
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
- **One command**: `motionframes go` runs voice, words, sounds, build, check, preview stills, mix, render,
  -14 LUFS and QA (black frames, frozen picture, dead air, loudness, true peak) with a timing per step.

## Use it by hand

```bash
node engine/motionframes.mjs init my-short
```

Edit `my-short/short.json` and `my-short/scenes/*.html`, then preview (about 30 s):

```bash
node engine/motionframes.mjs go my-short --no-render
```

Look at `my-short/snaps/preview/sheet.jpg`, then render the checked mp4 (about 2 minutes for 60 s):

```bash
node engine/motionframes.mjs go my-short
```

| command | does |
|---|---|
| `go <dir> [--no-render] [--draft]` | everything, with progress and a time per step |
| `story <dir>` | hook / turn / loop / pace / shot checks |
| `layout <dir>` | headless layout pass: caption bands, overlaps, cut-offs, safe area |
| `preview <dir>` | build + one still per scene -> `snaps/preview/sheet.jpg` |
| `setup [--agent claude\|codex\|gemini\|other] [--test]` | one-time: tools, free voice, models, agent plugin, test video |
| `doctor` | check node, ffmpeg, HyperFrames, voice and sound library |
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

Full reference: [`skills/motionframes/references/spec.md`](skills/motionframes/references/spec.md).

## Licence

Apache-2.0. See [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the projects
this builds on. Sounds fetched at build time keep their own licences; `SOUND-CREDITS.md` lists them.
