"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Download, BarChart3, Database, Search, ShieldAlert, CheckCircle2, AlertTriangle, ShieldCheck, Terminal, Command } from "lucide-react";

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

/* ── Constants ─────────────────────────────────────────────────────────────── */
const API_BASE = "https://cybersoul18-truthlens-backend.hf.space";
const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";

const CATEGORIES: Record<string, string[]> = {
  Economy: ["economy", "market", "stock", "inflation", "bank", "finance", "trade", "price", "cost", "wage"],
  Tech: ["tech", "apple", "google", "ai", "software", "cyber", "digital", "data", "crypto"],
  Health: ["health", "covid", "vaccine", "disease", "medical", "doctor", "hospital", "virus", "cancer", "diet"],
  Geopolitics: ["war", "election", "president", "policy", "border", "russia", "china", "geopolitics", "nato", "vote"]
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

/* ── Motion Variants ──────────────────────────────────────────────────────── */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
};

/* ── Component ─────────────────────────────────────────────────────────────── */
export default function TruthLensDashboard() {
  const [results, setResults] = useState<Result[]>([]);
  const [selectedResult, setSelectedResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("Connecting…");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [isCmdOpen, setIsCmdOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const connectWsRef = useRef<() => void>(() => {});
  
  // Data buffer to prevent rapid layout thrashing (stuck effect)
  const bufferRef = useRef<Result[]>([]);

  /* Cmd+K listener */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCmdOpen(prev => !prev);
      }
      if (e.key === "Escape") {
        setIsCmdOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Fetch historical results on mount */
  useEffect(() => {
    fetch(`${API_BASE}/results`)
      .then((r) => r.json())
      .then((data: Result[]) => {
        setResults(data);
        if (data.length > 0) setSelectedResult(data[0]);
      })
      .catch(() => {});
  }, []);

  const [nextRefresh, setNextRefresh] = useState(25);

  /* Countdown for next update */
  useEffect(() => {
    const timer = setInterval(() => {
      setNextRefresh((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /* Safety Polling (Backup if WS fails) */
  useEffect(() => {
    const fetchResults = () => {
      fetch(`${API_BASE}/results`)
        .then(res => res.json())
        .then((data: Result[]) => {
          if (data && Array.isArray(data)) {
            setResults(prev => {
              // Only add items we don't already have
              const existingTexts = new Set(prev.map(p => p.text));
              const newItems = data.filter(d => !existingTexts.has(d.text));
              if (newItems.length === 0) return prev;
              return [...newItems, ...prev].slice(0, 50);
            });
            if (data.length > 0 && !selectedResult) setSelectedResult(data[0]);
          }
        })
        .catch(() => {});
    };

    const interval = setInterval(fetchResults, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [selectedResult]);



  /* WebSocket with auto-reconnect */
  const connectWs = useCallback(() => {
    const socket = new WebSocket(WS_URL);
    wsRef.current = socket;

    socket.onopen = () => setStatus("Live");

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        if (msg.type === "ping") {
          setStatus("Live");
          setNextRefresh(25);
          return;
        }

        if (msg.type === "data" || !msg.type) {
          const item: Result = msg;
          bufferRef.current.push(item);

          if (!throttleRef.current) {
            throttleRef.current = setTimeout(() => {
              const currentIncoming = [...bufferRef.current];
              bufferRef.current = [];
              throttleRef.current = null;

              setResults((prev) => {
                const newItems = currentIncoming.filter(b => !prev.some(p => p.text === b.text));
                if (newItems.length === 0) return prev;
                return [...newItems.reverse(), ...prev].slice(0, 50);
              });
            }, 300);
          }
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    socket.onclose = () => {
      setStatus("Reconnecting…");
      setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          connectWsRef.current();
        }
      }, 3000);
    };

    socket.onerror = () => socket.close();
  }, []);

  useEffect(() => {
    connectWsRef.current = connectWs;
  }, [connectWs]);

  useEffect(() => {
    connectWs();
    return () => wsRef.current?.close();
  }, [connectWs]);

  // Helper values
  const isLive = status === "Live";
  const filteredResults = activeTag 
    ? results.filter(res => getCategory(res.text) === activeTag)
    : results;

  const handleExport = () => {
    if (results.length === 0) return;
    
    // CSV configuration
    const headers = ["Source", "Label", "Confidence (%)", "News", "Virality Score", "Explanation", "Timestamp"];
    
    const rows = results.map(res => {
      const text = res.text.replace(/"/g, '""');
      const explanation = res.explanation.replace(/"/g, '""');
      return `"${res.source}","${res.label}","${res.confidence}","${text}","${res.virality_score}","${explanation}","${res.timestamp}"`;
    });
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `truthlens_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ── Render ──────────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen font-sans selection:bg-indigo-500/30 overflow-x-hidden relative flex flex-col items-center">
      
      {/* Subtle ambient light layer */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-[1500px] px-4 md:px-8 py-8 relative z-10 flex flex-col h-screen">
        
        {/* ── Navbar ─────────────────────────────────────────────────────────── */}
        <motion.nav 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-wrap justify-between items-center mb-8 skeuo-card rounded-2xl px-6 py-4 w-full sticky top-4 z-50 transition-all border-t-white/10"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.4)]">
              <ShieldCheck className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                TruthLens <span className="text-gradient-primary">AI</span>
              </h1>
              <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Global Intelligence</p>
            </div>
          </div>

          <div className="flex items-center gap-6 mt-4 md:mt-0">
            
            <button 
              onClick={() => setIsCmdOpen(true)}
              className="hidden lg:flex items-center gap-2 px-3 py-1.5 skuo-button rounded-xl transition-all text-sm text-gray-400 group focus:outline-none skeuo-button"
            >
              <Command className="w-4 h-4 group-hover:text-indigo-400 transition-colors" />
              <span className="text-engraved">Menu</span>
              <div className="flex items-center gap-0.5 ml-2">
                <span className="px-1.5 py-0.5 rounded skeuo-inset text-[10px] font-mono border border-white/5 group-hover:border-indigo-500/30 transition-colors">⌘</span>
                <span className="px-1.5 py-0.5 rounded skeuo-inset text-[10px] font-mono border border-white/5 group-hover:border-indigo-500/30 transition-colors">K</span>
              </div>
            </button>

            <div className="h-8 w-px bg-white/10 hidden lg:block" />

            <div className="hidden lg:flex p-1 skeuo-inset border border-white/5 rounded-xl relative">
              {["Feed", "Economy", "Tech", "Health", "Geopolitics"].map((tag) => {
                const isFeed = tag === "Feed";
                const isActive = isFeed ? activeTag === null : activeTag === tag;
                
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(isFeed ? null : tag)}
                    className={`relative text-sm font-medium transition-all cursor-pointer px-4 py-1.5 rounded-lg z-10 outline-none focus:outline-none ${
                      isActive ? "text-white skeuo-button scale-105" : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>

            <div className="h-8 w-px bg-white/10 hidden md:block" />

            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg skeuo-inset border ${isLive ? 'border-green-500/20' : 'border-red-500/20'}`}>
                <div className={`skeuo-led ${isLive ? 'bg-green-500 text-green-500 animate-[pulse_1s_ease-in-out_infinite]' : 'bg-red-500 text-red-500'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isLive ? 'text-green-400' : 'text-red-400'}`}>{status}</span>
              </div>

              <button 
                onClick={handleExport}
                disabled={results.length === 0}
                className="px-4 py-2 skeuo-button hover:bg-[#1F2937] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all focus:outline-none group"
              >
                <Download className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                <span className="text-gray-200 group-hover:text-white transition-colors">Export</span>
              </button>
            </div>
          </div>
        </motion.nav>

        {/* ── Main Layout ──────────────────────────────────────────────────────── */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
          
          {/* Left Column — Live Feed */}
          <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-5 min-h-0">
            <div className="flex justify-between items-end px-2">
              <h2 className="text-sm font-bold text-gray-300 tracking-wide uppercase flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" /> Live Stream
              </h2>
              <span className="text-xs text-indigo-400 font-mono font-medium bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
                Sync {nextRefresh}s
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-3 scrollbar-thin pb-4">
              <AnimatePresence mode="popLayout">
                {results.length === 0 ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={`skel-${i}`} className="p-6 saas-card animate-pulse flex flex-col gap-4">
                      <div className="flex justify-between"><div className="h-3 w-16 bg-[#1F2937] rounded"></div><div className="h-4 w-20 bg-[#1F2937] rounded"></div></div>
                      <div className="space-y-2">
                        <div className="h-4 w-full bg-[#1F2937] rounded"></div>
                        <div className="h-4 w-2/3 bg-[#1F2937] rounded"></div>
                      </div>
                    </div>
                  ))
                ) : filteredResults.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-8 skeuo-card text-center text-gray-500 text-sm flex flex-col items-center justify-center gap-3 border-dashed border-gray-700 skeuo-inset"
                  >
                    <Search className="w-6 h-6 text-gray-600" />
                    No internal activity matching &quot;{activeTag}&quot;
                  </motion.div>
                ) : (
                  <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
                    {filteredResults.map((res, i) => {
                      const isSelected = selectedResult === res;
                      const isHigh = res.label === "HIGH RISK";
                      const isMod = res.label === "MODERATE";
                      
                      const indicatorColor = isHigh ? "bg-red-500" : isMod ? "bg-amber-500" : "bg-green-500";
                      const textClass = isHigh ? "text-red-400" : isMod ? "text-amber-400" : "text-green-400";
                      const bgClass = isHigh ? "bg-red-500/10 border-red-500/20" : isMod ? "bg-amber-500/10 border-amber-500/20" : "bg-green-500/10 border-green-500/20";

                      return (
                        <motion.div
                          key={`${res.timestamp}-${i}`}
                          variants={itemVariants}
                          layout
                          onClick={() => setSelectedResult(res)}
                          className={`p-5 skeuo-card skeuo-card-hover cursor-pointer group relative overflow-hidden ${
                            isSelected 
                              ? "border-indigo-500/50 bg-gradient-to-br from-[#2a303a] to-[#1a1d23]"
                              : ""
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-indigo-500 shadow-[0_0_15px_#6366F1]" />
                          )}
                          <div className="flex justify-between items-start mb-4">
                            <span className="text-[10px] text-gray-500 font-bold uppercase flex items-center gap-1.5 tracking-widest text-engraved">
                              <Database className="w-3 h-3" /> {res.source}
                            </span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-tighter border shadow-sm ${bgClass} ${textClass}`}>
                              {res.label}
                            </span>
                          </div>

                          <p className={`text-sm leading-relaxed mb-5 line-clamp-2 font-medium ${isSelected ? "text-white text-embossed" : "text-gray-400"}`}>
                            {res.text}
                          </p>

                          <div className="skeuo-progress-track">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${res.confidence}%` }}
                              transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                              className={`skeuo-progress-fill ${indicatorColor}`}
                            />
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Column — Detailed Analysis & Charts */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-6 min-h-0 pb-4">
            <div className="flex justify-between items-end px-1 mb-0 lg:mb-1">
              <h2 className="text-sm font-bold text-gray-300 tracking-wide uppercase">
                Intelligence Brief
              </h2>
            </div>
          
            {selectedResult ? (
              <motion.div
                key={selectedResult.text}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                className="skeuo-card p-8 flex flex-col flex-1 relative overflow-hidden border-t-white/5"
              >
                {/* Decorative background glow for the active card */}
                <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/5 rounded-full blur-[80px] pointer-events-none" />

                <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-4 relative z-10">
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight mb-3 flex items-center gap-3">
                      {selectedResult.source}
                      {selectedResult.label === "HIGH RISK" && <ShieldAlert className="w-7 h-7 text-red-500" />}
                      {selectedResult.label === "MODERATE" && <AlertTriangle className="w-7 h-7 text-amber-500" />}
                      {selectedResult.label === "LOW RISK" && <CheckCircle2 className="w-7 h-7 text-green-500" />}
                    </h2>
                    <div className="flex gap-2">
                      <span className="px-3 py-1 skeuo-inset text-[9px] font-black text-gray-400 uppercase tracking-widest border border-white/5">ML-Verified</span>
                      <span className="px-3 py-1 skeuo-inset text-[9px] font-black text-gray-400 uppercase tracking-widest border border-white/5">Correlated</span>
                    </div>
                  </div>
                  <div className="text-right skeuo-card px-6 py-3 rounded-2xl shadow-inner border-t-white/10">
                    <div className="text-3xl font-black text-gradient-primary font-mono tracking-tighter text-embossed">
                      {selectedResult.virality_score}
                    </div>
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 text-engraved">
                      Virality Score
                    </div>
                  </div>
                </div>

                <div className="skeuo-inset rounded-2xl p-6 mb-8 border-l-[6px] border-l-indigo-500 relative z-10">
                  <p className="text-[18px] font-bold leading-relaxed text-white text-embossed italic">
                    &quot;{selectedResult.text}&quot;
                  </p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8 flex-1 relative z-10">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                        Algorithmic Rationale
                      </h4>
                      <p className="text-sm text-gray-400 leading-relaxed font-bold skeuo-inset p-4 rounded-xl border border-white/5 text-engraved">
                        {selectedResult.explanation}
                      </p>
                    </div>

                    <div>
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-blue-500" />
                        Live Execution Log
                      </h4>
                      <div className="text-[11px] font-mono text-gray-500 leading-relaxed skeuo-inset p-4 rounded-xl border border-white/10 flex flex-col gap-1.5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-3"><div className="skeuo-led bg-blue-500 text-blue-500 animate-pulse" /></div>
                        <div><span className="text-indigo-400 font-bold">{'>'}</span> init_truthlens_core --id={selectedResult.timestamp.slice(-6).replace(/[^0-9]/g, '8')}</div>
                        <div><span className="text-gray-700">[SYS]</span> Connected to global ingestion pipeline.</div>
                        <div><span className="text-indigo-400 font-bold">{'>'}</span> analyze_linguistics --len={selectedResult.text.length}</div>
                        <div className="text-green-500/80 mb-1"><span className="text-gray-700">[AI]</span> Extracted {Math.floor(selectedResult.text.length / 10) || 5} semantic feature vectors.</div>
                        <div><span className="text-indigo-400 font-bold">{'>'}</span> calc_deterministic_score --verify=true</div>
                        <div><span className="text-gray-700">[AI]</span> Output: <span className={selectedResult.label === "HIGH RISK" ? "text-red-500 font-black" : selectedResult.label === "MODERATE" ? "text-amber-500 font-black" : "text-green-500 font-black"}>{selectedResult.label}</span> ({selectedResult.confidence}%)</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center">
                    <div className="bg-gradient-to-b from-[#0F172A] to-[#111827] border border-white/5 rounded-2xl p-8 flex flex-col justify-center items-center text-center h-full relative overflow-hidden shadow-inner">
                      
                      {/* Metric ring background effect */}
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.05)_0,transparent_70%)]" />
                      
                      <div className="text-6xl font-black text-white tracking-tighter mb-2 flex items-baseline relative z-10">
                        <Counter value={selectedResult.confidence} />
                        <span className="text-2xl text-gray-500 font-semibold ml-1">%</span>
                      </div>
                      <div className="text-[11px] font-bold text-indigo-400 uppercase tracking-widest mb-8 relative z-10 shadow-sm">
                        Confidence Metric
                      </div>
                      <div className="w-full h-2.5 bg-[#1F2937] rounded-full overflow-hidden shadow-inner border border-white/5 relative z-10">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${selectedResult.confidence}%` }}
                          transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
                          className={`h-full relative overflow-hidden ${
                            selectedResult.label === "HIGH RISK" ? "bg-red-500" : selectedResult.label === "MODERATE" ? "bg-amber-500" : "bg-green-500"
                          }`}
                        >
                          <div className="absolute inset-0 bg-white/20 w-[200%] -skew-x-12 translate-x-[-150%] animate-[shimmer_2s_infinite]" />
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>

              </motion.div>
            ) : (
              <div className="skeuo-card p-12 flex items-center justify-center flex-1 border-dashed border-white/10 skeuo-inset">
                <div className="flex flex-col items-center gap-5 text-gray-600">
                  <div className="w-16 h-16 rounded-2xl skeuo-card border border-white/5 flex items-center justify-center">
                    <Search className="w-8 h-8" />
                  </div>
                  <p className="text-xs font-black tracking-widest uppercase text-engraved">Select intelligence item for diagnostics</p>
                </div>
              </div>
            )}

            {/* Bottom — Analytics Bar Chart */}
            <div className="skeuo-card p-6 h-[200px] flex flex-col shrink-0 relative overflow-hidden border-t-white/5">
              <div className="absolute top-0 right-0 w-[30%] h-[100%] bg-blue-500/5 blur-[50px] pointer-events-none" />
              
              <div className="flex items-center justify-between mb-4 relative z-10">
                <h3 className="text-[10px] font-black text-gray-500 tracking-widest uppercase flex items-center gap-2 text-engraved">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  Volume History (24H)
                </h3>
              </div>
              
              <div className="flex-1 flex items-end justify-between px-2 gap-3 mt-2 relative z-10 skeuo-inset p-4 rounded-xl">
                {[40, 70, 45, 90, 65, 80, 50, 60, 30, 85, 95, 40].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.8, delay: i * 0.04, ease: [0.4, 0, 0.2, 1] }}
                    className="flex-1 bg-gradient-to-t from-[#1A1D23] to-[#2C323A] border-t border-white/10 rounded-t-sm hover:from-indigo-600 hover:to-indigo-400 transition-all cursor-pointer group relative shadow-md"
                  >
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 skeuo-card text-white text-[9px] font-black px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all pointer-events-none transform group-hover:-translate-y-1">
                      {h}
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="flex justify-between mt-4 text-[9px] text-gray-600 font-black border-t border-white/5 pt-3 relative z-10 uppercase tracking-widest text-engraved">
                <span>00:00</span>
                <span>06:00</span>
                <span>12:00</span>
                <span>18:00</span>
                <span>23:59</span>
              </div>
            </div>
          </div>
        </main>
      </div>
      
      {/* ── Command Palette ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isCmdOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-[#0A0F1C]/80 backdrop-blur-sm"
              onClick={() => setIsCmdOpen(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-2xl bg-[#0F172A] border border-white/10 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
            >
              <div className="flex items-center px-4 py-3 border-b border-white/10 bg-[#111827]">
                <Search className="w-5 h-5 text-gray-500 mr-3" />
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Type a command or search..." 
                  className="flex-1 bg-transparent text-white outline-none placeholder:text-gray-500 font-medium text-sm"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <div className="flex items-center gap-1.5 ml-3">
                  <span className="text-[10px] font-mono bg-[#1F2937] border border-white/5 px-1.5 py-0.5 rounded text-gray-400">ESC</span>
                </div>
              </div>
              <div className="max-h-[350px] overflow-y-auto p-2 bg-[#0F172A]">
                <div className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1 mb-1">
                  Quick Actions
                </div>
                {[
                  { icon: Download, label: "Export Data to CSV", action: () => { handleExport(); setIsCmdOpen(false); } },
                  { icon: Activity, label: "View Live Stream", action: () => { setActiveTag(null); setIsCmdOpen(false); } },
                  { icon: Database, label: "Filter: Tech Only", action: () => { setActiveTag("Tech"); setIsCmdOpen(false); } },
                  { icon: Database, label: "Filter: Health Only", action: () => { setActiveTag("Health"); setIsCmdOpen(false); } },
                  { icon: Database, label: "Filter: Economy Only", action: () => { setActiveTag("Economy"); setIsCmdOpen(false); } },
                ].filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase())).map((item, idx) => (
                  <button 
                    key={idx}
                    onClick={item.action}
                    className="w-full flex items-center px-3 py-3 hover:bg-indigo-500/10 rounded-xl transition-colors text-left group focus:outline-none focus:bg-indigo-500/10"
                  >
                    <item.icon className="w-4 h-4 text-gray-400 group-hover:text-indigo-400 mr-3 transition-colors" />
                    <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{item.label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CSS Animation defined locally for shimmer */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% { transform: translateX(150%); }
        }
      `}} />
    </div>
  );
}

// Simple Counter component for animated numbers
function Counter({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const start = displayValue;
    const end = value;
    if (start === end) return;
    
    const duration = 1000;
    const startTime = performance.now();
    
    // cubic-bezier(0.4, 0, 0.2, 1) approximation for JS
    const easeOutQuart = (x: number): number => 1 - Math.pow(1 - x, 4);
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeOutQuart(progress);
      
      setDisplayValue(Number((start + (end - start) * ease).toFixed(1)));
      
      if (progress < 1) requestAnimationFrame(animate);
      else setDisplayValue(end);
    };
    
    requestAnimationFrame(animate);
  }, [value, displayValue]);
  
  return <>{displayValue}</>;
}
