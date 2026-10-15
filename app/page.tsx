'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { supabase, Signal } from '@/lib/supabase';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ShieldCheck,
  Zap,
  Clock,
  Target,
  AlertCircle,
  Copy,
  RefreshCw,
  Radio,
  BookOpen
} from 'lucide-react';

// Dynamic import for TradingView Widget to avoid SSR issues
const TradingViewWidget = dynamic(
  () => import('@/components/TradingViewWidget'),
  { ssr: false }
);

const DEMO_SIGNALS: Signal[] = [
  {
    id: 1,
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    pair: 'XAUUSD',
    action: 'BUY',
    entry_price: 2652.40,
    stop_loss: 2646.00,
    take_profit_1: 2665.00,
    take_profit_2: 2678.00,
    timeframe: '15m',
    setup_name: 'London KZ - Bullish FVG + MSS Sweep',
    status: 'ACTIVE',
    pips_result: 0,
  },
  {
    id: 2,
    created_at: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
    pair: 'EURUSD',
    action: 'SELL',
    entry_price: 1.0845,
    stop_loss: 1.0875,
    take_profit_1: 1.0790,
    take_profit_2: 1.0750,
    timeframe: '15m',
    setup_name: 'Judas Swing + Bearish Order Block',
    status: 'ACTIVE',
    pips_result: 0,
  },
  {
    id: 3,
    created_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    pair: 'XAUUSD',
    action: 'SELL',
    entry_price: 2668.00,
    stop_loss: 2673.50,
    take_profit_1: 2655.00,
    take_profit_2: 2642.00,
    timeframe: '15m',
    setup_name: 'NY Open - BSL Liquidity Sweep + FVG',
    status: 'TP1_HIT',
    pips_result: 130,
  },
  {
    id: 4,
    created_at: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
    pair: 'GBPUSD',
    action: 'BUY',
    entry_price: 1.2980,
    stop_loss: 1.2940,
    take_profit_1: 1.3060,
    take_profit_2: 1.3120,
    timeframe: '1h',
    setup_name: 'Discount Zone + Institutional Order Block',
    status: 'TP2_HIT',
    pips_result: 140,
  }
];

