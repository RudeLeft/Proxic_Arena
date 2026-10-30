// Admin › Reports — spec 0039.
//
// Players' reports of problems and their ideas: the list, one report with
// its answers, picture and logs, its status and a private note, the zip
// to hand to Claude, and Delete. Administrators only (the game record in a
// report holds both players' hidden cards).

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./auth";
import "./report.css";

export interface ReportListItem {
  number: number;
  kind: "PROBLEM" | "IDEA";
  status: string;
  summary: string;
  username: string;
  createdAt: string;
  where: string;
  attached: string[];
}

export interface ReportsList {
  reports: ReportListItem[];
  newCount: number;
}

interface ReportDetail {
  number: number;
  kind: "PROBLEM" | "IDEA";
  status: string;
  summary: string;
  username: string;
  createdAt: string;
  answers: Record<string, string | string[]>;
  context: Record<string, string>;
  matchId: string | null;
  adminNote: string;
  files: { name: string; bytes: number }[];
}

export const STATUS_WORDS: Record<string, string> = {
  NEW: "New",
  SEEN: "Seen",
  FIXED: "Fixed",
  WONT_FIX: "Won’t fix",
  PLANNED: "Planned",
};

export async function fetchReports(fetchFn: typeof fetch = fetch): Promise<ReportsList | null> {
  try {
    const response = await apiFetch("/api/admin/reports", {}, fetchFn);
    return response.ok ? ((await response.json()) as ReportsList) : null;
  } catch {
    return null;
  }
}

const ANSWER_LABELS: [string, string][] = [
  ["where", "Where"],
  ["part", "Part of the game"],
  ["cards", "Cards"],
  ["happened", "What happened"],
  ["expected", "Expected"],
  ["impact", "How much"],
  ["before", "Before?"],
  ["when", "When"],
  ["about", "About"],
  ["title", "The idea"],
  ["want", "What they would like"],
  ["helps", "What it would help with"],
  ["matters", "How much it would matter"],
];

const FILTERS = [
  { id: "all", label: "Everything" },
  { id: "PROBLEM", label: "Problems" },
  { id: "IDEA", label: "Ideas" },
  { id: "NEW", label: "New" },
  { id: "open", label: "Not fixed yet" },
] as const;

