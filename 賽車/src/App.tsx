import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CarConfig, Player, RoomInfo, Track, ChatMessage } from "./types";
import { TRACKS } from "./tracks";
import CarGarage from "./components/CarGarage";
import LobbyList from "./components/LobbyList";
import GameCanvas from "./components/GameCanvas";
import TrackEditor from "./components/TrackEditor";
import { Award, Gauge, Share2, Info, Users, Play, RefreshCw, Car, Download, Layers, Settings, Globe, MapPin, Trash2, FileDown, ExternalLink, Check } from "lucide-react";
import { unlockAchievement, loadAchievements } from "./utils/achievementSystem";
import { AchievementDashboard, AchievementToastManager } from "./components/AchievementSystems";
import { audioSystem } from "./utils/audioSystem";
import { OnboardingModal } from "./components/OnboardingModal";
import { useWebRTCAudio } from "./hooks/useWebRTCAudio";
import { getTeamFlag, formatKeyLabel } from "./utils/teamUtils";
import { setI18nLanguage, getI18nLanguage, t, COUNTRIES_LIST, Country, LangType, LANGUAGE_FULL_LABELS, LANGUAGE_FLAGS, TRANSLATIONS, getTrackName, getTrackDesc } from "./utils/i18n";
import LanguageSelector from "./components/LanguageSelector";
import { safeStorage } from "./utils/storage";
import { downloadStandaloneOfflineGame } from "./utils/offlineGameExporter";

