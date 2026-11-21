# short.json + scene files

## short.json

```json
{
  "title": "Why bridges have gaps",
  "voice": "am_michael",                      // Kokoro voice for "toonshorts voice" (af_heart, bm_george, ...)
  "fps": 30, "lead": 0.3, "gap": 0.3, "tail": 1.0,   // defaults; gap = pause between lines
  "palette": { "ink": "#0f1220", "paper": "#f3eadb", "bg": "#0f1220", "hot": "#ffc93c" },
  "font": "Archivo Black",
  "transition": "auto",                       // default for scenes without "in"
  "cam": "auto",                              // default scene camera move
  "lines": [ { "id": "L1", "text": "...", "audio": "assets/vo-L1.mp3" } ],   // audio optional until "voice"
  "scenes": [ { "id": "s2", "at": "L2-0.1", "file": "s2-pip.html",
                "in": "whip", "cam": "still", "irisAt": "540 1000" } ],
  "captions": { "words": 2, "hot": ["gaps"], "replace": { "5 centimeters": "+5 CM" },
                "position": "high|low|<px>", "case": "upper|lower", "size": 92, "off": false,
                "groups": [["L1:gaps", "GAPS", true]] },              // groups = manual list, overrides auto
  "cues":  [ { "at": "L2:filled", "sfx": "sand pour", "vol": 0.35, "align": "peak|onset", "len": 1.2 },
             { "at": "s2+0.05", "sfx": ["footstep", "gravel step"], "every": 0.34, "count": 5, "vol": 0.3 } ],
  "beds":  [ { "sfx": "river", "from": "0", "to": "s5", "vol": 0.08 } ],
  "sound": { "cutWhoosh": true, "captionPops": "hot|all|none", "riser": "L3:buckle" },
  "music": { "file": "assets/music.mp3", "vol": 0.14 }        // only if the user supplies it
}
```

**`in`** (transition into the scene): `whip` / `whip-right` (fast slide with motion blur, new beat),
`push` (zoom through, going deeper), `iris` (circle opens at `irisAt`, new chapter or the ending),
`fade` (time passing), `cut`, `auto` (alternates whip/push). Sound follows the move automatically.

**`cam`** (the scene's own slow move, with parallax on every `data-depth` layer): `push`, `pull`,
`pan-left`, `pan-right`, `rise`, `still`, `none`, `auto`, or `{ "type": "push", "amt": 0.1 }`.
Use `still` when the scene script does its own `fx.cam` moves.

## Anchors (used everywhere: scenes.at, cues, captions.groups, and at() in scene code)

`"12.5"` seconds · `"L2"` / `"L2.end"` line start/end · `"L2:filled"` first word starting "filled" ·
`"L2:filled#2"` 2nd match · `"L2:filled.end"` word end · `"s3"` / `"s3.end"` scene · any + `"+0.2"` / `"-0.5"`.

## Scene file (`scenes/<file>`)

SVG on a 1080x1920 stage, then one `<script>`. In scope: `tl` (paused GSAP timeline), `at(anchor)`,
`fx`, `S` (`{start, end}` of this scene), `L` (lines by id, each with `words`).

```html
<backdrop preset="sunset" horizon="1330" ground="water" sun="790 860" seed="4" />
<g id="s2-deck" data-depth="1"> ... the bridge ... </g>
<rig type="bean" id="pip2" x="0" y="1262" scale="1.05" shirt="#2ec4b6" face="happy" />
<script>
  const stop = at("L2:inspector");
  fx.walk("pip2", S.start + 0.05, stop, -240, 330);
  fx.face("pip2", "proud", at("L2:brand"));
  fx.pose("pip2", "hips", stop + 0.05);
  fx.cam("#s2-cam", { scale: 1.22 }, stop - 0.3, 0.9, "330 960");
</script>
```

The engine wraps each scene as `#<sid>` > `#<sid>-creep` (scene camera move) > `#<sid>-cam` (yours).

## `<backdrop>`

`preset`: `sunset day dusk night paper studio`. `ground`: `water grass road sand none`.
`horizon` (y), `sun="x y"` or `"none"`, `seed`, overrides `sky="#a,#b,#c"`, `hills="#far,#near"`,
`groundcolor="#top,#bottom"`, studio/paper: `bg`, `spot`, `grid`. Layers: sky, sun + glow (breathes),
two cloud layers (drift), far hills with haze, near hills, ground (water ripples boil). Each layer has
a depth, so camera moves give parallax. Mark your own layers with `data-depth="0.3"` (far) to `"1.2"` (near).

## Rigs (`<rig type= id= x= y= scale= .../>`; feet on y)

- `bean` (hero rig, ~610 px tall at scale 1): outlined limbs with knees and elbows, hands, shoes, shaded
  torso and head, brows, pupils, 6 mouths. Colours `shirt skin pants shoe hat`; `hat="none"`, `prop="none"`.
- `stick`: big white head, ink limbs. `shirt`.
- Acting attributes (both rigs): `face="happy"` start face, `pose="hips"` start pose, `talks="L2,L5"`
  lip sync on those lines, `life="off"` to stop the automatic breathe / blink / head drift.

## fx

| call | does |
|---|---|
| `face(id,name,t)` | `neutral happy surprised shocked worried sad angry proud thinking` (brows, pupils, resting mouth) |
| `pose(id,name,t,dur)` / `gesture(id,name,t,hold)` | `idle point pointL cheer shrug hips think wave present reach` |
| `talk(id,lineId,{from,to})` | vowel-shaped lip sync; call `face` first so it closes to that face |
| `look(id,dir,t)` / `nod(id,t,n)` / `hop(id,t,h)` | head + eyes turn / nod / jump with squash |
| `walk(id,t0,t1,x0,x1,{stepT,amp,bob})` | walk with knee bend and body dip, returns step times |
| `pop(sel,t,{from,dur,origin})` / `out(sel,t)` / `show` / `hide` / `swap(a,b,t)` | appear / disappear |
| `move(sel,vars,t,dur,ease)` / `squash(sel,t,{amt})` | eased move / anticipation-squash-stretch-settle |
| `blink` / `blinks` / `breathe` / `boil` | manual life (rigs get these automatically) |
| `cam(sel,{scale,x,y,rotation},t,dur,origin)` / `camSet` | smootherstep camera on `#<sid>-cam` |
| `punch(sel,t,{amt,hold,origin})` | quick push-in on a payoff word |
| `kick(sel,t,amp)` / `flash(sel,t)` | decaying impact shake / flash |
| `drift(sel,x0,x1,t0,t1)` / `grow(sel,t,dur,{axis,origin,from,to})` | drift / bars and fills |
| `rng(seed)` / `smoother(p)` | seeded random / smootherstep |
