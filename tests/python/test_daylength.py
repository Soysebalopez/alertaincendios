from fire_danger.daylength import dmc_daylength, dc_daylength


def test_north_tables_match_van_wagner():
    # NH effective day length (DMC), months 1..12
    assert [dmc_daylength(m, "north") for m in range(1, 13)] == [
        6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0
    ]
    # NH day-length factor (DC), months 1..12
    assert [dc_daylength(m, "north") for m in range(1, 13)] == [
        -1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6
    ]


def test_south_is_north_shifted_six_months():
    # Southern summer (Jan) must use Northern summer (Jul) values, etc.
    for m in range(1, 13):
        nh_month = ((m + 6 - 1) % 12) + 1
        assert dmc_daylength(m, "south") == dmc_daylength(nh_month, "north")
        assert dc_daylength(m, "south") == dc_daylength(nh_month, "north")
