import React, { useState, useMemo, useEffect } from "react";
import { COUNTRIES_LIST, Country, LangType, LANGUAGE_LABELS, LANGUAGE_FULL_LABELS, TRANSLATIONS } from "../utils/i18n";
import { Search, Globe, ChevronRight, X } from "lucide-react";
import { audioSystem } from "../utils/audioSystem";
import LanguageSelector from "./LanguageSelector";
import { motion } from "motion/react";

interface OnboardingModalProps {
  currentLanguage: LangType;
  onConfirm: (country: Country, customLang: LangType) => void;
  onClose?: () => void;
  onLanguageChange?: (lang: LangType) => void;
}

export function OnboardingModal({ currentLanguage, onConfirm, onClose, onLanguageChange }: OnboardingModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedLang, setSelectedLang] = useState<LangType>(currentLanguage);

  const isChinaDetected = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return q.includes("china") || q.includes("中国") || q.includes("中國");
  }, [searchQuery]);

  useEffect(() => {
    setSelectedLang(currentLanguage);
  }, [currentLanguage]);

  const localT = (key: string): string => {
    return TRANSLATIONS[selectedLang]?.[key] || TRANSLATIONS['en']?.[key] || key;
  };

  // Group countries alphabetically from A to Z, excluding any China (not in the list anyway)
  const sortedCountries = useMemo(() => {
    return [...COUNTRIES_LIST].sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // Filter countries based on query (supports English, Chinese zhName, code, and keywords)
  const filteredCountries = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sortedCountries;
    return sortedCountries.filter(c => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const zhMatch = c.zhName ? c.zhName.toLowerCase().includes(q) : false;
      const codeMatch = c.code.toLowerCase().includes(q);
      const keywordsMatch = c.keywords ? c.keywords.some(k => k.toLowerCase().includes(q)) : false;
      return nameMatch || zhMatch || codeMatch || keywordsMatch;
    });
  }, [sortedCountries, searchQuery]);

  // Group filtered countries by starting letter for the A-Z view
  const groupedCountries = useMemo(() => {
    const groups: Record<string, Country[]> = {};
    filteredCountries.forEach(country => {
      const firstLetter = country.name[0].toUpperCase();
      if (!groups[firstLetter]) {
        groups[firstLetter] = [];
      }
      groups[firstLetter].push(country);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCountries]);

  const handleSelect = (country: Country) => {
    if (isChinaDetected) return;
    audioSystem.playClick("high");
    setSelectedCountry(country);
    setSelectedLang(country.lang);
    if (onLanguageChange) {
      onLanguageChange(country.lang);
    }
  };

  const handleConfirm = () => {
    if (!selectedCountry || isChinaDetected) return;
    audioSystem.playClick("medium");
    onConfirm(selectedCountry, selectedLang);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl"
    >
      <motion.div
        initial={{ scale: 0.92, y: 15, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
        className="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
      >
        
        {/* Glow decoration */}
        <div className="absolute top-0 left-1/4 w-1/2 h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent blur-sm" />
        
        {/* Close Button */}
        {onClose && (
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              audioSystem.playClick("low");
              onClose();
            }}
            type="button"
            className="absolute top-4 right-4 p-2 bg-slate-950/45 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 hover:border-slate-700 rounded-full transition-all duration-200 cursor-pointer z-50 shadow-md"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </motion.button>
        )}
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 bg-cyan-950/50 border border-cyan-500/20 rounded-2xl mb-3">
            <Globe className="w-8 h-8 text-cyan-400 animate-spin-slow" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 tracking-wide">
            {localT("onboardingTitle")}
          </h1>
          <p className="text-slate-400 text-xs md:text-sm mt-1.5 max-w-md mx-auto">
            {localT("onboardingSub")}
          </p>
        </div>

        {/* Search Input */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder={localT("onboardingPlaceholder") || "Type your country..."}
            value={searchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setSearchQuery(val);
              // Auto-select if exact match is typed
              const qVal = val.toLowerCase().trim();
              if (qVal) {
                const exactMatch = COUNTRIES_LIST.find(
                  c => c.name.toLowerCase() === qVal ||
                       c.code.toLowerCase() === qVal ||
                       (c.zhName && c.zhName.toLowerCase() === qVal) ||
                       (c.keywords && c.keywords.some(k => k.toLowerCase() === qVal))
                );
                if (exactMatch) {
                  setSelectedCountry(exactMatch);
                }
              }
            }}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-slate-100 font-semibold focus:outline-none focus:border-cyan-500 transition-all font-sans placeholder-slate-600"
          />
        </div>

        {/* Alphabetical A-Z Countries list */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 mb-6 custom-scrollbar max-h-[40vh]">
          {isChinaDetected ? (
            <div className="text-center py-10 px-4 text-rose-400 text-sm font-bold border border-rose-500/30 rounded-2xl bg-rose-950/20 shadow-[0_0_15px_rgba(239,68,68,0.1)] leading-relaxed font-sans">
              ⚠️ 你所回答的國家在作者眼中並不是一個國家，請輸入其他國家
            </div>
          ) : groupedCountries.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs font-mono">
              {localT("noMatches") || "NO COUNTRIES FOUND MATCHING YOUR INPUT"}
            </div>
          ) : (
            groupedCountries.map(([letter, countries]) => (
              <div key={letter} className="space-y-1.5">
                <div className="text-[10px] font-black text-cyan-500/70 font-mono px-2 tracking-wider">
                  — {letter} —
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {countries.map((country) => {
                    const isSelected = selectedCountry?.name === country.name;
                    return (
                      <motion.button
                        whileHover={{ scale: 1.015 }}
                        whileTap={{ scale: 0.985 }}
                        key={country.name}
                        onClick={() => handleSelect(country)}
                        type="button"
                        className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? "bg-cyan-500/15 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/5"
                            : "bg-slate-950/40 border-slate-850 hover:border-slate-800 text-slate-300 hover:bg-slate-950/70"
                        }`}
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <span className="text-xl select-none" role="img" aria-label={country.name}>
                            {country.flag}
                          </span>
                          <span className="text-xs font-bold truncate">
                            {country.zhName ? `${country.zhName} (${country.name})` : country.name}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[8px] font-bold font-mono px-1.5 py-0.5 rounded bg-slate-850 text-slate-400">
                            {LANGUAGE_LABELS[country.lang] || country.lang.toUpperCase()}
                          </span>
                          {isSelected && <ChevronRight className="w-3 h-3 text-cyan-400" />}
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected Country Banner & Confirm Button */}
        <div className="space-y-3 pt-3 border-t border-slate-850">
          {isChinaDetected ? (
            <div className="p-4 bg-rose-950/20 border border-rose-500/30 text-rose-400 rounded-2xl text-center text-xs font-bold leading-relaxed shadow-[0_0_15px_rgba(239,68,68,0.1)] font-sans">
              ⚠️ 你所回答的國家在作者眼中並不是一個國家，請輸入其他國家
            </div>
          ) : selectedCountry ? (
            <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-2xl">
              <div className="flex items-center space-x-3">
                <span className="text-2xl select-none">{selectedCountry.flag}</span>
                <div>
                  <div className="text-[10px] font-black tracking-widest text-slate-500 uppercase font-mono">{localT("selectedLocale")}</div>
                  <div className="text-xs font-bold text-slate-100">{selectedCountry.name}</div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="text-[10px] font-black tracking-widest text-cyan-400 uppercase font-mono mb-1">{localT("languageLabel")}</div>
                <LanguageSelector
                  value={selectedLang}
                  onChange={(lang) => {
                    setSelectedLang(lang);
                    if (onLanguageChange) {
                      onLanguageChange(lang);
                    }
                  }}
                  align="right"
                  t={localT}
                />
              </div>
            </div>
          ) : (
            <div className="p-3 text-center text-xs text-slate-500 bg-slate-950/40 border border-dashed border-slate-850 rounded-2xl">
              {localT("onboardingUnlockWarning")}
            </div>
          )}

          <motion.button
            whileHover={selectedCountry && !isChinaDetected ? { scale: 1.02 } : {}}
            whileTap={selectedCountry && !isChinaDetected ? { scale: 0.98 } : {}}
            onClick={handleConfirm}
            disabled={!selectedCountry || isChinaDetected}
            type="button"
            className={`w-full py-3.5 rounded-2xl font-black text-xs tracking-widest uppercase transition-all duration-300 shadow-lg text-center cursor-pointer ${
              selectedCountry && !isChinaDetected
                ? "bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-500/10"
                : "bg-slate-800 text-slate-500 border border-slate-850 cursor-not-allowed shadow-none"
            }`}
          >
            {localT("onboardingConfirmBtn")}
          </motion.button>
        </div>

      </motion.div>
    </motion.div>
  );
}
