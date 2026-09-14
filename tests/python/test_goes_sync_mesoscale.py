"""goes-sync also reads the 1-minute mesoscale fire product when a sector
covers Bahía Blanca (WHI-907 part 6), without ever putting the full-disk run
at risk.

NOAA points its two mesoscale sectors wherever weather matters to it (on
2026-09-14 M1 was over the central US), so most runs find no coverage and must
change nothing. When a sector does cover Bahía, its newest frame's detections
join the run, minus fires the full disk already has (see
goes_mesoscale/selection.py for why).
"""
import importlib.util
from pathlib import Path

import pytest

HANDLER = Path(__file__).resolve().parents[2] / "api" / "goes-sync.py"
M1_KEY = "ABI-L2-FDCM/2026/257/14/OR_ABI-L2-FDCM1-M6_G19_s20262571405000_e20262571405590_c20262571406020.nc"
M2_KEY = M1_KEY.replace("FDCM1", "FDCM2")
US_SECTOR = (32.7, 47.4, -110.0, -89.0)  # (south, north, west, east)
BAHIA_SECTOR = (-44.0, -34.0, -67.0, -57.0)
FULL_DISK = [{"lat": -38.6, "lng": -62.4, "high_confidence": True}]
SAME_FIRE = {"lat": -38.61, "lng": -62.41, "high_confidence": True}  # ~1.4 km from the full-disk one
NEW_FIRE = {"lat": -38.9, "lng": -62.0, "high_confidence": True}  # ~48 km away


class FakeS3:
    def download_file(self, bucket, key, path):
        pass


@pytest.fixture
def sync(monkeypatch):
    spec = importlib.util.spec_from_file_location("goes_sync", HANDLER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    written = {}

    def upsert(rows):
        written["rows"] = list(rows)
        return len(written["rows"]), None

    monkeypatch.setattr(module, "s3_client", lambda: FakeS3())
    monkeypatch.setattr(module, "latest_object_key", lambda client: "ABI-L2-FDCF/full-disk.nc")
    monkeypatch.setattr(module, "compute_persistence", lambda rows, url, key: 0)
    monkeypatch.setattr(module, "save_run_stats", lambda *args, **kwargs: None)
    monkeypatch.setattr(module, "upsert_to_supabase", upsert)
    monkeypatch.setattr(module, "list_mesoscale_keys", lambda client, since: [M1_KEY, M2_KEY])
    monkeypatch.setattr(
        module, "download_to_temp", lambda client, key: "mesoscale:" + ("M1" if "FDCM1" in key else "M2")
    )
    return module, written


def configure(module, monkeypatch, extents, mesoscale):
    monkeypatch.setattr(module, "read_extent", lambda path: extents[path.split(":")[1]])

    def extract(path):
        if path.startswith("mesoscale:"):
            return list(mesoscale[path.split(":")[1]]), "2026-09-14T14:05:00Z", {}
        return list(FULL_DISK), "2026-09-14T14:00:00Z", {}

    monkeypatch.setattr(module, "extract_filtered_detections", extract)


def test_no_sector_over_bahia_changes_nothing(sync, monkeypatch):
    module, written = sync
    configure(module, monkeypatch, {"M1": US_SECTOR, "M2": US_SECTOR}, {"M1": [NEW_FIRE], "M2": [NEW_FIRE]})
    result = module.run_pipeline()
    assert written["rows"] == FULL_DISK
    assert result["mesoscale"] == {"sectors_checked": 2, "sectors_covering": 0, "detections_added": 0}


def test_a_sector_over_bahia_adds_new_fires_but_not_the_ones_the_full_disk_has(sync, monkeypatch):
    module, written = sync
    configure(module, monkeypatch, {"M1": BAHIA_SECTOR, "M2": US_SECTOR}, {"M1": [SAME_FIRE, NEW_FIRE], "M2": []})
    result = module.run_pipeline()
    assert written["rows"] == FULL_DISK + [NEW_FIRE]
    assert result["mesoscale"] == {"sectors_checked": 2, "sectors_covering": 1, "detections_added": 1}


def test_a_mesoscale_failure_never_breaks_the_full_disk_run(sync, monkeypatch):
    module, written = sync
    configure(module, monkeypatch, {}, {})

    def listing_fails(client, since):
        raise RuntimeError("S3 listing failed")

    monkeypatch.setattr(module, "list_mesoscale_keys", listing_fails)
    result = module.run_pipeline()
    assert result["ok"] is True
    assert written["rows"] == FULL_DISK
    assert "S3 listing failed" in result["mesoscale"]["error"]
