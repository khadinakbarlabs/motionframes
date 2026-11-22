# Count-up parable (silent, one shot, a counter as the hook)

A format studied from a faceless animation account whose 21 reels did 36M plays in 17 days on 18.9k followers
(top 4: 12.4M, 11.6M, 6.4M, 3.5M). Borrow the structure only: your own story, figure, set, words and sound.

Use it for: motivation, habits, effort, time, family, friendship, "small things add up". Any idea where something
invisible (effort, time, people, days) can be **counted** and then **revealed**.

## Why it travels

1. **The number is the hook.** A big counter ticks from frame 0 (`0 STRIKES`, `AGE 18`, `1`). A ticking number is an
   open loop: viewers stay to see where it stops. In the study, 5 of the top 7 reels had a counter; almost none of the
   bottom 14 did (they opened on a quote).
2. **No voice.** Meaning is on screen in 2-5 short cards, so one video plays in every language. Comments on one reel
   came in English, Turkish, Farsi, Arabic and Urdu.
3. **One shot, no cuts.** The world changes instead of the edit: things pile up, people leave, light grows. 19 of 20
   reels had zero cuts.
4. **The stall.** The counter accelerates, then freezes one step before the end (99, 100) for 1.5-3 s with the sound
   pulled down. Then the last step lands with the loudest hit of the video.
5. **Colour is saved for the meaning.** Black, grey and white until the payoff, then one warm light (amber/gold):
   a glowing crack, god rays, a lit rocket. The held glow frame (2-3 s) drives rewatches and screenshots.
6. **"You", a truth, and someone to send it to.** "How many people did it take to make **you**?", "At 18, **you**
   have 10 best friends." It states a truth about the viewer's life, not advice. Pair with a share CTA in the post
   caption ("Tag the one who stayed").

Text-first, advice-first, metaphor-explained-in-words versions of the same look did 10-50x worse.

## Beat sheet

| beat | share of length | picture | counter | card |
|---|---|---|---|---|
| open | 0 | figure + object already mid-action, frame 0 | starts at 0/1, label under it | none, or the question |
| build | 0-55% | the action repeats, the world reacts (pile grows, chairs empty) | accelerates (ease in, doubling, or decades) | setup: "Not a single crack." |
| stall | 55-70% | action stops, figure rests or looks | frozen on the last-but-one value | hidden truth: "But inside, it was breaking." |
| turn | ~70% | the final action | last step, turns the hot colour | none |
| payoff | 70-100% | warm light reveal, then hold | holds | reframe → payoff: "It was every strike before it." |

Length 12-27 s (a whole-life story can run 35 s). Cards: 2-5, each 2-4 s, sentence case, 3-9 words.

Counter types: **count** (0→101), **double** (1, 2, 4 ... 268,435,456), **age/year** (AGE 18 → 70, 2000 → 2026),
**days** (DAY 1 → 365). Label: 1-2 words, tracked caps (`STRIKES`, `BAD IDEAS`, `DAYS`).

## short.json for this format

```json
{
  "title": "Day 61",
  "format": "count-up",
  "voice": "none",
  "gap": 0.2, "lead": 1.4, "tail": 2.6,
  "palette": { "ink": "#050505", "paper": "#f2f2f2", "bg": "#050505", "hot": "#F4B860" },
  "font": "Inter", "cardFont": "IBM Plex Mono",
  "captions": { "style": "card" },
  "transition": "cut", "cam": { "type": "push", "amt": 0.06 },
  "lines": [
    { "id": "L1", "text": "Nothing above ground.", "hold": 3.2 },
    { "id": "L2", "text": "But under it, everything was growing.", "hold": 3.0 },
    { "id": "L3", "text": "Day 61 didn't grow the tree.", "hold": 2.4 },
    { "id": "L4", "text": "Every day before it did.", "hot": true }
  ],
  "scenes": [ { "id": "s1", "at": "0", "file": "s1.html" } ],
  "beds": [ { "sfx": "soft piano ambient", "from": "0", "to": "L2.end", "vol": 0.16 },
            { "sfx": "ambient pad", "from": "L3", "vol": 0.2 } ],
  "cues": [
    { "at": "0.5", "sfx": "water pour", "every": 1.05, "count": 7, "vol": 0.3 },
    { "at": "L3", "sfx": "deep impact boom", "vol": 0.85 },
    { "at": "L3+0.05", "sfx": "shimmer", "vol": 0.45 }
  ],
  "sound": { "cutWhoosh": false, "captionPops": "none" }
}
```

