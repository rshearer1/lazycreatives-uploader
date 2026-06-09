"""Pydantic wire models for the API. Bounded to reject hostile/oversized input."""
from pydantic import BaseModel, Field

_PATH = 4096
_LIST = 5000
_TEXT = 5000


class Config(BaseModel):
    sources: list[str] = Field(default_factory=list, max_length=_LIST)  # watched folders
    interval_minutes: int = Field(0, ge=0, le=44640)  # 0 = off … max 31 days
    default_sharing: str = Field("public", max_length=16)               # public | private
    default_genre: str = Field("", max_length=64)
    default_tags: list[str] = Field(default_factory=list, max_length=50)
    title_template: str = Field("{name}", max_length=200)
    default_description: str = Field("", max_length=_TEXT)
    downloadable: bool = False


class ActivateRequest(BaseModel):
    key: str = Field(..., max_length=200)


class ScanRequest(BaseModel):
    sources: list[str] | None = Field(None, max_length=_LIST)  # falls back to saved config


class UploadItem(BaseModel):
    path: str = Field(..., max_length=_PATH)
    name: str | None = Field(None, max_length=300)
    title: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=_TEXT)
    sharing: str | None = Field(None, max_length=16)
    genre: str | None = Field(None, max_length=64)
    tags: list[str] | None = Field(None, max_length=50)
    downloadable: bool | None = None
    file_hash: str | None = Field(None, max_length=128)
    size: int | None = Field(None, ge=0)


class UploadRequest(BaseModel):
    items: list[UploadItem] = Field(..., max_length=500)
    force: bool = False  # re-upload even if a matching hash was already published


class TrackUpdate(BaseModel):
    """Edit an existing SoundCloud track. Any field left None is left unchanged."""
    title: str | None = Field(None, max_length=300)
    description: str | None = Field(None, max_length=_TEXT)
    sharing: str | None = Field(None, max_length=16)  # public | private
    genre: str | None = Field(None, max_length=64)
    tags: list[str] | None = Field(None, max_length=50)
