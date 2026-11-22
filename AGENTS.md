# MotionFrames: notes for coding agents

MotionFrames turns a written spec (`short.json`) plus scene files into a finished animated video, rendered
locally by HyperFrames. Works with any agent that can run shell commands (Claude Code, Codex, Cursor,
Gemini CLI, Windsurf, Cline).

## Set up (once per computer)

```bash
node engine/motionframes.mjs setup --test
```

Checks Node 20+, FFmpeg and Python 3.10-3.13, installs missing ones with Homebrew or winget when it can
(otherwise prints the exact command), installs the free Kokoro voice, downloads the whisper and Chrome
pieces, renders a 7-second test video and prints `ready`. Add `--agent claude|codex|gemini` to also install
the plugin for that agent.

## Make a video

Read `skills/motionframes/SKILL.md` and follow it: story first, then `short.json` and scenes, then
`node engine/motionframes.mjs go <dir> --no-render` for a preview, and render only after the user approves.

## Rules

- Original characters and worlds only. A reference video can guide structure and pacing, never its look.
- Free path by default: local Kokoro voice. No paid voice or credits without the user's OK.
- Sound effects must be commercial-safe; CC BY is credited automatically, NC is never used.
- Describe the style as "2.5D ink cartoon".
