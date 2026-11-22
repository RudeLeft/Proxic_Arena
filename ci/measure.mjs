// Phase 11's measuring kit, run and compared (PHASE_11 "The measuring kit":
// P11-C1 redraw, P11-D1 wire, P11-E1 loading). Each measure runs three times
// (P11-R5) into its own folder, then the runs are compared: every number of
// every row, its median, and whether each run is within 10% of the median
// (or a small absolute step: half a render or millisecond, a frame for a
// page's load times, 256 bytes), which
// is what "steady to ±10% over 3 runs" means here.
//
// Against the local stack on :8080, one run at a time, with nothing else
// using the shared test accounts (the measures play real games with them):
//
//   node ci/measure.mjs redraw  [--runs 3] [--out DIR] [--cpu 1,4] [--grep RE]
//   node ci/measure.mjs loading [--runs 3] [--out DIR] [--engines chromium,webkit]
//                               [--links local,slow4g,live,poor] [--grep RE]
//   node ci/measure.mjs compare DIR [--against BEFORE_DIR]
//
// `redraw` is frontend/tools/measure/redraw.spec.ts (the replayed table and
// the real game, which also writes the wire numbers); `loading` is
// loading.spec.ts, once per engine. DIR defaults to
// frontend/test-results/measure/<measure>-<time>; each run writes DIR/run-<k>/,
// and `compare` writes DIR/summary.md and DIR/summary.json. With --against,
// every median is shown beside the BEFORE folder's, with the change.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = join(root, "frontend");

const args = process.argv.slice(2);
const what = args.shift();
const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
};

function usage() {
    console.error(
        "usage: node ci/measure.mjs redraw|loading [--runs N] [--out DIR] ... | compare DIR [--against DIR]",
    );
    process.exit(2);
}

/** How far a run may sit from the median and still count as steady. */
function allowed(metric, median) {
    // A page's times are read once a frame: one frame (17 ms) is their step.
    const floor = /bytes|Bytes|Kb|kb/.test(metric)
        ? 256
        : /^(usable|fcp|images|apiServerMsMax)$/.test(metric)
          ? 17
          : 0.5;
    return Math.max(Math.abs(median) * 0.1, floor);
}

const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x) => Math.round(x * 100) / 100;

/** Every run folder's result files: { "<file> | <row key>": { metric: [values] } }. */
function collect(dir) {
    const runs = readdirSync(dir)
        .filter((d) => /^run-\d+$/.test(d))
        .sort();
    const table = {};
    const meta = [];
    for (const run of runs) {
        for (const file of readdirSync(join(dir, run)).filter((f) => f.endsWith(".json"))) {
            const data = JSON.parse(readFileSync(join(dir, run, file), "utf8"));
            meta.push(`${run}/${file}: ${data.engine}, ${data.machine}, ${data.commit}, ${data.when}`);
            for (const row of data.rows ?? []) {
                const key = `${file.replace(/\.json$/, "")} | ${row.key}`;
                table[key] ??= {};
                for (const [metric, value] of Object.entries(row)) {
                    if (metric === "key" || typeof value !== "number") continue;
                    (table[key][metric] ??= []).push(value);
                }
            }
        }
    }
    return { runs: runs.length, table, meta };
}

function compare(dir, against) {
    const now = collect(dir);
    const before = against ? collect(against) : null;
    const lines = [`# Measure summary: ${dir}`, "", `${now.runs} runs.`, ""];
    lines.push(...now.meta.map((m) => `- ${m}`), "");
    const json = {};
    let unsteady = 0;
    for (const [key, metrics] of Object.entries(now.table)) {
        lines.push(`## ${key}`, "");
        lines.push(
            before
                ? "| metric | runs | median | before | change | steady |"
                : "| metric | runs | median | spread | steady |",
        );
        lines.push(before ? "|---|---|---|---|---|---|" : "|---|---|---|---|---|");
        json[key] = {};
        for (const [metric, values] of Object.entries(metrics)) {
            const m = median(values);
            const steady = values.every((v) => Math.abs(v - m) <= allowed(metric, m));
            if (!steady) unsteady++;
            const spread =
                m === 0 ? "-" : `±${round((Math.max(...values.map((v) => Math.abs(v - m))) / Math.abs(m)) * 100)}%`;
            const runs = values.map(round).join(" / ");
            json[key][metric] = { values, median: m, steady };
            if (before) {
                const was = before.table[key]?.[metric];
                const b = was ? median(was) : null;
                const change =
                    b === null ? "new" : b === 0 ? (m === 0 ? "0" : "from 0") : `${round(((m - b) / Math.abs(b)) * 100)}%`;
                json[key][metric].before = b;
                lines.push(
                    `| ${metric} | ${runs} | ${round(m)} | ${b === null ? "-" : round(b)} | ${change} | ${steady ? "yes" : "NO"} |`,
                );
            } else lines.push(`| ${metric} | ${runs} | ${round(m)} | ${spread} | ${steady ? "yes" : "NO"} |`);
        }
        lines.push("");
    }
    lines.splice(3, 0, `${unsteady} numbers outside ±10% of their median.`, "");
    writeFileSync(join(dir, "summary.md"), lines.join("\n"));
    writeFileSync(join(dir, "summary.json"), JSON.stringify(json, null, 1));
    console.log(`[measure] ${unsteady} numbers outside ±10%; ${join(dir, "summary.md")}`);
}

function run(spec, runs, out, env, projects, grep) {
    for (let k = 1; k <= runs; k++) {
        for (const project of projects) {
            const runDir = join(out, `run-${k}`);
            mkdirSync(runDir, { recursive: true });
            console.log(`[measure] ${spec} run ${k}/${runs} (${project}) -> ${runDir}`);
            const r = spawnSync(
                "npx",
                [
                    "playwright",
                    "test",
                    "-c",
                    "playwright.measure.config.ts",
                    `--project=${project}`,
                    spec,
                    ...(grep ? ["-g", grep] : []),
                ],
                {
                    cwd: frontend,
                    stdio: "inherit",
                    shell: process.platform === "win32",
                    env: { ...process.env, ...env, PROXIC_MEASURE_OUT: runDir },
                },
            );
            if (r.status !== 0) {
                console.error(`[measure] run ${k} (${project}) failed: exit ${r.status}`);
                process.exit(r.status ?? 1);
            }
        }
    }
    compare(out);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
if (what === "compare") {
    const dir = args[0];
    if (!dir || !existsSync(dir)) usage();
    const against = opt("against");
    compare(resolve(dir), against ? resolve(against) : undefined);
} else if (what === "redraw" || what === "loading") {
    const runs = Number(opt("runs", "3"));
    const out = resolve(opt("out", join(frontend, "test-results", "measure", `${what}-${stamp}`)));
    const grep = opt("grep");
    if (what === "redraw")
        run("redraw.spec.ts", runs, out, { PROXIC_MEASURE_CPU: opt("cpu", "1,4") }, ["chromium"], grep);
    else
        run(
            "loading.spec.ts",
            runs,
            out,
            { PROXIC_LOAD_LINKS: opt("links", "local,slow4g,live,poor") },
            opt("engines", "chromium,webkit").split(","),
            grep,
        );
} else usage();
