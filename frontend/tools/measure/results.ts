// The measuring kit's result files (PHASE_11 P11-C1, D1, E1): one JSON file
// per measure and run, in PROXIC_MEASURE_OUT (default test-results/measure),
// that ci/measure.mjs reads back to compare runs and before/after.
//
//   { kind, when, machine, engine, commit, rows: [{ key, ...numbers }] }
//
// A row's `key` names the moment ("4x combat", "slow4g Admin cold"); every
// other field is a number, compared by name between files.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";

export const OUT = process.env.PROXIC_MEASURE_OUT ?? join("test-results", "measure");

export type Row = { key: string } & Record<string, number | string | null>;

function commit(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "?";
  }
}

export function machine(): string {
  return `${cpus()[0]?.model.trim() ?? "?"} x${cpus().length}, ${Math.round(totalmem() / 2 ** 30)} GB`;
}

export function writeResult(name: string, kind: string, engine: string, rows: Row[], extra = {}) {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, `${name}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        kind,
        when: new Date().toISOString(),
        machine: machine(),
        engine,
        commit: commit(),
        ...extra,
        rows,
      },
      null,
      1,
    ),
  );
  console.log(`[measure] wrote ${file}`);
}

/**
 * The server's own CPU time so far, ms (the Arena Server is process 1 of its
 * container; the Forge workers are processes of their own and not counted).
 * Null when the container can't be reached (PROXIC_E2E_CONTAINER names it).
 */
export function serverCpuMs(): number | null {
  const container = process.env.PROXIC_E2E_CONTAINER ?? "proxic-arena-arena-server-1";
  try {
    const stat = execFileSync("docker", ["exec", container, "cat", "/proc/1/stat"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    // Fields after the command name (which is in parentheses): utime is the
    // 14th field, stime the 15th, in clock ticks (100 a second on Linux).
    const after = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    return (Number(after[11]) + Number(after[12])) * 10;
  } catch {
    return null;
  }
}
