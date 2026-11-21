# Sound

The engine finds every sound by plain words (`"sfx": "metal clank"`) through `hyperframes media-use`
(free CC0 / CC BY catalogues), converts and measures it, and places it so its loudest moment lands one
frame after the picture. `sfx.lock.json` pins each sound; `SOUND-CREDITS.md` lists the credits.

- A cue for **every visible action**: steps, pops, impacts, slides, pours, groans. 1.5-3 cues per second is normal.
- Automatic: whoosh/swish on every cut, a pop on hot captions, a riser 1 s before `sound.riser`, looped beds.
- Levels (voice = 1.0): impacts 0.35-0.45, foley 0.25-0.35, caption pops 0.16, beds 0.06-0.1, music 0.12-0.16.
- `align: "onset"` for sounds that should start on the word (pours, groans, wind); default `peak` for hits.
- Short, simple intents resolve best ("pop", "splash", "boing"). If one fails, re-word it.
- `toonshorts mix` before rendering: true peak must stay under -1 dBFS; render normalises to -14 LUFS.
- CC BY sounds must be credited in the video description. NC/ND sounds are blocked.
