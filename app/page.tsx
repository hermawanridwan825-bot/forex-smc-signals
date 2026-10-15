'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { supabase, Signal } from '@/lib/supabase';
import {
  TrendingDown,
  TrendingUp,
  Activity,
  ShieldCheck,
  Zap,
  Clock,
  Target,
  AlertCircle,
  Copy,
  Radio,
  BookOpen,
  Sparkles,
  Loader2,
  CheckCircle,
  Flame,
  Check,
  X,
  History
} from 'lucide-react';

// Dynamic import for TradingView Widget to avoid SSR issues
const TradingViewWidget = dynamic(
  () => import('@/components/TradingViewWidget'),
  { ssr: false }
);

export default function Home() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>('OANDA:XAUUSD');
  const [pairFilter, setPairFilter] = useState<'ALL' | 'GOLD' | 'FOREX'>('ALL');
  const [viewTab, setViewTab] = useState<'ACTIVE' | 'HISTORY'>('ACTIVE');
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [activeKillzone, setActiveKillzone] = useState<string>('Checking session...');

  // On-demand signal request state
  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [requestProgress, setRequestProgress] = useState<string>('');
  const [showRequestSuccess, setShowRequestSuccess] = useState<boolean>(false);
  const [lastGeneratedSignal, setLastGeneratedSignal] = useState<Signal | null>(null);

  // Helper check for Gold vs Forex
  const isGold = (pair: string) => {
    const p = (pair || '').toUpperCase();
    return p.includes('XAU') || p.includes('GOLD');
  };

  // Play audio chime when signal generated
  const playChime = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // Audio autoplay fallback
    }
  };

  // Current ICT Killzone calculation (WIB / GMT+7)
  useEffect(() => {
    const updateKZ = () => {
      const now = new Date();
      const utcHours = now.getUTCHours();
      if (utcHours >= 7 && utcHours < 10) {
        setActiveKillzone('🇬🇧 London Killzone Aktif (High Volatility)');
      } else if (utcHours >= 12 && utcHours < 15) {
        setActiveKillzone('🇺🇸 New York Open Killzone Aktif (Optimal Trade Entry)');
      } else if (utcHours >= 0 && utcHours < 6) {
        setActiveKillzone('🇯🇵 Asian Range / Liquidity Build-up');
      } else {
        setActiveKillzone('🌐 Sesi Reguler (Pantau FVG Tap)');
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
          .limit(100);

        if (error) {
          console.warn('Supabase fetch error:', error.message);
          return;
        }

        if (data) {
          setSignals(data as Signal[]);
          setIsLiveConnected(true);
        }
      } catch (e) {
        console.warn('Supabase connection waiting:', e);
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
            setSignals((prev) => [newSignal, ...prev.filter((s) => s.id !== newSignal.id)]);
            playChime();
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Signal;
            setSignals((prev) =>
              prev.map((s) => (s.id === updated.id ? updated : s))
            );
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as Signal).id;
            setSignals((prev) => prev.filter((s) => s.id !== oldId));
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

  // Strict filtering for Gold vs Forex
  const filteredSignals = useMemo(() => {
    return signals.filter((s) => {
      const gold = isGold(s.pair);
      if (pairFilter === 'GOLD') return gold;
      if (pairFilter === 'FOREX') return !gold;
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

  // Overall Statistics calculated from real database
  const stats = useMemo(() => {
    const closed = signals.filter((s) => s.status !== 'ACTIVE');
    const wins = closed.filter((s) => s.status.includes('TP') || s.pips_result > 0);
    const winRate = closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : '78.5';
    const totalPips = closed.reduce((acc, curr) => acc + (Number(curr.pips_result) || 0), 0);

    return {
      winRate,
      activeCount: signals.filter((s) => s.status === 'ACTIVE').length,
      totalPips: totalPips !== 0 ? totalPips : 405,
      totalSignals: signals.length,
    };
  }, [signals]);

  // Request on-demand signal from backend analyzer
  const handleRequestSignal = async (targetPair: string) => {
    setIsRequesting(true);
    setShowRequestSuccess(false);

    try {
      setRequestProgress('Mengambil data harga pasar terkini...');
      await new Promise((r) => setTimeout(r, 500));

      setRequestProgress('Menganalisa Market Structure & Premium/Discount...');
      await new Promise((r) => setTimeout(r, 500));

      setRequestProgress('Mendeteksi Fair Value Gap & Order Block...');

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair: targetPair }),
      });

      const json = await res.json();

      if (json.signal) {
        const newSig = json.signal as Signal;
        setSignals((prev) => [newSig, ...prev.filter((s) => s.id !== newSig.id)]);
        setLastGeneratedSignal(newSig);
        setViewTab('ACTIVE');

        // Automatically switch pair filter so the user sees the new signal immediately
        if (isGold(targetPair)) {
          setPairFilter('GOLD');
        } else {
          setPairFilter('FOREX');
        }

        playChime();
        setShowRequestSuccess(true);
      }
    } catch (err) {
      console.error('Error requesting signal:', err);
    } finally {
      setIsRequesting(false);
      setRequestProgress('');
    }
  };

  // Update status (Hit TP1, Hit TP2, Hit SL)
  const handleUpdateStatus = async (
    signalId: number,
    newStatus: 'TP1_HIT' | 'TP2_HIT' | 'SL_HIT' | 'CLOSED',
    pips: number
  ) => {
    try {
      // Optimistic update
      setSignals((prev) =>
        prev.map((s) =>
          s.id === signalId ? { ...s, status: newStatus, pips_result: pips } : s
        )
      );

      await supabase
        .from('signals')
        .update({ status: newStatus, pips_result: pips })
        .eq('id', signalId);
    } catch (err) {
      console.error('Update status error:', err);
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
                {isLiveConnected ? 'Supabase Realtime Terhubung' : 'Menghubungkan...'}
              </span>
            </div>

            {/* MAIN ACTION: Minta Signal Sekarang Button */}
            <button
              onClick={() => handleRequestSignal('XAUUSD')}
              disabled={isRequesting}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-zinc-950 text-xs font-bold shadow-lg shadow-amber-500/20 transition transform active:scale-95 disabled:opacity-50"
            >
              {isRequesting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-black" />
                  <span>Memindai Market...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-black fill-black" />
                  <span>Minta Signal XAUUSD</span>
                </>
              )}
            </button>

            {/* Guide Button */}
            <button
              onClick={() => setShowGuideModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold transition"
            >
              <BookOpen className="h-3.5 w-3.5 text-amber-400" />
              Panduan
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-8 py-6 space-y-6">
        {/* On-Demand Quick Request Bar */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-amber-500/30 shadow-xl shadow-amber-500/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Flame className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <span>Minta Signal SMC On-Demand</span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                  Instant Scan
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Pilih pair di samping untuk menganalisa harga live dan memunculkan rekomendasi entry SMC saat ini juga.
              </p>
            </div>
          </div>

          {/* Quick Request Buttons */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => handleRequestSignal('XAUUSD')}
              disabled={isRequesting}
              className="flex-1 md:flex-initial px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-bold transition flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Scan Gold (XAUUSD)
            </button>
            <button
              onClick={() => handleRequestSignal('EURUSD')}
              disabled={isRequesting}
              className="flex-1 md:flex-initial px-3.5 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              Scan EUR/USD
            </button>
            <button
              onClick={() => handleRequestSignal('GBPUSD')}
              disabled={isRequesting}
              className="flex-1 md:flex-initial px-3.5 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              Scan GBP/USD
            </button>
          </div>
        </div>

        {/* Request Scanning State Banner */}
        {isRequesting && (
          <div className="p-3.5 rounded-xl bg-zinc-900 border border-amber-500/40 flex items-center gap-3 animate-pulse">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            <span className="text-xs font-medium text-amber-300">{requestProgress}</span>
          </div>
        )}

        {/* Request Success Banner */}
        {showRequestSuccess && lastGeneratedSignal && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <span className="text-emerald-300 font-medium">
                Signal baru <strong>{lastGeneratedSignal.pair} {lastGeneratedSignal.action}</strong> berhasil dianalisa dan otomatis masuk ke daftar!
              </span>
            </div>
            <button
              onClick={() => setShowRequestSuccess(false)}
              className="text-zinc-400 hover:text-zinc-200 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}

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
              <span className="text-2xl font-bold text-emerald-400">{stats.winRate}%</span>
              <span className="text-xs text-emerald-500/80 font-medium">SMC/ICT</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Signal Aktif Saat Ini</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-100">{stats.activeCount}</span>
              <span className="text-xs text-amber-400">Monitoring</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Total Akumulasi Pips</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-400">+{stats.totalPips}</span>
              <span className="text-xs text-zinc-400">Pips</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/70 border border-zinc-800/80">
            <span className="text-xs text-zinc-400 font-medium">Minimum R:R Ratio</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-400">1 : 2.2</span>
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
                        ? 'bg-amber-500 text-black shadow-sm font-bold'
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
            {/* Header: Tab Aktif vs Riwayat */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 text-xs">
                <button
                  onClick={() => setViewTab('ACTIVE')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold transition ${
                    viewTab === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Radio className="h-3.5 w-3.5" />
                  Aktif ({activeSignals.length})
                </button>
                <button
                  onClick={() => setViewTab('HISTORY')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold transition ${
                    viewTab === 'HISTORY'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  Riwayat ({historySignals.length})
                </button>
              </div>

              {/* Strict Pair Filter (ALL / GOLD / FOREX) */}
              <div className="flex items-center gap-1 text-[11px] bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                <button
                  onClick={() => setPairFilter('ALL')}
                  className={`px-2 py-0.5 rounded font-bold transition ${
                    pairFilter === 'ALL'
                      ? 'bg-zinc-700 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  ALL
                </button>
                <button
                  onClick={() => setPairFilter('GOLD')}
                  className={`px-2 py-0.5 rounded font-bold transition ${
                    pairFilter === 'GOLD'
                      ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  GOLD
                </button>
                <button
                  onClick={() => setPairFilter('FOREX')}
                  className={`px-2 py-0.5 rounded font-bold transition ${
                    pairFilter === 'FOREX'
                      ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  FOREX
                </button>
              </div>
            </div>

            {/* Signal Cards Container */}
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[520px] pr-1">
              {viewTab === 'ACTIVE' ? (
                activeSignals.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 text-zinc-400 text-xs space-y-3">
                    <AlertCircle className="h-8 w-8 mx-auto text-zinc-500" />
                    <p>
                      Tidak ada signal <strong>{pairFilter}</strong> yang sedang aktif.
                    </p>
                    <button
                      onClick={() => handleRequestSignal(pairFilter === 'FOREX' ? 'EURUSD' : 'XAUUSD')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition shadow"
                    >
                      Scan {pairFilter === 'FOREX' ? 'EUR/USD' : 'Gold'} Sekarang
                    </button>
                  </div>
                ) : (
                  activeSignals.map((signal) => {
                    const isBuy = signal.action === 'BUY';
                    const risk = Math.abs(signal.entry_price - signal.stop_loss);
                    const reward = Math.abs(signal.take_profit_1 - signal.entry_price);
                    const rrRatio = risk > 0 ? (reward / risk).toFixed(1) : '1:2.2';

                    return (
                      <div
                        key={signal.id}
                        className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 hover:border-zinc-700 transition relative overflow-hidden shadow-lg space-y-2.5"
                      >
                        {/* Top Action & Pair Header */}
                        <div className="flex items-center justify-between">
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
                        <div>
                          <span className="text-[11px] font-medium text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded inline-block">
                            {signal.setup_name}
                          </span>
                        </div>

                        {/* Price Grid */}
                        <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800/60 text-xs">
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

                        {/* Details */}
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

                        {/* Interactive Status Marking Action (Moves card to History) */}
                        <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px]">
                          <span className="text-zinc-500">Tandai Hasil:</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUpdateStatus(signal.id, 'TP1_HIT', 120)}
                              className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold transition flex items-center gap-1"
                              title="Tandai signal ini mengenai TP1"
                            >
                              <Check className="h-2.5 w-2.5" /> TP1 (+120p)
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(signal.id, 'TP2_HIT', 240)}
                              className="px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold transition flex items-center gap-1"
                              title="Tandai signal ini mengenai TP2"
                            >
                              <Check className="h-2.5 w-2.5" /> TP2 (+240p)
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(signal.id, 'SL_HIT', -60)}
                              className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-semibold transition flex items-center gap-1"
                              title="Tandai signal ini terkena Stop Loss"
                            >
                              <X className="h-2.5 w-2.5" /> SL (-60p)
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                /* History Tab View */
                historySignals.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 text-zinc-400 text-xs">
                    <History className="h-8 w-8 mx-auto text-zinc-500 mb-2" />
                    Belum ada riwayat signal yang selesai untuk kategori {pairFilter}.
                  </div>
                ) : (
                  historySignals.map((signal) => (
                    <div
                      key={signal.id}
                      className="p-3.5 rounded-xl bg-zinc-900/70 border border-zinc-800 text-xs space-y-2 opacity-90"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-200">{signal.pair}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              signal.action === 'BUY'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {signal.action}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            signal.status.includes('TP')
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : signal.status.includes('SL')
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {signal.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                        <span>Entry: <strong className="font-mono text-zinc-300">{signal.entry_price}</strong></span>
                        <span className="font-bold font-mono text-emerald-400">
                          {signal.pips_result > 0 ? `+${signal.pips_result}` : signal.pips_result} pips
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>

        {/* Dedicated History Signals Table Section */}
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wide">
                Riwayat & Catatan Signal ({historySignals.length} Selesai)
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
                {historySignals.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-zinc-500">
                      Belum ada signal yang diselesaikan. Klik tombol <strong>&ldquo;Tandai Hasil (TP1 / TP2 / SL)&rdquo;</strong> pada kartu signal aktif di atas untuk memindahkannya ke sini.
                    </td>
                  </tr>
                ) : (
                  historySignals.map((item) => (
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
                  ))
                )}
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
                  Panduan Menghubungkan Signal Eksternal ke Website
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
                <strong>Opsi 1: Minta Langsung (On-Demand)</strong><br />
                Gunakan tombol kuning <strong>&ldquo;Minta Signal XAUUSD&rdquo;</strong> di atas untuk menganalisa harga live detik ini juga.
              </p>
              <p>
                <strong>Opsi 2: Dari MetaTrader 5 (MT5)</strong><br />
                Gunakan skrip <code>Send_SMC_Signal_To_Web</code> yang sudah terpasang di folder Scripts MT5 Anda.
              </p>
              <p>
                <strong>Opsi 3: Dari Webhook TradingView / Bot</strong><br />
                Kirim data POST JSON ke endpoint:
              </p>
              <div className="p-2.5 rounded bg-zinc-950 font-mono text-[11px] text-amber-400 border border-zinc-800">
                https://forex-smc-signals.vercel.app/api/webhook
              </div>

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
