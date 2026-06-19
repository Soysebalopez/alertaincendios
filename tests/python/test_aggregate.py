# tests/python/test_aggregate.py
from fire_danger.aggregate import percentile, aggregate_fwi, leader_index


def test_percentile_linear_interpolation_matches_numpy_default():
    # numpy.percentile(range(11), 95) == 9.5  (rank = 0.95 * 10 = 9.5)
    assert percentile([float(i) for i in range(11)], 95.0) == 9.5


def test_percentile_two_points():
    assert percentile([0.0, 10.0], 95.0) == 9.5


def test_percentile_uniform_list():
    assert percentile([5.0, 5.0, 5.0], 95.0) == 5.0


def test_percentile_boundaries_q0_and_q100():
    # q=100 lands exactly on the last index (exercises the lo+1 >= len guard)
    assert percentile([1.0, 5.0, 10.0], 100.0) == 10.0
    assert percentile([1.0, 5.0, 10.0], 0.0) == 1.0


def test_aggregate_fwi_single_point_equals_value():
    assert aggregate_fwi([12.34]) == 12.34


def test_aggregate_fwi_robust_to_single_outlier():
    # 49 calm points + 1 spike: p95 stays in the calm bulk, not at the spike
    assert aggregate_fwi([3.0] * 49 + [80.0]) < 4.0


def test_leader_index_picks_point_closest_to_p95():
    # p95 of [0..10] is 9.5; values 9 and 10 are equidistant; min() picks the
    # first occurrence -> index 9 (value 9.0)
    assert leader_index([float(i) for i in range(11)]) == 9
