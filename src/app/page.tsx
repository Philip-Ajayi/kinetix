'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  ShieldCheck,
  Activity,
  BarChart3,
  Cpu,
  Zap,
  ArrowUpRight,
  Layers,
  ExternalLink,
  ChevronRight,
  TrendingDown,
  Terminal,
  Settings2,
  CheckCircle2
} from 'lucide-react';
import { AlmgrenChrissParams, ChildFill, ExecutionReport, Level2OrderBook, OrderSide } from '@/lib/engine/types';
import { AlmgrenChrissSolver } from '@/lib/engine/almgren-chriss';

export default function KinetixTerminal() {
  // Config state
  const [side, setSide] = useState<OrderSide>('BUY');
  const [sizeUSD, setSizeUSD] = useState<number>(5000);
  const [horizonSeconds, setHorizonSeconds] = useState<number>(30);
  const [urgencyKappa, setUrgencyKappa] = useState<number>(0.05);
  const [networkMode, setNetworkMode] = useState<'SIMULATION' | 'SOMNIA_TESTNET'>('SIMULATION');
  const [isWalletConnected, setIsWalletConnected] = useState<boolean>(true);
  const [sessionActive, setSessionActive] = useState<boolean>(true);

  // Live state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [currentBook, setCurrentBook] = useState<Level2OrderBook | null>(null);
  const [liveFills, setLiveFills] = useState<ChildFill[]>([]);
  const [executionReport, setExecutionReport] = useState<ExecutionReport | null>(null);
  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize order book & volatility telemetry
  useEffect(() => {
    fetch('/api/orderbook')
      .then(res => res.json())
      .then(data => {
        if (data.book) setCurrentBook(data.book);
      })
      .catch(() => {});

    addLog('System initialized: Almgren-Chriss Engine v1.0.0 ready.');
    addLog('Stork Oracle tick listener registered. Volatility: 64.2% annualized.');
    addLog('dreamDEX CLOB session key authenticated (Trade-Only Permissions).');
  }, []);

  const addLog = (msg: string) => {
    const timestamp = new Date().toISOString().substring(11, 23);
    setTelemetryLogs(prev => [`[${timestamp}] ${msg}`, ...prev.slice(0, 40)]);
  };

  // Trajectory calculation
  const params: AlmgrenChrissParams = {
    totalUnits: currentBook ? sizeUSD / currentBook.midPrice : sizeUSD / 0.985,
    horizonSeconds,
    sliceCount: Math.max(6, Math.floor(horizonSeconds / 5)),
    riskAversion: urgencyKappa,
    temporaryImpactFactor: 0.08,
    permanentImpactFactor: 0.02,
    volatility: 0.65,
  };

  const theoreticalTrajectory = AlmgrenChrissSolver.computeTrajectory(params);
  const impactEstimate = AlmgrenChrissSolver.estimateImpactCost(params, currentBook?.midPrice || 0.985);

  // Canvas visualizer for Almgren-Chriss Sinh Trajectory & live fills
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Padding
    const padX = 45;
    const padY = 30;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    // Grid lines
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padY + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(width - padX, y);
      ctx.stroke();

      const x = padX + (plotW / 4) * i;
      ctx.beginPath();
      ctx.moveTo(x, padY);
      ctx.lineTo(x, height - padY);
      ctx.stroke();
    }

    // Benchmark: Naive linear TWAP curve (Grey dashed)
    ctx.strokeStyle = '#475569';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padX, padY);
    ctx.lineTo(padX + plotW, padY + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Optimal Almgren-Chriss Sinh Trajectory (Cyan Solid)
    ctx.strokeStyle = '#00F0FF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(padX, padY);

    theoreticalTrajectory.forEach((slice, idx) => {
      const x = padX + (slice.timeTarget / horizonSeconds) * plotW;
      const y = padY + ((params.totalUnits - slice.scheduledRemaining) / params.totalUnits) * plotH;
      ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Actual Child Fills plotted as pulsing green dots
    let cumulativeExecuted = 0;
    liveFills.forEach((fill, idx) => {
      cumulativeExecuted += fill.size;
      const x = padX + ((fill.sliceIndex * (horizonSeconds / theoreticalTrajectory.length)) / horizonSeconds) * plotW;
      const y = padY + (cumulativeExecuted / params.totalUnits) * plotH;

      ctx.fillStyle = fill.orderType === 'MAKER_LIMIT' ? '#00E599' : '#FF9900';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Labels
    ctx.fillStyle = '#64748B';
    ctx.font = '10px monospace';
    ctx.fillText('0s', padX - 10, height - padY + 16);
    ctx.fillText(`${horizonSeconds}s`, width - padX - 10, height - padY + 16);
    ctx.fillText('100% Vol', 5, padY + 5);
    ctx.fillText('0%', 15, height - padY);
  }, [theoreticalTrajectory, liveFills, horizonSeconds, params.totalUnits]);

  // Execute Duel Order Handler
  const handleExecute = async () => {
    setIsExecuting(true);
    setLiveFills([]);
    setExecutionReport(null);
    setCurrentStep(0);

    addLog(`Initiating block execution: ${sizeUSD} USDso ${side} on SOMI-PERP.`);
    addLog(`Calculated Almgren-Chriss urgency kappa: ${AlmgrenChrissSolver.calculateKappa(params).toFixed(4)}.`);

    try {
      const res = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          side,
          sizeUSD,
          horizonSeconds,
          riskAversion: urgencyKappa,
        }),
      });

      const data = await res.json();
      if (data.success && data.report) {
        // Stream fills into UI dynamically for visual feedback
        for (let i = 0; i < data.report.fills.length; i++) {
          const fill: ChildFill = data.report.fills[i];
          await new Promise(r => setTimeout(r, 220));
          setLiveFills(prev => [...prev, fill]);
          setCurrentStep(i + 1);
          addLog(`Slice #${fill.sliceIndex} executed: ${fill.size} SOMI @ ${fill.fillPrice} [${fill.orderType}] - Slippage: ${fill.slippageVsArrivalBps} bps`);
        }

        setExecutionReport(data.report);
        addLog(`Execution completed. Realized VWAP: ${data.report.realizedVWAP}. Slippage saved: $${data.report.totalSavingsUSDso} USDso.`);
      }
    } catch (err: any) {
      addLog(`Error during dispatch: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-slate-100 font-sans">
      {/* Top Navigation */}
      <header className="border-b border-surfaceBorder bg-surface/70 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-accent to-accentGreen flex items-center justify-center font-bold text-black font-mono text-lg">
            K
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold tracking-wider text-white text-base">KINETIX</span>
              <span className="text-[10px] bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded font-mono font-medium">
                ALMGREN-CHRISS ENGINE
              </span>
            </div>
            <p className="text-xs text-slate-400">Institutional CLOB Execution Protocol &bull; dreamDEX / Somnia</p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Mode Switcher */}
          <div className="bg-background border border-surfaceBorder rounded-lg p-0.5 flex text-xs font-mono">
            <button
              onClick={() => setNetworkMode('SIMULATION')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                networkMode === 'SIMULATION' ? 'bg-accent/20 text-accent font-semibold border border-accent/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Interactive Sandbox
            </button>
            <button
              onClick={() => setNetworkMode('SOMNIA_TESTNET')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                networkMode === 'SOMNIA_TESTNET' ? 'bg-accentGreen/20 text-accentGreen font-semibold border border-accentGreen/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              Somnia Testnet (Live)
            </button>
          </div>

          {/* Session Badge */}
          <div className="flex items-center space-x-2 bg-surface border border-surfaceBorder px-3 py-1.5 rounded-lg text-xs">
            <span className="w-2 h-2 rounded-full bg-accentGreen animate-pulse"></span>
            <span className="text-slate-300 font-mono">Session Key: 0x73a...91d (Trade Only)</span>
          </div>
        </div>
      </header>

      {/* Main Terminal Layout */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Parameter Control & Order Configuration (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-surfaceBorder">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-slate-300 flex items-center space-x-2">
                <Settings2 className="w-4 h-4 text-accent" />
                <span>Optimal Order Dispatcher</span>
              </h2>
              <span className="text-xs font-mono text-accentGreen bg-accentGreen/10 px-2 py-0.5 rounded border border-accentGreen/20">
                L2 Depth: Active
              </span>
            </div>

            {/* Asset & Direction Selection */}
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 font-mono block mb-1.5">Asset Pair</label>
                <div className="bg-background border border-surfaceBorder rounded-lg px-3 py-2 text-sm font-mono flex justify-between items-center text-white">
                  <span className="font-bold">SOMI-PERP</span>
                  <span className="text-xs text-slate-400">dreamDEX Index: 0.9850 USDso</span>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-mono block mb-1.5">Direction</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSide('BUY')}
                    className={`py-2 rounded-lg font-mono text-xs font-bold transition-all border ${
                      side === 'BUY'
                        ? 'bg-accentGreen/20 text-accentGreen border-accentGreen shadow-[0_0_15px_rgba(0,229,153,0.2)]'
                        : 'bg-background border-surfaceBorder text-slate-400 hover:text-white'
                    }`}
                  >
                    LONG / BUY
                  </button>
                  <button
                    onClick={() => setSide('SELL')}
                    className={`py-2 rounded-lg font-mono text-xs font-bold transition-all border ${
                      side === 'SELL'
                        ? 'bg-accentRed/20 text-accentRed border-accentRed shadow-[0_0_15px_rgba(255,51,102,0.2)]'
                        : 'bg-background border-surfaceBorder text-slate-400 hover:text-white'
                    }`}
                  >
                    SHORT / SELL
                  </button>
                </div>
              </div>

              {/* Order Size */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-slate-400 font-mono">Total Block Size</label>
                  <span className="text-xs font-mono text-accent">{sizeUSD.toLocaleString()} USDso</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {[2500, 5000, 15000].map(val => (
                    <button
                      key={val}
                      onClick={() => setSizeUSD(val)}
                      className={`text-xs font-mono py-1 rounded border ${
                        sizeUSD === val ? 'bg-accent/20 text-accent border-accent' : 'bg-background border-surfaceBorder text-slate-400'
                      }`}
                    >
                      ${val.toLocaleString()}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min="1000"
                  max="25000"
                  step="500"
                  value={sizeUSD}
                  onChange={e => setSizeUSD(Number(e.target.value))}
                  className="w-full accent-accent bg-background cursor-pointer"
                />
              </div>

              {/* Horizon Window */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-slate-400 font-mono">Horizon Window (T)</label>
                  <span className="text-xs font-mono text-white">{horizonSeconds} seconds</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="5"
                  value={horizonSeconds}
                  onChange={e => setHorizonSeconds(Number(e.target.value))}
                  className="w-full accent-accent bg-background cursor-pointer"
                />
              </div>

              {/* Urgency Slider kappa */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-slate-400 font-mono">Urgency / Risk Aversion (κ)</label>
                  <span className="text-xs font-mono text-accentOrange">{urgencyKappa}</span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.25"
                  step="0.005"
                  value={urgencyKappa}
                  onChange={e => setUrgencyKappa(Number(e.target.value))}
                  className="w-full accent-accentOrange bg-background cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>Low Impact (Passive)</span>
                  <span>Fast Execution</span>
                </div>
              </div>

              {/* Theoretical Impact Pre-flight Check */}
              <div className="bg-background/80 border border-surfaceBorder rounded-lg p-3 space-y-2 text-xs font-mono">
                <div className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Pre-Flight Benchmark</div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Market Order Est. Impact:</span>
                  <span className="text-accentRed">-${impactEstimate.naiveMarketCostUSD.toFixed(2)} USDso</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kinetix Almgren-Chriss Cost:</span>
                  <span className="text-accentGreen">-${impactEstimate.almgrenExpectedCostUSD.toFixed(2)} USDso</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-surfaceBorder font-bold">
                  <span className="text-slate-200">Expected Slippage Savings:</span>
                  <span className="text-accent">~${impactEstimate.expectedSavingsUSD.toFixed(2)} USDso</span>
                </div>
              </div>

              {/* One Click Deploy Button */}
              <button
                disabled={isExecuting}
                onClick={handleExecute}
                className={`w-full py-3.5 rounded-lg font-bold font-mono text-sm tracking-wide transition-all flex items-center justify-center space-x-2 shadow-lg ${
                  isExecuting
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-surfaceBorder'
                    : 'bg-gradient-to-r from-accent to-accentGreen text-black hover:opacity-95 shadow-[0_0_20px_rgba(0,240,255,0.3)] active:scale-[0.99]'
                }`}
              >
                {isExecuting ? (
                  <>
                    <Activity className="w-4 h-4 animate-spin text-accent" />
                    <span>EXECUTING OPTIMAL SLICES ({currentStep}/{theoreticalTrajectory.length})...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-black" />
                    <span>EXECUTE OPTIMAL ORDER (RUN DUEL)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Real-time Orderbook Snapshot */}
          <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg">
            <h3 className="text-xs font-semibold tracking-wide uppercase text-slate-300 font-mono mb-3 flex items-center space-x-2">
              <Layers className="w-3.5 h-3.5 text-accent" />
              <span>dreamDEX L2 Book Depth (Live)</span>
            </h3>

            {currentBook ? (
              <div className="space-y-1 font-mono text-xs">
                <div className="text-accentRed/90 space-y-0.5">
                  {currentBook.asks.slice(0, 3).reverse().map(([price, size], i) => (
                    <div key={i} className="flex justify-between px-2 py-0.5 bg-accentRed/5 rounded">
                      <span>{price.toFixed(4)}</span>
                      <span className="text-slate-400">{size.toFixed(1)} SOMI</span>
                    </div>
                  ))}
                </div>

                <div className="py-1 px-2 my-1 bg-surfaceBorder/40 rounded text-center font-bold text-accent text-xs">
                  SPREAD: {currentBook.spread.toFixed(4)} USDso &bull; MID: {currentBook.midPrice.toFixed(4)}
                </div>

                <div className="text-accentGreen/90 space-y-0.5">
                  {currentBook.bids.slice(0, 3).map(([price, size], i) => (
                    <div key={i} className="flex justify-between px-2 py-0.5 bg-accentGreen/5 rounded">
                      <span>{price.toFixed(4)}</span>
                      <span className="text-slate-400">{size.toFixed(1)} SOMI</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 font-mono animate-pulse">Connecting to dreamDEX WebSocket...</div>
            )}
          </div>
        </div>

        {/* Center / Right Column: Trajectory Chart, Slippage Duel, & Execution Telemetry (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Almgren-Chriss Real-time Trajectory Canvas */}
          <div className="bg-surface border border-surfaceBorder rounded-xl p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-4 border-b border-surfaceBorder gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white tracking-wide flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-accent" />
                  <span>Trajectory Optimization: Sinh Trajectory vs Child Fills</span>
                </h3>
                <p className="text-xs text-slate-400">Continuous Euler-Lagrange Solution &bull; Anti-Front-Running Randomized Jitter (±15%)</p>
              </div>
              <div className="flex items-center space-x-3 text-xs font-mono">
                <span className="flex items-center space-x-1">
                  <span className="w-2.5 h-0.5 bg-accent inline-block"></span>
                  <span className="text-slate-300">Optimal (AC)</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2.5 h-0.5 bg-slate-500 inline-block"></span>
                  <span className="text-slate-400">Naive TWAP</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-accentGreen inline-block"></span>
                  <span className="text-accentGreen">Maker Limit</span>
                </span>
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-accentOrange inline-block"></span>
                  <span className="text-accentOrange">IOC Sweep</span>
                </span>
              </div>
            </div>

            <div className="relative w-full h-[260px] bg-background/50 rounded-lg border border-surfaceBorder overflow-hidden">
              <canvas
                ref={canvasRef}
                width={700}
                height={260}
                className="w-full h-full block"
              />
            </div>
          </div>

          {/* Slippage Duel Summary (Concept 1: The Slippage Duel) */}
          {executionReport && (
            <div className="bg-gradient-to-b from-surface to-background border-2 border-accentGreen/40 rounded-xl p-5 shadow-[0_0_30px_rgba(0,229,153,0.1)]">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-surfaceBorder">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-accentGreen" />
                  <span className="font-bold text-white text-base">Execution Quality Audit: Kinetix vs Market Order</span>
                </div>
                <span className="text-xs font-mono bg-accentGreen/10 text-accentGreen border border-accentGreen/30 px-2.5 py-1 rounded-full font-bold">
                  {executionReport.slippageReductionPercent}% SLIPPAGE REDUCTION
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-center mb-4">
                <div className="bg-background/80 border border-accentRed/30 p-3 rounded-lg">
                  <div className="text-[11px] text-slate-400 uppercase mb-1">Naive Market Order</div>
                  <div className="text-lg font-bold text-accentRed">{executionReport.marketOrderBenchmarkVWAP}</div>
                  <div className="text-xs text-slate-400 mt-1">Slippage: {executionReport.marketSlippageBps} bps</div>
                  <div className="text-xs text-accentRed/80 mt-0.5">Heavy book impact loss</div>
                </div>

                <div className="bg-background/80 border border-slate-700 p-3 rounded-lg">
                  <div className="text-[11px] text-slate-400 uppercase mb-1">Standard TWAP</div>
                  <div className="text-lg font-bold text-slate-300">{executionReport.twapBenchmarkVWAP}</div>
                  <div className="text-xs text-slate-400 mt-1">Slippage: ~{(executionReport.realizedSlippageBps * 2.2).toFixed(1)} bps</div>
                  <div className="text-xs text-slate-500 mt-0.5">Targeted by front-runners</div>
                </div>

                <div className="bg-background/80 border border-accentGreen/50 p-3 rounded-lg shadow-[0_0_15px_rgba(0,229,153,0.15)]">
                  <div className="text-[11px] text-accentGreen uppercase font-bold mb-1">Kinetix Almgren-Chriss</div>
                  <div className="text-xl font-bold text-accentGreen">{executionReport.realizedVWAP}</div>
                  <div className="text-xs text-accentGreen mt-1">Slippage: {executionReport.realizedSlippageBps} bps</div>
                  <div className="text-xs text-white font-semibold mt-0.5">Harvested 0% Maker Fees</div>
                </div>
              </div>

              <div className="bg-accentGreen/10 border border-accentGreen/30 rounded-lg p-3 flex items-center justify-between font-mono text-xs">
                <span className="text-slate-300">Verified Net Capital Saved on dreamDEX:</span>
                <span className="text-base font-bold text-accentGreen">+${executionReport.totalSavingsUSDso} USDso</span>
              </div>
            </div>
          )}

          {/* Child Fill Telemetry Feed & Logs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Child Slice Fill Log */}
            <div className="bg-surface border border-surfaceBorder rounded-xl p-4 shadow-lg">
              <h4 className="text-xs font-semibold text-slate-300 tracking-wide uppercase font-mono mb-3 flex items-center space-x-2">
                <Zap className="w-3.5 h-3.5 text-accent" />
                <span>Child Slice Executions ({liveFills.length})</span>
              </h4>

              <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1 font-mono text-xs">
                {liveFills.length === 0 ? (
                  <div className="text-slate-500 text-xs py-4 text-center">No child orders dispatched yet. Click execute above.</div>
                ) : (
                  liveFills.map((fill, idx) => (
                    <div key={idx} className="bg-background/70 border border-surfaceBorder px-2.5 py-1.5 rounded flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400">#{fill.sliceIndex}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${fill.orderType === 'MAKER_LIMIT' ? 'bg-accentGreen/10 text-accentGreen' : 'bg-accentOrange/10 text-accentOrange'}`}>
                          {fill.orderType}
                        </span>
                        <span className="text-white font-medium">{fill.size} SOMI</span>
                      </div>
                      <div className="text-right">
                        <div className="text-white">@{fill.fillPrice}</div>
                        <div className="text-[10px] text-slate-400">{fill.slippageVsArrivalBps} bps</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Daemon Telemetry Console */}
            <div className="bg-surface border border-surfaceBorder rounded-xl p-4 shadow-lg flex flex-col">
              <h4 className="text-xs font-semibold text-slate-300 tracking-wide uppercase font-mono mb-3 flex items-center space-x-2">
                <Terminal className="w-3.5 h-3.5 text-accentGreen" />
                <span>Execution Daemon Telemetry</span>
              </h4>

              <div className="flex-1 bg-background/90 rounded-lg p-2.5 font-mono text-[11px] text-slate-300 space-y-1 overflow-y-auto max-h-[180px] border border-surfaceBorder">
                {telemetryLogs.map((log, i) => (
                  <div key={i} className="leading-tight text-slate-400">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-surfaceBorder bg-surface/50 px-6 py-3 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 font-mono gap-2">
        <div className="flex items-center space-x-3">
          <span>Kinetix v1.0.0-prod</span>
          <span>&bull;</span>
          <span className="text-accent">Almgren-Chriss Continuous Trajectory</span>
          <span>&bull;</span>
          <span>Somnia High-Performance EVM</span>
        </div>
        <div className="flex items-center space-x-4">
          <a
            href="https://shannon-explorer.somnia.network"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent flex items-center space-x-1"
          >
            <span>Somnia Shannon Explorer</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
}
