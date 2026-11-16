"""The metric list and the forecast maths, without needing any data."""
import numpy as np

from pipeline import predict
from pipeline.build import state_minutes
from pipeline.metrics import BY_KEY, METRICS, TREND_METRICS


def test_metric_keys_unique_and_valid():
    assert len(BY_KEY) == len(METRICS)
    for m in METRICS:
        assert m.better in ("high", "low", None)
        assert m.format in ("num", "pct", "int")
        assert m.unit in ("results", "attack", "defence", "set_pieces", "style")


def test_conceding_metrics_are_lower_is_better():
    for m in METRICS:
        if m.unit == "defence" and m.category in ("conceding", "chances_allowed") and m.key != "clean_sheets":
            assert m.better == "low", m.key


def test_style_metrics_have_no_direction():
    assert all(m.better is None for m in METRICS if m.unit == "style")


def test_trend_metrics_exist():
    assert set(TREND_METRICS) <= set(BY_KEY)


def test_score_matrix_is_a_distribution():
    for rho in (0.0, -0.1):
        m = predict.score_matrix(1.6, 1.1, rho)
        assert abs(m.sum() - 1) < 1e-9 and (m >= 0).all()
        assert abs(sum(predict.outcome_probs(m)) - 1) < 1e-9


def test_stronger_home_side_is_favoured():
    home, _, away = predict.outcome_probs(predict.score_matrix(2.0, 0.8, 0.0))
    assert home > away


def test_scores_reward_the_better_forecast():
    y = np.array([0, 0, 2])
    good = np.array([[0.7, 0.2, 0.1], [0.6, 0.3, 0.1], [0.1, 0.2, 0.7]])
    flat = np.full((3, 3), 1 / 3)
    assert predict._score(good, y)["logLoss"] < predict._score(flat, y)["logLoss"]
    assert predict._score(good, y)["rps"] < predict._score(flat, y)["rps"]


def test_state_minutes():
    # home scores on 30, away equalises on 60
    goals = [(30, True), (60, False)]
    assert state_minutes(goals, True) == {"lead": 30, "level": 60, "trail": 0}
    assert state_minutes(goals, False) == {"lead": 0, "level": 60, "trail": 30}
