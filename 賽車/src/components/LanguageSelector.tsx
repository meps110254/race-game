import React, { useState, useRef, useEffect, useMemo } from "react";
import { LangType, LANGUAGE_LABELS, LANGUAGE_FULL_LABELS, LANGUAGE_FLAGS, TRANSLATIONS, t } from "../utils/i18n";
import { Globe, Search, Check, ChevronDown } from "lucide-react";
import { audioSystem } from "../utils/audioSystem";

interface LanguageSelectorProps {
  value: LangType;
  onChange: (lang: LangType) => void;
  align?: "left" | "right";
  t?: (key: string) => string;
}

export default function LanguageSelector({ value, onChange, align = "right", t: customT }: LanguageSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const translate = customT || t;

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter languages based on search query (matching both code, full name, and native label)
  const filteredLanguages = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const allLanguages = Object.keys(LANGUAGE_FULL_LABELS) as LangType[];
    
    if (!q) {
      // Return sorted languages, putting English, Traditional Chinese, and Japanese first
      const priority = ["zh-TW", "en", "ja"];
      return [...allLanguages].sort((a, b) => {
        const pA = priority.indexOf(a);
        const pB = priority.indexOf(b);
        if (pA !== -1 && pB !== -1) return pA - pB;
        if (pA !== -1) return -1;
        if (pB !== -1) return 1;
        
        const labelA = LANGUAGE_FULL_LABELS[a] || "";
        const labelB = LANGUAGE_FULL_LABELS[b] || "";
        return labelA.localeCompare(labelB);
      });
    }

    return allLanguages.filter((lang) => {
      const label = (LANGUAGE_FULL_LABELS[lang] || "").toLowerCase();
      const code = lang.toLowerCase();
      const shortLabel = (LANGUAGE_LABELS[lang] || "").toLowerCase();

      if (lang === "zh-TW") {
        const twKeywords = ["台灣", "臺灣", "繁體", "繁中", "taiwan", "tw", "traditional chinese", "chinese", "中華民國"];
        if (twKeywords.some(k => k.includes(q) || q.includes(k))) return true;
      }

      return label.includes(q) || code.includes(q) || shortLabel.includes(q);
    });
  }, [searchQuery]);

  const handleToggle = () => {
    audioSystem.playClick("high");
    setIsOpen(!isOpen);
    setSearchQuery(""); // reset search query on toggle
  };

  const handleSelect = (lang: LangType) => {
    audioSystem.playClick("medium");
    onChange(lang);
    setIsOpen(false);
  };

  const activeLabel = LANGUAGE_FULL_LABELS[value] || value;
  const activeFlag = LANGUAGE_FLAGS[value] || "🌐";

  return (
    <div className="relative inline-block text-left" ref={containerRef} id="custom-language-selector">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        className={`flex items-center space-x-1.5 bg-slate-800/80 hover:bg-slate-750 text-slate-200 border ${
          isOpen ? "border-cyan-500/80 shadow-[0_0_8px_rgba(6,182,212,0.3)]" : "border-slate-700 hover:border-cyan-500/50"
        } rounded-xl px-2.5 py-1.5 transition duration-200 text-xs font-bold shadow-md cursor-pointer h-[32px] select-none`}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <Globe className="w-3.5 h-3.5 text-cyan-400" />
        <span className="flex items-center space-x-1 max-w-[100px] sm:max-w-none truncate">
          <span>{activeFlag}</span>
          <span className="hidden md:inline truncate">{activeLabel}</span>
          <span className="md:hidden truncate uppercase">{value}</span>
        </span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-250 ${isOpen ? "rotate-180 text-cyan-400" : ""}`} />
      </button>

      {/* Custom Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute ${
            align === "right" ? "right-0" : "left-0"
          } mt-2 w-64 md:w-72 bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl z-[250] overflow-hidden animate-fade-in-up origin-top flex flex-col max-h-[380px]`}
          style={{
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 10px 10px -5px rgba(0, 0, 0, 0.7), 0 0 15px rgba(6,182,212,0.15)"
          }}
        >
          {/* Search bar inside popover */}
          <div className="p-3 border-b border-slate-850 bg-slate-950/65 flex items-center sticky top-0">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                autoFocus
                placeholder={translate("searchPlaceholder") || "Search language / 搜尋語言..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 font-semibold focus:outline-none focus:border-cyan-500/80 transition-all placeholder-slate-600"
              />
            </div>
          </div>

          {/* Languages list with custom scrollbar */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar">
            {filteredLanguages.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs font-mono select-none">
                {translate("noMatches") || "No languages match your search"}
              </div>
            ) : (
              filteredLanguages.map((langKey) => {
                const isSelected = value === langKey;
                const flag = LANGUAGE_FLAGS[langKey] || "🌐";
                const label = LANGUAGE_FULL_LABELS[langKey] || langKey;
                
                return (
                  <button
                    key={langKey}
                    type="button"
                    onClick={() => handleSelect(langKey)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-150 cursor-pointer text-left ${
                      isSelected
                        ? "bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-black shadow-[inset_0_1px_3px_rgba(6,182,212,0.1)]"
                        : "border border-transparent text-slate-300 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="text-base select-none">{flag}</span>
                      <span className="text-xs truncate font-bold">{label}</span>
                    </div>
                    {isSelected && (
                      <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Helper Footer inside Popover */}
          <div className="px-3 py-2 bg-slate-950/65 border-t border-slate-850 text-[10px] text-slate-500 flex justify-between font-mono select-none">
            <span>{filteredLanguages.length} {translate("languagesAvailable") || "LANGUAGES"}</span>
            <span className="text-cyan-500 font-bold uppercase">{value}</span>
          </div>
        </div>
      )}
    </div>
  );
}
