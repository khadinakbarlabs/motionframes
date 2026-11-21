// Punch captions: 1-2 word groups cut on the voice's own word timings.
// short.json "captions": { "words": 2, "hot": ["gaps","bump"], "replace": {"five centimetres":"+5 CM"},
//                          "position": "high" (default, y=330) | "low" (y=1080) | <top px>, "case": "upper"|"lower", "off": false,
//                          "groups": [["L1:gaps","GAPS",true], ...]   // optional manual list, overrides auto }
const PUNCT_END = /[.,!?;:…]$/;
const clean = (s) => s.replace(/[^\p{L}\p{N}%'+\- ]/gu, "").trim();
const norm = (s) => clean(s).toLowerCase();

export function captionGroups(model) {
  const c = model.spec.captions || {};
  if (c.off) return [];
  const maxWords = c.words ?? 2, maxDur = c.max ?? 1.8;
  const hot = new Set((c.hot || []).map(norm));
  const replace = Object.entries(c.replace || {}).map(([k, v]) => [norm(k), v]);
  const oneWord = new Map(replace.filter(([k]) => !k.includes(" ")));
  const cased = (s) => (c.case === "lower" ? s.toLowerCase() : s.toUpperCase());

  let groups;
  if (Array.isArray(c.groups)) {
    groups = c.groups.map(([anchor, text, isHot]) => ({ start: model.at(anchor), text, hot: !!isHot, end: null }));
  } else {
    groups = [];
    for (const line of model.lines) {
      let cur = [];
      const flush = () => {
        if (!cur.length) return;
        let text = norm(cur.map((w) => w.text).join(" "));
        let swapped = false;
        for (const [k, v] of replace) if (text === k) { text = v; swapped = true; }
        groups.push({
          start: cur[0].start, lastEnd: cur.at(-1).end,
          // single-word replacements also apply inside a multi-word group ("PIP'S GRIDGE" -> "PIP'S BRIDGE")
          text: swapped ? text : cased(clean(cur.map((w) => oneWord.get(norm(w.text)) ?? w.text).join(" "))),
          hot: cur.some((w) => hot.has(norm(w.text))) || swapped,
        });
        cur = [];
      };
      line.words.forEach((w, i) => {
        // multi-word replacements ("five centimetres" -> "+5 CM") stay in one group
        const ahead = norm(line.words.slice(i, i + 3).map((x) => x.text).join(" "));
        const startsPhrase = replace.find(([k]) => k.includes(" ") && ahead.startsWith(k));
        if (startsPhrase && cur.length) flush();
        cur.push(w);
        const next = line.words[i + 1];
        const inPhrase = replace.find(([k]) => k.includes(" ") && k.startsWith(norm(cur.map((x) => x.text).join(" "))) && k !== norm(cur.map((x) => x.text).join(" ")));
        if (inPhrase && next) return;
        const brk = cur.length >= maxWords || PUNCT_END.test(w.text) || !next || next.start - w.end > 0.35 || w.end - cur[0].start > 1.2;
        if (brk) flush();
      });
      flush();
    }
  }
  groups.sort((a, b) => a.start - b.start);
  groups.forEach((g, i) => {
    const next = groups[i + 1]?.start ?? model.duration;
    const want = g.lastEnd ? Math.max(g.lastEnd + 0.15, g.start + 0.45) : g.start + maxDur;
    g.end = Math.min(next - 0.04, g.start + maxDur, want);
    g.start = Math.round(g.start * 1000) / 1000;
    g.dur = Math.max(0.2, Math.round((g.end - g.start) * 1000) / 1000);
  });
  return groups.filter((g) => g.text);
}

export function captionCss(spec) {
  const c = spec.captions || {};
  const top = c.position === "low" ? 1080 : typeof c.position === "number" ? c.position : 330;
  return `
      .cap { position: absolute; left: 0; right: 0; top: ${top}px; padding: 0 230px 0 130px; display: flex; justify-content: center; text-align: center; }
      .cap span { display: inline-block; font-family: var(--font-caption); font-size: ${c.size ?? 84}px; line-height: 1.02; color: #fff;
        letter-spacing: 0.01em; -webkit-text-stroke: 12px var(--ink); paint-order: stroke fill; }
      .cap .hot { color: var(--hot); }`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function captionMarkup(groups) {
  const html = groups.map((g, i) =>
    `      <div id="cap${i + 1}" class="clip cap" data-start="${g.start}" data-duration="${g.dur}" data-track-index="1" data-track-kind="captions"><span${g.hot ? ' class="hot"' : ""}>${esc(g.text)}</span></div>`
  ).join("\n");
  const js = groups.map((g, i) =>
    `      tl.fromTo("#cap${i + 1} span", { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "back.out(2.2)" }, ${g.start});`
  ).join("\n");
  return { html, js };
}
