import json
from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session")
def cffdrs_reference():
    with open(FIXTURES / "cffdrs_reference.json") as f:
        return json.load(f)
