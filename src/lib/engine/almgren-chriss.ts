import { AlmgrenChrissParams, TrajectorySlice } from './types';

export class AlmgrenChrissSolver {
  /**
   * Calculates the continuous urgency parameter kappa:
   * kappa = sqrt( (lambda * sigma^2) / eta )
   * or the exact discrete equivalent for discrete intervals tau:
   * cosh(kappa * tau) = 1 + (lambda * sigma^2 * tau^2) / (2 * eta)
   */
  public static calculateKappa(params: AlmgrenChrissParams): number {
    const { riskAversion, volatility, temporaryImpactFactor } = params;
    const safeEta = Math.max(temporaryImpactFactor, 1e-7);
    const safeVol = Math.max(volatility, 1e-5);
    const safeLambda = Math.max(riskAversion, 1e-6);

    const continuousKappaSquared = (safeLambda * Math.pow(safeVol, 2)) / safeEta;
    return Math.sqrt(continuousKappaSquared);
  }

  /**
   * Generates the optimal discrete execution trajectory:
   * x_j = X * ( sinh(kappa * (T - t_j)) / sinh(kappa * T) )
   * with slice sizes: n_j = x_{j-1} - x_j
   * Applies ±15% anti-front-running jitter to slice timing.
   */
  public static computeTrajectory(params: AlmgrenChrissParams): TrajectorySlice[] {
    const { totalUnits, horizonSeconds, sliceCount } = params;
    const tau = horizonSeconds / sliceCount;
    const kappa = this.calculateKappa(params);
    const T = horizonSeconds;

    const trajectory: TrajectorySlice[] = [];
    let previousRemaining = totalUnits;

    // Sinh scaling constant to avoid numerical instability
    const sinhKT = Math.sinh(Math.min(kappa * T, 50));

    for (let j = 1; j <= sliceCount; j++) {
      const tj = j * tau;
      let scheduledRemaining: number;

      if (j === sliceCount) {
        scheduledRemaining = 0;
      } else {
        const remainingTime = Math.max(T - tj, 0);
        const sinhRemaining = Math.sinh(Math.min(kappa * remainingTime, 50));
        scheduledRemaining = totalUnits * (sinhRemaining / sinhKT);
      }

      const targetSliceSize = Math.max(previousRemaining - scheduledRemaining, 0);

      // Anti-front-running pseudo-random timing jitter: +/- 15% of tau
      // Ensures predatory bots cannot predict slice arrival intervals
      const jitterFraction = (Math.random() * 0.30 - 0.15); // [-0.15, +0.15]
      const jitteredDelaySeconds = Math.max(0.5, tau * (1 + jitterFraction));

      trajectory.push({
        step: j,
        timeTarget: tj,
        scheduledRemaining,
        targetSliceSize,
        jitteredDelaySeconds,
      });

      previousRemaining = scheduledRemaining;
    }

    return trajectory;
  }

  /**
   * Benchmarks theoretical expected price impact vs a single naive market block order
   */
  public static estimateImpactCost(
    params: AlmgrenChrissParams,
    arrivalMidPrice: number
  ): { almgrenExpectedCostUSD: number; naiveMarketCostUSD: number; expectedSavingsUSD: number } {
    const { totalUnits, temporaryImpactFactor, permanentImpactFactor, horizonSeconds, sliceCount } = params;

    // Naive market order takes full temporary depth penalty in one single sweep
    const naiveImmediateImpact = (temporaryImpactFactor * (totalUnits / 1.0)) + (0.5 * permanentImpactFactor * totalUnits);
    const naiveMarketCostUSD = totalUnits * arrivalMidPrice * (naiveImmediateImpact / 100);

    // Almgren-Chriss spreads execution over time T using optimal hyperbolic profile
    const tau = horizonSeconds / sliceCount;
    const kappa = this.calculateKappa(params);
    const cothKT = 1 / Math.tanh(Math.min(kappa * horizonSeconds, 50));

    // Theoretical optimal quadratic execution impact
    const optimalTemporaryCost = 0.5 * temporaryImpactFactor * Math.pow(totalUnits, 2) * (tau * kappa * cothKT);
    const optimalPermanentCost = 0.5 * permanentImpactFactor * Math.pow(totalUnits, 2);
    const almgrenExpectedCostUSD = (optimalTemporaryCost + optimalPermanentCost) * (arrivalMidPrice / 1000);

    const expectedSavingsUSD = Math.max(0, naiveMarketCostUSD - almgrenExpectedCostUSD);

    return {
      almgrenExpectedCostUSD,
      naiveMarketCostUSD,
      expectedSavingsUSD,
    };
  }
}
