// P11-D0's chart: one page per moment, which slice of the click-to-screen
// time is biggest. Made by `node ci/measure.mjs timeline` after its runs are
// compared (from DIR/summary.json, the medians of the runs, and the slice
// list the spec wrote into each run's file), or again by
// `node ci/measure.mjs timeline-chart DIR`. Writes DIR/timeline-chart.html,
// a page that needs nothing but itself.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MOMENTS = [
  ["tap-one-land", "Tap one land", "The host clicks one Forest to pay for a creature."],
  ["cast-target", "Cast a spell with a target", "Giant Growth: the click on the card, its target and its payment, to the spell on the stack."],
  ["combat", "A big combat", "The host attacks with every creature that leaves the guest alive; the guest blocks nothing; to the damage."],
  ["karn-restart", "Karn Liberated's restart", "Karn's -14, the guest passing, to game 2's first board on both screens."],
];
const GROUPS = {
  browser: ["The browser", "#2f6fd6"],
  network: ["The network", "#8a8f98"],
  server: ["The Arena Server", "#d9822b"],
  pipe: ["The pipe between server and worker", "#c4b7a6"],
  worker: ["The worker (not Forge)", "#8e5bd6"],
  engine: ["Forge deciding", "#c93c3c"],
  paced: ["Deliberate waits (the stack's rest, a passed step's pause)", "#e0b93a"],
  board: ["Each seat's board (view, history, hiding)", "#2e9e6b"],
};
// Within a group, slices step lighter so neighbours can be told apart.
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * Math.min(0.55, k * 0.16));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `rgb(${r},${g},${b})`;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (ms) => (ms >= 100 ? Math.round(ms).toString() : ms >= 10 ? ms.toFixed(1) : ms.toFixed(2));

function sliceList(dir) {
  for (const run of readdirSync(dir).filter((d) => /^run-\d+$/.test(d)).sort())
    for (const file of readdirSync(join(dir, run)).filter((f) => /^timeline-.*\.json$/.test(f))) {
      const data = JSON.parse(readFileSync(join(dir, run, file), "utf8"));
      if (Array.isArray(data.slices)) return data.slices;
    }
  throw new Error(`no timeline run file with its slice list in ${dir}`);
}

