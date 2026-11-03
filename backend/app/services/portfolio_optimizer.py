"""Suggests portfolio weights with mean-variance optimisation (Markowitz), long only, with a cap per stock.

It uses past returns as the estimate of future ones, which is the method's well-known weak point:
the suggestion is a starting point to think with, not an answer.
"""
import math
from typing import Optional

import numpy as np
import pandas as pd

TRADING_DAYS = 252
SHRINKAGE = 0.2  # Pulls correlations toward zero a little, so a few noisy years don't dominate.
FRONTIER_POINTS = 40
ITERATIONS = 3000
MIN_SESSIONS = 250


class OptimisationError(ValueError):
    """Inputs the optimiser can't work with."""


def project_capped_simplex(values: np.ndarray, cap: float) -> np.ndarray:
    """The closest weights to `values` that are each between 0 and `cap` and add up to 1."""
    low, high = values.min() - 1.0, values.max()
    for _ in range(100):
        shift = (low + high) / 2
        if np.clip(values - shift, 0.0, cap).sum() > 1.0:
            low = shift
        else:
            high = shift
    return np.clip(values - (low + high) / 2, 0.0, cap)


def estimate(closes: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Yearly expected return (mean daily log return) and covariance, with light shrinkage."""
    returns = np.log(closes / closes.shift(1)).dropna()
    mean = returns.mean().to_numpy() * TRADING_DAYS
    covariance = returns.cov().to_numpy() * TRADING_DAYS
    covariance = (1 - SHRINKAGE) * covariance + SHRINKAGE * np.diag(np.diag(covariance))
    return mean, covariance


def stats(weights: np.ndarray, mean: np.ndarray, covariance: np.ndarray, risk_free: float) -> dict:
    expected = float(weights @ mean)
    risk = math.sqrt(max(float(weights @ covariance @ weights), 0.0))
    return {
        "return_pct": round(expected * 100, 1),
        "risk_pct": round(risk * 100, 1),
        "sharpe": round((expected - risk_free) / risk, 2) if risk > 0 else None,
    }


def _solve(mean: np.ndarray, covariance: np.ndarray, cap: float, return_weight: float, risk_weight: float) -> np.ndarray:
    """Maximise return_weight * return - risk_weight * variance by projected gradient ascent. It's concave, so this finds the best."""
    size = len(mean)
    weights = project_capped_simplex(np.full(size, 1.0 / size), cap)
    largest = float(np.linalg.eigvalsh(covariance).max())
    step = 1.0 / (2 * risk_weight * largest + 1e-12)
    for _ in range(ITERATIONS):
        gradient = return_weight * mean - 2 * risk_weight * covariance @ weights
        updated = project_capped_simplex(weights + step * gradient, cap)
        if np.abs(updated - weights).max() < 1e-10:
            break
        weights = updated
    return weights


def optimise(closes: pd.DataFrame, objective: str, cap: float, risk_free: float, current: Optional[dict] = None) -> dict:
    closes = closes.dropna()
    tickers = list(closes.columns)
    if len(tickers) < 2:
        raise OptimisationError("At least two stocks with price history are needed.")
    if len(closes) < MIN_SESSIONS:
        raise OptimisationError("The stocks share less than a year of price history, which is too little to estimate risk.")
    cap = max(cap, 1.0 / len(tickers))  # Otherwise the weights couldn't add up to 100%.
    mean, covariance = estimate(closes)

    # The frontier: from lowest risk to highest return. Maximum Sharpe sits on it.
    frontier = []
    for risk_weight in np.logspace(3, -1.5, FRONTIER_POINTS):
        weights = _solve(mean, covariance, cap, 1.0, float(risk_weight))
        frontier.append((weights, stats(weights, mean, covariance, risk_free)))
    lowest_risk = _solve(mean, covariance, cap, 0.0, 1.0)

    if objective == "min_variance":
        chosen = lowest_risk
    else:
        chosen = max(frontier, key=lambda item: item[1]["sharpe"] if item[1]["sharpe"] is not None else -math.inf)[0]

    def as_percent(weights: np.ndarray) -> dict:
        rounded = {t: round(float(w) * 100, 1) for t, w in zip(tickers, weights) if w >= 0.0005}
        # Rounding can leave the total a hair off 100, so the largest holding absorbs it.
        largest = max(rounded, key=rounded.get)
        rounded[largest] = round(rounded[largest] + 100 - sum(rounded.values()), 1)
        return {t: rounded.get(t, 0.0) for t in tickers}

    result = {
        "tickers": tickers,
        "sessions": len(closes),
        "start": closes.index[0].date().isoformat(),
        "end": closes.index[-1].date().isoformat(),
        "cap_pct": round(cap * 100, 1),
        "risk_free_pct": round(risk_free * 100, 2),
        "suggested": {"weights": as_percent(chosen), **stats(chosen, mean, covariance, risk_free)},
        "equal": stats(np.full(len(tickers), 1.0 / len(tickers)), mean, covariance, risk_free),
        "frontier": sorted(
            {(s["risk_pct"], s["return_pct"]) for _, s in [*frontier, (lowest_risk, stats(lowest_risk, mean, covariance, risk_free))]}
        ),
        "stocks": [
            {"ticker": t, "return_pct": round(float(mean[i]) * 100, 1), "risk_pct": round(math.sqrt(covariance[i, i]) * 100, 1)}
            for i, t in enumerate(tickers)
        ],
    }
    result["frontier"] = [{"risk_pct": r, "return_pct": e} for r, e in result["frontier"]]
    if current:
        given = np.array([float(current.get(t, 0.0)) for t in tickers])
        if given.sum() > 0:
            result["current"] = stats(given / given.sum(), mean, covariance, risk_free)
    return result
