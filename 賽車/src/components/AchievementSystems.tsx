import React, { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { 
  Award, Wrench, Users, Flame, Flag, Zap, 
  Compass, MessageSquare, Sparkles, X, Trophy, CheckCircle2, RotateCcw
} from "lucide-react";
import { 
  Achievement, loadAchievements, resetAchievements, 
  unlockAchievement 
} from "../utils/achievementSystem";
import { t } from "../utils/i18n";

// Icon components mapping
const iconMap: Record<string, React.ComponentType<any>> = {
  Award: Award,
  Wrench: Wrench,
  Users: Users,
  Flame: Flame,
  Flag: Flag,
  Zap: Zap,
  Compass: Compass,
  MessageSquare: MessageSquare,
  Sparkles: Sparkles
};

export function getAchievementIcon(name: string, className = "w-5 h-5") {
  const IconComponent = iconMap[name] || Trophy;
  return <IconComponent className={className} />;
}

// ----------------------------------------------------
// POPUP TOAST MANAGER Component
// Displays fancy floating achievements notification cards
// ----------------------------------------------------
export function AchievementToastManager() {
  const [activeToasts, setActiveToasts] = useState<Array<Achievement & { toastId: string }>>([]);

  useEffect(() => {
    const handleUnlock = (e: Event) => {
      const customEvent = e as CustomEvent<Achievement>;
      const achievement = customEvent.detail;
      const toastId = `${achievement.id}-${Date.now()}`;
      
      // Add new achievement toast to stack
      setActiveToasts((prev) => [...prev, { ...achievement, toastId }]);

      // Trigger standard retro chime/siren using simple Web Audio API synthesis
      playUnlockChime();

      // Auto-remove after 4.5 seconds
      setTimeout(() => {
        setActiveToasts((prev) => prev.filter((t) => t.toastId !== toastId));
      }, 4500);
    };

    window.addEventListener("achievement-unlocked", handleUnlock);
    return () => {
      window.removeEventListener("achievement-unlocked", handleUnlock);
    };
  }, []);

  // Visual/Audio feedback using standard Web Audio oscillator (no static assets required)
  const playUnlockChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const now = ctx.currentTime;
      
      // Note 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc1.frequency.setValueAtTime(783.99, now + 0.24); // G5
      osc1.frequency.setValueAtTime(1046.50, now + 0.36); // C6
      
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 1.0);
    } catch (err) {
      console.warn("Audio Context blocked or not supported on client:", err);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col space-y-3 pointer-events-none max-w-sm w-full">
      <AnimatePresence>
        {activeToasts.map((toast) => {
          return (
            <motion.div
              key={toast.toastId}
              initial={{ opacity: 0, y: 50, scale: 0.9, rotateX: -15 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: 50, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 350, damping: 20 }}
              className="pointer-events-auto bg-slate-900 border-2 border-pink-500 rounded-2xl shadow-2xl overflow-hidden relative"
            >
              {/* Star dust radiant scan beam */}
              <div className="absolute inset-0 bg-gradient-to-r from-pink-500/10 via-cyan-500/10 to-indigo-500/10 pointer-events-none" />
              
              {/* Progress animation line */}
              <motion.div 
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 4.5, ease: "linear" }}
                className="absolute top-0 right-0 h-1 bg-gradient-to-l from-pink-500 to-cyan-500"
              />

              <div className="p-4 flex items-start space-x-3.5 mt-1">
                {/* Visual badge glowing shape */}
                <div className="relative flex-shrink-0">
                  <div className="absolute -inset-1.5 bg-gradient-to-tr from-pink-500 to-amber-400 rounded-xl blur opacity-70 animate-pulse" />
                  <div className="relative bg-slate-950 p-2.5 rounded-xl border border-pink-500 text-pink-400">
                    {getAchievementIcon(toast.iconName, "w-6 h-6")}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black tracking-widest text-pink-500 font-mono uppercase bg-pink-500/10 px-2 py-0.5 rounded-sm">
                      解鎖成就 UNLOCKED
                    </span>
                    <button
                      onClick={() => {
                        setActiveToasts((prev) => prev.filter((t) => t.toastId !== toast.toastId));
                      }}
                      className="text-slate-500 hover:text-slate-300 pointer-events-auto"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <h4 className="text-sm font-black text-slate-100 tracking-wide mt-1.5 truncate">
                    {toast.title}
                  </h4>
                  <p className="text-xs text-slate-400 font-sans mt-1 leading-normal">
                    {toast.description}
                  </p>
                  
                  {toast.rewardText && (
                    <div className="mt-2.5 flex items-center space-x-1.5 text-[10px] font-bold text-amber-400 font-mono">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin-slow" />
                      <span>{toast.rewardText}</span>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------
// CORE ACHIEVEMENT PANEL Component
// Grid presentation widget for Lobby/Garage dashboard
// ----------------------------------------------------
interface AchievementDashboardProps {
  onReturn?: () => void;
}

export function AchievementDashboard({ onReturn }: AchievementDashboardProps) {
  const [items, setItems] = useState<Achievement[]>([]);
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const [unlockedCount, setUnlockedCount] = useState(0);

  const loadData = () => {
    const list = loadAchievements();
    setItems(list);
    setUnlockedCount(list.filter((x) => x.unlocked).length);
  };

  useEffect(() => {
    loadData();

    // Listen to custom unlock events to refresh lists in real-time
    const handleUnlockEvent = () => loadData();
    window.addEventListener("achievement-unlocked", handleUnlockEvent);
    return () => {
      window.removeEventListener("achievement-unlocked", handleUnlockEvent);
    };
  }, []);

  const handleReset = () => {
    if (confirm(t("confirmResetAchievements"))) {
      const resetList = resetAchievements();
      setItems(resetList);
      setUnlockedCount(0);
    }
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    if (filter === 'unlocked') return item.unlocked;
    if (filter === 'locked') return !item.unlocked;
    return true;
  });

  const completionPct = items.length ? Math.round((unlockedCount / items.length) * 100) : 0;

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 p-6 overflow-y-auto min-h-screen">
      
      {/* Upper overview card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 mb-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-[10%] right-[5%] w-48 h-48 bg-gradient-to-b from-cyan-500/10 to-pink-500/5 rounded-full filter blur-2xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center space-x-4">
            <div className="bg-gradient-to-tr from-amber-400 via-pink-500 to-indigo-600 p-4 rounded-2xl shadow-xl shadow-pink-500/10 text-white">
              <Trophy className="w-8 h-8 animate-bounce-slow" style={{ animationDuration: '3s' }} />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-100 uppercase tracking-wider">
                {t("achievementsTitle")}
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                {t("achievementsSub")}
              </p>
            </div>
          </div>

          {/* Core completion stats */}
          <div className="flex items-center space-x-6 bg-slate-950/70 border border-slate-800 px-5 py-3.5 rounded-2xl min-w-[200px]">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-black text-slate-400 tracking-widest block uppercase font-mono mb-1">
                {t("achievementsProgress")}
              </span>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-cyan-400 via-pink-500 to-indigo-500 h-full transition-all duration-700"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] font-mono text-slate-400 font-bold mt-1.5">
                <span>{unlockedCount} / {items.length} {t("unlockedLabel")}</span>
                <span className="text-cyan-400">{completionPct}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FILTER CONTROL TAB & ACTION BUTTONS */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl space-x-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg text-xs font-bold font-sans transition cursor-pointer ${
              filter === 'all'
                ? 'bg-slate-800 text-cyan-400 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t("allAchievements")} ({items.length})
          </button>
          <button
            onClick={() => setFilter('unlocked')}
            className={`px-4 py-2 rounded-lg text-xs font-bold font-sans transition cursor-pointer ${
              filter === 'unlocked'
                ? 'bg-slate-800 text-cyan-400 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t("unlockedLabel")} ({unlockedCount})
          </button>
          <button
            onClick={() => setFilter('locked')}
            className={`px-4 py-2 rounded-lg text-xs font-bold font-sans transition cursor-pointer ${
              filter === 'locked'
                ? 'bg-slate-800 text-cyan-400 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t("lockedLabel")} ({items.length - unlockedCount})
          </button>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 border border-slate-800 hover:border-red-500/50 text-slate-400 hover:text-red-400 font-bold text-xs rounded-xl transition flex items-center space-x-2 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t("resetAllRecords")}</span>
          </button>
          
          {onReturn && (
            <button
              onClick={onReturn}
              className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition cursor-pointer"
            >
              {t("backToMainMenu")}
            </button>
          )}
        </div>
      </div>

      {/* ACHIVEMENT bento GRID list */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <AnimatePresence mode="popLayout">
          {filteredItems.map((item) => {
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className={`bg-slate-900 border rounded-2xl p-5 flex flex-col justify-between min-h-[170px] relative transition-all group overflow-hidden ${
                  item.unlocked 
                    ? "border-pink-500/30 hover:border-pink-500/60 shadow-lg shadow-pink-500/5" 
                    : "border-slate-800/80 grayscale opacity-55"
                }`}
              >
                {/* Background lighting flare on hover for unlocked ones */}
                {item.unlocked && (
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-pink-500/10 to-transparent rounded-bl-full pointer-events-none group-hover:from-pink-500/20 transition-all duration-300" />
                )}

                <div className="space-y-3 relative z-10">
                  {/* Top line with Icon and Locked status */}
                  <div className="flex justify-between items-start">
                    <div className={`p-2.5 rounded-xl border ${
                      item.unlocked 
                        ? "bg-pink-500/10 border-pink-500/30 text-pink-400" 
                        : "bg-slate-950 border-slate-800 text-slate-500"
                    }`}>
                      {getAchievementIcon(item.iconName, "w-5 h-5")}
                    </div>

                    {item.unlocked ? (
                      <span className="flex items-center space-x-1 text-[10px] font-black text-pink-400 bg-pink-500/10 px-2.5 py-1 rounded-full font-mono uppercase">
                        <CheckCircle2 className="w-3 h-3 text-pink-400" />
                        <span>{t("unlockedLabel")}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-slate-500 bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-full font-mono uppercase">
                        {t("lockedLabel")}
                      </span>
                    )}
                  </div>

                  {/* Body textual information */}
                  <div>
                    <h3 className="text-sm font-black text-slate-100 tracking-wide">
                      {t(`${item.id}_title`) !== `${item.id}_title` ? t(`${item.id}_title`) : item.title}
                    </h3>
                    <p className="text-xs text-slate-400 font-sans mt-1 leading-normal">
                      {t(`${item.id}_desc`) !== `${item.id}_desc` ? t(`${item.id}_desc`) : item.description}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-800/80 pt-3 mt-3 relative z-10 block">
                  <div className="text-[10px] text-slate-400 tracking-tight leading-normal">
                    <span className="font-bold uppercase text-slate-500 font-mono block mb-0.5">{t("achievementTarget")}</span>
                    {t(`${item.id}_req`) !== `${item.id}_req` ? t(`${item.id}_req`) : item.requirement}
                  </div>
                  
                  {item.unlocked && item.unlockedAt && (
                    <div className="text-[9px] text-slate-500 font-mono mt-2 flex items-center justify-between">
                      <span>{t("unlockedTime")}</span>
                      <span>{item.unlockedAt}</span>
                    </div>
                  )}

                  {item.rewardText && (
                    <div className="mt-2.5 flex items-center space-x-1 text-[10px] font-extrabold text-amber-400 font-mono bg-amber-500/5 px-2 py-1 rounded-lg border border-amber-500/10">
                      <Sparkles className="w-3 h-3 text-amber-500" />
                      <span className="truncate">
                        {t(`${item.id}_reward`) !== `${item.id}_reward` ? t(`${item.id}_reward`) : item.rewardText}
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <div className="col-span-full py-12 text-center bg-slate-900/50 border border-slate-800 border-dashed rounded-3xl">
            <span className="text-3xl block mb-2">🏁</span>
            <p className="text-xs font-mono text-slate-500 font-semibold uppercase">
              {t("noAchievementsMatch")}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