export default function App() {
  // Global States
  const [screen, setScreen] = useState<'landing' | 'garage' | 'lobby' | 'race' | 'achievements' | 'track-editor'>('landing');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  
  // Custom Tracks State
  const [customTracks, setCustomTracks] = useState<Record<string, Track>>(() => {
    try {
      const stored = safeStorage.getItem("custom_racing_tracks");
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse custom tracks", e);
    }
    return {};
  });

  const handleSaveTrack = (track: Track) => {
    setCustomTracks((prev) => {
      const updated = { ...prev, [track.id]: track };
      safeStorage.setItem("custom_racing_tracks", JSON.stringify(updated));
      return updated;
    });
  };

  const handleInstantPlayCustomTrack = (customTrack: Track) => {
    handleSaveTrack(customTrack);
    setPlayerId("local-player");
    setActiveTrackId(customTrack.id);
    
    // Construct local-player practice room state:
    const practicePlayers: Record<string, Player> = {
      "local-player": {
        id: "local-player",
        name: playerName.trim() || t("playerSelf"),
        carConfig: carConfig,
        x: 0,
        y: 0.5,
        z: 0,
        ry: 0,
        speed: 0,
        steering: 0,
        lap: 1,
        progress: 0,
        bestTime: 0,
        isReady: true,
        team: playerTeam
      }
    };
    
    // Add 1 AI bot competitor for custom tracks
    const botId = "ai-bot-1";
    practicePlayers[botId] = {
      id: botId,
      name: t("aiSean"),
      carConfig: {
        paint: "#ef4444",
        wheelType: "sport",
        spoilerType: "sport",
        bodyStyle: "coupe",
        engineLevel: 2,
        weightLevel: 3,
        gripLevel: 3
      },
      x: 0,
      y: 0.5,
      z: 0,
      ry: 0,
      speed: 0,
      steering: 0,
      lap: 1,
      progress: 0,
      bestTime: 0,
      isReady: true,
      team: "AI"
    };

    setCurrentRoom({
      id: "PRACTICE",
      trackId: customTrack.id,
      state: "countdown",
      players: practicePlayers
    });

    handleScreenChange("race");
  };
  
  // Single Player Practice configuration states
  const [showPracticeSetup, setShowPracticeSetup] = useState(false);
  const [practiceTrackId, setPracticeTrackId] = useState("neon-grid");
  const [practiceBotCount, setPracticeBotCount] = useState(3);
  const [practiceDifficulty, setPracticeDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');

  // PWA (Progressive Web App) states
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);
  const [showDownloadToast, setShowDownloadToast] = useState(false);

  const handleDownloadGameFile = () => {
    audioSystem.playClick("high");
    downloadStandaloneOfflineGame(userLang, playerName || "Speed Racer");
    setShowDownloadToast(true);
    setTimeout(() => setShowDownloadToast(false), 4500);
  };

  const handleOpenInNewWindow = () => {
    audioSystem.playClick("high");
    try {
      window.open(window.location.href, "_blank", "noopener,noreferrer");
    } catch (e) {
      window.location.href = window.location.href;
    }
  };

  useEffect(() => {
    // Check if running in iframe
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Initial check for standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsAppInstalled(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const [userCountry, setUserCountry] = useState(() => {
    return safeStorage.getItem("giga_racer_user_country") || "Taiwan";
  });
  const [userLang, setUserLang] = useState<LangType>(() => {
    const saved = safeStorage.getItem("giga_racer_user_lang") as LangType | null;
    return saved || "zh-TW";
  });
  const [translating, setTranslating] = useState(false);
  const [translationLoadedCount, setTranslationLoadedCount] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [playerName, setPlayerName] = useState(() => {
    return safeStorage.getItem("giga_racer_player_name") || "";
  });
  const [playerTeam, setPlayerTeam] = useState(() => {
    return safeStorage.getItem("giga_racer_player_team") || "";
  });
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [keybindings, setKeybindings] = useState(() => {
    try {
      const stored = safeStorage.getItem("cyber_race_keybindings");
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error("Failed to parse stored keybindings", e);
    }
    return {
      accelerate: { key: "w", code: "KeyW", label: "W" },
      brake: { key: "s", code: "KeyS", label: "S" },
      left: { key: "a", code: "KeyA", label: "A" },
      right: { key: "d", code: "KeyD", label: "D" },
      drift: { key: " ", code: "Space", label: "Spacebar ⌴" },
      nitro: { key: "shift", code: "ShiftLeft", label: "L-Shift ⇧" }
    };
  });
  const [activeRecordingAction, setActiveRecordingAction] = useState<string | null>(null);

  useEffect(() => {
    if (!activeRecordingAction) return;

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const { key, code } = e;
      const label = formatKeyLabel(code, key);

      const nextBindings = {
        ...keybindings,
        [activeRecordingAction]: { key: key.toLowerCase(), code, label }
      };

      setKeybindings(nextBindings);
      safeStorage.setItem("cyber_race_keybindings", JSON.stringify(nextBindings));
      setActiveRecordingAction(null);
      audioSystem.playClick("high");
    };

    window.addEventListener("keydown", handleGlobalKeydown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleGlobalKeydown, { capture: true });
    };
  }, [activeRecordingAction, keybindings]);

  const [carConfig, setCarConfig] = useState<CarConfig>(() => {
    try {
      const saved = safeStorage.getItem("giga_racer_car_config");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      paint: "#ff3366",
      wheelType: "sport",
      spoilerType: "none",
      bodyStyle: "coupe",
      engineLevel: 1,
      weightLevel: 3,
      gripLevel: 3,
    };
  });

  const [showOtherLangs, setShowOtherLangs] = useState(false);

  const handleScreenChange = (nextScreen: typeof screen) => {
    audioSystem.playClick("medium");
    setScreen(nextScreen);
  };

  const handleOnboardingConfirm = (country: Country, customLang: LangType) => {
    safeStorage.setItem("giga_racer_user_country", country.name);
    setUserCountry(country.name);
    setUserLang(customLang);
    setShowOnboarding(false);
  };

  // Sync to localStorage on change
  useEffect(() => {
    safeStorage.setItem("giga_racer_player_name", playerName);
  }, [playerName]);

  useEffect(() => {
    safeStorage.setItem("giga_racer_player_team", playerTeam);
  }, [playerTeam]);

  useEffect(() => {
    safeStorage.setItem("giga_racer_car_config", JSON.stringify(carConfig));
  }, [carConfig]);

  // Sync active language to i18n configuration and localStorage when userLang state updates
  useEffect(() => {
    const checkAndFetchTranslation = async () => {
      const englishKeysCount = Object.keys(TRANSLATIONS["en"] || {}).length;
      const currentKeysCount = Object.keys(TRANSLATIONS[userLang] || {}).length;
      const isFullyPretranslated = userLang === "en" || userLang === "zh-TW" || userLang === "ja" || userLang === "af" || userLang === "ms" || userLang === "fr" || userLang === "da" || userLang === "de" || userLang === "et" || userLang === "es" || userLang === "fil" || userLang === "cs" || userLang === "ga" || userLang === "hr" || userLang === "is" || userLang === "it";
      
      // If it's not a pre-translated language and has less than 95% of the English key count,
      // we consider it incomplete and fetch the complete localization.
      const hasTranslation = isFullyPretranslated || (TRANSLATIONS[userLang] && currentKeysCount >= englishKeysCount * 0.95);

      if (!hasTranslation) {
        // Try to load from localStorage cache first to avoid slow network API calls
        const cacheKey = `giga_racer_translation_${userLang}`;
        const cached = safeStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && Object.keys(parsed).length >= englishKeysCount * 0.95) {
              TRANSLATIONS[userLang] = parsed;
              setI18nLanguage(userLang);
              setTranslationLoadedCount(prev => prev + 1);
              return;
            }
          } catch (e) {
            console.error(`Failed to parse cached translation for ${userLang}`, e);
          }
        }

        const existingTranslations = { ...TRANSLATIONS[userLang] };
        setTranslating(true);
        try {
          const response = await fetch("/api/translate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              lang: userLang,
              source: TRANSLATIONS["en"],
              existing: existingTranslations
            })
          });
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && contentType.includes("application/json")) {
            const data = await response.json();
            if (data && data.success && data.translation) {
              TRANSLATIONS[userLang] = data.translation;
              // Cache successful translation in localStorage for instant retrieval next time
              safeStorage.setItem(cacheKey, JSON.stringify(data.translation));
            }
          }
        } catch (err) {
          console.error(`Failed to fetch dynamic translations for ${userLang}:`, err);
        } finally {
          setI18nLanguage(userLang);
          setTranslating(false);
          setTranslationLoadedCount(prev => prev + 1);
        }
      } else {
        setI18nLanguage(userLang);
        setTranslationLoadedCount(prev => prev + 1);
      }
    };

    checkAndFetchTranslation().catch((err) => console.warn("Failed translation check:", err));
    safeStorage.setItem("giga_racer_user_lang", userLang);
  }, [userLang]);

  // Dynamic achievements progress tracking
  const [achStats, setAchStats] = useState({ unlocked: 0, total: 8 });

  useEffect(() => {
    // Check if audio context was already running or has been authorized earlier
    if (audioSystem.isUnlocked()) {
      setAudioUnlocked(true);
    }

    const handleGlobalInteraction = () => {
      audioSystem.init();
      setAudioUnlocked(true);
    };

    window.addEventListener("click", handleGlobalInteraction, { once: true });
    window.addEventListener("touchstart", handleGlobalInteraction, { once: true });
    window.addEventListener("keydown", handleGlobalInteraction, { once: true });

    const list = loadAchievements();
    setAchStats({
      unlocked: list.filter((x) => x.unlocked).length,
      total: list.length
    });

    const handleUnlockEvent = () => {
      const updatedList = loadAchievements();
      setAchStats({
        unlocked: updatedList.filter((x) => x.unlocked).length,
        total: updatedList.length
      });
    };

    window.addEventListener("achievement-unlocked", handleUnlockEvent);
    return () => {
      window.removeEventListener("click", handleGlobalInteraction);
      window.removeEventListener("touchstart", handleGlobalInteraction);
      window.removeEventListener("keydown", handleGlobalInteraction);
      window.removeEventListener("achievement-unlocked", handleUnlockEvent);
    };
  }, []);

  // Networking Socket States
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [currentRoom, setCurrentRoom] = useState<{
    id: string;
    trackId?: string;
    state: 'lobby' | 'countdown' | 'racing' | 'finished';
    players: Record<string, Player>;
  } | null>(null);
  
  const [playerId, setPlayerId] = useState("");
  const {
    localStream,
    isMuted,
    permissionError,
    toggleMute,
    receiveWebRTCSignal
  } = useWebRTCAudio(socket, currentRoom, playerId);
  const [myReadyState, setMyReadyState] = useState(false);
  const [activeTrackId, setActiveTrackId] = useState("neon-grid");
  const [connStatus, setConnStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);

  // Send chat message via socket or fallback to local log
  const handleSendChatMessage = (messageText: string) => {
    const trimmed = messageText.trim();
    if (!trimmed) return;

    const activeWs = socketRef.current || socket;
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({
        type: "chat-message",
        payload: {
          message: trimmed,
          senderId: playerId,
          senderName: playerName
        }
      }));
      unlockAchievement("active_social");
    } else {
      const newMsg: ChatMessage = {
        senderId: playerId || "local-player",
        senderName: playerName || "Racer",
        message: trimmed,
        time: Date.now()
      };
      setChatLog((prev) => [...prev, newMsg].slice(-100));
    }
  };

  const handleAddChatMessage = (msg: ChatMessage) => {
    setChatLog((prev) => [...prev, msg].slice(-100));
  };

  // Generate random default name on load if name is empty & auto-connect to server
  useEffect(() => {
    if (!playerName) {
      const rId = Math.floor(Math.random() * 900) + 100;
      const prefix = t("defaultRacerPrefix");
      setPlayerName(`${prefix}${rId}`);
    }
    connectToServer().catch(() => {
      console.log("Initial socket connection pending user interaction or server boot");
    });
  }, []);

  // Initialize and handle WebSocket lifecycle
  const connectToServer = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      let isSettled = false;

      const safeResolve = (ws: WebSocket) => {
        if (!isSettled) {
          isSettled = true;
          resolve(ws);
        }
      };

      const safeReject = (err: any) => {
        if (!isSettled) {
          isSettled = true;
          reject(err instanceof Error ? err : new Error("WebSocket connection failed"));
        }
      };

      const existingWs = socketRef.current;
      if (existingWs) {
        if (existingWs.readyState === WebSocket.OPEN) {
          safeResolve(existingWs);
          return;
        }
        if (existingWs.readyState === WebSocket.CONNECTING) {
          const handleOpen = () => {
            cleanup();
            safeResolve(existingWs);
          };
          const handleError = (err: any) => {
            cleanup();
            safeReject(err);
          };
          const cleanup = () => {
            existingWs.removeEventListener("open", handleOpen);
            existingWs.removeEventListener("error", handleError);
          };
          existingWs.addEventListener("open", handleOpen);
          existingWs.addEventListener("error", handleError);
          return;
        }
      }

      setConnStatus('connecting');
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log("Connecting multiplayer socket server standard at", wsUrl);

      if (existingWs) {
        try { existingWs.close(); } catch (err) {}
      }

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        setConnStatus('connected');
        setSocket(ws);
        
        // Immediately fetch rooms
        try {
          ws.send(JSON.stringify({ type: "get-rooms" }));
        } catch (e) {}
        safeResolve(ws);
      };

      ws.onmessage = (e) => {
        try {
          const action = JSON.parse(e.data);
          const { type, payload } = action;

          switch (type) {
            case "rooms-list": {
              setRooms(payload);
              break;
            }
            case "joined-successfully": {
              const { playerId: assignedId, roomState } = payload;
              setPlayerId(assignedId);
              setCurrentRoom(roomState);
              setActiveTrackId(roomState.trackId);
              setMyReadyState(false); // Reset state when joining a new room
              handleScreenChange('lobby');
              unlockAchievement("first_lobby");
              break;
            }
            case "player-joined": {
              setCurrentRoom((prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  players: {
                    ...prev.players,
                    [payload.id]: payload
                  }
                };
              });
              break;
            }
            case "player-left": {
              const { playerId: leavingId } = payload;
              setCurrentRoom((prev) => {
                if (!prev) return null;
                const nextPlayers = { ...prev.players };
                delete nextPlayers[leavingId];
                return {
                  ...prev,
                  players: nextPlayers
                };
              });
              break;
            }
            case "you-were-kicked": {
              audioSystem.playClick("high");
              alert(t("youWereKicked"));
              setCurrentRoom(null);
              handleScreenChange('landing');
              break;
            }
            case "player-ready-updated": {
              const { playerId: rPlayerId, isReady: isR } = payload;
              setCurrentRoom((prev) => {
                if (!prev) return null;
                const targetPlayer = prev.players[rPlayerId];
                if (!targetPlayer) return prev;
                return {
                  ...prev,
                  players: {
                    ...prev.players,
                    [rPlayerId]: {
                      ...targetPlayer,
                      isReady: isR
                    }
                  }
                };
              });
              break;
            }
            case "player-car-updated": {
              const { playerId: updatedPlayerId, carConfig: nextConf } = payload;
              setCurrentRoom((prev) => {
                if (!prev) return null;
                const targetPlayer = prev.players[updatedPlayerId];
                if (!targetPlayer) return prev;
                return {
                  ...prev,
                  players: {
                    ...prev.players,
                    [updatedPlayerId]: {
                      ...targetPlayer,
                      carConfig: nextConf
                    }
                  }
                };
              });
              break;
            }
            case "countdown-start": {
              setCurrentRoom((prev) => {
                if (!prev) return null;
                return { ...prev, state: 'countdown' };
              });
              handleScreenChange('race');
              break;
            }
            case "race-start": {
              setCurrentRoom((prev) => {
                if (!prev) return null;
                return { ...prev, state: 'racing' };
              });
              break;
            }
            case "webrtc-signal": {
              const { senderId, signal } = payload;
              receiveWebRTCSignal(senderId, signal).catch((err) => console.warn("WebRTC signal processing error:", err));
              break;
            }
            case "mic-status-updated": {
              const { playerId: micPlayerId, isMuted: micMuted } = payload;
              setCurrentRoom((prev) => {
                if (!prev) return null;
                const targetPlayer = prev.players[micPlayerId];
                if (!targetPlayer) return prev;
                return {
                  ...prev,
                  players: {
                    ...prev.players,
                    [micPlayerId]: {
                      ...targetPlayer,
                      isMuted: micMuted
                    }
                  }
                };
              });
              break;
            }
            case "chat-broadcast": {
              setChatLog((prev) => [
                ...prev,
                {
                  senderId: payload.senderId,
                  senderName: payload.senderName || "Racer",
                  message: payload.message,
                  time: payload.time || Date.now()
                }
              ].slice(-100));
              break;
            }
            case "race-over": {
              setCurrentRoom((prev) => {
                if (!prev) return null;
                return { ...prev, state: 'finished' };
              });
              break;
            }
          }
        } catch (error) {
          console.error("Networking state modification trigger error", error);
        }
      };

      ws.onclose = () => {
        if (socketRef.current === ws) {
          socketRef.current = null;
        }
        setConnStatus('disconnected');
        setSocket(null);
        setCurrentRoom(null);
      };

      ws.onerror = (err) => {
        if (socketRef.current === ws) {
          socketRef.current = null;
        }
        console.warn("WebSocket connection state warning", err);
        setConnStatus('disconnected');
        safeReject(err);
      };
    });
  };

  // Helper connection actions
  const fetchLobbiesList = () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "get-rooms" }));
    } else {
      connectToServer().catch((err) => {
        console.warn("Could not connect to server for lobbies list:", err);
      });
    }
  };

  const handleJoinOrCreateRoom = async (roomId: string, trackId: string) => {
    try {
      const activeWs = await connectToServer();
      activeWs.send(JSON.stringify({
        type: "join-room",
        payload: {
          roomId: roomId.trim().toUpperCase() || "MEGACITY",
          name: playerName,
          carConfig,
          trackId,
          team: playerTeam
        }
      }));
    } catch (e) {
      alert(t("serverConnectionError"));
    }
  };

  const handleToggleReady = () => {
    if (!socket || !currentRoom) return;
    const nextState = !myReadyState;
    setMyReadyState(nextState);
    socket.send(JSON.stringify({
      type: "ready-state",
      payload: { isReady: nextState }
    }));
  };

  const handleLeaveRoom = () => {
    if (socket) {
      try {
        socket.send(JSON.stringify({ type: "leave" }));
      } catch (e) {}
    }
    setCurrentRoom(null);
    setMyReadyState(false);
    handleScreenChange('landing');
    if (socket) {
      fetchLobbiesList();
    }
  };

  const handleAddAiBot = () => {
    audioSystem.playClick("medium");
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "add-ai-bot" }));
    }
  };

  const handleRemoveAiBot = (botId: string) => {
    audioSystem.playClick("low");
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "remove-ai-bot", payload: { botId } }));
    }
  };

  const handleKickPlayer = (targetPlayerId: string) => {
    audioSystem.playClick("high");
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "kick-player", payload: { targetPlayerId } }));
    }
  };

  const startPracticeRace = () => {
    setShowPracticeSetup(false);
    audioSystem.playClick("high");

    const practicePlayers: Record<string, Player> = {
      "local-player": {
        id: "local-player",
        name: playerName.trim() || t("playerSelf"),
        carConfig: carConfig,
        x: 0,
        y: 0.5,
        z: 0,
        ry: 0,
        speed: 0,
        steering: 0,
        lap: 1,
        progress: 0,
        bestTime: 0,
        isReady: true,
        team: playerTeam
      }
    };

    const aiNames = [
      t("aiAuri"),
      t("aiAlly"),
      t("aiSean"),
      t("aiMark")
    ];
    const aiPaints = ["#ef4444", "#3b82f6", "#10b981", "#ec4899"];
    const aiBodies = ["f1", "muscle", "coupe"] as const;
    const aiTeams = ["CPU", "INTEL", "NVIDIA", "AMD"];

    for (let i = 0; i < practiceBotCount; i++) {
      const botId = `ai-bot-${i + 1}`;
      practicePlayers[botId] = {
        id: botId,
        name: aiNames[i % aiNames.length],
        carConfig: {
          paint: aiPaints[i % aiPaints.length],
          wheelType: i % 2 === 0 ? "sport" : "retro",
          spoilerType: i % 3 === 0 ? "super" : i % 3 === 1 ? "sport" : "none",
          bodyStyle: aiBodies[i % aiBodies.length],
          engineLevel: practiceDifficulty === 'easy' ? 1 : practiceDifficulty === 'normal' ? 2 : 3,
          weightLevel: 3,
          gripLevel: 3
        },
        x: 0,
        y: 0.5,
        z: 0,
        ry: 0,
        speed: 0,
        steering: 0,
        lap: 1,
        progress: 0,
        bestTime: 0,
        isReady: true,
        team: aiTeams[i % aiTeams.length]
      };
    }

    setPlayerId("local-player");
    let finalTrackId = practiceTrackId;
    if (practiceTrackId === "random") {
      const allTracks = [...Object.values(TRACKS), ...Object.values(customTracks)] as Track[];
      if (allTracks.length > 0) {
        const randTrack = allTracks[Math.floor(Math.random() * allTracks.length)];
        finalTrackId = randTrack.id;
      } else {
        finalTrackId = "neon-grid";
      }
    }
    setActiveTrackId(finalTrackId);
    
    setCurrentRoom({
      id: "PRACTICE",
      state: 'countdown',
      players: practicePlayers
    });

    handleScreenChange('race');
  };

  const startEngineAndUnlockAudio = () => {
    audioSystem.init();
    setAudioUnlocked(true);
  };

  const shareApplicationLink = async () => {
    const shareData = {
      title: t("lobbyTitle"),
      text: `Join my 3D Room ${currentRoom ? currentRoom.id : ""}`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.warn("Share operation cancelled or failed:", err);
      }
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(window.location.href);
        alert(t("inviteAlert"));
      } catch (err) {
        console.warn("Clipboard access prevented:", err);
        alert(t("inviteAlert"));
      }
    } else {
      alert(t("inviteAlert"));
    }
  };

  const activeCountry = COUNTRIES_LIST.find(c => c.name === userCountry);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-white select-none font-sans">
      
      {/* GLOBAL NAVBAR HEADER */}
      {screen !== 'race' && (
        <header className="flex justify-between items-center bg-slate-900 px-6 py-4 border-b border-slate-800">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => handleScreenChange('landing')}>
            <div className="bg-gradient-to-r from-cyan-500 to-indigo-600 p-2 rounded-xl text-white shadow-lg">
              <Gauge className="w-6 h-6 animate-spin-slow" style={{ animationDuration: '6s' }} />
            </div>
            <div>
              <span className="text-sm font-black font-sans tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-500 block uppercase">
                TURBO RACER 3D
              </span>
              <span className="text-[10px] text-slate-400 block tracking-widest uppercase font-mono mt-0.5">
                {t("lobbyTitle")}
              </span>
            </div>
          </div>

          {/* Network and Action cluster */}
          <div className="flex items-center space-x-3">
            {/* Country / Region Picker Button */}
            <button
              onClick={() => {
                audioSystem.playClick("high");
                setShowOnboarding(true);
              }}
              title={t("changeCountry")}
              id="header-country-change-btn"
              className="flex items-center bg-slate-800/80 hover:bg-slate-750 text-slate-200 border border-slate-700 hover:border-cyan-500/50 rounded-xl px-2.5 py-1.5 transition text-xs font-black shadow-md cursor-pointer h-[32px]"
            >
              <MapPin className="w-3.5 h-3.5 text-pink-500 mr-1.5" />
              <span className="hidden sm:inline">
                {activeCountry ? `${activeCountry.flag} ${activeCountry.name}` : t("changeCountry")}
              </span>
              <span className="sm:hidden">
                {activeCountry ? activeCountry.flag : "🌍"}
              </span>
            </button>

            {/* Quick Language Dropdown Selector */}
            <LanguageSelector
              value={userLang}
              onChange={(newLang) => {
                setUserLang(newLang);
                safeStorage.setItem("giga_racer_user_lang", newLang);
              }}
              align="right"
            />

            <button
              onClick={() => {
                audioSystem.playClick("high");
                setShowSettingsModal(true);
              }}
              id="global-settings-trigger-btn"
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl transition text-xs font-black flex items-center space-x-2 cursor-pointer shadow-md hover:border-cyan-500/50"
            >
              <Settings className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t("customKeysBtn")}</span>
            </button>

            {/* Quick Immediate Reset All Data Button */}
            <button
              onClick={() => {
                audioSystem.playClick("high");
                safeStorage.clear();
                try {
                  localStorage.clear();
                  sessionStorage.clear();
                } catch (e) {
                  console.error(e);
                }
                window.location.reload();
              }}
              id="global-header-reset-btn"
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 rounded-xl transition text-xs font-black flex items-center space-x-1.5 cursor-pointer shadow-md hover:shadow-rose-600/20"
              title="立刻重設所有資料 (Reset All Data)"
            >
              <Trash2 className="w-3.5 h-3.5 text-white" />
              <span className="hidden md:inline">重設資料</span>
            </button>

            {connStatus === 'connected' && (
              <div className="flex items-center space-x-1.5 bg-cyan-950/40 border border-cyan-800/40 px-3 py-1.5 rounded-lg">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold text-cyan-400 uppercase">SERVER ONLINE</span>
              </div>
            )}

            {currentRoom && (
              <button
                onClick={shareApplicationLink}
                id="share-lobby-btn"
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition text-xs font-bold flex items-center space-x-2 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">{t("inviteFriendsBtn")}</span>
              </button>
            )}
          </div>
        </header>
      )}

      {/* WORKSPACE SCREEN SEGMENT ROUTER */}
      <main className={`flex-1 relative ${screen === 'race' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {screen === 'landing' && (
          <div id="landing-main-view" className="h-full w-full flex flex-col items-center justify-center p-6 bg-slate-950/90 relative overflow-y-auto">
            {/* Visual background atmospheric shapes */}
            <div className="absolute top-[20%] left-[20%] w-72 h-72 bg-cyan-500/10 rounded-full filter blur-3xl pointer-events-none" />
            <div className="absolute bottom-[20%] right-[20%] w-72 h-72 bg-pink-500/10 rounded-full filter blur-3xl pointer-events-none" />

            <motion.div
              initial={{ scale: 0.95, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: "spring", duration: 0.7, bounce: 0.15 }}
              className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative z-10 text-center"
            >
              <div className="w-16 h-16 bg-gradient-to-tr from-cyan-400 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-5">
                <Gauge className="w-9 h-9 text-white" />
              </div>

              <h1 className="text-2xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 tracking-wide">
                {t("createProfile")}
              </h1>
              <p className="text-xs text-slate-400 mt-2 mb-6 leading-relaxed">
                {t("profileSubtitle")}
              </p>

              <div className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">
                    {t("racerName")} (RACER INITIALS)
                  </label>
                  <input
                    type="text"
                    maxLength={15}
                    placeholder={t("racerNamePlaceholder")}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-slate-100 font-bold focus:outline-none focus:border-cyan-500 transition-all font-sans"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono flex justify-between items-center">
                    <span>{t("teamCode")} (TEAM CODE)</span>
                    {playerTeam && (
                      <span className="text-[10px] text-cyan-400 flex items-center space-x-1 font-mono">
                        <span>{getTeamFlag(playerTeam)}</span>
                        <span>{t("flagPreview")}</span>
                      </span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder={t("teamCodePlaceholder")}
                      value={playerTeam}
                      onChange={(e) => setPlayerTeam(e.target.value.toUpperCase().trim())}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3.5 text-slate-100 font-bold focus:outline-none focus:border-cyan-500 transition-all font-sans placeholder-slate-700 uppercase"
                    />
                    {playerTeam && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg">
                        {getTeamFlag(playerTeam)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reset button inside profile block */}
                <div className="pt-2">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => {
                      audioSystem.playClick("high");
                      safeStorage.clear();
                      try {
                        localStorage.clear();
                        sessionStorage.clear();
                      } catch (e) {
                        console.error(e);
                      }
                      window.location.reload();
                    }}
                    type="button"
                    className="w-full py-3.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/30 hover:border-rose-500/55 rounded-2xl text-rose-400 font-black text-xs tracking-widest uppercase transition-all duration-300 shadow-md flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>重設所有遊戲資料 (Reset All Data)</span>
                  </motion.button>
                </div>

                {/* Shortcuts action cards */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <motion.button
                    whileHover={{ scale: 1.03, translateY: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleScreenChange('garage')}
                    id="enter-garage-btn"
                    className="p-4 bg-slate-950 border border-slate-850 hover:border-pink-500/50 rounded-2xl text-left transition hover:shadow-lg hover:shadow-pink-500/5 group cursor-pointer"
                  >
                    <div className="bg-pink-500/10 p-2 rounded-xl w-8 h-8 flex items-center justify-center mb-3">
                      <Car className="w-4 h-4 text-pink-500" />
                    </div>
                    <span className="text-sm font-bold block group-hover:text-pink-400">{t("garageTitle")}</span>
                    <span className="text-[9px] text-slate-500 block mt-1">{t("garageDesc")}</span>
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.03, translateY: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      handleScreenChange('lobby');
                      fetchLobbiesList();
                    }}
                    id="goto-matchmaker-btn"
                    className="p-4 bg-slate-950 border border-slate-850 hover:border-cyan-500/50 rounded-2xl text-left transition hover:shadow-lg hover:shadow-cyan-500/5 group cursor-pointer"
                  >
                    <div className="bg-cyan-500/10 p-2 rounded-xl w-8 h-8 flex items-center justify-center mb-3">
                      <Users className="w-4 h-4 text-cyan-400" />
                    </div>
                    <span className="text-sm font-bold block group-hover:text-cyan-400">{t("lobby")}</span>
                    <span className="text-[9px] text-slate-500 block mt-1">{t("lobbyDesc")}</span>
                  </motion.button>
                </div>

                {/* Single Player Practice Hero Card */}
                <motion.button
                  whileHover={{ scale: 1.02, translateY: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    audioSystem.playClick("medium");
                    setShowPracticeSetup(true);
                  }}
                  id="goto-practice-setup-btn"
                  className="w-full mt-3 p-4 bg-gradient-to-r from-cyan-950/40 to-indigo-950/40 border border-cyan-500/50 hover:border-cyan-400 rounded-2xl text-left transition hover:shadow-lg hover:shadow-cyan-500/10 group flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                    <div className="bg-cyan-500/15 p-2.5 rounded-xl w-10 h-10 flex items-center justify-center flex-shrink-0">
                      <Play className="w-5 h-5 text-cyan-400 fill-cyan-400/20 animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-bold block group-hover:text-cyan-300 truncate">{t("singlePlayerPractice")}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 truncate">{t("singlePlayerPracticeDesc")}</span>
                    </div>
                  </div>
                  <div className="bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-xl text-right flex-shrink-0">
                    <span className="text-xs font-mono font-bold text-cyan-400 block">OFFLINE</span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-500 block font-mono">PRACTICE</span>
                  </div>
                </motion.button>

                {/* Custom Track Editor Card */}
                <motion.button
                  whileHover={{ scale: 1.02, translateY: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    audioSystem.playClick("medium");
                    setScreen('track-editor');
                  }}
                  id="goto-track-editor-btn"
                  className="w-full mt-3 p-4 bg-gradient-to-r from-violet-950/40 to-fuchsia-950/40 border border-violet-500/50 hover:border-violet-400 rounded-2xl text-left transition hover:shadow-lg hover:shadow-violet-500/10 group flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                    <div className="bg-violet-500/15 p-2.5 rounded-xl w-10 h-10 flex items-center justify-center flex-shrink-0">
                      <Layers className="w-5 h-5 text-violet-400 animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-bold block group-hover:text-violet-300 truncate">{t("trackEditorTitle")}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 truncate">{t("trackEditorDesc")}</span>
                    </div>
                  </div>
                  <div className="bg-violet-500/10 border border-violet-500/20 px-3 py-1.5 rounded-xl text-right flex-shrink-0">
                    <span className="text-xs font-mono font-bold text-violet-400 block">CREATOR</span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-500 block font-mono">TRACK BUILD</span>
                  </div>
                </motion.button>

                {/* Wide Achievements Wall action card */}
                <motion.button
                  whileHover={{ scale: 1.02, translateY: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleScreenChange('achievements')}
                  id="goto-achievements-btn"
                  className="w-full mt-3 p-4 bg-slate-950 border border-slate-850 hover:border-amber-500/50 rounded-2xl text-left transition hover:shadow-lg hover:shadow-amber-500/5 group flex items-center justify-between gap-3 cursor-pointer"
                >
                  <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                    <div className="bg-amber-500/10 p-2.5 rounded-xl w-10 h-10 flex items-center justify-center flex-shrink-0">
                      <Award className="w-5 h-5 text-amber-500 animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-bold block group-hover:text-amber-400 truncate">{t("achievementsWall")}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 truncate">{t("achievementsWallDesc")}</span>
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-right flex-shrink-0">
                    <span className="text-xs font-mono font-bold text-amber-400 block">
                      {achStats.unlocked} / {achStats.total}
                    </span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-500 block font-mono">{t("unlockedLabel")}</span>
                  </div>
                </motion.button>

                {/* Download and Install Game App Card */}
                <div className="w-full mt-3 p-4 bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-teal-950/40 border border-emerald-500/30 rounded-2xl text-left flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                    <div className="bg-emerald-500/20 p-2.5 rounded-xl w-10 h-10 flex items-center justify-center flex-shrink-0 border border-emerald-500/30">
                      <Download className="w-5 h-5 text-emerald-400 animate-bounce" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-bold block text-slate-100 leading-snug">{t("pwaDownloadTitle")}</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">{t("pwaDownloadDesc")}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 flex-shrink-0 w-full lg:w-auto">
                    {/* Direct Offline Game File Download Button */}
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      type="button"
                      onClick={handleDownloadGameFile}
                      className="flex-1 sm:flex-none px-3.5 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 rounded-xl text-xs font-black tracking-normal whitespace-nowrap cursor-pointer transition text-center shadow-lg shadow-emerald-950/40 flex items-center justify-center space-x-1.5"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>{t("downloadOfflineGameFile")}</span>
                    </motion.button>

                    {/* PWA Install Button */}
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      type="button"
                      onClick={async () => {
                        try {
                          if (deferredPrompt) {
                            audioSystem.playClick("high");
                            deferredPrompt.prompt();
                            const { outcome } = await deferredPrompt.userChoice;
                            if (outcome === 'accepted') {
                              setDeferredPrompt(null);
                            }
                          } else if (isInIframe) {
                            audioSystem.playClick("high");
                            handleOpenInNewWindow();
                          } else {
                            audioSystem.playClick("medium");
                            setShowInstallGuide(true);
                          }
                        } catch (err) {
                          console.warn("PWA install prompt error:", err);
                        }
                      }}
                      className="flex-1 sm:flex-none px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-300 rounded-xl text-xs font-bold tracking-normal whitespace-nowrap cursor-pointer transition text-center flex items-center justify-center space-x-1"
                    >
                      <span>{isAppInstalled ? t("pwaInstalled") : t("pwaOneClick")}</span>
                    </motion.button>

                    {/* Manual Guide / Download Center */}
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      type="button"
                      onClick={() => {
                        audioSystem.playClick("high");
                        setShowInstallGuide(true);
                      }}
                      className="flex-1 sm:flex-none px-3 py-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold tracking-normal whitespace-nowrap cursor-pointer transition text-center"
                    >
                      {t("pwaManualGuide")}
                    </motion.button>
                  </div>
                </div>

                {/* Iframe PWA & Download Notice */}
                {isInIframe && (
                  <div className="w-full mt-2 p-3 bg-gradient-to-r from-rose-950/30 to-slate-900/50 border border-rose-500/30 rounded-xl text-left flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center space-x-2 text-[11px] text-rose-300 font-medium">
                      <span className="flex-shrink-0 inline-block w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                      <span>{t("pwaIframeWarning")}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={handleOpenInNewWindow}
                        className="px-3 py-1.5 bg-rose-500 hover:bg-rose-400 text-slate-950 text-[11px] font-black rounded-lg cursor-pointer transition flex items-center space-x-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>{t("openInNewWindow")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadGameFile}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-emerald-400 text-[11px] font-bold rounded-lg cursor-pointer transition flex items-center space-x-1"
                      >
                        <FileDown className="w-3 h-3" />
                        <span>{t("downloadOfflineGameFile")}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Information bottom bar */}
              <div className="mt-8 pt-5 border-t border-slate-800 text-[10px] text-slate-500 text-left font-sans leading-normal">
                <span className="font-bold text-slate-400 block mb-1">{t("controlsGuide")}</span>
                {t("controlW")}<br />
                {t("controlS")}<br />
                {t("controlAD")}<br />
                {t("controlSpace")}<br />
                {t("controlEnter")}
              </div>
            </motion.div>

            {/* Offline Practice Setup Overlay Modal */}
            <AnimatePresence>
              {showPracticeSetup && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
                >
                  <motion.div
                    initial={{ scale: 0.92, y: 15, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.95, y: 10, opacity: 0 }}
                    transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
                    className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative z-55"
                  >
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-cyan-600/20 border border-cyan-500/30 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-cyan-400 font-mono shadow-md">
                      OFFLINE TESTING LAB
                    </div>

                    <h2 className="text-xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 tracking-wide text-center mt-2 mb-5">
                      🏎️ {t("configureSingleRace")}
                    </h2>
                    
                    <div className="space-y-4 text-left">
                      {/* Track Selection */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">
                          {t("chooseTrack")}
                        </label>
                        <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto pr-1">
                          {/* Random Track Option */}
                          <motion.button
                            whileHover={{ scale: 1.015 }}
                            whileTap={{ scale: 0.985 }}
                            type="button"
                            onClick={() => {
                              audioSystem.playClick("medium");
                              setPracticeTrackId("random");
                            }}
                            className={`p-3 rounded-xl border text-left flex justify-between items-center transition cursor-pointer w-full ${
                              practiceTrackId === "random"
                                ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                                : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                            }`}
                          >
                            <div className="pr-4">
                              <span className="text-sm font-bold block text-slate-200">
                                🎲 {t("randomTrack")}
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5 leading-snug">
                                {t("randomTrackDesc")}
                              </span>
                            </div>
                            <span className="text-[8px] uppercase font-mono font-bold px-2 py-0.5 rounded flex-shrink-0 border bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                              RANDOM
                            </span>
                          </motion.button>

                          {([...Object.values(TRACKS), ...Object.values(customTracks)] as Track[]).map((tVal) => {
                            const isCustom = !TRACKS[tVal.id];
                            return (
                              <motion.button
                                whileHover={{ scale: 1.015 }}
                                whileTap={{ scale: 0.985 }}
                                key={tVal.id}
                                type="button"
                                onClick={() => {
                                  audioSystem.playClick("medium");
                                  setPracticeTrackId(tVal.id);
                                }}
                                className={`p-3 rounded-xl border text-left flex justify-between items-center transition cursor-pointer w-full ${
                                  practiceTrackId === tVal.id
                                    ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_12px_rgba(6,182,212,0.1)]'
                                    : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                                }`}
                              >
                                <div className="pr-4">
                                  <span className="text-sm font-bold block text-slate-200">
                                    {isCustom && <span className="text-violet-400 font-mono text-[10px] mr-2 border border-violet-500/30 px-1 py-0.5 rounded bg-violet-500/10 font-bold">{t("customBuild")}</span>}
                                    {getTrackName(tVal.id, tVal.name)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 block mt-0.5 leading-snug">{isCustom ? (tVal.description || t("customTrackDesc")) : getTrackDesc(tVal.id, tVal.description)}</span>
                                </div>
                                <span className={`text-[8px] uppercase font-mono font-bold px-2 py-0.5 rounded flex-shrink-0 border ${
                                  tVal.difficulty === 'easy' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                  tVal.difficulty === 'medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                  'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                  {tVal.difficulty}
                                </span>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>

                      {/* AI Competitors selection */}
                      <div className="grid grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                            {t("aiBots")}
                          </label>
                          <select
                            value={practiceBotCount}
                            onChange={(e) => {
                              audioSystem.playClick("medium");
                              setPracticeBotCount(Number(e.target.value));
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-bold focus:outline-none focus:border-cyan-500 transition-all cursor-pointer"
                          >
                            <option value={1}>{t("aiBotsUnit1")}</option>
                            <option value={2}>{t("aiBotsUnit2")}</option>
                            <option value={3}>{t("aiBotsUnit3")}</option>
                            <option value={4}>{t("aiBotsUnit4")}</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                            {t("difficultyLabel")}
                          </label>
                          <select
                            value={practiceDifficulty}
                            onChange={(e) => {
                              audioSystem.playClick("medium");
                              setPracticeDifficulty(e.target.value as any);
                            }}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-100 font-bold focus:outline-none focus:border-cyan-500 transition-all cursor-pointer"
                          >
                            <option value="easy">{t("difficultyEasy")}</option>
                            <option value="normal">{t("difficultyNormal")}</option>
                            <option value="hard">{t("difficultyHard")}</option>
                          </select>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex space-x-3 pt-3">
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          type="button"
                          onClick={() => {
                            audioSystem.playClick("medium");
                            setShowPracticeSetup(false);
                          }}
                          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl font-bold transition text-[11px] uppercase tracking-widest cursor-pointer"
                        >
                          {t("cancel")}
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          type="button"
                          onClick={startPracticeRace}
                          className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl font-bold transition text-[11px] uppercase tracking-widest cursor-pointer shadow-lg shadow-cyan-500/20"
                        >
                          {t("start")}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Offline App Download & Install Instructions Modal */}
            <AnimatePresence>
              {showInstallGuide && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-55 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
                >
                  <motion.div
                    initial={{ scale: 0.92, y: 15, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.95, y: 10, opacity: 0 }}
                    transition={{ type: "spring", duration: 0.4, bounce: 0.15 }}
                    className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative z-55 overflow-y-auto max-h-[90vh]"
                  >
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-emerald-600/20 border border-emerald-500/30 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-emerald-400 font-mono shadow-md">
                      APP DOWNLOAD CENTER
                    </div>

                    <h2 className="text-xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-400 tracking-wide text-center mt-2 mb-4">
                      {t("pwaGuideTitle")}
                    </h2>

                    <div className="space-y-4 text-xs text-slate-300 leading-relaxed text-left">
                      {/* Top Action Box: 1-Click Offline Download & New Tab */}
                      <div className="p-4 bg-gradient-to-br from-emerald-950/60 to-slate-950/80 border border-emerald-500/40 rounded-2xl space-y-3">
                        <div className="flex items-center space-x-2">
                          <FileDown className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                          <div>
                            <h3 className="font-black text-sm text-emerald-300">{t("downloadOfflineGameFile")}</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">{t("downloadOfflineGameDesc")}</p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 pt-1">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={() => {
                              handleDownloadGameFile();
                            }}
                            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50 cursor-pointer transition"
                          >
                            <Download className="w-4 h-4" />
                            <span>{t("downloadOfflineGameFile")}</span>
                          </motion.button>

                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="button"
                            onClick={handleOpenInNewWindow}
                            className="py-2.5 px-4 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center space-x-1.5 cursor-pointer transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>{t("openInNewWindow")}</span>
                          </motion.button>
                        </div>
                      </div>

                      <p className="text-slate-400 pb-2 border-b border-slate-800">
                        {t("pwaGuideSubtitle")}
                      </p>

                      <div>
                        <h3 className="font-bold text-emerald-400 text-[13px] mb-1">{t("pwaIosTitle")}</h3>
                        <ul className="list-decimal list-inside space-y-1 pl-1">
                          <li>{t("pwaIosStep1")}</li>
                          <li>{t("pwaIosStep2")}</li>
                          <li>{t("pwaIosStep3")}</li>
                          <li>{t("pwaIosStep4")}</li>
                        </ul>
                      </div>

                      <div>
                        <h3 className="font-bold text-emerald-400 text-[13px] mb-1">{t("pwaAndroidTitle")}</h3>
                        <ul className="list-decimal list-inside space-y-1 pl-1">
                          <li>{t("pwaAndroidStep1")}</li>
                          <li>{t("pwaAndroidStep2")}</li>
                          <li>{t("pwaAndroidStep3")}</li>
                        </ul>
                      </div>

                      <div>
                        <h3 className="font-bold text-emerald-400 text-[13px] mb-1">{t("pwaPcTitle")}</h3>
                        <ul className="list-decimal list-inside space-y-1 pl-1">
                          <li>{t("pwaPcStep1")}</li>
                          <li>{t("pwaPcStep2")}</li>
                        </ul>
                      </div>

                      <div className="bg-slate-950/85 p-3.5 rounded-2xl border border-slate-850 mt-2">
                        <h3 className="font-bold text-cyan-400 text-[12px] mb-1.5 flex items-center space-x-1.5">
                          <span>{t("pwaZipTitle")}</span>
                        </h3>
                        <div className="text-[10px] text-slate-400 leading-relaxed pl-0.5 space-y-1">
                          <p>{t("pwaZipStep1")}</p>
                          <p>{t("pwaZipStep2")}</p>
                          <p>{t("pwaZipStep3")}</p>
                          <p>{t("pwaZipStep4")}</p>
                          <pre className="p-1 px-2 bg-slate-900 rounded border border-slate-800 text-[9px] text-emerald-400 font-mono w-full overflow-x-auto">npm install &amp;&amp; npm run dev</pre>
                          <p>{t("pwaZipStep5")}</p>
                        </div>
                      </div>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={() => {
                          audioSystem.playClick("low");
                          setShowInstallGuide(false);
                        }}
                        className="w-full mt-4 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl transition text-[11px] uppercase tracking-widest cursor-pointer text-center block"
                      >
                        {t("pwaGuideClose")}
                      </motion.button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {screen === 'garage' && (
          <CarGarage
            config={carConfig}
            onChange={(next) => {
              setCarConfig(next);
              // Send the updated carConfig to the server if in a lobby
              if (socket && socket.readyState === WebSocket.OPEN && currentRoom) {
                socket.send(JSON.stringify({
                  type: "update-car-config",
                  payload: { carConfig: next }
                }));
              }
            }}
            onConfirm={() => {
              // Redirect back to lobby if we are already in a room, otherwise landing page
              if (currentRoom) {
                setScreen('lobby');
              } else {
                setScreen('landing');
              }
            }}
          />
        )}

        {screen === 'lobby' && (
          <LobbyList
            rooms={rooms}
            currentJoinedRoom={currentRoom}
            playerId={playerId}
            myReadyState={myReadyState}
            onRefreshRooms={fetchLobbiesList}
            onJoinOrCreateRoom={handleJoinOrCreateRoom}
            onToggleReady={handleToggleReady}
            onOpenGarage={() => setScreen('garage')}
            isMuted={isMuted}
            onToggleMute={toggleMute}
            permissionError={permissionError}
            onAddAiBot={handleAddAiBot}
            onRemoveAiBot={handleRemoveAiBot}
            onKickPlayer={handleKickPlayer}
            chatLog={chatLog}
            onSendChatMessage={handleSendChatMessage}
            playerName={playerName}
          />
        )}

        {screen === 'race' && currentRoom && (
          <GameCanvas
            socket={socket}
            playerId={playerId}
            roomId={currentRoom.id}
            track={TRACKS[activeTrackId] || customTracks[activeTrackId] || TRACKS["neon-grid"]}
            myCarConfig={carConfig}
            initialPlayers={currentRoom.players}
            roomState={currentRoom.state}
            onBackToLobby={handleLeaveRoom}
            chatLog={chatLog}
            onSendChatMessage={handleSendChatMessage}
            onAddChatMessage={handleAddChatMessage}
          />
        )}

        {screen === 'achievements' && (
          <AchievementDashboard onReturn={() => setScreen('landing')} />
        )}

        {screen === 'track-editor' && (
          <TrackEditor
            onBackToLobby={() => {
              audioSystem.playClick("low");
              setScreen('landing');
            }}
            onInstantPlay={handleInstantPlayCustomTrack}
            savedTracks={customTracks}
            onSaveTrack={handleSaveTrack}
          />
        )}
      </main>

      {/* FLOATING TOAST MANAGER FOR REAL-TIME DECORATIONS */}
      <AchievementToastManager />

      {/* GLOBAL SETTINGS AND KEYBINDINGS MODAL */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 10, opacity: 0 }}
              transition={{ type: "spring", duration: 0.45, bounce: 0.15 }}
              className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-y-auto max-h-[90vh] text-slate-200"
            >
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-cyan-600/20 border border-cyan-500/30 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest text-cyan-400 font-mono shadow-md">
                CYBER CONTROL PANEL
              </div>

            <h2 className="text-xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-indigo-400 tracking-wide text-center mt-2 mb-4">
              ⚙️ {t("systemSettings")}
            </h2>

            <div className="space-y-4">
              {/* Language & Country inside Settings */}
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-850/60 space-y-3">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono flex justify-between">
                  <span>{t("language")} & {t("currentCountry")}</span>
                  <button
                    type="button"
                    onClick={() => {
                      audioSystem.playClick("high");
                      setShowOnboarding(true);
                    }}
                    className="text-cyan-400 hover:underline text-[9px] font-bold uppercase tracking-widest cursor-pointer"
                  >
                    {t("changeCountry")}
                  </button>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-xl border border-slate-850/40">
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xl">
                      {COUNTRIES_LIST.find(c => c.name === userCountry)?.flag || "🌐"}
                    </span>
                    <span className="text-xs font-bold text-slate-200">{userCountry || "Not Set"}</span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <LanguageSelector
                      value={userLang}
                      onChange={(newLang) => {
                        setUserLang(newLang);
                        safeStorage.setItem("giga_racer_user_lang", newLang);
                      }}
                      align="right"
                    />
                  </div>
                </div>
              </div>

              {/* Profile Config inside Settings */}
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-850/60 space-y-3.5">
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                  {t("profileAndTeam")}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">
                      {t("racerName")} (RACER NAME)
                    </label>
                    <input
                      type="text"
                      maxLength={15}
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-cyan-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 flex justify-between">
                      <span>{t("teamCode")} (TEAM)</span>
                      {playerTeam && <span className="text-cyan-400 font-mono">{getTeamFlag(playerTeam)}</span>}
                    </label>
                    <input
                      type="text"
                      maxLength={6}
                      value={playerTeam}
                      onChange={(e) => setPlayerTeam(e.target.value.toUpperCase().trim())}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 font-bold focus:outline-none focus:border-cyan-500 transition-all uppercase placeholder-slate-700"
                      placeholder="SPEED"
                    />
                  </div>
                </div>
              </div>

              {/* Keybindings customization list */}
              <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-850/60">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
                    {t("keyboardBindings")}
                  </span>
                  {activeRecordingAction && (
                    <span className="text-[10px] text-amber-400 animate-pulse font-mono font-bold">
                      {t("recordingKey")}
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  {[
                    { id: "accelerate", keyLabel: "accelerate" },
                    { id: "brake", keyLabel: "brake" },
                    { id: "left", keyLabel: "left" },
                    { id: "right", keyLabel: "right" },
                    { id: "drift", keyLabel: "drift" },
                    { id: "nitro", keyLabel: "nitro" },
                  ].map((act) => {
                    const isRecording = activeRecordingAction === act.id;
                    const binding = (keybindings as any)[act.id] || { label: "未指派" };

                    return (
                      <div key={act.id} className="flex items-center justify-between p-2.5 bg-slate-900/60 border border-slate-850/40 rounded-xl hover:border-slate-800/80 transition-all">
                        <span className="text-xs font-bold text-slate-300">{t(act.keyLabel)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            audioSystem.playClick("high");
                            setActiveRecordingAction(isRecording ? null : act.id);
                          }}
                          className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all border min-w-[120px] cursor-pointer text-center ${
                            isRecording
                              ? "bg-amber-500/20 text-amber-400 border-amber-500 animate-pulse"
                              : "bg-slate-950 hover:bg-slate-800 text-cyan-400 border-slate-800 hover:border-cyan-500/40"
                          }`}
                        >
                          {isRecording ? t("pressAnyKey") : binding.label}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Danger Zone (Reset All Game Data) */}
              <div className="bg-rose-950/20 p-4 rounded-2xl border border-rose-500/30 space-y-3">
                <div className="text-[10px] font-bold text-rose-400 uppercase tracking-widest font-mono flex items-center space-x-2">
                  <span className="inline-block w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
                  <span>{t("dangerZone")}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <p className="text-[10px] text-slate-400 leading-relaxed">
                    清除所有遊戲進度、客製化車型、按鍵映射，並重新選擇您的國家。
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    type="button"
                    onClick={() => {
                      audioSystem.playClick("high");
                      safeStorage.clear();
                      window.location.reload();
                    }}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-md shadow-rose-600/10 cursor-pointer flex-shrink-0 text-center"
                  >
                    🗑️ {t("resetAllData")}
                  </motion.button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3 pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    audioSystem.playClick("low");
                    const defaults = {
                      accelerate: { key: "w", code: "KeyW", label: "W" },
                      brake: { key: "s", code: "KeyS", label: "S" },
                      left: { key: "a", code: "KeyA", label: "A" },
                      right: { key: "d", code: "KeyD", label: "D" },
                      drift: { key: " ", code: "Space", label: "Spacebar ⌴" },
                      nitro: { key: "shift", code: "ShiftLeft", label: "L-Shift ⇧" }
                    };
                    setKeybindings(defaults);
                    safeStorage.setItem("cyber_race_keybindings", JSON.stringify(defaults));
                  }}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl font-bold transition text-xs font-mono tracking-wider cursor-pointer text-center"
                >
                  {t("resetToDefault")}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => {
                    audioSystem.playClick("low");
                    setShowSettingsModal(false);
                    setActiveRecordingAction(null);
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl font-black transition text-xs tracking-wider cursor-pointer text-center shadow-lg shadow-cyan-500/10"
                >
                  {t("saveAndClose")}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showOnboarding && (
          <OnboardingModal
            currentLanguage={userLang}
            onConfirm={handleOnboardingConfirm}
            onClose={() => setShowOnboarding(false)}
            onLanguageChange={(lang) => {
              setUserLang(lang);
              safeStorage.setItem("giga_racer_user_lang", lang);
            }}
          />
        )}
      </AnimatePresence>

      {translating && (
        <div className="fixed bottom-4 left-4 z-[9999] flex items-center space-x-2.5 bg-slate-900/90 border border-cyan-500/30 text-cyan-400 px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md animate-bounce text-xs font-bold font-mono">
          <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          <span>Localizing UI ({LANGUAGE_FULL_LABELS[userLang] || userLang})...</span>
        </div>
      )}

      {/* Download Success Toast Notification */}
      <AnimatePresence>
        {showDownloadToast && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[9999] max-w-md bg-gradient-to-r from-emerald-900/90 to-teal-900/90 border border-emerald-400/50 text-emerald-100 p-4 rounded-2xl shadow-2xl backdrop-blur-md flex items-center space-x-3.5"
          >
            <div className="p-2 bg-emerald-500/20 rounded-xl flex-shrink-0 border border-emerald-500/30">
              <Check className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <div className="font-bold text-xs text-white leading-tight">{t("downloadSuccessToast")}</div>
              <div className="text-[10px] text-emerald-200/80 mt-0.5 leading-snug">
                Giga_Racer_3D_Offline_Game.html
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
