// Time anchors: one syntax shared by the Node builder and the browser runtime.
//   "12.5"            absolute seconds
//   "L2"              start of voice line L2        "L2.end"  its end
//   "L2:filled"       start of the first word in L2 that begins with "filled"
//   "L2:filled#2"     the 2nd such word             "L2:filled.end"  that word's end
//   "s3"              start of scene s3             "s3.end"  its end
//   any of the above + / - seconds:  "L2:phone+0.2", "s3.end-0.5"
// The builder inlines this file into the composition (the `export` keyword is stripped).

export function makeAnchor(lines, scenes) {
  const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9%+-]/g, "");
  const lineById = Object.fromEntries(lines.map((l) => [l.id, l]));
  const sceneById = Object.fromEntries((scenes || []).map((s) => [s.id, s]));

  function base(ref) {
    if (/^-?\d+(\.\d+)?$/.test(ref)) return Number(ref);
    const m = ref.match(/^([A-Za-z][\w-]*?)(?::([^#.]+)(?:#(\d+))?)?(\.end)?$/);
    if (!m) throw new Error(`bad anchor "${ref}"`);
    const [, id, word, nth, end] = m;
    if (sceneById[id] && !word) return end ? sceneById[id].end : sceneById[id].start;
    const line = lineById[id];
    if (!line) throw new Error(`anchor "${ref}": no line or scene "${id}"`);
    if (!word) return end ? line.end : line.start;
    const want = norm(word);
    const hits = (line.words || []).filter((w) => norm(w.text).startsWith(want));
    if (!(line.words || []).length) throw new Error(`anchor "${ref}": line ${id} has no word timings yet (run "toonshorts words")`);
    const hit = hits[(Number(nth) || 1) - 1];
    if (!hit) throw new Error(`anchor "${ref}": word "${word}" not found in ${id} (${(line.words || []).map((w) => w.text).join(" ")})`);
    return end ? hit.end : hit.start;
  }

  return function at(anchor) {
    if (typeof anchor === "number") return anchor;
    const s = String(anchor).replace(/\s+/g, "");
    const m = s.match(/^(.*?)([+-]\d+(?:\.\d+)?)?$/);
    const t = base(m[1]) + (m[2] ? Number(m[2]) : 0);
    return Math.round(t * 1000) / 1000;
  };
}
