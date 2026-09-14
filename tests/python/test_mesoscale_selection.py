"""Which mesoscale frames goes-sync reads, and which detections it keeps
(WHI-907 part 6).

GOES-19 scans each mesoscale sector every minute; goes-sync runs every 10.
Its persistence rule (WHI-546) counts a detection as persistent when an
EARLIER run saw it too, and single-frame low-power detections are not alerted
(WHI-584). For that to keep meaning "seen by two separate looks", a run reads
only the newest frame of each sector and drops the mesoscale detections of a
fire the full-disk scan of the same run already has.
"""
from goes_mesoscale.selection import drop_already_detected, newest_per_sector

_TEMPLATE = (
    "ABI-L2-FDCM/2026/257/14/OR_ABI-L2-FDCM{sector}-M6_G19_"
    "s2026257{hhmm}{ss}0_e2026257{hhmm}{ss}9_c20262571401000.nc"
)


def key(sector: int, hhmm: str, ss: str = "00") -> str:
    return _TEMPLATE.format(sector=sector, hhmm=hhmm, ss=ss)


def test_keeps_only_the_newest_frame_of_each_sector():
    keys = [key(1, "1400"), key(1, "1401"), key(2, "1400"), key(1, "1402"), key(2, "1403")]
    assert newest_per_sector(keys) == {"M1": key(1, "1402"), "M2": key(2, "1403")}


def test_ignores_keys_that_are_not_mesoscale_fire_files():
    full_disk = "ABI-L2-FDCF/2026/257/14/OR_ABI-L2-FDCF-M6_G19_s20262571400000_e20262571409000_c20262571409300.nc"
    assert newest_per_sector([full_disk, "junk"]) == {}


def test_drops_mesoscale_detections_of_fires_the_full_disk_already_has():
    full_disk = [{"lat": -38.6, "lng": -62.4}]
    same_fire = {"lat": -38.61, "lng": -62.41}  # ~1.4 km away
    new_fire = {"lat": -38.9, "lng": -62.0}  # ~48 km away
    assert drop_already_detected(full_disk, [same_fire, new_fire], radius_km=4.0) == [new_fire]


def test_without_full_disk_detections_every_mesoscale_detection_stays():
    mesoscale = [{"lat": -38.61, "lng": -62.41}]
    assert drop_already_detected([], mesoscale, radius_km=4.0) == mesoscale
