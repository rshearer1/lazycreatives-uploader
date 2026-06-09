import os

import pytest

# Force the offline mock client + enable dev licence keys for the whole suite,
# before any lazyupload module reads these at call time.
os.environ.setdefault("LAZYUP_MOCK", "1")
os.environ.setdefault("LAZYUP_DEV", "1")

from lazyupload.catalog import Catalog  # noqa: E402
from tests.helpers import make_wav  # noqa: E402


@pytest.fixture
def catalog(tmp_path):
    cat = Catalog(tmp_path / "catalog.db")
    yield cat
    cat.close()


@pytest.fixture
def mixes_dir(tmp_path):
    d = tmp_path / "Mixes"
    make_wav(d / "Sunset Dub.wav", value=1)
    make_wav(d / "Midnight Drive.wav", value=2)
    make_wav(d / "Warehouse Set.wav", value=3)
    (d / "session.als").write_bytes(b"not audio")  # a project file — ignored by the scanner
    return d