export function timelineChart(dir) {
  const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
  const slices = sliceList(dir);
  const colour = {};
  const inGroup = {};
  for (const [k, group] of slices) {
    inGroup[group] = (inGroup[group] ?? 0) + 1;
    colour[k] = shade(GROUPS[group]?.[1] ?? "#888888", inGroup[group] - 1);
  }
  const row = (cpu, moment, who) => summary[`timeline-${cpu}x | ${cpu}x ${moment} ${who}`] ?? null;
  const med = (r, metric) => r?.[metric]?.median ?? 0;
  const steady = (r, metric) => r?.[metric]?.steady !== false;
  const pages = [];
  for (const [id, title, what] of MOMENTS) {
    const bars = [];
    for (const cpu of [1, 4])
      for (const who of ["host", "guest"]) {
        const r = row(cpu, id, who);
        if (!r) continue;
        const parts = slices.map(([k, group, words]) => ({ k, group, words, ms: Math.max(0, med(r, `ms_${k}`)) }));
        bars.push({
          cpu,
          who,
          total: med(r, "totalMs"),
          steady: steady(r, "totalMs"),
          unpaced: med(r, "unpacedMs"),
          unpacedSteady: steady(r, "unpacedMs"),
          steps: med(r, "steps"),
          parts,
        });
      }
    if (!bars.length) continue;
    // Each bar again without the deliberate waits: the system's own time.
    const own = bars.map((b) => {
      const parts = b.parts.filter((p) => p.k !== "paced");
      return { ...b, parts, total: b.unpaced, steady: b.unpacedSteady };
    });
    // Judged on the slower page's bar at 4x (else 1x).
    const pick = (set) => set.filter((b) => b.cpu === 4).sort((a, b) => b.total - a.total)[0] ?? set[0];
    const judge = pick(bars);
    const judgeOwn = pick(own);
    const paced = judge.parts.find((p) => p.k === "paced")?.ms ?? 0;
    const both = (cpu) => med(summary[`timeline-${cpu}x | ${cpu}x ${id} both`], "bothMs");
    const barsHtml = (set) => {
      const max = Math.max(...set.map((b) => b.total), 0.001);
      return set
        .map(
          (b) => `<div class="bar-row"><div class="bar-label">${b.cpu}x ${b.who}<span>${fmt(b.total)} ms${b.steady ? "" : " !"}</span></div><div class="bar" style="width:${(b.total / max) * 100}%">${b.parts
            .filter((p) => p.ms > 0)
            .map(
              (p) =>
                `<div class="seg" style="flex:${p.ms} 0 0;background:${colour[p.k]}" title="${esc(p.k)}: ${fmt(p.ms)} ms (${esc(p.words)})">${p.ms / Math.max(b.total, 0.001) > 0.07 ? esc(p.k) : ""}</div>`,
            )
            .join("")}</div></div>`,
        )
        .join("");
    };
    const verdict = (b) => {
      const top = [...b.parts].sort((x, y) => y.ms - x.ms);
      const pct = (ms) => Math.round((ms / Math.max(b.total, 0.001)) * 100);
      const groups = {};
      for (const p of b.parts) groups[p.group] = (groups[p.group] ?? 0) + p.ms;
      const topGroup = Object.entries(groups).sort((x, y) => y[1] - x[1]);
      return `<b>${esc(top[0].k)}</b>, ${fmt(top[0].ms)} ms (${pct(top[0].ms)}%): ${esc(top[0].words)}. Next: ${esc(top[1].k)} ${fmt(top[1].ms)} ms (${pct(top[1].ms)}%), ${esc(top[2].k)} ${fmt(top[2].ms)} ms (${pct(top[2].ms)}%). By part: ${topGroup
        .slice(0, 3)
        .map(([g, ms]) => `${esc(GROUPS[g]?.[0] ?? g)} ${pct(ms)}%`)
        .join(", ")}.`;
    };
    const used = slices.filter(([k]) => bars.some((b) => b.parts.find((p) => p.k === k).ms > 0));
    const table = used
      .map(([k, group, words]) => {
        const cells = bars.map((b) => `<td>${fmt(b.parts.find((p) => p.k === k).ms)}</td>`).join("");
        return `<tr><td><span class="sw" style="background:${colour[k]}"></span>${esc(k)}</td><td class="words">${esc(GROUPS[group]?.[0] ?? group)}: ${esc(words)}</td>${cells}</tr>`;
      })
      .join("");
    const totals = `<tr class="sum"><td>total</td><td class="words">click to both screens painted</td>${bars.map((b) => `<td>${fmt(b.total)}</td>`).join("")}</tr><tr class="sum"><td>without waits</td><td class="words">the same, less the deliberate waits</td>${own.map((b) => `<td>${fmt(b.total)}</td>`).join("")}</tr>`;
    pages.push(`<section class="page">
<h2>${esc(title)}</h2>
<p class="what">${esc(what)} Click to both screens painted, summed over the moment's ${Math.round(judge.steps)} round trip${Math.round(judge.steps) === 1 ? "" : "s"} (bot time between them left out); medians of the runs. Both screens: ${fmt(both(1))} ms at 1x, ${fmt(both(4))} ms at 4x.</p>
<p class="verdict">${paced > 0 ? `Deliberate waits are ${Math.round((paced / Math.max(judge.total, 0.001)) * 100)}% of it (${judge.cpu}x, ${judge.who}: ${fmt(paced)} of ${fmt(judge.total)} ms), owner-approved pacing, not work. ` : ""}Biggest slice of the system's own time (${judgeOwn.cpu}x, ${judgeOwn.who}, ${fmt(judgeOwn.total)} ms): ${verdict(judgeOwn)}</p>
${paced > 0 ? `<h3>Everything, waits included</h3><div class="bars">${barsHtml(bars)}</div><h3>The system's own time (waits left out)</h3>` : ""}<div class="bars">${barsHtml(own)}</div>
<div class="legend">${Object.entries(GROUPS)
      .map(([, [name, hex]]) => `<span><i style="background:${hex}"></i>${esc(name)}</span>`)
      .join("")}</div>
<table><thead><tr><th>slice</th><th>what it is</th>${bars.map((b) => `<th>${b.cpu}x ${b.who}</th>`).join("")}</tr></thead><tbody>${table}${totals}</tbody></table>
</section>`);
  }
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Where the time goes</title>
<style>
:root{--bg:#ffffff;--fg:#1c1f24;--muted:#5c6370;--line:#e3e6ea;--track:#f3f4f6}
@media (prefers-color-scheme: dark){:root{--bg:#16181c;--fg:#e8eaed;--muted:#a0a6b0;--line:#30343a;--track:#22252a}}
body{background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,sans-serif;margin:0;padding:24px 16px}
.page{max-width:1100px;margin:0 auto 56px;page-break-after:always}
h1{max-width:1100px;margin:0 auto 8px;font-size:22px}
.intro{max-width:1100px;margin:0 auto 32px;color:var(--muted)}
h2{font-size:18px;margin:0 0 4px}
.what{color:var(--muted);margin:0 0 8px}
.verdict{margin:0 0 14px}
h3{font-size:13px;margin:14px 0 2px;color:var(--muted);font-weight:600}
tr.sum td{font-weight:600}
.bar-row{display:flex;align-items:center;gap:10px;margin:6px 0}
.bar-label{width:120px;flex:none;font-variant-numeric:tabular-nums}
.bar-label span{display:block;color:var(--muted);font-size:12px}
.bar{display:flex;height:30px;min-width:2px;border-radius:3px;overflow:hidden;background:var(--track)}
.seg{display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;overflow:hidden;white-space:nowrap;border-right:1px solid rgba(255,255,255,.35)}
.legend{display:flex;flex-wrap:wrap;gap:14px;margin:12px 0;color:var(--muted);font-size:12px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid var(--line);padding:4px 6px;text-align:right}
th:nth-child(-n+2),td:nth-child(-n+2){text-align:left}
td.words{color:var(--muted)}
.sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px}
@media (max-width:700px){td.words{display:none}th:nth-child(2){display:none}.bar-label{width:80px}}
</style></head><body>
<h1>Where the time goes, end to end</h1>
<p class="intro">Phase 11 P11-D0. Each moment from the player's click to both screens showing the result, every step timed: the page, the network, the server, the pipe, the worker and Forge, each seat's board (its view, history, hidden cards removed), and on each page its parse, handler, React and the frame's style, layout and paint. Hover a segment for its name and time. Each total is the median of the runs' totals; each segment is the median of that slice, so the segments of a bar can add up to a little more or less than its total. "!" marks a total whose runs were not all within 10% of the median. Folder: ${esc(dir)}.</p>
${pages.join("\n")}
</body></html>`;
  const file = join(dir, "timeline-chart.html");
  writeFileSync(file, html);
  console.log(`[measure] ${file}`);
  return file;
}
