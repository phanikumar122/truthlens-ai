"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, Download, Search, Command, ArrowUpRight, X,
  Sun, Moon, ShieldCheck, AlertTriangle, Gauge,
} from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface Result {
  text: string;
  label: string;
  confidence: number;
  explanation: string;
  source: string;
  timestamp: string;
  virality_score: number;
}

type RiskLevel = "high" | "mod" | "low";
type Theme = "dark" | "light";

/* ── Constants ─────────────────────────────────────────────────────────────── */
const REST_URL = "/api/results";                                   // proxied → local backend
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

const CATEGORIES: Record<string, string[]> = {
  Economy: ["economy", "market", "stock", "inflation", "bank", "finance", "trade", "price", "cost", "wage"],
  Tech: ["tech", "apple", "google", "ai", "software", "cyber", "digital", "data", "crypto"],
  Health: ["health", "covid", "vaccine", "disease", "medical", "doctor", "hospital", "virus", "cancer", "diet"],
  Geopolitics: ["war", "election", "president", "policy", "border", "russia", "china", "geopolitics", "nato", "vote"],
};

const getCategory = (text: string) => {
  const lowerText = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some(kw => lowerText.includes(kw))) {
      return category;
    }
  }
  return null;
};

const riskOf = (label: string): RiskLevel =>
  label === "HIGH RISK" ? "high" : label === "MODERATE" ? "mod" : "low";

const RISK_COLOR: Record<RiskLevel, string> = {
  high: "var(--color-risk-high)",
  mod: "var(--color-risk-mod)",
  low: "var(--color-risk-low)",
};

const RISK_CHIP: Record<RiskLevel, string> = {
  high: "risk-chip risk-chip-high",
  mod: "risk-chip risk-chip-mod",
  low: "risk-chip risk-chip-low",
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};

/* ── Motion ────────────────────────────────────────────────────────────────── */
const listVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

