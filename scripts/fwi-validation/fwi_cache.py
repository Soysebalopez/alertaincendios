"""Resumable on-disk cache for Open-Meteo archive fetches. The archive is
deterministic (historical data never changes), so each fetch is cached to disk
the first time and read back on resume — a 429 mid-run just means the next run
skips what's already cached and fetches only what's missing.

Cache value shape: list[list[DayWeather]] (the multi-point block for one key)."""
import json
import pathlib
import sys
from dataclasses import asdict

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger.openmeteo import DayWeather  # noqa: E402


def cached_fetch(cache_dir, key, fetch_fn):
    """Return the block for `key`, from disk if cached else by calling fetch_fn()
    once and persisting it. `fetch_fn() -> list[list[DayWeather]]`. `key` should
    encode everything that defines the data (zone, year, point count) so a change
    in any of them naturally misses the cache."""
    cache_dir = pathlib.Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{key}.json"
    if path.exists():
        raw = json.loads(path.read_text())
        return [[DayWeather(**d) for d in block] for block in raw]
    blocks = fetch_fn()
    serialized = [[asdict(d) for d in block] for block in blocks]
    path.write_text(json.dumps(serialized))
    return blocks
