"""Orchestration layer: scanning with dedupe, the upload engine, the connected
account, and the dashboard overview. The API and CLI call into here; this module
holds no FastAPI/HTTP concerns so it's trivially unit-testable.
"""
import threading
import time
from datetime import datetime
from pathlib import Path

from lazyupload import soundcloud
from lazyupload.catalog import Catalog
from lazyupload.hashing import hash_file
from lazyupload.models import TrackMeta, UploadResult
from lazyupload.scanner import discover

# Module-level "is an upload running" flag so a scheduled tick can stand down while a
# manual upload is in flight (mirrors the Backups scheduler's guard).
_upload_lock = threading.Lock()
_uploading = False

_ACCOUNT_KEY = "sc_account"      # persisted OAuth tokens for the connected account
_HASH_CACHE_KEY = "hash_cache"   # {path: {size, mtime, hash}} so scans don't re-hash


def default_timestamp() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def upload_in_progress() -> bool:
    return _uploading


# ---- connected account ------------------------------------------------------
def get_account(catalog: Catalog) -> dict | None:
    return catalog.get_setting(_ACCOUNT_KEY)


def save_account(catalog: Catalog, tokens: dict) -> None:
    catalog.set_setting(_ACCOUNT_KEY, tokens)


def clear_account(catalog: Catalog) -> None:
    catalog.delete_setting(_ACCOUNT_KEY)


def connected(catalog: Catalog) -> bool:
    if soundcloud.use_mock():
        return get_account(catalog) is not None  # mock still requires an explicit connect
    acct = get_account(catalog) or {}
    return bool(acct.get("access_token"))


def account_label(catalog: Catalog) -> str | None:
    acct = get_account(catalog) or {}
    return acct.get("username") or acct.get("permalink") or None


class _MockStore:
    """Catalog-backed persistence for the mock client's managed library, so demo
    uploads + edits survive restarts. Ignored entirely by the real client."""
    _KEY = "mock_library"

    def __init__(self, catalog: Catalog):
        self._catalog = catalog

    def load(self):
        return self._catalog.get_setting(self._KEY)  # None => client seeds demo tracks

    def save(self, lib):
        self._catalog.set_setting(self._KEY, lib)


def client_for(catalog: Catalog):
    """A SoundCloud client bound to the stored account, persisting refreshed tokens.

    Refresh tokens are single-use, so the on_tokens callback re-saves the account
    every time the access token is renewed."""
    tokens = get_account(catalog) or {}

    def on_tokens(new: dict):
        save_account(catalog, new)

    return soundcloud.get_client(tokens, on_tokens, store=_MockStore(catalog))


# ---- manage existing uploads ------------------------------------------------
def list_tracks(catalog: Catalog) -> list[dict]:
    if not connected(catalog):
        raise RuntimeError("not_connected")
    return client_for(catalog).list_tracks()


def update_track(catalog: Catalog, track_id: int, fields: dict) -> dict:
    if not connected(catalog):
        raise RuntimeError("not_connected")
    return client_for(catalog).update_track(track_id, fields)


def delete_track(catalog: Catalog, track_id: int) -> None:
    if not connected(catalog):
        raise RuntimeError("not_connected")
    client_for(catalog).delete_track(track_id)


# ---- scan with dedupe -------------------------------------------------------
def _hashed(catalog: Catalog, path: str, size: int, mtime: float) -> str:
    """Content hash for a file, cached by (size, mtime) so unchanged files aren't
    re-read on every scan. A render that changes bumps mtime/size -> re-hash."""
    cache = catalog.get_setting(_HASH_CACHE_KEY) or {}
    ent = cache.get(path)
    if ent and ent.get("size") == size and ent.get("mtime") == mtime:
        return ent["hash"]
    h = hash_file(Path(path))
    cache[path] = {"size": size, "mtime": mtime, "hash": h}
    catalog.set_setting(_HASH_CACHE_KEY, cache)
    return h


def scan_mixes(catalog: Catalog, sources: list[Path], progress=None) -> list[dict]:
    """Discover mixes and mark which are already on SoundCloud (by content hash)."""
    found = discover(sources)
    uploaded = catalog.uploaded_hashes()
    if progress:
        progress({"type": "scan_start", "total": len(found)})
    out = []
    for i, m in enumerate(found):
        try:
            h = _hashed(catalog, m["path"], m["size"], m["mtime"])
        except OSError:
            continue
        m["file_hash"] = h
        prev = uploaded.get(h)
        m["uploaded"] = prev is not None
        m["permalink_url"] = prev["permalink_url"] if prev else None
        out.append(m)
        if progress:
            progress({"type": "scan_progress", "done": i + 1,
                      "total": len(found), "name": m["name"]})
    if progress:
        progress({"type": "scan_done", "count": len(out)})
    return out


