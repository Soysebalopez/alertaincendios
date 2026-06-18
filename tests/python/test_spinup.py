from fire_danger.spinup import replay_state
from fire_danger.openmeteo import DayWeather
from fire_danger import fwi


def _day(date, temp=15.0, rh=50.0, wind=10.0, precip=0.0):
    return DayWeather(date=date, month=int(date[5:7]), temp=temp, rh=rh, wind=wind, precip=precip)


def test_replay_returns_final_state_after_history():
    history = [_day(f"2026-05-{d:02d}") for d in range(1, 31)]
    state = replay_state(history, hemisphere="south")
    assert set(state) == {"ffmc", "dmc", "dc"}
    # 30 dry days → drought code climbs above the default 15.0
    assert state["dc"] > 15.0


def test_replay_empty_history_is_default_state():
    state = replay_state([], hemisphere="south")
    assert (state["ffmc"], state["dmc"], state["dc"]) == fwi.DEFAULT_STATE
