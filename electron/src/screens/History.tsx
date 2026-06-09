import { useEffect, useState } from "react";
import { makeApi, openExternal, revealPath } from "../api";
import type { UploadRow } from "../types";
import { fmtBytes } from "../components/ui";

const api = makeApi();

const PILL: Record<string, string> = { uploaded: "pill--ok", error: "pill--error", skipped: "pill--skipped" };

export function History() {
  const [rows, setRows] = useState<UploadRow[] | null>(null);
  useEffect(() => { api.history(100).then(setRows).catch(() => setRows([])); }, []);

  return (
    <div>
      <h1>History</h1>
      <div className="sub">Everything LazyCreatives Uploader has published, newest first.</div>

      {rows && rows.length === 0 && (
        <div className="empty"><div className="empty__icon">📼</div>Nothing uploaded yet.</div>
      )}

      <div className="stack">
        {(rows || []).map((r) => (
          <div key={r.id} className="row" style={{ marginBottom: 0 }}>
            <span className={`pill ${PILL[r.status] || ""}`}>{r.status}</span>
            <div className="row__main">
              <div className="row__title">{r.title}</div>
              <div className="row__sub">
                {r.timestamp} · {fmtBytes(r.size)} · {r.sharing}
                {r.error ? ` · ${r.error}` : ""}
              </div>
            </div>
            {r.permalink_url
              ? <button className="btn btn--ghost btn--sm" onClick={() => openExternal(r.permalink_url!)}>Open ↗</button>
              : <button className="btn btn--ghost btn--sm" onClick={() => revealPath(r.file_path)}>Reveal file</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
