export type OrderSide = 'BUY' | 'SELL';

export interface Level2OrderBook {
  timestamp: number;
  bids: [number, number][]; // [price, size]
  asks: [number, number][]; // [price, size]
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spread: number;
}

export interface AlmgrenChrissParams {
  totalUnits: number;            // Total shares or tokens to execute (X)
  horizonSeconds: number;        // Execution horizon T in seconds
  sliceCount: number;            // Number of child steps N
  riskAversion: number;          // Urgency / Risk aversion lambda (0.001 - 1.0)
  temporaryImpactFactor: number; // eta (temporary price impact coefficient)
  permanentImpactFactor: number; // gamma (permanent price impact coefficient)
  volatility: number;            // sigma (annualized or per-second volatility)
}

export interface TrajectorySlice {
  step: number;
  timeTarget: number;            // Timestamp offset from start (seconds)
  scheduledRemaining: number;    // Remaining inventory x_j
  targetSliceSize: number;       // Child volume n_j = x_{j-1} - x_j
  jitteredDelaySeconds: number;  // Randomized offset for anti-front-running
}

export interface ChildFill {
  sliceIndex: number;
  timestamp: number;
  side: OrderSide;
  size: number;
  fillPrice: number;
  orderType: 'MAKER_LIMIT' | 'IOC_SWEEP';
  feeCost: number;
  makerFeeHarvested: boolean;
  slippageVsArrivalBps: number;
  txHash: string;
}

export interface ExecutionReport {
  asset: string;
  side: OrderSide;
  totalSize: number;
  horizonSeconds: number;
  arrivalMidPrice: number;
  realizedVWAP: number;
  marketOrderBenchmarkVWAP: number;
  twapBenchmarkVWAP: number;
  realizedSlippageBps: number;
  marketSlippageBps: number;
  totalSavingsUSDso: number;
  slippageReductionPercent: number;
  fills: ChildFill[];
}