# ---- upload engine ----------------------------------------------------------
def _meta_for(item: dict, defaults: dict) -> TrackMeta:
    name = item.get("name") or Path(item["path"]).stem
    template = defaults.get("title_template") or "{name}"
    title = (item.get("title") or template.replace("{name}", name)).strip() or name
    tags = item.get("tags")
    if tags is None:
        tags = defaults.get("tags") or []
    return TrackMeta(
        title=title,
        description=item.get("description", defaults.get("description", "")) or "",
        sharing=item.get("sharing") or defaults.get("sharing") or "public",
        genre=item.get("genre", defaults.get("genre", "")) or "",
        tags=list(tags),
        downloadable=bool(item.get("downloadable", defaults.get("downloadable", False))),
    )


def run_upload(catalog: Catalog, items: list[dict], defaults: dict | None = None,
               progress=None, cancel=None, force: bool = False) -> dict:
    """Upload each item to SoundCloud, skipping anything already published (by hash).

    `items`  : [{path, title?, description?, sharing?, genre?, tags?}, ...]
    `defaults`: fallback metadata from config (sharing/genre/tags/title_template).
    `cancel` : a callable returning True to stop between tracks.
    Returns a summary dict; emits live progress events through `progress`.
    """
    global _uploading
    defaults = defaults or {}
    cancel = cancel or (lambda: False)

    def emit(ev):
        if progress:
            progress(ev)

    with _upload_lock:
        _uploading = True
    results: list[UploadResult] = []
    ok = skipped = errors = 0
    cancelled = False
    try:
        if not connected(catalog):
            emit({"type": "upload_error", "error": "not_connected"})
            return {"ok_count": 0, "error_count": 0, "skipped_count": 0,
                    "results": [], "error": "not_connected"}
        client = client_for(catalog)
        uploaded = catalog.uploaded_hashes()
        total = len(items)
        emit({"type": "upload_start", "total": total, "timestamp": default_timestamp()})
        for i, item in enumerate(items):
            if cancel():
                cancelled = True
                break
            path = item["path"]
            name = item.get("name") or Path(path).stem
            emit({"type": "track_start", "index": i, "name": name, "total": total})
            try:
                size = Path(path).stat().st_size
                h = item.get("file_hash") or _hashed(catalog, path, size, Path(path).stat().st_mtime)
                if not force and h in uploaded:
                    skipped += 1
                    results.append(UploadResult(name=name, status="skipped", file_hash=h))
                    emit({"type": "track_skipped", "index": i, "name": name,
                          "reason": "duplicate"})
                    continue
                meta = _meta_for(item, defaults)

                def on_prog(sent, tot, _i=i, _n=name):
                    emit({"type": "track_progress", "index": _i, "name": _n,
                          "sent": sent, "size": tot})

                track = client.upload(path, meta, on_progress=on_prog)
                tid = track.get("id")
                url = track.get("permalink_url")
                catalog.record_upload(
                    title=meta.title, file_path=path, file_hash=h, size=size,
                    sharing=meta.sharing, status="uploaded", timestamp=default_timestamp(),
                    sc_track_id=tid, permalink_url=url, account=account_label(catalog))
                uploaded[h] = {"permalink_url": url, "title": meta.title}
                ok += 1
                results.append(UploadResult(name=name, status="uploaded", file_hash=h,
                                            sc_track_id=tid, permalink_url=url))
                emit({"type": "track_done", "index": i, "name": name, "permalink_url": url})
            except Exception as e:  # one bad track must not abort the batch
                errors += 1
                msg = str(e)[:300]
                catalog.record_upload(
                    title=name, file_path=path, file_hash=item.get("file_hash"),
                    size=item.get("size", 0), sharing=defaults.get("sharing", "public"),
                    status="error", timestamp=default_timestamp(), error=msg,
                    account=account_label(catalog))
                results.append(UploadResult(name=name, status="error", error=msg))
                emit({"type": "track_error", "index": i, "name": name, "error": msg})
        emit({"type": "upload_done", "ok_count": ok, "error_count": errors,
              "skipped_count": skipped, "cancelled": cancelled})
        return {"ok_count": ok, "error_count": errors, "skipped_count": skipped,
                "cancelled": cancelled, "results": [r.__dict__ for r in results]}
    finally:
        with _upload_lock:
            _uploading = False


# ---- dashboard overview -----------------------------------------------------
def build_overview(catalog: Catalog) -> dict:
    t = catalog.totals()
    recent = catalog.recent_uploads(limit=1)
    last = recent[0] if recent else None
    return {
        "connected": connected(catalog),
        "account": account_label(catalog),
        "mock": soundcloud.use_mock(),
        "uploaded_count": t["uploaded_count"],
        "error_count": t["error_count"],
        "uploaded_bytes": t["uploaded_bytes"],
        "last_upload": (last or {}).get("timestamp"),
        "last_upload_ok": bool(last and last.get("status") == "uploaded"),
    }
