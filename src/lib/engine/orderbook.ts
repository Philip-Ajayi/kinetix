import { Level2OrderBook, OrderSide } from './types';

export class OrderBookSimulator {
  private book: Level2OrderBook;
  private baseMid: number;

  constructor(initialMidPrice: number = 0.9850) {
    this.baseMid = initialMidPrice;
    this.book = this.generateSyntheticDepth(initialMidPrice);
  }

  public getBook(): Level2OrderBook {
    return this.book;
  }

  public updateMid(newMid: number): Level2OrderBook {
    this.baseMid = newMid;
    this.book = this.generateSyntheticDepth(newMid);
    return this.book;
  }

  /**
   * Generates a realistic dreamDEX SOMI-PERP L2 book with 20 levels
   */
  public generateSyntheticDepth(mid: number): Level2OrderBook {
    const bids: [number, number][] = [];
    const asks: [number, number][] = [];
    const tickSize = 0.0005;
    const halfSpread = 0.00025;

    let bidStart = mid - halfSpread;
    let askStart = mid + halfSpread;

    for (let i = 0; i < 20; i++) {
      const bidPrice = Number((bidStart - i * tickSize).toFixed(4));
      const askPrice = Number((askStart + i * tickSize).toFixed(4));

      // Nonlinear liquidity: deeper levels have significantly more liquidity
      const depthMultiplier = 1 + Math.pow(i, 1.4);
      const bidSize = Number((300 * depthMultiplier + (Math.random() * 200)).toFixed(2));
      const askSize = Number((300 * depthMultiplier + (Math.random() * 200)).toFixed(2));

      bids.push([bidPrice, bidSize]);
      asks.push([askPrice, askSize]);
    }

    return {
      timestamp: Date.now(),
      bids,
      asks,
      bestBid: bids[0][0],
      bestAsk: asks[0][0],
      midPrice: Number(((bids[0][0] + asks[0][0]) / 2).toFixed(4)),
      spread: Number((asks[0][0] - bids[0][0]).toFixed(4)),
    };
  }

  /**
   * Simulates sweeping the book immediately with a large market block order
   */
  public executeMarketOrderSimulation(
    side: OrderSide,
    totalUsdSize: number
  ): { vwap: number; slippageBps: number; fills: [number, number][] } {
    const levels = side === 'BUY' ? [...this.book.asks] : [...this.book.bids];
    let remainingUsd = totalUsdSize;
    let totalUnitsAcquired = 0;
    let totalCostUsd = 0;
    const fills: [number, number][] = [];

    const arrivalMid = this.book.midPrice;

    for (const [levelPrice, levelUnits] of levels) {
      const levelNotional = levelPrice * levelUnits;
      if (remainingUsd <= levelNotional) {
        const unitsFromLevel = remainingUsd / levelPrice;
        totalUnitsAcquired += unitsFromLevel;
        totalCostUsd += remainingUsd;
        fills.push([levelPrice, unitsFromLevel]);
        remainingUsd = 0;
        break;
      } else {
        totalUnitsAcquired += levelUnits;
        totalCostUsd += levelNotional;
        fills.push([levelPrice, levelUnits]);
        remainingUsd -= levelNotional;
      }
    }

    if (remainingUsd > 0) {
      // Swept past top 20 levels: severe slippage penalty
      const lastLevelPrice = levels[levels.length - 1][0];
      const penaltyPrice = side === 'BUY' ? lastLevelPrice * 1.05 : lastLevelPrice * 0.95;
      const unitsRemaining = remainingUsd / penaltyPrice;
      totalUnitsAcquired += unitsRemaining;
      totalCostUsd += remainingUsd;
      fills.push([penaltyPrice, unitsRemaining]);
    }

    const vwap = totalCostUsd / totalUnitsAcquired;
    const slippageBps = Math.abs((vwap - arrivalMid) / arrivalMid) * 10000;

    return { vwap, slippageBps, fills };
  }
}
