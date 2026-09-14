import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def cffdrs_reference():
    with open(FIXTURES / "cffdrs_reference.json") as f:
        return json.load(f)


@pytest.fixture(autouse=True)
def _no_open_meteo_key(monkeypatch):
    """A real OPEN_METEO_API_KEY in the developer's shell would switch every
    Open-Meteo URL to the paid host; tests that need it set it explicitly."""
    monkeypatch.delenv("OPEN_METEO_API_KEY", raising=False)