function when(at: string): string {
  return new Date(at).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportsPanel({
  list,
  open,
  onOpen,
  refresh,
}: {
  list: ReportsList | null;
  /** The report on screen, or null for the list. */
  open: number | null;
  onOpen: (number: number | null) => void;
  refresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  if (open !== null) {
    return <ReportView number={open} onBack={() => onOpen(null)} refresh={refresh} />;
  }
  const all = list?.reports ?? [];
  const shown = all.filter((r) =>
    filter === "all"
      ? true
      : filter === "NEW"
        ? r.status === "NEW"
        : filter === "open"
          ? r.status !== "FIXED" && r.status !== "WONT_FIX"
          : r.kind === filter,
  );
  return (
    <section className="pa-admin-panel" aria-labelledby="reports-heading">
      <div className="pa-admin-panel-head">
        <h2 id="reports-heading">Reports</h2>
        <span className="pa-admin-panel-note">Kept until you delete them</span>
      </div>
      <div className="pa-reports-filters" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            type="button"
            key={f.id}
            aria-pressed={filter === f.id}
            className={filter === f.id ? "pa-report-pill pa-report-pill-on" : "pa-report-pill"}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="pa-group-empty">No reports here.</p>}
      <ul className="pa-reports">
        {shown.map((r) => (
          <li key={r.number}>
            <button
              type="button"
              className={`pa-reports-row${r.status === "NEW" ? " pa-reports-new" : ""}`}
              onClick={() => onOpen(r.number)}
            >
              <span className="pa-reports-number">#{r.number}</span>
              <span className={`pa-reports-kind pa-reports-kind-${r.kind.toLowerCase()}`}>
                {r.kind === "PROBLEM" ? "Problem" : "Idea"}
              </span>
              <span className={`pa-reports-status pa-reports-status-${r.status.toLowerCase()}`}>
                {STATUS_WORDS[r.status] ?? r.status}
              </span>
              <span className="pa-reports-summary">{r.summary}</span>
              <span className="pa-reports-meta">{r.username}</span>
              <span className="pa-reports-meta">{r.where}</span>
              <span className="pa-reports-meta">{when(r.createdAt)}</span>
              <span className="pa-reports-meta">
                {r.attached.length
                  ? r.attached
                      .map((a) => (a === "record" ? "Record" : a === "log" ? "Log" : "Picture"))
                      .join(" · ")
                  : "—"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

const LOG_TABS = [
  { id: "browser-log.jsonl", label: "Their screen" },
  { id: "game-record.jsonl.gz", label: "The game record" },
  { id: "server-log.txt", label: "The server" },
  { id: "engine-errors.txt", label: "Engine errors" },
] as const;
const LOG_SHOWN = 300;

/** A log file as lines to read: the page's log made readable, the record unzipped. */
async function logLines(number: number, name: string): Promise<string[]> {
  const response = await apiFetch(`/api/admin/reports/${number}/files/${name}`);
  if (!response.ok) return [];
  let text: string;
  if (name.endsWith(".gz") && typeof DecompressionStream !== "undefined" && response.body) {
    text = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
  } else {
    text = await response.text();
  }
  const raw = text.split("\n").filter(Boolean);
  if (name !== "browser-log.jsonl") return raw;
  return raw.map((line) => {
    try {
      const l = JSON.parse(line) as { t: number; kind: string; text: string };
      const at = new Date(l.t).toLocaleTimeString([], { hour12: false });
      return `${at}  ${l.kind.padEnd(10)}  ${l.text}`;
    } catch {
      return line;
    }
  });
}

function ReportView({
  number,
  onBack,
  refresh,
}: {
  number: number;
  onBack: () => void;
  refresh: () => Promise<void>;
}) {
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [note, setNote] = useState("");
  const [logTab, setLogTab] = useState<string>("browser-log.jsonl");
  const [lines, setLines] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await apiFetch(`/api/admin/reports/${number}`);
    if (!response.ok) {
      setMissing(true);
      return;
    }
    const body = (await response.json()) as ReportDetail;
    setReport(body);
    setNote(body.adminNote);
    setLogTab((current) =>
      body.files.some((f) => f.name === current)
        ? current
        : (LOG_TABS.find((t) => body.files.some((f) => f.name === t.id))?.id ?? current),
    );
  }, [number]);
  useEffect(() => {
    void load();
  }, [load]);
  // Opening a new report marks it Seen.
  useEffect(() => {
    if (report?.status === "NEW") void save({ status: "SEEN" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report?.number]);
  useEffect(() => {
    if (!report || !report.files.some((f) => f.name === logTab)) {
      setLines(null);
      return;
    }
    let alive = true;
    void logLines(number, logTab).then((got) => {
      if (alive) setLines(got);
    });
    return () => {
      alive = false;
    };
  }, [report, logTab, number]);

  const save = async (change: { status?: string; adminNote?: string }) => {
    const response = await apiFetch(`/api/admin/reports/${number}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
    if (response.ok) {
      setReport((await response.json()) as ReportDetail);
      if (change.adminNote !== undefined) setMessage("Note saved.");
      await refresh();
    } else {
      setMessage("That could not be saved. Try again.");
    }
  };
  const remove = async () => {
    const response = await apiFetch(`/api/admin/reports/${number}`, { method: "DELETE" });
    if (response.ok) {
      await refresh();
      onBack();
    } else setMessage("That could not be deleted. Try again.");
  };

  if (missing) {
    return (
      <section className="pa-admin-panel pa-report-view">
        <button type="button" className="pa-report-link" onClick={onBack}>
          ‹ All reports
        </button>
        <p className="pa-group-empty">That report is gone.</p>
      </section>
    );
  }
  if (!report) return <p className="pa-group-empty">Reading the report…</p>;
  const has = (name: string) => report.files.some((f) => f.name === name);
  const shownLines = lines ? lines.slice(-LOG_SHOWN) : null;
  return (
    <section className="pa-admin-panel pa-report-view" aria-labelledby="report-heading">
      <button type="button" className="pa-report-link" onClick={onBack}>
        ‹ All reports
      </button>
      <div className="pa-report-view-head">
        <div className="pa-report-view-title">
          <span>
            <span className={`pa-reports-kind pa-reports-kind-${report.kind.toLowerCase()}`}>
              {report.kind === "PROBLEM" ? "Problem" : "Idea"}
            </span>{" "}
            #{report.number}
          </span>
          <h2 id="report-heading">{report.summary}</h2>
          <span className="pa-report-note">
            From <b>{report.username}</b> · {when(report.createdAt)}
            {report.context["version"] ? ` · Proxic ${report.context["version"]}` : ""}
            {report.context["browser"] ? ` · ${report.context["browser"]}` : ""}
            {report.context["screen"] ? ` · ${report.context["screen"]}` : ""}
          </span>
        </div>
        <label className="pa-report-field">
          <span>Status</span>
          <select value={report.status} onChange={(e) => void save({ status: e.target.value })}>
            {Object.entries(STATUS_WORDS).map(([id, words]) => (
              <option key={id} value={id}>
                {words}
              </option>
            ))}
          </select>
        </label>
        <a className="pa-report-send pa-report-download" href={`/api/admin/reports/${number}/zip`}>
          Download (.zip)
        </a>
        {confirming ? (
          <span className="pa-report-confirm" role="alert">
            Delete #{number} and its files?{" "}
            <button type="button" className="pa-report-danger" onClick={() => void remove()}>
              Delete
            </button>{" "}
            <button type="button" className="pa-report-quiet" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="pa-report-danger" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
      </div>
      {message && (
        <p className="pa-report-note" role="status">
          {message}
        </p>
      )}
      <div className="pa-report-view-grid">
        <dl className="pa-report-answers">
          {ANSWER_LABELS.filter(([key]) => report.answers[key]).map(([key, label]) => {
            const value = report.answers[key]!;
            return (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{Array.isArray(value) ? value.join(", ") : value}</dd>
              </div>
            );
          })}
          {report.context["turn"] && (
            <div>
              <dt>The moment</dt>
              <dd>
                {report.context["game"]} · turn {report.context["turn"]} · {report.context["whose"]}{" "}
                · {report.context["step"]}
              </dd>
            </div>
          )}
          <div>
            <dt>Your note</dt>
            <dd>
              <textarea
                rows={2}
                value={note}
                placeholder="Only admins see this"
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                type="button"
                className="pa-report-quiet"
                disabled={note === report.adminNote}
                onClick={() => void save({ adminNote: note })}
              >
                Save note
              </button>
            </dd>
          </div>
        </dl>
        {has("screen.png") ? (
          <a
            href={`/api/admin/reports/${number}/files/screen.png`}
            target="_blank"
            rel="noreferrer"
          >
            <img
              className="pa-report-shot"
              src={`/api/admin/reports/${number}/files/screen.png`}
              alt="Their screen when they pressed Report"
            />
          </a>
        ) : (
          <p className="pa-group-empty">No picture.</p>
        )}
      </div>
      {LOG_TABS.some((t) => has(t.id)) && (
        <div className="pa-report-logs">
          <div className="pa-report-logtabs" role="tablist">
            {LOG_TABS.filter((t) => has(t.id)).map((t) => (
              <button
                type="button"
                role="tab"
                key={t.id}
                aria-selected={logTab === t.id}
                onClick={() => setLogTab(t.id)}
              >
                {t.label}
              </button>
            ))}
            <span className="pa-report-note">
              {lines
                ? lines.length > LOG_SHOWN
                  ? `${lines.length} lines · showing the last ${LOG_SHOWN}`
                  : `${lines.length} lines`
                : ""}
            </span>
          </div>
          <pre className="pa-report-log">
            {shownLines ? shownLines.join("\n") || "Empty." : "Reading…"}
          </pre>
        </div>
      )}
    </section>
  );
}
