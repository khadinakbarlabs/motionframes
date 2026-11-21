# Sound

The engine finds every sound by plain words (`"sfx": "metal clank"`), converts and measures it, and places it
so its loudest moment lands one frame after the picture. `sfx.lock.json` pins each sound; `SOUND-CREDITS.md`
lists the credits.

- Lookup order: the project lock -> the shared library (`~/.cache/toonshorts/sounds`, every sound found
  before, with its licence) -> online search through `hyperframes media-use` (free CC0 / CC BY).
  A sound that cannot be found is reported and its cues are skipped: the build does not stop.
- A cue for **every visible action**: steps, pops, impacts, slides, pours, groans. 1.5-3 cues per second is normal.
- Automatic: transition sounds follow the move (whip/push -> whoosh at the middle of the move, iris -> swish,
  cut/fade -> none), a pop on hot captions unless another sound already plays there, a riser 1 s before
  `sound.riser`, looped beds. Long sounds and beds duck 30% under the voice.
- Levels (voice = 1.0): impacts 0.35-0.45, foley 0.25-0.35, caption pops 0.14, beds 0.06-0.1.
- `align: "onset"` for sounds that should start on the word (pours, groans, wind); default `peak` for hits.
- Short, simple intents resolve best ("pop", "splash", "boing").
- The `mix` step reports peak; render normalises to -14 LUFS and QA checks it.
- CC BY sounds must be credited in the video description. NC/ND sounds are blocked. No music unless supplied.