/* ── Component ─────────────────────────────────────────────────────────────── */
export default function TruthLensDashboard() {
  const [results, setResults] = useState<Result[]>([]);
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<"Connecting" | "Live" | "Reconnecting" | "Polling">("Connecting");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");

  const wsRef = useRef<WebSocket | null>(null);
  const connectWsRef = useRef<() => void>(() => {});
  const bufferRef = useRef<Result[]>([]);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLive = status === "Live";

  /* ── Theme: hydrate from <html data-theme> (set by no-flash script) ────── */
  useEffect(() => {
    const current = (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
    setTheme(current);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("tl-theme", next); } catch { /* noop */ }
      return next;
    });
  }, []);

  /* ── Keyboard shortcuts ───────────────────────────────────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCmdOpen(prev => !prev);
      }
      if (e.key === "Escape") {
        setIsCmdOpen(false);
        setIsSheetOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* ── Merge new items into results (dedup by text) ─────────────────────── */
  const mergeResults = useCallback((incoming: Result[]) => {
    if (!incoming.length) return;
    setResults(prev => {
      const existing = new Set(prev.map(p => p.text));
      const fresh = incoming.filter(d => !existing.has(d.text));
      if (!fresh.length) return prev;
      setLastSync(Date.now());
      return [...fresh.reverse(), ...prev].slice(0, 50);
    });
  }, []);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(REST_URL);
      if (!res.ok) return;
      const data: Result[] = await res.json();
      if (Array.isArray(data)) {
        mergeResults(data);
        setSelectedResult(cur => cur ?? (data.length ? data[0] : null));
      }
    } catch { /* swallowed; polling/WS will retry */ }
  }, [mergeResults]);

  /* Initial REST load */
  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  /* ── Polling: fallback ONLY when WS is down ───────────────────────────── */
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    setStatus("Polling");
    pollingRef.current = setInterval(fetchResults, 10_000);
  }, [fetchResults]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  /* ── WebSocket: primary transport ─────────────────────────────────────── */
  const connectWs = useCallback(() => {
    try {
      const socket = new WebSocket(WS_URL);
      wsRef.current = socket;

      socket.onopen = () => {
        setStatus("Live");
        stopPolling();
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "ping") {
            setStatus("Live");
            setLastSync(Date.now());
            return;
          }
          if (msg.type === "data" || !msg.type) {
            const item: Result = msg;
            bufferRef.current.push(item);
            if (!throttleRef.current) {
              throttleRef.current = setTimeout(() => {
                const incoming = [...bufferRef.current];
                bufferRef.current = [];
                throttleRef.current = null;
                mergeResults(incoming);
              }, 300);
            }
          }
        } catch (err) {
          console.error("Failed to parse WS message:", err);
        }
      };

      socket.onclose = () => {
        setStatus("Reconnecting");
        startPolling();
        setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.CLOSED) {
            connectWsRef.current();
          }
        }, 3000);
      };

      socket.onerror = () => socket.close();
    } catch {
      startPolling();
    }
  }, [mergeResults, startPolling, stopPolling]);

  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  useEffect(() => {
    connectWs();
    return () => {
      wsRef.current?.close();
      stopPolling();
    };
  }, [connectWs, stopPolling]);

  /* ── Derived (memoized) ───────────────────────────────────────────────── */
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    results.forEach(r => {
      const c = getCategory(r.text);
      const key = c ?? "Uncategorized";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [results]);

  const filteredResults = useMemo(
    () => (activeTag ? results.filter(res => getCategory(res.text) === activeTag) : results),
    [results, activeTag],
  );

  const stats = useMemo(() => {
    const total = results.length || 1;
    const high = results.filter(r => riskOf(r.label) === "high").length;
    const avgConf = results.reduce((s, r) => s + r.confidence, 0) / total;
    return {
      total: results.length,
      highPct: Math.round((high / total) * 100),
      highCount: high,
      avgConf: Math.round(avgConf),
    };
  }, [results]);

  const distribution = useMemo(() => {
    const counts = { high: 0, mod: 0, low: 0 } as Record<RiskLevel, number>;
    filteredResults.forEach(r => { counts[riskOf(r.label)]++; });
    const total = filteredResults.length || 1;
    return {
      counts,
      total: filteredResults.length,
      percents: {
        high: (counts.high / total) * 100,
        mod: (counts.mod / total) * 100,
        low: (counts.low / total) * 100,
      } as Record<RiskLevel, number>,
    };
  }, [filteredResults]);

  /* Confidence trend (sparkline): last 16 by time, oldest→newest */
  const confidenceTrend = useMemo(() => {
    return [...results]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-16)
      .map(r => r.confidence);
  }, [results]);

  /* ── Actions ──────────────────────────────────────────────────────────── */
  const openDetail = (r: Result) => {
    setSelectedResult(r);
    setIsSheetOpen(true);
  };

  const handleExport = () => {
    if (results.length === 0) return;
    const headers = ["Source", "Label", "Confidence (%)", "News", "Virality Score", "Explanation", "Timestamp"];
    const rows = results.map(res => {
      const text = res.text.replace(/"/g, '""');
      const explanation = res.explanation.replace(/"/g, '""');
      return `"${res.source}","${res.label}","${res.confidence}","${text}","${res.virality_score}","${explanation}","${res.timestamp}"`;
    });
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `truthlens_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const relTime = (ms: number | null) => {
    if (!ms) return "—";
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 5) return "just now";
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    return `${m}m ago`;
  };

  const statusLabel =
    status === "Live" ? "Live" :
    status === "Polling" ? "Polling" :
    status === "Reconnecting" ? "Reconnecting" : "Connecting";

  const kpiCards = [
    {
      label: "verified", value: stats.total, suffix: "", accent: "var(--color-signal)",
      sub: `${categoryCounts.Tech || 0} tech · ${categoryCounts.Health || 0} health`,
      icon: ShieldCheck, trend: confidenceTrend,
    },
    {
      label: "high-risk", value: stats.highPct, suffix: "%", accent: "var(--color-risk-high)",
      sub: `${stats.highCount} flagged`, icon: AlertTriangle, trend: undefined,
    },
    {
      label: "avg confidence", value: stats.avgConf, suffix: "%", accent: "var(--color-text)",
      sub: `${results.length} samples`, icon: Gauge, trend: undefined,
    },
  ];

  const cmdActions = [
    { icon: Download, label: "Export claims to CSV", action: () => { handleExport(); setIsCmdOpen(false); } },
    { icon: Activity, label: "Show full feed", action: () => { setActiveTag(null); setIsCmdOpen(false); } },
    { icon: Search, label: "Filter by Tech", action: () => { setActiveTag("Tech"); setIsCmdOpen(false); } },
    { icon: Search, label: "Filter by Health", action: () => { setActiveTag("Health"); setIsCmdOpen(false); } },
    { icon: Search, label: "Filter by Economy", action: () => { setActiveTag("Economy"); setIsCmdOpen(false); } },
    { icon: Search, label: "Filter by Geopolitics", action: () => { setActiveTag("Geopolitics"); setIsCmdOpen(false); } },
  ];

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8">

          <div className="flex items-center justify-between h-14 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-md border border-line-bright bg-panel flex items-center justify-center shrink-0">
                <span className="w-2.5 h-2.5 rounded-sm bg-signal" />
              </div>
              <span className="font-semibold tracking-tight text-text text-[15px]">truthlens</span>
              <span className="hidden sm:inline eyebrow border-l border-line pl-2.5 ml-0.5">verification desk</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-2.5 h-8 rounded-md border border-line bg-panel">
                <span className={`status-led ${isLive ? "status-led-live animate-pulse" : "status-led-down"}`} />
                <span className="mono text-[11px] font-medium text-dim">{statusLabel}</span>
              </div>

              <ThemeToggle theme={theme} onToggle={toggleTheme} />

              <button
                onClick={handleExport}
                disabled={results.length === 0}
                className="btn h-8 px-2.5 sm:px-3 flex items-center gap-1.5 text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                aria-label="Export results as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline text-[12px] font-medium">Export</span>
              </button>

              <button
                onClick={() => setIsCmdOpen(true)}
                className="btn h-8 px-2.5 flex items-center gap-1.5 text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                aria-label="Open command menu"
              >
                <Command className="w-3.5 h-3.5" />
                <span className="hidden md:flex items-center gap-0.5">
                  <kbd className="mono text-[10px] text-faint">⌘K</kbd>
                </span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide -mb-px h-11">
            {["Feed", "Economy", "Tech", "Health", "Geopolitics"].map((tag) => {
              const isFeed = tag === "Feed";
              const isActive = isFeed ? activeTag === null : activeTag === tag;
              const count = isFeed ? results.length : (categoryCounts[tag] || 0);
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTag(isFeed ? null : tag)}
                  className={`shrink-0 h-9 px-3 flex items-center gap-2 border-b-2 transition-colors text-[12px] font-medium focus-visible:outline-none ${
                    isActive ? "border-signal text-text" : "border-transparent text-dim hover:text-text"
                  }`}
                >
                  {tag}
                  <span className="mono text-[10px] text-faint">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── KPI hero band ──────────────────────────────────────────────────── */}
      <div className="border-b border-line bg-ink">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {kpiCards.map((s) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className="panel px-3 py-2.5 sm:px-4 sm:py-3 relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="eyebrow truncate">{s.label}</span>
                    <Icon className="w-3 h-3 text-faint shrink-0" />
                  </div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="mono text-xl sm:text-3xl font-semibold tracking-tight" style={{ color: s.accent }}>
                      {s.value}
                    </span>
                    {s.suffix && <span className="mono text-sm sm:text-base text-faint">{s.suffix}</span>}
                  </div>
                  {s.sub && <div className="mono text-[10px] text-faint mt-0.5 hidden sm:block truncate">{s.sub}</div>}
                  {s.trend && s.trend.length > 1 && (
                    <div className="absolute bottom-0 right-0 opacity-50">
                      <Sparkline values={s.trend} color={s.accent} />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Status strip ───────────────────────────────────────────────────── */}
      <div className="border-b border-line bg-ink">
        <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between text-[11px]">
          <div className="flex items-center divide-x divide-line">
            <span className="pr-3 mono text-faint">items <span className="text-dim">{filteredResults.length}</span></span>
            <span className="px-3 mono text-faint hidden sm:block">last sync <span className="text-dim">{relTime(lastSync)}</span></span>
            <span className="px-3 mono text-faint hidden md:block">feed <span className="text-dim">{activeTag ?? "all"}</span></span>
          </div>
          <span className="mono text-faint hidden sm:block">classification · confidence · virality</span>
        </div>
      </div>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 lg:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

          {/* ── Wire feed ──────────────────────────────────────────────────── */}
          <section className="lg:col-span-5 xl:col-span-4 flex flex-col min-w-0">
            <div className="flex items-center justify-between mb-3 px-0.5">
              <h2 className="eyebrow flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-signal" />
                incoming wire
              </h2>
              <span className="mono text-[10px] text-faint">{filteredResults.length} claims</span>
            </div>

            <div className="panel flex-1 overflow-y-auto max-h-[55vh] lg:max-h-[calc(100vh-340px)]">
              <AnimatePresence mode="popLayout">
                {results.length === 0 ? (
                  <div className="p-3">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="h-[58px] border-b border-line animate-pulse" />
                    ))}
                  </div>
                ) : filteredResults.length === 0 ? (
                  <div className="p-10 flex flex-col items-center justify-center gap-3 text-center">
                    <Search className="w-5 h-5 text-faint" />
                    <p className="text-[12px] text-dim">No claims in <span className="text-text">{activeTag}</span> yet.</p>
                  </div>
                ) : (
                  <motion.ul variants={listVariants} initial="hidden" animate="show">
                    {filteredResults.map((res, i) => {
                      const risk = riskOf(res.label);
                      const isSelected = selectedResult === res;
                      const cat = getCategory(res.text);
                      return (
                        <motion.li key={`${res.timestamp}-${i}`} variants={rowVariants} exit="exit" layout>
                          <button
                            onClick={() => openDetail(res)}
                            onMouseEnter={() => setSelectedResult(res)}
                            className={`w-full text-left px-3.5 py-3 border-b border-line transition-colors flex flex-col gap-1.5 focus-visible:outline-none focus-visible:bg-panel-2 ${
                              isSelected ? "panel-hover-selected" : "hover:bg-panel-2"
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="risk-dot" style={{ background: RISK_COLOR[risk] }} />
                              <span className="mono text-[10px] text-faint">{fmtTime(res.timestamp)}</span>
                              <span className="mono text-[10px] text-dim truncate flex-1">{res.source}</span>
                              {cat && <span className="mono text-[9px] text-faint uppercase tracking-wide hidden sm:inline">{cat}</span>}
                              <span className="mono text-[11px] font-semibold" style={{ color: RISK_COLOR[risk] }}>{res.confidence}%</span>
                            </div>
                            <p className="text-[12.5px] leading-snug text-dim line-clamp-1 pl-[18px]">{res.text}</p>
                          </button>
                        </motion.li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* ── Detail (desktop + tablet) ─────────────────────────────────── */}
          <section className="hidden lg:flex lg:col-span-7 xl:col-span-8 flex-col gap-5 min-w-0">
            <DetailPanel result={selectedResult} />
            <DistributionPanel distribution={distribution} />
          </section>
        </div>
      </main>

      {/* ── Mobile bottom-sheet ────────────────────────────────────────────── */}
      <AnimatePresence>
        {isSheetOpen && selectedResult && (
          <div className="lg:hidden fixed inset-0 z-[80] flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 overlay-bg" onClick={() => setIsSheetOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="relative bg-panel border-t border-line-bright rounded-t-2xl max-h-[88vh] flex flex-col"
              role="dialog" aria-modal="true"
            >
              <div className="flex flex-col items-center pt-2.5 pb-1 shrink-0">
                <div className="w-9 h-1 rounded-full bg-line-bright" />
              </div>
              <button
                onClick={() => setIsSheetOpen(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-md flex items-center justify-center text-faint hover:text-text hover:bg-panel-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="overflow-y-auto px-4 pb-10 pt-2">
                <DetailPanel result={selectedResult} mobile />
                <DistributionPanel distribution={distribution} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Command palette ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isCmdOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] px-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 overlay-bg" onClick={() => setIsCmdOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-xl panel overflow-hidden"
            >
              <div className="flex items-center px-4 h-12 border-b border-line">
                <Search className="w-4 h-4 text-faint mr-3" />
                <input
                  autoFocus type="text" placeholder="Type a command or search…"
                  className="flex-1 bg-transparent text-text outline-none placeholder:text-faint text-[13px]"
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                />
                <kbd className="mono text-[10px] text-faint border border-line rounded px-1.5 py-0.5">ESC</kbd>
              </div>
              <div className="max-h-[340px] overflow-y-auto p-2">
                <div className="px-2.5 pt-2 pb-1 eyebrow">actions</div>
                {cmdActions
                  .filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((item, idx) => (
                    <button
                      key={idx} onClick={item.action}
                      className="w-full flex items-center px-2.5 py-2.5 rounded-md text-left hover:bg-panel-2 transition-colors group focus-visible:outline-none focus-visible:bg-panel-2"
                    >
                      <item.icon className="w-4 h-4 text-faint group-hover:text-dim mr-3" />
                      <span className="text-[13px] text-dim group-hover:text-text">{item.label}</span>
                    </button>
                  ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Theme toggle ──────────────────────────────────────────────────────────── */
function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="btn h-8 w-8 flex items-center justify-center text-dim hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {theme === "dark" ? (
          <motion.span key="sun" initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 90 }} transition={{ duration: 0.2 }}>
            <Sun className="w-4 h-4" />
          </motion.span>
        ) : (
          <motion.span key="moon" initial={{ opacity: 0, rotate: 90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -90 }} transition={{ duration: 0.2 }}>
            <Moon className="w-4 h-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

/* ── Sparkline ─────────────────────────────────────────────────────────────── */
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 64, h = 22, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/* ── Detail panel (desktop inline + mobile sheet) ──────────────────────────── */
function DetailPanel({ result, mobile = false }: { result: Result | null; mobile?: boolean }) {
  if (!result) {
    return (
      <div className="panel p-12 flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Search className="w-6 h-6 text-faint" />
          <p className="text-[12px] text-dim">Select a claim from the wire to inspect.</p>
        </div>
      </div>
    );
  }

  const risk = riskOf(result.label);

  return (
    <motion.article
      key={result.text}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className={`panel ${mobile ? "" : "flex-1"} p-5 sm:p-7`}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="eyebrow mb-1.5">claim</div>
          <h1 className="text-[15px] sm:text-base font-semibold text-text tracking-tight mono truncate">{result.source}</h1>
        </div>
        <span className={RISK_CHIP[risk]}>{result.label}</span>
      </div>

      <blockquote className="border-l-2 border-signal pl-4 py-1 mb-6">
        <p className={`leading-relaxed text-text font-medium ${mobile ? "text-[15px]" : "text-[15px] sm:text-[17px]"}`}>{result.text}</p>
      </blockquote>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="border border-line rounded-lg p-3.5">
          <div className="eyebrow mb-1.5">confidence</div>
          <div className="flex items-baseline gap-1">
            <span className="mono text-2xl sm:text-3xl font-semibold text-text tracking-tight"><Counter value={result.confidence} /></span>
            <span className="mono text-sm text-faint">%</span>
          </div>
          <div className="bar-track h-1 mt-2.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${result.confidence}%` }}
              transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              className="h-full rounded-full" style={{ background: RISK_COLOR[risk] }}
            />
          </div>
        </div>

        <div className="border border-line rounded-lg p-3.5">
          <div className="eyebrow mb-1.5">virality</div>
          <div className="flex items-baseline gap-1">
            <span className="mono text-2xl sm:text-3xl font-semibold text-text tracking-tight">{result.virality_score}</span>
            <span className="mono text-sm text-faint">/10</span>
          </div>
          <div className="bar-track h-1 mt-2.5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${Math.min(result.virality_score * 10, 100)}%` }}
              transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              className="h-full rounded-full bg-signal"
            />
          </div>
        </div>
      </div>

      <div className="mb-5">
        <div className="eyebrow mb-2">rationale</div>
        <p className="text-[13.5px] leading-relaxed text-dim">{result.explanation}</p>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-line">
        <span className="mono text-[11px] text-faint">logged {fmtTime(result.timestamp)}</span>
        <span className="mono text-[11px] text-dim flex items-center gap-1">
          src {result.source} <ArrowUpRight className="w-3 h-3 text-faint" />
        </span>
      </div>
    </motion.article>
  );
}

/* ── Distribution panel ────────────────────────────────────────────────────── */
function DistributionPanel({ distribution }: { distribution: { counts: Record<RiskLevel, number>; total: number; percents: Record<RiskLevel, number> } }) {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="eyebrow flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-signal" />
          risk distribution
        </h3>
        <span className="mono text-[10px] text-faint">{distribution.total} claims</span>
      </div>

      <div className="flex h-2 rounded-full overflow-hidden bar-track">
        {(["high", "mod", "low"] as RiskLevel[]).map(level => (
          distribution.counts[level] > 0 && (
            <motion.div
              key={level}
              initial={{ width: 0 }} animate={{ width: `${distribution.percents[level]}%` }}
              transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
              style={{ background: RISK_COLOR[level] }}
            />
          )
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3.5">
        {([
          { level: "high" as RiskLevel, label: "high risk" },
          { level: "mod" as RiskLevel, label: "moderate" },
          { level: "low" as RiskLevel, label: "low risk" },
        ]).map(({ level, label }) => (
          <div key={level} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="risk-dot" style={{ background: RISK_COLOR[level] }} />
              <span className="text-[11px] text-dim">{label}</span>
            </div>
            <span className="mono text-[15px] font-semibold text-text">{distribution.counts[level]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Animated number ───────────────────────────────────────────────────────── */
function Counter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const start = displayValue;
    const end = value;
    if (start === end) return;

    const duration = 700;
    const startTime = performance.now();
    const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setDisplayValue(Number((start + (end - start) * easeOutQuart(progress)).toFixed(1)));
      if (progress < 1) requestAnimationFrame(animate);
      else setDisplayValue(value);
    };

    requestAnimationFrame(animate);
  }, [value, displayValue]);

  return <>{displayValue}</>;
}
