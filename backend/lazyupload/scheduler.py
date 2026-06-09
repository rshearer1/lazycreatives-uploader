"""APScheduler-backed watch-folder auto-uploader (a Pro feature).

On each interval it scans the watched folders, takes any mixes not yet published,
and uploads them with the configured default metadata. De-dupe lives in the engine,
so re-scanning the same folder never re-posts an existing track.
"""
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler

from lazyupload import entitlement
from lazyupload.catalog import Catalog
from lazyupload.service import run_upload, scan_mixes, upload_in_progress

_JOB_ID = "auto_upload"


class UploadScheduler:
    def __init__(self, catalog: Catalog, hub=None):
        self._catalog = catalog
        self._hub = hub  # scheduled runs stream progress + fire the completion toast
        self._scheduler = BackgroundScheduler()
        self._scheduler.start(paused=False)

    def set_interval(self, minutes: int) -> None:
        existing = self._scheduler.get_job(_JOB_ID)
        if existing is not None:
            existing.remove()
        if minutes and minutes > 0:
            self._scheduler.add_job(self._run_once, "interval", minutes=minutes, id=_JOB_ID)

    def job_count(self) -> int:
        return len(self._scheduler.get_jobs())

    def next_run(self) -> Optional[str]:
        job = self._scheduler.get_job(_JOB_ID)
        if job is not None and job.next_run_time is not None:
            return job.next_run_time.isoformat()
        return None

    def _run_once(self) -> None:
        config = self._catalog.get_setting("config") or {}
        sources = config.get("sources", [])
        if not sources:
            return  # nothing watched yet
        tier = entitlement.verify_stored(self._catalog.get_setting("entitlement") or {})
        if not entitlement.allows(tier, "auto_upload"):
            return  # auto-upload is Pro-only
        if upload_in_progress():
            return  # a manual/previous run is going — skip this tick

        mixes = scan_mixes(self._catalog, [Path(s) for s in sources])
        fresh = [m for m in mixes if not m.get("uploaded")]
        if not fresh:
            return
        # Auto runs respect the configured defaults (sharing/genre/tags/template).
        defaults = {
            "sharing": config.get("default_sharing", "public"),
            "genre": config.get("default_genre", ""),
            "tags": config.get("default_tags", []),
            "title_template": config.get("title_template", "{name}"),
            "description": config.get("default_description", ""),
        }

        def progress(ev):
            if self._hub is not None:
                try:
                    self._hub.publish_threadsafe(ev)
                except RuntimeError:
                    pass

        run_upload(self._catalog, fresh, defaults=defaults, progress=progress)

    def shutdown(self) -> None:
        self._scheduler.shutdown(wait=False)
