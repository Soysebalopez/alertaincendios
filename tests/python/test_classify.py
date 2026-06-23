from fire_danger.classify import danger_class, DANGER_CLASSES
import fire_danger.classify as classify_mod


def test_class_boundaries():
    assert danger_class(0.0) == "bajo"
    assert danger_class(4.9) == "bajo"
    assert danger_class(5.0) == "moderado"
    assert danger_class(11.0) == "alto"
    assert danger_class(24.0) == "muy alto"
    assert danger_class(40.0) == "extremo"


def test_classes_are_ordered_and_known():
    assert DANGER_CLASSES == ["bajo", "moderado", "alto", "muy alto", "extremo"]
    assert danger_class(-1.0) == "bajo"  # never below the floor


def test_calibrated_zone_uses_its_own_cuts(monkeypatch):
    monkeypatch.setattr(classify_mod, "_calibrated",
                        lambda: {"z": {"moderado": 2.0, "alto": 5.0, "muy alto": 8.0, "extremo": 12.0}})
    assert classify_mod.danger_class(1.0, "z") == "bajo"
    assert classify_mod.danger_class(2.0, "z") == "moderado"
    assert classify_mod.danger_class(6.0, "z") == "alto"
    assert classify_mod.danger_class(9.0, "z") == "muy alto"
    assert classify_mod.danger_class(12.0, "z") == "extremo"


def test_unknown_zone_falls_back_to_global(monkeypatch):
    monkeypatch.setattr(classify_mod, "_calibrated",
                        lambda: {"z": {"moderado": 2.0, "alto": 5.0, "muy alto": 8.0, "extremo": 12.0}})
    # zone "other" has no calibration -> global cuts (muy alto starts at 21.0)
    assert classify_mod.danger_class(25.0, "other") == "muy alto"


def test_no_zone_id_uses_global(monkeypatch):
    monkeypatch.setattr(classify_mod, "_calibrated",
                        lambda: {"z": {"moderado": 2.0, "alto": 5.0, "muy alto": 8.0, "extremo": 12.0}})
    assert classify_mod.danger_class(25.0) == "muy alto"   # global, unchanged contract
