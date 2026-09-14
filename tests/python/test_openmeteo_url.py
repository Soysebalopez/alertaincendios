"""WHI-907 part 1 — the FWI engine must follow the same paid-plan switch as the
TypeScript side: OPEN_METEO_API_KEY set -> customer hosts + apikey."""
from fire_danger import openmeteo


def test_free_host_without_key(monkeypatch):
    monkeypatch.delenv("OPEN_METEO_API_KEY", raising=False)
    assert openmeteo.endpoint("forecast") == "https://api.open-meteo.com/v1/forecast"
    assert openmeteo.endpoint("archive") == "https://archive-api.open-meteo.com/v1/archive"
    assert "apikey" not in openmeteo.with_key({"latitude": 1})


def test_customer_host_and_trimmed_key(monkeypatch):
    monkeypatch.setenv("OPEN_METEO_API_KEY", " abc \n")
    assert openmeteo.endpoint("forecast") == "https://customer-api.open-meteo.com/v1/forecast"
    assert openmeteo.endpoint("archive") == "https://customer-archive-api.open-meteo.com/v1/archive"
    assert openmeteo.with_key({"latitude": 1}) == {"latitude": 1, "apikey": "abc"}


def test_blank_key_is_no_key(monkeypatch):
    monkeypatch.setenv("OPEN_METEO_API_KEY", "   ")
    assert openmeteo.endpoint("forecast").startswith("https://api.open-meteo.com")
    assert "apikey" not in openmeteo.with_key({"latitude": 1})


def test_fetch_forecast_sends_the_key(monkeypatch):
    """The switch must reach the real request, not only the helpers."""
    monkeypatch.setenv("OPEN_METEO_API_KEY", "abc")
    seen = {}

    def fake_request(url, params, timeout):
        seen["url"], seen["params"] = url, params

        class Resp:
            def json(self):
                return {"hourly": {"time": [], "temperature_2m": [], "relative_humidity_2m": [],
                                   "wind_speed_10m": [], "precipitation": []}}
        return Resp()

    monkeypatch.setattr(openmeteo, "_request_with_retry", fake_request)
    openmeteo.fetch_forecast(-38.72, -62.27, days=1)
    assert seen["url"] == "https://customer-api.open-meteo.com/v1/forecast"
    assert seen["params"]["apikey"] == "abc"
