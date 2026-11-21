# short.json + scene files

## short.json

```json
{
  "title": "Why bridges have gaps",
  "voice": "am_michael",                      // Kokoro voice for "toonshorts voice" (af_heart, bm_george, ...)
  "fps": 30, "lead": 0.3, "gap": 0.3, "tail": 1.0,   // defaults; gap = pause between lines
  "palette": { "ink": "#0f1220", "paper": "#f3eadb", "bg": "#0f1220", "hot": "#ffc93c" },
  "font": "Archivo Black",
  "lines": [ { "id": "L1", "text": "...", "audio": "assets/vo-L1.mp3" } ],   // audio optional until "toonshorts voice"
  "scenes": [ { "id": "s1", "at": "0", "file": "s1.html", "cut": "hard|fade", "creep": 1.04 } ],
  "captions": { "words": 2, "hot": ["gaps"], "replace": { "5 centimeters": "+5 CM" },
                "position": "high|low|<px>", "case": "upper|lower", "size": 84, "off": false,
                "groups": [["L1:gaps", "GAPS", true]] },              // groups = manual list, overrides auto
  "cues":  [ { "at": "L2:filled", "sfx": "sand pour", "vol": 0.35, "align": "peak|onset", "len": 1.2 },
             { "at": "L2+0.2", "sfx": ["footstep", "gravel step"], "every": 0.36, "count": 8, "vol": 0.3 } ],
  "beds":  [ { "sfx": "river", "from": "0", "to": "s3", "vol": 0.08 } ],
  "sound": { "cutWhoosh": true, "captionPops": "hot|all|none", "riser": "L3:buckle" },
  "music": { "file": "assets/music.mp3", "vol": 0.14 }
}
```

## Anchors (used everywhere: scenes.at, cues, captions.groups, and at() in scene code)

`"12.5"` seconds · `"L2"` / `"L2.end"` line start/end · `"L2:filled"` first word starting "filled" ·
`"L2:filled#2"` 2nd match · `"L2:filled.end"` word end · `"s3"` / `"s3.end"` scene · any + `"+0.2"` / `"-0.5"`.

## Scene file (`scenes/<file>`)

SVG on a 1080x1920 stage, then one `<script>`. In scope: `tl` (paused GSAP timeline), `at(anchor)`,
`fx`, `S` (`{start, end}` of this scene), `L` (lines by id, each with `words`).

```html
<rect width="1080" height="1920" fill="#ffb066" />
<rig type="bean" id="pip" x="480" y="1080" scale="0.9" shirt="#2ec4b6" hat="#ffc93c" prop="none" />
<script>
  fx.walk("pip", S.start + 0.2, at("L2:found"), -160, 470);
  fx.talk("pip", "L2");
  fx.squash("#pip", at("L2:filled") - 0.1);
  fx.cam("#s2-cam", { scale: 1.25 }, at("L2:filled") - 0.3, 0.6, "620 1100");
</script>
```

The engine wraps each scene as `#<sid>` > `#<sid>-creep` > `#<sid>-cam`. Animate `#<sid>-cam` for camera,
`#<sid>` for impact kicks.

## Rigs (`<rig type= id= x= y= scale= .../>`; feet on y, facing +x)

- `stick`: big white head. Parts `<id>-body -head -eyes -brows -mouth -mouthO -armL -armR -legL -legR -prop`. Attr `shirt`.
- `bean`: ink cartoon (rounded torso, skin head). Same parts plus `-hat`, `-prop`. Attrs `shirt skin limb hat prop`
  (`hat="none"`, `prop="none"` remove them).

## fx

| call | does |
|---|---|
| `pop(sel,t,{from,dur,origin})` / `out(sel,t)` / `show` / `hide` / `swap(a,b,t)` | appear / disappear |
| `move(sel,vars,t,dur,ease)` | eased move |
| `squash(sel,t,{amt})` | anticipation → squash → stretch → settle |
| `blink(sel,t)` / `blinks(sel,t0,t1,seed)` | 4-frame blink / seeded blinks |
| `breathe(sel,t0,t1)` / `boil(sel,t0,t1,{px})` | idle life / hand-drawn jitter |
| `walk(id,t0,t1,x0,x1,{stepT,amp,bob})` | walk cycle, returns step times |
| `talk(id,lineId)` / `look(id,dir,t)` | mouth flaps on words / head turn |
| `cam(sel,{scale,x,y,rotation},t,dur,origin)` / `camSet` | smootherstep camera |
| `kick(sel,t,amp)` / `flash(sel,t)` | 7-frame impact shake / flash |
| `drift(sel,x0,x1,t0,t1)` / `grow(sel,t,dur,{axis,origin,from,to})` | parallax / bars and fills |
| `rng(seed)` / `smoother(p)` | seeded random / smootherstep |
