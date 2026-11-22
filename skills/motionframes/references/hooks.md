# Hooks, retention and the shape of a short people finish

`motionframes story <dir>` checks most of this automatically. The rules are the reasons behind its checks.

## The first 3 seconds decide everything

Viewers decide in about 1-2 s whether to swipe. Three hooks stack in the opening:

1. **Picture hook (frame 0)**: the strange thing is already on screen, mid-action. No logo, no title card,
   no fade-in. A gap in a bridge with an arrow on it beats a pretty bridge.
2. **Text hook** (`"hook": { "text": "WHY DO BRIDGES HAVE *GAPS*?" }`): 3-6 words, on screen from frame 0
   until the first line ends. `*word*` is coloured. It must be readable with the sound off.
3. **Spoken hook (L1)**: 10 words or fewer, finished by ~3 s. It opens a question the viewer needs closed.

Spoken hook formulas that work for explainers and character stories:

| formula | example |
|---|---|
| on purpose | "Engineers leave gaps in every bridge, on purpose." |
| wrong belief | "You've been charging your phone wrong." |
| hidden number | "This bridge grows 5 centimetres every summer." |
| stakes first | "One missing gap cost this city 2 million dollars." |
| what if | "What if your phone could hear you blink?" |
| character in trouble | "Pip filled the gap. That was his first mistake." |

Avoid: greetings, "in this video", "did you know" (weak), questions with an obvious yes/no answer.

## The middle: keep paying off small, keep the big answer open

- **Open loop**: the hook's question is answered late (60-80% through), never in the first third.
- **Escalate**: every beat raises the stakes or the weirdness (a gap -> a phone falls -> he fills it -> ...).
- **Turn**: one "but / until / that's why" moment where the expectation flips.
- **Proof**: one concrete number or comparison ("5 cm on a 100 m bridge"). Numbers get hot captions.
- **Re-hook at the middle** (around 40-60%): a new small question or a "but" to stop the mid-video drop.
- **Pattern interrupt every 2-3 s**: a cut, a jump cut, a face change, a pose, a prop, a punch-in. The story
  check fails any stretch over 3.5 s with no new action, and any shot over 6 s.
- **Pace**: 3-4 spoken words per second. Recorded voice that drags: `"pace": { "speed": 1.1, "maxPause": 0.28 }`.

## The ending: loop it

- End on the twist or the callback, not a summary. Echo a word or image from the hook so the last frame
  flows into the first one; replays count as watch time.
- No "follow for more" at the end of a story short: it kills the loop. The last caption holds 2 s+.
- 25-45 s is the sweet spot for explainers; over 60 s needs a very strong story.

## Shots: what makes a frame read on a phone

- One subject per shot, big. The character's face is the most watched thing on screen.
- Faces stay below the caption band (y > 520) unless the scene puts captions low on purpose.
- Key text in the art (labels, numbers, signs) gets `data-key` or is a `<text>` so the layout check
  protects it. Never put two labels in the same place at the same time.
- Keep art inside x 90-990; nothing important under the platform buttons (right edge, lower half).
- Wide -> medium -> close: cut closer as the tension rises; go wide again for the payoff.
- Jump cuts (`"jumps"` on a scene) split a long explainer into 2-4 s shots without redrawing it.

## Original, honest, safe

Original characters and worlds only: take structure from great channels, never their look, characters,
catchphrases or music. Facts in an explainer must be true; round numbers honestly ("about 5 cm").
