export interface CandleTick {
  high: number;
  low: number;
  open: number;
  close: number;
  timestamp: number;
}

export class VolatilityEngine {
  /**
   * Computes Parkinson High-Low Realized Volatility:
   * sigma_p = sqrt( (1 / (4 * ln(2) * N)) * sum( (ln(H_i / L_i))^2 ) )
   * Highly efficient estimator that is up to 5x more sample-efficient than close-to-close vol.
   */
  public static calculateParkinsonVol(candles: CandleTick[]): number {
    if (!candles || candles.length === 0) return 0.45; // Default 45% annual vol fallback

    const factor = 1 / (4 * Math.LN2 * candles.length);
    let sumLogRatioSquared = 0;

    for (const c of candles) {
      if (c.high > 0 && c.low > 0 && c.high >= c.low) {
        const logRatio = Math.log(c.high / c.low);
        sumLogRatioSquared += logRatio * logRatio;
      }
    }

    const variance = factor * sumLogRatioSquared;
    const periodVol = Math.sqrt(variance);

    // Annualize (assuming 1-minute sampling intervals: 525,600 minutes / year)
    const annualizedVol = periodVol * Math.sqrt(525600);
    return Math.min(Math.max(annualizedVol, 0.05), 3.0); // Bound between 5% and 300%
  }

  /**
   * Evaluates order book resilience parameter lambda based on spread recovery speed
   */
  public static computeOrderBookResilience(
    currentSpread: number,
    baseSpread: number,
    recoveryTimeSeconds: number
  ): number {
    if (recoveryTimeSeconds <= 0) return 0.5;
    const spreadExpansion = Math.max(currentSpread - baseSpread, 0.0001);
    return 1 / (spreadExpansion * recoveryTimeSeconds);
  }
}
