// Punch captions: 1-2 word groups cut on the voice's own word timings.
// short.json "captions": { "words": 2, "hot": ["gaps","bump"], "replace": {"five centimetres":"+5 CM"},
//                          "position": "high" (default, y=330) | "low" (y=1080) | <top px>, "case": "upper"|"lower", "off": false,
//                          "groups": [["L1:gaps","GAPS",true], ...]   // optional manual list, overrides auto }
const PUNCT_END = /[.,!?;:…]$/;
// words that should never end a caption on their own ("GAPS IN", "EXCEPT HIS"): they lean on the next word
const LEAN = new Set("a an the in on of to at by for from with into onto and or but so as is are was were be been it its it's his her their our my your this that these those very just now not no can will would could did does do has have had he she we they you i than then when what who any every some each".split(" "));
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
        // a hot word gets its own caption: flush what came before it (unless that is only a leaning word)
        const isHot = hot.has(norm(w.text));
        if (isHot && cur.length && !cur.every((x) => LEAN.has(norm(x.text)))) {
          // leaning words just before the hot word travel with it ("EXCEPT" | "HIS PAPERWORK")
          let k = cur.length; while (k > 0 && LEAN.has(norm(cur[k - 1].text))) k--;
          const tail = cur.slice(k); cur = cur.slice(0, k); flush(); cur = tail;
        }
        cur.push(w);
        const next = line.words[i + 1];
        const inPhrase = replace.find(([k]) => k.includes(" ") && k.startsWith(norm(cur.map((x) => x.text).join(" "))) && k !== norm(cur.map((x) => x.text).join(" ")));
        if (inPhrase && next) return;
        // count only content words toward the limit; leaning words ride along (max 4 words, 1.2 s)
        const content = cur.filter((x) => !LEAN.has(norm(x.text))).length;
        const leans = LEAN.has(norm(w.text)) && next && !PUNCT_END.test(w.text) && next.start - w.end < 0.35;
        const nextHot = next && hot.has(norm(next.text));
        const full = content >= maxWords || cur.length >= 4 || w.end - cur[0].start > 1.2;
        // a short leaning word that ends the sentence right after a hot word stays with it ("FILLED IT.")
        const tailLean = isHot && next && LEAN.has(norm(next.text)) && PUNCT_END.test(next.text) && next.start - w.end < 0.25;
        const brk = (isHot && !tailLean) || PUNCT_END.test(w.text) || !next || next.start - w.end > 0.35 || cur.length >= 4 ||
          (!leans && (full || nextHot));
        if (!brk) return;
        // never end on a leaning word when the line goes on: carry it into the next caption ("THE ROAD" | "HAD A BUMP")
        let k = cur.length;
        if (next && !PUNCT_END.test(w.text) && next.start - w.end <= 0.35) while (k > 1 && LEAN.has(norm(cur[k - 1].text))) k--;
        const tail = cur.slice(k); cur = cur.slice(0, k); flush(); cur = tail;
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
      .cap { position: absolute; left: 0; right: 0; top: ${top}px; padding: 0 200px 0 110px; display: flex; justify-content: center; text-align: center; }
      .cap span { display: inline-block; font-family: var(--font-caption); font-size: ${c.size ?? 92}px; line-height: 1.0; color: #fff;
        letter-spacing: 0.01em; -webkit-text-stroke: 14px var(--ink); paint-order: stroke fill;
        filter: drop-shadow(0 9px 0 rgba(15, 18, 32, 0.55)); }
      .cap .hot { color: var(--hot); font-size: ${Math.round((c.size ?? 92) * 1.12)}px; }`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function captionMarkup(groups) {
  const html = groups.map((g, i) =>
    `      <div id="cap${i + 1}" class="clip cap" data-start="${g.start}" data-duration="${g.dur}" data-track-index="1" data-track-kind="captions"><span${g.hot ? ' class="hot"' : ""}>${esc(g.text)}</span></div>`
  ).join("\n");
  let h = 0;
  const js = groups.map((g, i) => {
    const sel = `#cap${i + 1} span`;
    if (g.hot) {
      const tilt = h++ % 2 ? 3 : -3;
      return `      tl.fromTo("${sel}", { scale: 0.35, rotation: ${tilt * 3}, opacity: 0 }, { scale: 1, rotation: ${tilt}, opacity: 1, duration: 0.26, ease: "back.out(3.2)" }, ${g.start});`;
    }
    return `      tl.fromTo("${sel}", { scale: 0.78, y: 26, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.16, ease: "back.out(2.4)" }, ${g.start});`;
  }).join("\n");
  return { html, js };
}