export default function Home() {
  const [signals, setSignals] = useState<Signal[]>(DEMO_SIGNALS);
  const [selectedPair, setSelectedPair] = useState<string>('OANDA:XAUUSD');
  const [pairFilter, setPairFilter] = useState<'ALL' | 'GOLD' | 'FOREX'>('ALL');
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [isSendingTest, setIsSendingTest] = useState<boolean>(false);
  const [activeKillzone, setActiveKillzone] = useState<string>('Checking session...');

  // Current ICT Killzone calculation (WIB / GMT+7)
  useEffect(() => {
    const updateKZ = () => {
      const now = new Date();
      // UTC hours
      const utcHours = now.getUTCHours();
      // London KZ: 07:00 - 10:00 UTC (14:00 - 17:00 WIB)
      // NY KZ: 12:00 - 15:00 UTC (19:00 - 22:00 WIB)
      // Asian Session: 00:00 - 06:00 UTC (07:00 - 13:00 WIB)
      if (utcHours >= 7 && utcHours < 10) {
        setActiveKillzone('🇬🇧 London Killzone Active (High Volatility)');
      } else if (utcHours >= 12 && utcHours < 15) {
        setActiveKillzone('🇺🇸 New York Open Killzone Active (Optimal Entry)');
      } else if (utcHours >= 0 && utcHours < 6) {
        setActiveKillzone('🇯🇵 Asian Range / Liquidity Build-up');
      } else {
        setActiveKillzone('🌐 Normal Market Hours (Watch FVG Tap)');
      }
    };
    updateKZ();
    const interval = setInterval(updateKZ, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch signals from Supabase & Listen to Realtime updates
  useEffect(() => {
    async function loadSignals() {
      try {
        const { data, error } = await supabase
          .from('signals')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          console.warn('Supabase not connected yet or empty, using demo signals:', error.message);
          return;
        }

        if (data && data.length > 0) {
          setSignals(data as Signal[]);
          setIsLiveConnected(true);
        } else {
          setIsLiveConnected(true);
        }
      } catch {
        console.warn('Using demo data while waiting for Supabase credentials');
      }
    }

    loadSignals();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('realtime_signals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'signals' },
        (payload) => {
          setIsLiveConnected(true);
          if (payload.eventType === 'INSERT') {
            const newSignal = payload.new as Signal;
            setSignals((prev) => [newSignal, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Signal;
            setSignals((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            );
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsLiveConnected(true);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Filter signals
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      if (pairFilter === 'GOLD') return s.pair.includes('XAU') || s.pair.includes('GOLD');
      if (pairFilter === 'FOREX') return !s.pair.includes('XAU') && !s.pair.includes('GOLD');
      return true;
    });
  }, [signals, pairFilter]);

  const activeSignals = useMemo(
    () => filteredSignals.filter((s) => s.status === 'ACTIVE'),
    [filteredSignals]
  );
  const historySignals = useMemo(
    () => filteredSignals.filter((s) => s.status !== 'ACTIVE'),
    [filteredSignals]
  );

  // Send a test signal into Supabase
  const handleSendTestSignal = async () => {
    setIsSendingTest(true);
    const pairs = ['XAUUSD', 'EURUSD', 'GBPUSD'];
    const randomPair = pairs[Math.floor(Math.random() * pairs.length)];
    const isBuy = Math.random() > 0.5;
    const basePrice = randomPair === 'XAUUSD' ? 2650.00 : 1.0850;
    const offset = (Math.random() * 5).toFixed(2);

    const testSignal = {
      pair: randomPair,
      action: isBuy ? 'BUY' : 'SELL',
      entry_price: Number((basePrice + Number(offset)).toFixed(2)),
      stop_loss: Number((basePrice - 8).toFixed(2)),
      take_profit_1: Number((basePrice + 14).toFixed(2)),
      take_profit_2: Number((basePrice + 25).toFixed(2)),
      timeframe: '15m',
      setup_name: 'Simulasi SMC - London FVG Tap + CHoCH',
      status: 'ACTIVE',
      pips_result: 0
    };

    try {
      const { data, error } = await supabase.from('signals').insert([testSignal]).select();
      if (error) {
        // If Supabase not yet configured with keys, insert into local state for visual check
        setSignals((prev) => [{ ...testSignal, id: Date.now(), created_at: new Date().toISOString() } as Signal, ...prev]);
        alert('Signal uji coba berhasil ditambahkan secara lokal!');
      } else if (data) {
        setSignals((prev) => [data[0] as Signal, ...prev]);
      }
    } catch {
      setSignals((prev) => [{ ...testSignal, id: Date.now(), created_at: new Date().toISOString() } as Signal, ...prev]);
    } finally {
      setIsSendingTest(false);
    }
  };

  const sampleJsonWebhook = `{
  "secret": "smc_secret_token_123",
  "pair": "XAUUSD",
  "action": "BUY",
  "entry": "{{close}}",
  "sl": 2645.00,
  "tp1": 2665.00,
  "tp2": 2680.00,
  "setup": "London Open - Bullish FVG + MSS",
  "timeframe": "15m"
}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(sampleJsonWebhook);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col selection:bg-amber-500/30">
      {/* Top Navbar */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30 px-4 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Zap className="h-5 w-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                  SMC • ICT SIGNALS HUB
                </h1>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  FREE TERMINAL
                </span>
              </div>
              <p className="text-xs text-zinc-400">Institutional Order Flow & Fair Value Gap Alerts</p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            {/* Live Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-zinc-300 font-medium">
                {isLiveConnected ? 'Supabase Live Connected' : 'Demo / Standby'}
              </span>
            </div>

            {/* Test Signal Button */}
            <button
              onClick={handleSendTestSignal}
              disabled={isSendingTest}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition border border-zinc-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isSendingTest ? 'animate-spin' : ''}`} />
              Test Signal
            </button>

            {/* Guide Button */}
            <button
              onClick={() => setShowGuideModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-semibold transition"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Panduan TradingView
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-8 py-6 space-y-6">
        {/* Market Session Banner */}
        <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 text-xs">
          <div className="flex items-center gap-2.5">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="text-zinc-300 font-medium">{activeKillzone}</span>
          </div>
          <div className="text-zinc-400 flex items-center gap-4">
            <span>London KZ: <strong className="text-zinc-200">14:00 - 17:00 WIB</strong></span>
            <span>NY KZ: <strong className="text-zinc-200">19:00 - 22:00 WIB</strong></span>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Win Rate Sistem</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-400">78.5%</span>
              <span className="text-xs text-emerald-500/80 font-medium">SMC/ICT</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Signal Aktif Saat Ini</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">{activeSignals.length}</span>
              <span className="text-xs text-amber-400">Monitoring</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Total Akumulasi Pips</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-400">+1,420</span>
              <span className="text-xs text-zinc-400">Pips</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Minimum R:R Ratio</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-400">1 : 2.5</span>
              <span className="text-xs text-zinc-400">Risk vs Reward</span>
            </div>
          </div>
        </div>

        {/* Chart & Active Signals Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* TradingView Chart Section (8 cols) */}
          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-200">
                  Live TradingView Chart
                </h2>
              </div>

              {/* Pair Switcher */}
              <div className="flex items-center gap-1.5 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
                {[
                  { label: 'Gold (XAUUSD)', val: 'OANDA:XAUUSD' },
                  { label: 'EUR/USD', val: 'FX:EURUSD' },
                  { label: 'GBP/USD', val: 'FX:GBPUSD' },
                  { label: 'USD/JPY', val: 'FX:USDJPY' }
                ].map((item) => (
                  <button
                    key={item.val}
                    onClick={() => setSelectedPair(item.val)}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      selectedPair === item.val
                        ? 'bg-amber-500 text-black shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* TradingView Embedded Advanced Widget */}
            <TradingViewWidget symbol={selectedPair} theme="dark" />
          </div>

          {/* Active Signals Column (4 cols) */}
          <div className="lg:col-span-4 space-y-3 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-emerald-400" />
                <h2 className="text-sm font-semibold tracking-wide uppercase text-zinc-200">
                  Signal Aktif ({activeSignals.length})
                </h2>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 text-[11px] bg-zinc-900 p-0.5 rounded-md border border-zinc-800">
                {(['ALL', 'GOLD', 'FOREX'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setPairFilter(tab)}
                    className={`px-2 py-0.5 rounded font-medium ${
                      pairFilter === tab
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Signal Cards Container */}
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[540px] pr-1">
              {activeSignals.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 text-zinc-400 text-xs">
                  <AlertCircle className="h-8 w-8 mx-auto text-zinc-500 mb-2" />
                  Belum ada signal aktif saat ini. Menunggu setup SMC dari TradingView...
                </div>
              ) : (
                activeSignals.map((signal) => {
                  const isBuy = signal.action === 'BUY';
                  const risk = Math.abs(signal.entry_price - signal.stop_loss);
                  const reward = Math.abs(signal.take_profit_1 - signal.entry_price);
                  const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : '1:2';

                  return (
                    <div
                      key={signal.id}
                      className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 transition relative overflow-hidden shadow-lg"
                    >
                      {/* Top Action & Pair Header */}
                      <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-md text-xs font-bold tracking-wide flex items-center gap-1 ${
                              isBuy
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {isBuy ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {signal.action}
                          </span>
                          <span className="font-bold text-sm text-zinc-100">{signal.pair}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                            {signal.timeframe}
                          </span>
                        </div>

                        <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(signal.created_at).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>

                      {/* Setup Name Tag */}
                      <div className="mb-3">
                        <span className="text-[11px] font-medium text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                          {signal.setup_name}
                        </span>
                      </div>

                      {/* Price Grid */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/60 text-xs mb-2.5">
                        <div>
                          <div className="text-[10px] text-zinc-400 font-medium">ENTRY</div>
                          <div className="font-mono font-bold text-zinc-200 mt-0.5">
                            {signal.entry_price}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-rose-400/90 font-medium">STOP LOSS</div>
                          <div className="font-mono font-bold text-rose-400 mt-0.5">
                            {signal.stop_loss}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-emerald-400/90 font-medium">TP 1</div>
                          <div className="font-mono font-bold text-emerald-400 mt-0.5">
                            {signal.take_profit_1}
                          </div>
                        </div>
                      </div>

                      {/* Bottom Footer Details */}
                      <div className="flex items-center justify-between text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3 text-indigo-400" />
                          Risk Reward: <strong className="text-zinc-200 font-mono">1 : {rrRatio}</strong>
                        </span>
                        {signal.take_profit_2 && (
                          <span>
                            TP2: <strong className="text-emerald-400 font-mono">{signal.take_profit_2}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* History Signals Table */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">
                Riwayat & Catatan Signal
              </h3>
            </div>
            <span className="text-xs text-zinc-400">Transparansi Hasil Perdagangan</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-400 uppercase text-[10px] font-semibold border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Pair</th>
                  <th className="py-3 px-4">Aksi</th>
                  <th className="py-3 px-4">Setup SMC</th>
                  <th className="py-3 px-4">Entry</th>
                  <th className="py-3 px-4">SL / TP</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Hasil (Pips)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {historySignals.map((item) => (
                  <tr key={item.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3 px-4 text-zinc-400 font-mono">
                      {new Date(item.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-3 px-4 font-bold text-zinc-100">{item.pair}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-semibold px-2 py-0.5 rounded text-[10px] ${
                          item.action === 'BUY'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}
                      >
                        {item.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-400">{item.setup_name}</td>
                    <td className="py-3 px-4 font-mono">{item.entry_price}</td>
                    <td className="py-3 px-4 font-mono text-zinc-400">
                      {item.stop_loss} / {item.take_profit_1}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          item.status.includes('TP')
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : item.status.includes('SL')
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-zinc-800 text-zinc-400'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-bold font-mono ${
                        item.pips_result > 0
                          ? 'text-emerald-400'
                          : item.pips_result < 0
                          ? 'text-rose-400'
                          : 'text-zinc-400'
                      }`}
                    >
                      {item.pips_result > 0 ? `+${item.pips_result}` : item.pips_result} pips
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-amber-400" />
                <h3 className="font-bold text-base text-zinc-100">
                  Panduan Menghubungkan TradingView ke Website
                </h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="text-zinc-400 hover:text-zinc-200 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <p>
                <strong>Langkah 1:</strong> Buka chart di TradingView (misal XAUUSD).
              </p>
              <p>
                <strong>Langkah 2:</strong> Buat <strong>Alert</strong> baru di indikator SMC Anda.
              </p>
              <p>
                <strong>Langkah 3:</strong> Pada tab <strong>Notifications</strong>, centang{' '}
                <strong className="text-amber-400">Webhook URL</strong> dan masukkan URL endpoint website Anda:
              </p>
              <div className="p-2.5 rounded bg-zinc-950 font-mono text-[11px] text-amber-400 border border-zinc-800">
                https://domain-website-anda.vercel.app/api/webhook
              </div>
              <p>
                <strong>Langkah 4:</strong> Pada kotak <strong>Message</strong>, tempel format JSON berikut:
              </p>

              <div className="relative">
                <pre className="p-3 rounded-lg bg-zinc-950 text-emerald-400 font-mono text-[11px] overflow-x-auto border border-zinc-800">
                  {sampleJsonWebhook}
                </pre>
                <button
                  onClick={copyToClipboard}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] transition"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? 'Tersalin!' : 'Salin JSON'}
                </button>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-[11px]">
                💡 <strong>Tips:</strong> Token <code>{"{{close}}"}</code> di TradingView akan secara otomatis digantikan dengan harga candle saat alert berbunyi.
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition"
              >
                Mengerti & Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-800/60 py-4 px-4 text-center text-xs text-zinc-500">
        © 2026 SMC ICT Trading Signals • Free Open-Source Architecture • Powered by Next.js & Supabase
      </footer>
    </div>
  );
}
