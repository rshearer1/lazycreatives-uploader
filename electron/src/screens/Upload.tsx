import { useEffect, useRef, useState } from "react";
import { makeApi, openExternal } from "../api";
import type { Entitlement, Mix, Sharing } from "../types";
import { Button, fmtBytes, fmtDuration, ProBadge, ProgressBar } from "../components/ui";
import type { UploadState, ScanState } from "../useProgress";

const api = makeApi();

export function Upload({ ent, scan, upload, resetUpload }: {
  ent: Entitlement; scan: ScanState; upload: UploadState; resetUpload: () => void;
}) {
  const [mixes, setMixes] = useState<Mix[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<Sharing>("public");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => { void rescan(); /* on mount */ }, []);
  // When an upload finishes, refresh the list so published mixes flip to "uploaded".
  useEffect(() => { if (upload.done) { void rescan(); setRunning(false); } }, [upload.done]);

  async function rescan() {
    setError(null);
    try {
      const m = await api.scan();
      setMixes(m);
      // default-select everything not yet uploaded (single only on Free)
      const fresh = m.filter((x) => !x.uploaded).map((x) => x.path);
      setSelected(new Set(ent.features.batch ? fresh : fresh.slice(0, 1)));
    } catch (e) {
      setError(String((e as Error).message));
    }
  }

  function toggle(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) { next.delete(path); return next; }
      if (!ent.features.batch) return new Set([path]); // Free: one at a time
      next.add(path);
      return next;
    });
  }

  async function start() {
    if (selected.size === 0) return;
    setError(null); resetUpload(); setRunning(true);
    const items = (mixes || [])
      .filter((m) => selected.has(m.path))
      .map((m) => ({ path: m.path, name: m.name, sharing, file_hash: m.file_hash, size: m.size }));
    try {
      const { job_id } = await api.upload(items);
      // The live WS stream drives the UI; poll the job only to surface a hard error.
      const tick = async () => {
        const job = await api.jobStatus(job_id);
        if (job.state === "error") { setError(job.error || "Upload failed."); setRunning(false); return; }
        if (job.state !== "done") pollRef.current = window.setTimeout(tick, 1000);
      };
      pollRef.current = window.setTimeout(tick, 1000);
    } catch (e) {
      setError(String((e as Error).message)); setRunning(false);
    }
  }

  const trackPct = upload.size > 0 ? (upload.sent / upload.size) * 100 : (running ? 5 : 0);
  const newCount = (mixes || []).filter((m) => !m.uploaded).length;

  return (
    <div>
      <div className="flowbar">
        <div className="flowbar__steps">
          <span className={`flowstep ${running ? "flowstep--done" : "flowstep--on"}`}><span className="flowstep__n">1</span> Pick mixes</span>
          <span className={`flowstep ${running ? "flowstep--on" : ""}`}><span className="flowstep__n">2</span> Publish</span>
        </div>
        <Button kind="ghost" sm onClick={rescan} disabled={scan.active || running}>
          {scan.active ? "Scanning…" : "Rescan"}
        </Button>
      </div>

      {error && <div className="banner banner--warn">⚠ {error}</div>}

      {(running || upload.active || upload.done) && (
        <div className="card celebrate" style={{ marginBottom: 18 }}>
          <div className="row-spread" style={{ marginBottom: 10 }}>
            <b>{upload.done ? "Done" : upload.current ? `Uploading “${upload.current}”` : "Preparing…"}</b>
            <span className="mono sub" style={{ margin: 0 }}>
              {upload.completed + upload.skipped + upload.errors}/{upload.total}
            </span>
          </div>
          <ProgressBar pct={upload.done ? 100 : trackPct} active={!upload.done} />
          <div className="sub" style={{ margin: "10px 0 0" }}>
            {upload.completed} published · {upload.skipped} skipped · {upload.errors} error(s)
            {upload.lastUrl && (
              <> · <button className="linkbtn" onClick={() => openExternal(upload.lastUrl!)}>open last on SoundCloud ↗</button></>
            )}
          </div>
        </div>
      )}

      {!ent.features.batch && (
        <div className="locked-note" style={{ marginBottom: 12 }}>
          <span>Free uploads one mix at a time.</span>
          <b>Batch upload<ProBadge /></b><span>publishes a whole folder at once.</span>
        </div>
      )}

      <div className="row-spread" style={{ marginBottom: 12 }}>
        <div className="sub" style={{ margin: 0 }}>
          {mixes === null ? "Scanning your folders…"
            : `${mixes.length} mix(es) · ${newCount} new · ${selected.size} selected`}
        </div>
        <label className="sub" style={{ margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
          Release as
          <select value={sharing} onChange={(e) => setSharing(e.target.value as Sharing)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
        </label>
      </div>

      {mixes && mixes.length === 0 && (
        <div className="empty"><div className="empty__icon">🎚️</div>No audio found in your watched folders.</div>
      )}

      <div className="stack">
        {(mixes || []).map((m, i) => (
          <label key={m.path} className="row scanrow--enter" style={{ ["--i" as any]: i, marginBottom: 0, opacity: m.uploaded ? 0.6 : 1 }}>
            <input type="checkbox" className="mixrow__check" disabled={m.uploaded || running}
              checked={selected.has(m.path)} onChange={() => toggle(m.path)} />
            <span className="fmt-badge">{m.ext.replace(".", "")}</span>
            <div className="row__main">
              <div className="row__title">{m.name}</div>
              <div className="row__sub">
                {fmtBytes(m.size)}{m.duration ? ` · ${fmtDuration(m.duration)}` : ""}
              </div>
            </div>
            {m.uploaded
              ? <button className="pill pill--ok" onClick={(e) => { e.preventDefault(); m.permalink_url && openExternal(m.permalink_url); }}>● published</button>
              : <span className="pill">new</span>}
          </label>
        ))}
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
        <Button kind="primary" disabled={selected.size === 0 || running || upload.active} onClick={start}>
          {running ? "Publishing…" : `Publish ${selected.size || ""} to SoundCloud`}
        </Button>
      </div>
    </div>
  );
}