- `"voice": "none"` makes every line a **silent card**: no audio, hold = reading time (0.3 s a word + 0.9 s, min
  1.6 s) or `hold`. Word anchors (`"L2:growing"`) still work for cues and fx. A line can also set `"silent": true`
  in a voiced short.
- `"captions": { "style": "card" }`: one calm sentence per line (its own case), fade + small rise, gone before the
  next. `position`: px from top (default 1110, the lowest band inside the platform safe area; `"high"` = 330; 540-620
  sits just under the counter). Keep cards off the key art (the layout step only protects `data-key` art and text). `size` (default 44),
  per-line `"hot": true` colours that card, per-line `"card"` overrides the shown text.
- `"cam": { "type": "push", "amt": 0.06 }`: a slow creep over the whole shot. The look is a locked camera, but
  a counter that changes a few pixels is a frozen frame to the platform and to QA; the creep keeps every frame alive.
- `"format": "count-up"` switches the story check: it wants `fx.count`, `fx.glow`, 2-5 cards, and allows one long shot.
- Sound: `"captionPops": "none"` (cards are quiet). A `cues` list of sounds (`["a", "b"]`) alternates across
  repeats, it is not a fallback. No music track is needed. A soft tonal bed (`beds`) + a hit per action (`cues` with `every`) + one big
  hit on the payoff. Pull the bed down at the stall (end the first bed at the stall, start a second at the turn).

## Scene: the counter and the payoff

```html
<rect x="0" y="0" width="1080" height="1920" fill="#050505" />
<text id="s1-num" x="540" y="420" text-anchor="middle" font-family="IBM Plex Mono" font-size="92" font-weight="600" fill="#f2f2f2">0</text>
<text x="540" y="470" text-anchor="middle" font-family="Inter" font-size="28" letter-spacing="7" fill="#7a7a7a">DAYS</text>
<g id="s1-glow" opacity="0"> ... radial gradient + 8 soft rays in #F4B860 ... </g>
<rig type="stick" id="s1-me" x="380" y="1480" scale="0.9" ink="#f2f2f2" shirt="#f2f2f2" />
<script>
  const turn = at("L3");                                   // the last step lands on the turn card
  fx.count("#s1-num", [[0.4, 0], [6.2, 49], [8.4, 60], [turn - 0.05, 60], [turn, 61]], { ease: "power1.in" });
  fx.move("#s1-num", { fill: "#F4B860" }, turn, 0.25);     // the counter takes the hot colour on the payoff
  fx.glow("#s1-glow", turn, { dur: 1.1 });
  fx.flicker("#s1-glow", turn + 1.1, S.end, { amt: 0.1 });  // the held frame keeps breathing
</script>
```

- `fx.count(sel, [[t, value], ...], { ease, fmt: "comma" | "plain" | fn, prefix, suffix })`: eases between keys;
  two equal values in a row = the stall. `fmt: "comma"` prints 268,435,456. `prefix: "AGE "` for age counters.
- `fx.glow(sel, t, { dur, from })`: the payoff light. `fx.flicker(sel, t0, t1)`: gentle breathing on the held frame.
- Repeated actions: a loop in the scene script that schedules one `fx.move`/`fx.kick` per hit at the same times as
  the `every` cue. Piles that grow: pre-draw N items with `opacity="0"` and `fx.pop` them in on the same schedule.

## Look

- Near-black ground (`#050505`), soft vignette, one floor line with a faint reflection.
- Figure: white, faceless: `<rig type="stick" ink="#f2f2f2" shirt="#f2f2f2" />` (white limbs; eyes and mouth
  vanish into the white head). No face means anyone can be it. Poses still read (`fx.pose`, `fx.hop`).
- Props get light and texture (stone grain, fire, paper) so it reads premium, not clip-art.
- Counter: tabular mono 80-96 px, white, baseline y 400-440 (the top 288 px sit under platform UI); label 28 px
  tracked caps, 45% grey (28 px is the phone reading floor). Cards 40-46 px, 90% white, at y 1110.
- Schedule repeated actions with `at("L1") + k * step` (or `S.start + ...`) so the story check sees them.
- One hot colour only, first seen at the payoff.

## Checklist before rendering

- Frame 0: counter visible and the action already happening.
- Counter accelerates, then stalls 1.5-3 s on the last-but-one value.
- Payoff = last step + hot colour + glow + the loudest hit, all on the same frame.
- 2-5 cards, each under 10 words, never two on screen at once; the last card is the truth, held 2 s+.
- Readable on mute; no voice; no logo on frame 0 except a small watermark.
- 12-27 s. The post caption repeats the hook and asks the viewer to tag or send it to one person.
