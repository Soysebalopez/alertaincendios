from fire_danger.classify import danger_class, DANGER_CLASSES


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
