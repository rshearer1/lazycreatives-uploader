import { useEffect, useState } from "react";
import { makeApi, openExternal } from "../api";
import type { Sharing, Track } from "../types";
import { Button, fmtDuration } from "../components/ui";

const api = makeApi();

export function Manage() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  async function load() {
    setError(null);
    try { setTracks(await api.listTracks()); }
    catch (e) { setError(String((e as Error).message)); setTracks([]); }
  }
  useEffect(() => { void load(); }, []);

  async function onSaved(t: Track) {
    setEditing(null);
    setTracks((prev) => (prev || []).map((x) => (x.id === t.id ? t : x)));
  }
  async function onDeleted(id: number) {
    setTracks((prev) => (prev || []).filter((x) => x.id !== id));
  }

  return (
    <div>
      <div className="row-spread" style={{ marginBottom: 4 }}>
        <h1>Manage</h1>
        <Button kind="ghost" sm onClick={load}>Refresh</Button>
      </div>
      <div className="sub">Your existing SoundCloud tracks — edit details, change privacy, or delete.</div>

      {error && <div className="banner banner--warn">⚠ {error}</div>}
      {tracks === null && <div className="sub">Loading your library…</div>}
      {tracks && tracks.length === 0 && !error && (
        <div className="empty"><div className="empty__icon">🎵</div>No tracks on your account yet.</div>
      )}

      <div className="stack">
        {(tracks || []).map((t) => (
          <TrackCard key={t.id} track={t} editing={editing === t.id}
            onEdit={() => setEditing(t.id)} onCancel={() => setEditing(null)}
            onSaved={onSaved} onDeleted={onDeleted} />
        ))}
      </div>
    </div>
  );
}

function TrackCard({ track, editing, onEdit, onCancel, onSaved, onDeleted }: {
  track: Track; editing: boolean;
  onEdit: () => void; onCancel: () => void;
  onSaved: (t: Track) => void; onDeleted: (id: number) => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [description, setDescription] = useState(track.description);
  const [genre, setGenre] = useState(track.genre);
  const [tags, setTags] = useState(track.tags.join(", "));
  const [sharing, setSharing] = useState<Sharing>(track.sharing === "private" ? "private" : "public");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const updated = await api.updateTrack(track.id, {
        title, description, genre, sharing,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      onSaved(updated);
    } catch (e) { setErr(String((e as Error).message)); }
    finally { setBusy(false); }
  }

  async function quickPrivacy(next: Sharing) {
    setBusy(true);
    try { onSaved(await api.updateTrack(track.id, { sharing: next })); }
    catch (e) { setErr(String((e as Error).message)); }
    finally { setBusy(false); }
  }

  async function del() {
    if (!window.confirm(`Delete “${track.title}” from SoundCloud? This can't be undone.`)) return;
    setBusy(true);
    try { await api.deleteTrack(track.id); onDeleted(track.id); }
    catch (e) { setErr(String((e as Error).message)); setBusy(false); }
  }

  if (!editing) {
    return (
      <div className="row" style={{ marginBottom: 0 }}>
        <span className={`pill ${track.sharing === "private" ? "pill--private" : "pill--ok"}`}>
          {track.sharing === "private" ? "private" : "public"}
        </span>
        <div className="row__main">
          <div className="row__title">{track.title}</div>
          <div className="row__sub">
            {track.genre || "—"}
            {track.duration ? ` · ${fmtDuration(track.duration)}` : ""}
            {track.playback_count != null ? ` · ${track.playback_count} plays` : ""}
            {track.tags.length ? ` · #${track.tags.join(" #")}` : ""}
          </div>
        </div>
        {track.permalink_url &&
          <button className="btn btn--ghost btn--sm" onClick={() => openExternal(track.permalink_url!)}>Open ↗</button>}
        <Button sm disabled={busy}
          onClick={() => quickPrivacy(track.sharing === "private" ? "public" : "private")}>
          Make {track.sharing === "private" ? "public" : "private"}
        </Button>
        <Button sm onClick={onEdit}>Edit</Button>
        <Button kind="danger" sm disabled={busy} onClick={del}>Delete</Button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 0 }}>
      <label className="field"><span>Title</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label className="field"><span>Genre</span>
          <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} /></label>
        <label className="field"><span>Privacy</span>
          <select value={sharing} onChange={(e) => setSharing(e.target.value as Sharing)}>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select></label>
      </div>
      <label className="field"><span>Tags (comma-separated)</span>
        <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} /></label>
      {err && <div className="locked-note" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
        <Button sm onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button kind="primary" sm onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
