#!/usr/bin/env tsx

import { ExecutionDispatcher } from '../src/lib/engine/dispatcher';
import { StorkOracleConnector } from '../src/lib/connectors/stork';
import { AlmgrenChrissSolver } from '../src/lib/engine/almgren-chriss';

async function main() {
  console.log('===============================================================');
  console.log('  KINETIX: ALMGREN-CHRISS OPTIMAL EXECUTION DAEMON');
  console.log('===============================================================');

  const stork = new StorkOracleConnector();
  console.log('[*] Fetching Parkinson Realized Volatility from Stork Oracle...');
  const volData = await stork.getRealizedVolatility('SOMI');
  console.log(`[+] Stork Volatility: ${(volData.annualizedVol * 100).toFixed(2)}% | Index: ${volData.latestPrice} USDso`);

  const totalUSD = 10000;
  const horizonSeconds = 45;
  const urgencyKappa = 0.05;

  console.log(`[*] Preparing block order: $${totalUSD} USDso BUY SOMI-PERP`);
  console.log(`[*] Horizon: ${horizonSeconds}s | Urgency kappa: ${urgencyKappa}`);

  const dispatcher = new ExecutionDispatcher();

  console.log('[*] Executing Almgren-Chriss hybrid slices onto dreamDEX...');
  const report = await dispatcher.executeBlockOrder(
    'BUY',
    totalUSD,
    horizonSeconds,
    urgencyKappa,
    (fill, book) => {
      console.log(`  -> Child Slice #${fill.sliceIndex}: Filled ${fill.size} SOMI @ ${fill.fillPrice} [${fill.orderType}] | Jittered slippage: ${fill.slippageVsArrivalBps} bps`);
    }
  );

  console.log('\n===============================================================');
  console.log('  EXECUTION QUALITY REPORT');
  console.log('===============================================================');
  console.log(`Asset:                       ${report.asset}`);
  console.log(`Benchmark Arrival Mid-Price: ${report.arrivalMidPrice} USDso`);
  console.log(`Realized Kinetix VWAP:       ${report.realizedVWAP} USDso`);
  console.log(`Naive Market Order VWAP:     ${report.marketOrderBenchmarkVWAP} USDso`);
  console.log(`Market Order Slippage:       ${report.marketSlippageBps} bps`);
  console.log(`Kinetix Realized Slippage:   ${report.realizedSlippageBps} bps`);
  console.log(`Slippage Reduction:          ${report.slippageReductionPercent}%`);
  console.log(`Total Capital Saved:         $${report.totalSavingsUSDso} USDso`);
  console.log('===============================================================\n');
}

main().catch(console.error);
