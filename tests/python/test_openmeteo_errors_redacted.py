"""WHI-907 — once OPEN_METEO_API_KEY is set, `requests` writes the full URL,
apikey included, into its error messages, and api/fire-danger-sync.py returns
error text in its JSON response (which pg_net keeps in net._http_response).
Errors that leave the Open-Meteo client must never carry the key."""
import pytest
import requests

from fire_danger import openmeteo

KEY = "s3cr3t-key-123"


class _BadRequest:
    status_code = 400

    def raise_for_status(self):
        raise requests.HTTPError(
            "400 Client Error: Bad Request for url: "
            f"https://customer-api.open-meteo.com/v1/forecast?latitude=-38.7&apikey={KEY}"
        )


def _call():
    return openmeteo._request_with_retry(
        openmeteo.endpoint("forecast"), openmeteo.with_key({"latitude": -38.7}), timeout=5
    )


def test_http_errors_do_not_carry_the_key(monkeypatch):
    monkeypatch.setenv("OPEN_METEO_API_KEY", KEY)
    monkeypatch.setattr(openmeteo.requests, "get", lambda url, params, timeout: _BadRequest())
    with pytest.raises(requests.HTTPError) as err:
        _call()
    assert KEY not in str(err.value)
    assert "apikey=***" in str(err.value)
    assert err.value.__cause__ is None


def test_network_errors_do_not_carry_the_key(monkeypatch):
    monkeypatch.setenv("OPEN_METEO_API_KEY", KEY)
    monkeypatch.setattr(openmeteo.time, "sleep", lambda seconds: None)

    def unreachable(url, params, timeout):
        raise requests.ConnectionError(f"Max retries exceeded with url: /v1/forecast?apikey={KEY}")

    monkeypatch.setattr(openmeteo.requests, "get", unreachable)
    with pytest.raises(requests.ConnectionError) as err:
        _call()
    assert KEY not in str(err.value)
