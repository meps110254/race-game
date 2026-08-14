import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CarConfig, Player, Track, ChatMessage } from "../types";
import { build3DCar } from "../utils/carBuilder";
import { getTrackSplinePoint, getClosestTimeOnTrack, getDistanceFromTrackCenter } from "../tracks";
import { Gauge, Flag, Timer, Zap, Trophy, ShieldAlert, ArrowLeft, MessageSquare } from "lucide-react";
import { unlockAchievement } from "../utils/achievementSystem";
import { getTeamFlag } from "../utils/teamUtils";
import { audioSystem } from "../utils/audioSystem";
import { PodiumCeremony } from "./PodiumCeremony";
import { t, getTrackName, getTrackDesc } from "../utils/i18n";
import { safeStorage } from "../utils/storage";

const makeGhostly = (obj: THREE.Object3D) => {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => {
          const m = mat.clone();
          m.transparent = true;
          m.opacity = 0.35;
          if ('color' in m) {
            (m as any).color.setHex(0x08e8f4); // Cyberpunk bright neon cyan
          }
          m.depthWrite = false;
          return m;
        });
      } else if (mesh.material) {
        const m = mesh.material.clone();
        m.transparent = true;
        m.opacity = 0.35;
        if ('color' in m) {
          (m as any).color.setHex(0x08e8f4); // Cyberpunk bright neon cyan
        }
        m.depthWrite = false;
        mesh.material = m;
      }
    }
  });
};

export class ReplayRingBuffer {
  buffer: { x: number; y: number; z: number; ry: number; speed: number; steering: number }[];
  capacity: number;
  writeIndex: number = 0;
  count: number = 0;

  constructor(capacity: number = 2500) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(frame: { x: number; y: number; z: number; ry: number; speed: number; steering: number }) {
    this.buffer[this.writeIndex] = frame;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  clear() {
    this.writeIndex = 0;
    this.count = 0;
  }

  getOrderedFrames() {
    const list: { x: number; y: number; z: number; ry: number; speed: number; steering: number }[] = [];
    if (this.size === 0) return list; // size fallback below
    const activeCount = this.count;
    if (activeCount < this.capacity) {
      for (let i = 0; i < activeCount; i++) {
        list.push(this.buffer[i]);
      }
    } else {
      for (let i = 0; i < this.capacity; i++) {
        const idx = (this.writeIndex + i) % this.capacity;
        list.push(this.buffer[idx]);
      }
    }
    return list;
  }

  // Backwards compatibility with standard size/length getters
  get size() {
    return this.count;
  }
}

export function getTrackHeightAtT(track: Track, t: number): number {
  const normT = ((t % 1) + 1) % 1;
  
  // We want to add an elevated high-altitude area (高架路段) between t = 0.38 and t = 0.62
  if (normT >= 0.38 && normT <= 0.62) {
    if (normT < 0.45) {
      // Ramp Up
      const pct = (normT - 0.38) / (0.45 - 0.38);
      const smoothPct = Math.sin(pct * Math.PI / 2);
      return 0.01 + smoothPct * 12.0;
    } else if (normT > 0.55) {
      // Ramp Down
      const pct = (0.62 - normT) / (0.62 - 0.55);
      const smoothPct = Math.sin(pct * Math.PI / 2);
      return 0.01 + smoothPct * 12.0;
    } else {
      // Peak high-altitude flyover flat bridge
      return 12.01;
    }
  }
  return 0.01;
}

export function getModifiedTrackSplinePoint(trackSpline: THREE.CatmullRomCurve3, t: number): THREE.Vector3 {
  const normT = ((t % 1) + 1) % 1;
  if (normT >= 0.28 && normT <= 0.38) {
    const pStart = trackSpline.getPointAt(0.28);
    const pEnd = trackSpline.getPointAt(0.38);
    const pct = (normT - 0.28) / (0.38 - 0.28);
    return new THREE.Vector3().lerpVectors(pStart, pEnd, pct);
  }
  return trackSpline.getPointAt(normT);
}

export function getModifiedTrackSplineTangent(trackSpline: THREE.CatmullRomCurve3, t: number): THREE.Vector3 {
  const normT = ((t % 1) + 1) % 1;
  if (normT >= 0.28 && normT <= 0.38) {
    const pStart = trackSpline.getPointAt(0.28);
    const pEnd = trackSpline.getPointAt(0.38);
    return new THREE.Vector3().subVectors(pEnd, pStart).normalize();
  }
  return trackSpline.getTangentAt(normT);
}

interface GameCanvasProps {
  socket: WebSocket | null;
  playerId: string;
  roomId: string;
  track: Track;
  myCarConfig: CarConfig;
  initialPlayers: Record<string, Player>;
  roomState: 'lobby' | 'countdown' | 'racing' | 'finished';
  onBackToLobby: () => void;
  chatLog?: ChatMessage[];
  onSendChatMessage?: (msg: string) => void;
  onAddChatMessage?: (msg: ChatMessage) => void;
}

export default function GameCanvas({
  socket,
  playerId,
  roomId,
  track,
  myCarConfig,
  initialPlayers,
  roomState: initialRoomState,
  onBackToLobby,
  chatLog: propsChatLog = [],
  onSendChatMessage,
  onAddChatMessage
}: GameCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  const formatRaceTimeLocal = (ms: number) => {
    if (!ms || isNaN(ms)) return "00.00";
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const centiseconds = Math.floor((ms % 1000) / 10);
    
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}.${centiseconds.toString().padStart(2, '0')}s`;
  };

  const trackLength = React.useMemo(() => {
    if (!track || !track.points || track.points.length === 0) return 1000;
    let len = 0;
    for (let i = 0; i < track.points.length - 1; i++) {
      const p1 = track.points[i];
      const p2 = track.points[i+1];
      len += Math.sqrt(Math.pow(p2[0] - p1[0], 2) + Math.pow(p2[1] - p1[1], 2));
    }
    if (!track.isOpen && track.points.length > 1) {
      const pFirst = track.points[0];
      const pLast = track.points[track.points.length - 1];
      len += Math.sqrt(Math.pow(pFirst[0] - pLast[0], 2) + Math.pow(pFirst[1] - pLast[1], 2));
    }
    return Math.round(len);
  }, [track]);

  const addRivalRef = useRef<(p: Player) => void>(() => {});
  const removeRivalRef = useRef<(id: string) => void>(() => {});

  // States
  const [roomState, setRoomState] = useState(initialRoomState);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [rpm, setRpm] = useState(1000);
  const [gear, setGear] = useState("N");
  const [steeringInput, setSteeringInput] = useState(0);
  const [isHandbrakeActive, setIsHandbrakeActive] = useState(false);
  const [lap, setLap] = useState(1);
  const [bestLapTime, setBestLapTime] = useState<number | null>(null);
  const [currentLapTime, setCurrentLapTime] = useState(0);
  const [completedLapTimes, setCompletedLapTimes] = useState<number[]>([]);
  const [latestLapBanner, setLatestLapBanner] = useState<{ lap: number; time: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<{ name: string; progress: number; lap: number; finished: boolean; bestTime: number }[]>([]);
  const [rivalTags, setRivalTags] = useState<{ id: string; name: string; x: number; y: number; visible: boolean; distance: number; rank: number; color: string }[]>([]);
  const leaderboardRef = useRef<any[]>([]);
  const rivalTagsRef = useRef<any[]>([]);
  const [isFinished, setIsFinished] = useState(false);
  const [finishTime, setFinishTime] = useState<number | null>(null);
  
  // Local race records persistence (User's personal records)
  const [lastSavedFinishTime, setLastSavedFinishTime] = useState<number | null>(null);
  const [allTimeBestLap, setAllTimeBestLap] = useState<number | null>(null);

  useEffect(() => {
    if (track?.id) {
      const savedLastFinish = safeStorage.getItem(`giga_racer_last_finish_time_${track.id}`);
      const savedBestLap = safeStorage.getItem(`giga_racer_all_time_best_lap_${track.id}`);
      
      setLastSavedFinishTime(savedLastFinish ? parseFloat(savedLastFinish) : null);
      setAllTimeBestLap(savedBestLap ? parseFloat(savedBestLap) : null);
    }
  }, [track?.id]);

  const chatLog = propsChatLog;
  const addChatMessage = (msg: ChatMessage) => {
    if (onAddChatMessage) {
      onAddChatMessage(msg);
    }
  };
  const [chatInput, setChatInput] = useState("");
  const [isChatActive, setIsChatActive] = useState(false);
  const isChatActiveRef = useRef(false);

  const setChatActiveState = (active: boolean) => {
    setIsChatActive(active);
    isChatActiveRef.current = active;
  };
  const [offroadWarning, setOffroadWarning] = useState(false);
  const [isInPitLane, setIsInPitLane] = useState(false);
  const [pitRepairing, setPitRepairing] = useState(false);
  const [pitRefueling, setPitRefueling] = useState(false);
  const [pitCompleteAnimation, setPitCompleteAnimation] = useState(false);
  
  const isInPitLaneRef = useRef(false);
  const pitAlertShownRef = useRef(false);
  const [highAltitudeAlert, setHighAltitudeAlert] = useState<string | null>(null);
  const [raceTime, setRaceTime] = useState(0);
  const [showSpeedometer, setShowSpeedometer] = useState(true);
  const [isLeaderboardCollapsed, setIsLeaderboardCollapsed] = useState(false);
  const [currentWeather, setCurrentWeather] = useState<'sunny' | 'rainy' | 'foggy' | 'snowy'>('sunny');
  const [nitroEnergy, setNitroEnergy] = useState(100);
  const [isNitroActive, setIsNitroActive] = useState(false);
  const [nitroCooldown, setNitroCooldown] = useState(0); // remaining cooldown in seconds

  // Vehicle Damage States & Ref
  const [damagePercent, setDamagePercent] = useState(0);
  const damageRef = useRef(0);
  const [isExploded, setIsExploded] = useState(false);
  const isExplodedRef = useRef(false);
  const explosionTimerRef = useRef(0);

  // Custom telemetry metrics tracking refs
  const nitroUsedCountRef = useRef<number>(0);
  const driftDurationRef = useRef<number>(0);
  const collisionCountRef = useRef<number>(0);

  // 3D Exhaust Emitters & Point Lights
  const leftExhaustFlameRef = useRef<THREE.Mesh | null>(null);
  const rightExhaustFlameRef = useRef<THREE.Mesh | null>(null);
  const leftExhaustCoreRef = useRef<THREE.Mesh | null>(null);
  const rightExhaustCoreRef = useRef<THREE.Mesh | null>(null);
  const exhaustLightRef = useRef<THREE.PointLight | null>(null);

  // Drag strip physics speed testing reports
  const [speedTestRepo, setSpeedTestRepo] = useState<{
    time0To100: number | null;
    time0To200: number | null;
    time400m: number | null;
    time1000m: number | null;
    time3000m: number | null;
    maxSpeed: number;
  }>({
    time0To100: null,
    time0To200: null,
    time400m: null,
    time1000m: null,
    time3000m: null,
    maxSpeed: 0
  });
  const speedTestRepoRef = useRef(speedTestRepo);
  useEffect(() => {
    speedTestRepoRef.current = speedTestRepo;
  }, [speedTestRepo]);

  // Last Match Replay States & Refs
  const replayFramesRef = useRef<{ x: number; y: number; z: number; ry: number; steering: number; speed: number }[]>([]);
  const [isReplaying, setIsReplaying] = useState(false);
  const isReplayingRef = useRef(false);
  const replayIndexRef = useRef(0);
  const ringBufferRef = useRef<ReplayRingBuffer>(new ReplayRingBuffer(2500));
   const [raceReplayState, setRaceReplayState] = useState<{
    playerPositions: { x: number; y: number; z: number; ry: number; speed: number }[];
    steerInputs: number[];
  } | null>(null);
  const raceReplayStateRef = useRef<{
    playerPositions: { x: number; y: number; z: number; ry: number; speed: number }[];
    steerInputs: number[];
  } | null>(null);

  // Perspective Views
  const [cameraMode, setCameraMode] = useState<'overhead' | 'cockpit' | 'farFollow' | 'cinematic'>('farFollow');
  const cameraModeRef = useRef<'overhead' | 'cockpit' | 'farFollow' | 'cinematic'>('farFollow');

  // Replay Specific Perspective Views
  const [replayCameraMode, setReplayCameraMode] = useState<'rearFollow' | 'sideFixed'>('rearFollow');
  const replayCameraModeRef = useRef<'rearFollow' | 'sideFixed'>('rearFollow');

  // Collision Camera Screen-shake Intensity Ref
  const collisionShakeIntensityRef = useRef<number>(0);

  // Web API Automatic Video Highlights Recording States & Refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [highlightVideoUrl, setHighlightVideoUrl] = useState<string | null>(null);
  const [isWatchingHighlight, setIsWatchingHighlight] = useState(false);
  const [isDownloadingHighlight, setIsDownloadingHighlight] = useState(false);

  // 3D Trajectory Playback States & Refs
  const [showTrajectoryLine, setShowTrajectoryLine] = useState(true);
  const playerPathRef = useRef<THREE.Vector3[]>([]);
  const allParticipantsPathsRef = useRef<Record<string, {
    color: string;
    name: string;
    points: { x: number; z: number }[];
  }>>({});
  const overtakingPointsRef = useRef<{
    x: number;
    z: number;
    passer: string;
    passed: string;
    passerColor: string;
    passedColor: string;
    time: string;
  }[]>([]);
  const prevRanksRef = useRef<string[]>([]);

  // 2D Mini-map States & Refs
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);

  // --- Ghost Mode States & Refs for Time-Trial & Practice ---
  const [ghostModeEnabled, setGhostModeEnabled] = useState(() => {
    try {
      const saved = safeStorage.getItem("cyber_race_ghost_enabled");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const [ghostType, setGhostType] = useState<'best' | 'last'>(() => {
    try {
      const saved = safeStorage.getItem("cyber_race_ghost_type");
      return (saved === 'best' || saved === 'last') ? saved : 'best';
    } catch {
      return 'best';
    }
  });

  const ghostModeEnabledRef = useRef(ghostModeEnabled);
  const ghostTypeRef = useRef(ghostType);

  // --- Weather System Setting (Auto vs Manual Forced Weather) ---
  const [weatherSetting, setWeatherSetting] = useState<'auto' | 'sunny' | 'rainy' | 'foggy' | 'snowy'>(() => {
    try {
      const saved = safeStorage.getItem("cyber_race_weather_setting");
      return (saved === 'auto' || saved === 'sunny' || saved === 'rainy' || saved === 'foggy' || saved === 'snowy') ? saved : 'auto';
    } catch {
      return 'auto';
    }
  });
  const weatherSettingRef = useRef(weatherSetting);

  useEffect(() => {
    weatherSettingRef.current = weatherSetting;
    try {
      safeStorage.setItem("cyber_race_weather_setting", weatherSetting);
    } catch {}
  }, [weatherSetting]);

  useEffect(() => {
    ghostModeEnabledRef.current = ghostModeEnabled;
    try {
      safeStorage.setItem("cyber_race_ghost_enabled", String(ghostModeEnabled));
    } catch {}
  }, [ghostModeEnabled]);

  useEffect(() => {
    ghostTypeRef.current = ghostType;
    try {
      safeStorage.setItem("cyber_race_ghost_type", ghostType);
    } catch {}
  }, [ghostType]);

  interface GhostPoint {
    time: number;
    x: number;
    y: number;
    z: number;
    ry: number;
  }

  // --- 最佳行車引導線 (Optimal Racing Line / Dynamic Driving Guide System) ---
  const [showRacingLine, setShowRacingLine] = useState(() => {
    try {
      const saved = safeStorage.getItem("cyber_race_racing_line_enabled");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const showRacingLineRef = useRef(showRacingLine);

  useEffect(() => {
    showRacingLineRef.current = showRacingLine;
    try {
      safeStorage.setItem("cyber_race_racing_line_enabled", String(showRacingLine));
    } catch {}
  }, [showRacingLine]);

  interface RacingLinePoint {
    position: THREE.Vector3;
    t: number;
    safetySpeed: number; // km/h
  }
  const racingLineRef = useRef<THREE.Line | null>(null);
  const racingLinePointsRef = useRef<RacingLinePoint[]>([]);

  // --- 立體陰影 (Dynamic 3D Shadows Setting) ---
  const [shadowsEnabled, setShadowsEnabled] = useState(() => {
    try {
      const saved = safeStorage.getItem("giga_racer_shadows_enabled");
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });
  const shadowsEnabledRef = useRef(shadowsEnabled);

  useEffect(() => {
    shadowsEnabledRef.current = shadowsEnabled;
    try {
      safeStorage.setItem("giga_racer_shadows_enabled", String(shadowsEnabled));
    } catch {}
  }, [shadowsEnabled]);

  const currentLapPointsRef = useRef<GhostPoint[]>([]);
  const lastLapGhostPointsRef = useRef<GhostPoint[]>([]);
  const bestLapGhostPointsRef = useRef<GhostPoint[]>([]);
  const lastRecordedTimeRef = useRef<number>(0);
  const ghostCarModelRef = useRef<any>(null);


  // States to track proximity to tight/sharp turns or obstacles for high-fidelity HUD warning banners
  const [approachingTurnAlert, setApproachingTurnAlert] = useState(false);
  const [approachingObstacleAlert, setApproachingObstacleAlert] = useState(false);

  // Analyze track coordinates to identify tight turns & high obstacle density alert zones
  const alertZones = React.useMemo(() => {
    const zones: { x: number; z: number; type: 'turn' | 'obstacle'; angle?: number; density?: number }[] = [];
    
    // 1. Calculate turn angles between consecutive segments to identify sharp bends
    const pts = track.points;
    const len = pts.length;
    if (len >= 3) {
      const isClosed = !track.isOpen;
      const limit = isClosed ? len : len - 1;
      const startIdx = isClosed ? 0 : 1;
      
      for (let i = startIdx; i < limit; i++) {
        const prevIdx = (i - 1 + len) % len;
        const currIdx = i;
        const nextIdx = (i + 1) % len;
        
        const A = pts[prevIdx];
        const B = pts[currIdx];
        const C = pts[nextIdx];
        
        const dx1 = B[0] - A[0];
        const dz1 = B[1] - A[1];
        const dx2 = C[0] - B[0];
        const dz2 = C[1] - B[1];
        
        const len1 = Math.hypot(dx1, dz1) || 0.001;
        const len2 = Math.hypot(dx2, dz2) || 0.001;
        
        const dot = dx1 * dx2 + dz1 * dz2;
        const cosTheta = dot / (len1 * len2);
        
        // If the direction change is tighter than ~41 degrees (cosTheta < 0.75), mark it
        if (cosTheta < 0.75) {
          zones.push({
            x: B[0],
            z: B[1],
            type: 'turn',
            angle: Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI)
          });
        }
      }
    }
    
    // 2. Scan for clusters of nearby static obstacles to flag danger zones
    if (track.obstacles && track.obstacles.length > 0) {
      const obsList = track.obstacles;
      const threshold = 40; // Max distance between obstacles in same zone
      
      obsList.forEach((obs1, idx1) => {
        let nearbyCount = 0;
        obsList.forEach((obs2, idx2) => {
          if (idx1 !== idx2) {
            const dist = Math.hypot(obs1.x - obs2.x, obs1.z - obs2.z);
            if (dist < threshold) {
              nearbyCount++;
            }
          }
        });
        
        // If an obstacle has neighbors, register a warning hotspot
        if (nearbyCount >= 1) {
          const alreadyAdded = zones.some(
            z => z.type === 'obstacle' && Math.hypot(z.x - obs1.x, z.z - obs1.z) < 25
          );
          if (!alreadyAdded) {
            zones.push({
              x: obs1.x,
              z: obs1.z,
              type: 'obstacle',
              density: nearbyCount + 1
            });
          }
        }
      });
    }
    
    return zones;
  }, [track]);

  const startHighlightRecording = (canvas: HTMLCanvasElement) => {
    try {
      if (!canvas) return;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      recordedChunksRef.current = [];
      
      const stream = canvas.captureStream(30); // 30 FPS Capture
      let options: any = {};
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
        options = { mimeType: 'video/webm;codecs=vp9' };
      } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
        options = { mimeType: 'video/webm;codecs=vp8' };
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options = { mimeType: 'video/webm' };
      } else if (MediaRecorder.isTypeSupported('video/mp4')) {
        options = { mimeType: 'video/mp4' };
      }

      const recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = () => {
        if (recordedChunksRef.current.length > 0) {
          const blob = new Blob(recordedChunksRef.current, {
            type: recordedChunksRef.current[0].type || 'video/webm'
          });
          const url = URL.createObjectURL(blob);
          setHighlightVideoUrl(url);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch (err) {
      console.warn("Failed to activate MediaRecorder Web API:", err);
    }
  };

  const stopHighlightRecording = () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch (err) {
      console.warn("Failed to terminate MediaRecorder:", err);
    }
  };

  const handleDownloadHighlight = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDownloadingHighlight) return;
    
    if (!recordedChunksRef.current || recordedChunksRef.current.length === 0) {
      alert("No recorded highlight data available. / 尚未生成精彩畫面錄製資料。");
      return;
    }
    
    try {
      setIsDownloadingHighlight(true);
      audioSystem.playClick("medium");
      
      const blob = new Blob(recordedChunksRef.current, {
        type: recordedChunksRef.current[0].type || 'video/webm'
      });
      
      // Convert Blob to Base64 safely
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      
      const videoBase64 = await base64Promise;
      
      // Post to our express server upload endpoint
      const response = await fetch("/api/upload-video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          videoBase64,
          mimeType: blob.type
        })
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      const downloadUrl = `/api/download-video/${data.id}`;
      
      // Dynamic clean download trigger
      const tempLink = document.createElement("a");
      tempLink.href = downloadUrl;
      tempLink.download = `race-highlight-${Date.now()}.webm`;
      tempLink.target = "_blank";
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
    } catch (err: any) {
      console.warn("Failed to prepare download-safe video through server, falling back to blob:", err);
      // Fallback: download directly using local blob url if express server is busy or inaccessible
      if (highlightVideoUrl) {
        const tempLink = document.createElement("a");
        tempLink.href = highlightVideoUrl;
        tempLink.download = `race-highlight-${Date.now()}.webm`;
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
      } else {
        alert("無法準備影片下載檔案，請嘗試重新產生。 Failed to prepare video file.");
      }
    } finally {
      setIsDownloadingHighlight(false);
    }
  };

  const changeCameraMode = (mode: 'overhead' | 'cockpit' | 'farFollow' | 'cinematic') => {
    setCameraMode(mode);
    cameraModeRef.current = mode;
  };

  const roomStateRef = useRef(roomState);

  // Multi-frame window activation & focus recovery
  useEffect(() => {
    const handleWindowFocusClick = (e: MouseEvent | PointerEvent) => {
      try { window.focus(); } catch (err) {}
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable || target?.id === "chat-input-field";
      const isChatOverlay = target?.closest("#game-chat-overlay");
      
      if (!isInput && !isChatOverlay) {
        if (isChatActiveRef.current) {
          setChatActiveState(false);
        }
        if (mountRef.current) {
          mountRef.current.focus();
        }
      }
    };

    window.addEventListener("pointerdown", handleWindowFocusClick, { capture: true });
    window.addEventListener("click", handleWindowFocusClick, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", handleWindowFocusClick, { capture: true });
      window.removeEventListener("click", handleWindowFocusClick, { capture: true });
    };
  }, []);

  // Sync initialRoomState from parent component prop changes (crucial React bugfix)
  useEffect(() => {
    if (roomId === "PRACTICE") return;
    setRoomState(initialRoomState);
  }, [initialRoomState, roomId]);

  // Sync state refs to prevent stale closure inside the 60FPS physics gameTick loop
  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  // Offline Single Player Practice Mode Automations
  useEffect(() => {
    if (roomId !== "PRACTICE") return;

    setRoomState('countdown');
    setCountdown(3);
    
    const counterInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(counterInterval);
          
          setRoomState('racing');
          setCountdown(null);
          setCompletedLapTimes([]);
          setLatestLapBanner(null);
          
          // Reset custom telemetry metrics tracking refs
          nitroUsedCountRef.current = 0;
          driftDurationRef.current = 0;
          collisionCountRef.current = 0;
          
          const nowTime = Date.now();
          if (myPhysicsRef.current) {
            myPhysicsRef.current.raceStartTime = nowTime;
            myPhysicsRef.current.lapStartTime = nowTime;
            myPhysicsRef.current.driveStartTime = 0;
            myPhysicsRef.current.totalLaps = track.isOpen ? 1 : 3;
            myPhysicsRef.current.finished = false;
            myPhysicsRef.current.passedCheckpoints.clear();
            prevTRef.current = 0;
            latestLapRef.current = 1;
            setLap(1);
            
            // Reset Ghost points data for the new race session
            currentLapPointsRef.current = [];
            lastLapGhostPointsRef.current = [];
            bestLapGhostPointsRef.current = [];
            lastRecordedTimeRef.current = 0;
          }
          setSpeedTestRepo({
            time0To100: null,
            time0To200: null,
            time400m: null,
            time1000m: null,
            time3000m: null,
            maxSpeed: 0
          });
          setIsFinished(false);
          setFinishTime(null);
          setRaceTime(0);

          addChatMessage({
            senderId: "system",
            senderName: t("systemAnnouncement"),
            message: t("practiceStartMsg"),
            time: Date.now()
          });
          
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(counterInterval);
    };
  }, [roomId, track]);

  useEffect(() => {
    isChatActiveRef.current = isChatActive;
  }, [isChatActive]);

  // Sync cameraModeRef
  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  // Sync isReplayingRef
  useEffect(() => {
    isReplayingRef.current = isReplaying;
  }, [isReplaying]);

  // Sync raceReplayStateRef
  useEffect(() => {
    raceReplayStateRef.current = raceReplayState;
  }, [raceReplayState]);

  // Sync replayCameraModeRef
  useEffect(() => {
    replayCameraModeRef.current = replayCameraMode;
  }, [replayCameraMode]);

  // Explicitly re-bind the keyboard event listeners inside the GameCanvas mounting effect
  // to ensure user inputs are being captured correctly once the race component is active.
  useEffect(() => {
    // Capture standard keys for racing handling controls
    const onKeyDown = (e: KeyboardEvent) => {
      const activeElem = document.activeElement as HTMLElement | null;
      const isTypingInInput = activeElem?.tagName === "INPUT" || activeElem?.tagName === "TEXTAREA" || activeElem?.id === "chat-input-field";

      if (isTypingInInput || isChatActiveRef.current) {
        if (e.key === "Escape") {
          setChatActiveState(false);
          activeElem?.blur?.();
          if (mountRef.current) mountRef.current.focus();
        }
        return;
      }

      // Intercept Enter key to toggle chat mode
      if (e.key === "Enter" || e.code === "Enter") {
        e.preventDefault();
        setChatActiveState(true);
        // Clear all active keys to prevent stuck car control acceleration/steering
        keysPressed.current = {};
        setTimeout(() => {
          const field = document.getElementById("chat-input-field") as HTMLInputElement | null;
          if (field) {
            field.focus();
          }
        }, 50);
        return;
      }
      
      const code = e.code;
      const key = e.key.toLowerCase();
      
      // Try to load custom keybindings from Settings
      let customBindings: any = null;
      try {
        const stored = safeStorage.getItem("cyber_race_keybindings");
        if (stored) customBindings = JSON.parse(stored);
      } catch (err) {}

      let resolvedKey = key;
      if (customBindings) {
        if (code === customBindings.accelerate?.code || key === customBindings.accelerate?.key) {
          resolvedKey = "w";
        } else if (code === customBindings.brake?.code || key === customBindings.brake?.key) {
          resolvedKey = "s";
        } else if (code === customBindings.left?.code || key === customBindings.left?.key) {
          resolvedKey = "a";
        } else if (code === customBindings.right?.code || key === customBindings.right?.key) {
          resolvedKey = "d";
        } else if (code === customBindings.drift?.code || key === customBindings.drift?.key) {
          resolvedKey = " ";
        } else if (code === customBindings.nitro?.code || key === customBindings.nitro?.key) {
          resolvedKey = "shift";
        }
      }

      // Determine normalization mapping supporting Chinese input methods (Bopomofo/Zhuyin IME) or fallbacks
      if (resolvedKey === key) {
        if (code === "KeyW" || code === "ArrowUp" || key === "arrowup" || key === "up" || key === "w" || key === "ㄊ") {
          resolvedKey = "w";
        } else if (code === "KeyS" || code === "ArrowDown" || key === "arrowdown" || key === "down" || key === "s" || key === "ㄋ") {
          resolvedKey = "s";
        } else if (code === "KeyA" || code === "ArrowLeft" || key === "arrowleft" || key === "left" || key === "a" || key === "ㄇ") {
          resolvedKey = "a";
        } else if (code === "KeyD" || code === "ArrowRight" || key === "arrowright" || key === "right" || key === "d" || key === "ㄎ") {
          resolvedKey = "d";
        } else if (code === "Space" || key === " " || key === "spacebar") {
          resolvedKey = " ";
        } else if (code === "Digit1" || key === "1" || code === "Numpad1") {
          resolvedKey = "1";
        } else if (code === "Digit2" || key === "2" || code === "Numpad2") {
          resolvedKey = "2";
        } else if (code === "Digit3" || key === "3" || code === "Numpad3") {
          resolvedKey = "3";
        } else if (code === "Digit4" || key === "4" || code === "Numpad4") {
          resolvedKey = "4";
        } else if (code === "KeyV" || key === "v") {
          resolvedKey = "v";
        } else if (code === "KeyC" || key === "c") {
          resolvedKey = "c";
        } else if (code === "KeyM" || key === "m") {
          resolvedKey = "m";
        } else if (code === "KeyH" || key === "h") {
          resolvedKey = "h";
        } else if (code === "ShiftLeft" || code === "ShiftRight" || key === "shift") {
          resolvedKey = "shift";
        }
      }

      // Prevent browser default actions like page scrolling inside iframe for controls
      if (["w", "s", "a", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright", "up", "down", "left", "right"].includes(resolvedKey)) {
        e.preventDefault();
      }

      keysPressed.current[resolvedKey] = true;
      if (resolvedKey !== key) {
        keysPressed.current[key] = true;
      }

      // Explicitly dual-bind standard directional controls to cover ALL browsers/setups
      if (resolvedKey === "w") {
        keysPressed.current["w"] = true;
        keysPressed.current["arrowup"] = true;
        keysPressed.current["up"] = true;
      } else if (resolvedKey === "s") {
        keysPressed.current["s"] = true;
        keysPressed.current["arrowdown"] = true;
        keysPressed.current["down"] = true;
      } else if (resolvedKey === "a") {
        keysPressed.current["a"] = true;
        keysPressed.current["arrowleft"] = true;
        keysPressed.current["left"] = true;
      } else if (resolvedKey === "d") {
        keysPressed.current["d"] = true;
        keysPressed.current["arrowright"] = true;
        keysPressed.current["right"] = true;
      }

      // Switch camera view mode with number keys 1-4 and legacy V, C or M
      if (resolvedKey === "1") {
        changeCameraMode('cockpit');
      } else if (resolvedKey === "2") {
        changeCameraMode('farFollow');
      } else if (resolvedKey === "3") {
        changeCameraMode('overhead');
      } else if (resolvedKey === "4") {
        changeCameraMode('cinematic');
      } else if (resolvedKey === 'v' || resolvedKey === 'c' || resolvedKey === 'm') {
        const order: ('overhead' | 'cockpit' | 'farFollow' | 'cinematic')[] = ['overhead', 'cockpit', 'farFollow', 'cinematic'];
        const currentIndex = order.indexOf(cameraModeRef.current);
        const nextIndex = (currentIndex + 1) % order.length;
        const nextMode = order[nextIndex];
        changeCameraMode(nextMode);
      } else if (resolvedKey === 'f') {
        // Toggle specifically between cockpit (first-person cockpit) and farFollow (third-person follow)
        const nextMode = cameraModeRef.current === 'cockpit' ? 'farFollow' : 'cockpit';
        changeCameraMode(nextMode);
      } else if (resolvedKey === 'h') {
        audioSystem.playClick("low");
        setShowSpeedometer(prev => !prev);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (isChatActiveRef.current) return;
      
      const code = e.code;
      const key = e.key.toLowerCase();
      
      // Try to load custom keybindings from Settings
      let customBindings: any = null;
      try {
        const stored = safeStorage.getItem("cyber_race_keybindings");
        if (stored) customBindings = JSON.parse(stored);
      } catch (err) {}

      let resolvedKey = key;
      if (customBindings) {
        if (code === customBindings.accelerate?.code || key === customBindings.accelerate?.key) {
          resolvedKey = "w";
        } else if (code === customBindings.brake?.code || key === customBindings.brake?.key) {
          resolvedKey = "s";
        } else if (code === customBindings.left?.code || key === customBindings.left?.key) {
          resolvedKey = "a";
        } else if (code === customBindings.right?.code || key === customBindings.right?.key) {
          resolvedKey = "d";
        } else if (code === customBindings.drift?.code || key === customBindings.drift?.key) {
          resolvedKey = " ";
        } else if (code === customBindings.nitro?.code || key === customBindings.nitro?.key) {
          resolvedKey = "shift";
        }
      }

      if (resolvedKey === key) {
        if (code === "KeyW" || code === "ArrowUp" || key === "arrowup" || key === "up" || key === "w" || key === "ㄊ") {
          resolvedKey = "w";
        } else if (code === "KeyS" || code === "ArrowDown" || key === "arrowdown" || key === "down" || key === "s" || key === "ㄋ") {
          resolvedKey = "s";
        } else if (code === "KeyA" || code === "ArrowLeft" || key === "arrowleft" || key === "left" || key === "a" || key === "ㄇ") {
          resolvedKey = "a";
        } else if (code === "KeyD" || code === "ArrowRight" || key === "arrowright" || key === "right" || key === "d" || key === "ㄎ") {
          resolvedKey = "d";
        } else if (code === "Space" || key === " " || key === "spacebar") {
          resolvedKey = " ";
        } else if (code === "Digit1" || key === "1" || code === "Numpad1") {
          resolvedKey = "1";
        } else if (code === "Digit2" || key === "2" || code === "Numpad2") {
          resolvedKey = "2";
        } else if (code === "Digit3" || key === "3" || code === "Numpad3") {
          resolvedKey = "3";
        } else if (code === "Digit4" || key === "4" || code === "Numpad4") {
          resolvedKey = "4";
        } else if (code === "KeyV" || key === "v") {
          resolvedKey = "v";
        } else if (code === "KeyC" || key === "c") {
          resolvedKey = "c";
        } else if (code === "KeyM" || key === "m") {
          resolvedKey = "m";
        } else if (code === "KeyH" || key === "h") {
          resolvedKey = "h";
        } else if (code === "ShiftLeft" || code === "ShiftRight" || key === "shift") {
          resolvedKey = "shift";
        }
      }

      keysPressed.current[resolvedKey] = false;
      keysPressed.current[key] = false;

      // Explicitly dual-release standard directional controls to cover ALL browsers/setups
      if (resolvedKey === "w") {
        keysPressed.current["w"] = false;
        keysPressed.current["arrowup"] = false;
        keysPressed.current["up"] = false;
      } else if (resolvedKey === "s") {
        keysPressed.current["s"] = false;
        keysPressed.current["arrowdown"] = false;
        keysPressed.current["down"] = false;
      } else if (resolvedKey === "a") {
        keysPressed.current["a"] = false;
        keysPressed.current["arrowleft"] = false;
        keysPressed.current["left"] = false;
      } else if (resolvedKey === "d") {
        keysPressed.current["d"] = false;
        keysPressed.current["arrowright"] = false;
        keysPressed.current["right"] = false;
      }
    };

    const onWindowBlur = () => {
      // Clear stuck keys when switching to another window/tab
      keysPressed.current = {};
      audioSystem.stopEngine();
    };

    const onWindowFocus = () => {
      // Clear keys when returning to ensure no stuck inputs
      keysPressed.current = {};
      try {
        const activeElem = document.activeElement as HTMLElement | null;
        if (activeElem?.id !== "chat-input-field") {
          setIsChatActive(false);
        }
        if (mountRef.current && (roomState === 'countdown' || roomState === 'racing')) {
          mountRef.current.focus();
        }
      } catch (err) {}
    };

    const onVisibilityChange = () => {
      keysPressed.current = {};
      try {
        if (document.hidden) {
          audioSystem.stopEngine();
        } else {
          const activeElem = document.activeElement as HTMLElement | null;
          if (activeElem?.id !== "chat-input-field") {
            setIsChatActive(false);
          }
          if (mountRef.current && (roomState === 'countdown' || roomState === 'racing')) {
            mountRef.current.focus();
          }
        }
      } catch (err) {}
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Focus canvas when countdown or racing starts
    if (roomState === 'countdown' || roomState === 'racing') {
      if (mountRef.current) {
        mountRef.current.focus();
      }
    }

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [roomState]);

  // Sync showTrajectoryLineRef
  const showTrajectoryLineRef = useRef(true);
  useEffect(() => {
    showTrajectoryLineRef.current = showTrajectoryLine;
  }, [showTrajectoryLine]);

  // Play countdown and race start audio FX
  useEffect(() => {
    if (roomState === 'countdown') {
      if (countdown !== null) {
        audioSystem.playCountdownBeep(countdown);
      }
    } else if (roomState === 'racing') {
      audioSystem.playCountdownBeep("GO!");
    }
  }, [countdown, roomState]);

  // Reset replay frames and damage on new count down/race initialization
  useEffect(() => {
    if (roomState === 'countdown') {
      replayFramesRef.current = [];
      ringBufferRef.current.clear();
      setRaceReplayState(null);
      raceReplayStateRef.current = null;
      damageRef.current = 0;
      setDamagePercent(0);
      setHighlightVideoUrl(null);
      setIsWatchingHighlight(false);
      playerPathRef.current = [];
      allParticipantsPathsRef.current = {};
      overtakingPointsRef.current = [];
      prevRanksRef.current = [];
    } else if (roomState === 'finished') {
      stopHighlightRecording();
      // Fallback: If race finish triggers from external orchestrator and replay state hasn't been set yet
      if (!raceReplayState) {
        const orderedFrames = ringBufferRef.current.getOrderedFrames();
        if (orderedFrames.length > 0) {
          const pPositions = orderedFrames.map(f => ({
            x: f.x,
            y: f.y,
            z: f.z,
            ry: f.ry,
            speed: f.speed
          }));
          const sInputs = orderedFrames.map(f => f.steering);
          
          const replayObj = {
            playerPositions: pPositions,
            steerInputs: sInputs
          };
          setRaceReplayState(replayObj);
          raceReplayStateRef.current = replayObj;
          replayFramesRef.current = orderedFrames;
        }
      }
    }
  }, [roomState, raceReplayState]);

  // Web API auto-recording triggers on active racing state
  useEffect(() => {
    if (roomState === 'racing') {
      if (rendererRef.current) {
        startHighlightRecording(rendererRef.current.domElement);
      }
    } else {
      stopHighlightRecording();
    }
  }, [roomState]);

  // Core Refs
  const racersRef = useRef<Record<string, {
    player: Player;
    model: any;
    targetPos: THREE.Vector3;
    targetRy: number;
    targetSteering: number;
    currentProgress: number;
  }>>({});
  
  const myPhysicsRef = useRef({
    x: 0,
    y: 0.5,
    z: 0,
    ry: 0,                // yaw angle mapping
    speed: 0,             // velocity forward
    vx: 0,                // dynamic velocity X
    vz: 0,                // dynamic velocity Z
    steering: 0,          // current visual front steering angle (-1 to 1)
    passedCheckpoints: new Set<number>(), // Check checkpoints to prevent cutting
    lapStartTime: Date.now(),
    raceStartTime: 0,
    driveStartTime: 0,    // Time since they actively pressed throttle (for speed measurements)
    totalLaps: 3,
    finished: false
  });

  const keysPressed = useRef<Record<string, boolean>>({});
  const particlesRef = useRef<THREE.Mesh[]>([]);
  const latestProgressRef = useRef(0);
  const prevTRef = useRef(0);
  const latestLapRef = useRef(1);
  const currentWeatherRef = useRef<'sunny' | 'rainy' | 'foggy' | 'snowy'>('sunny');
  const staticCollidersRef = useRef<{ x: number; z: number; radius: number; type: 'mountain' | 'river' }[]>([]);
  const nitroEnergyRef = useRef<number>(100);
  const isNitroActiveRef = useRef<boolean>(false);
  const nitroCooldownRef = useRef<number>(0);
  const nitroActiveDurationRef = useRef<number>(0);

  // Initialize socket listeners for dynamic game updates
  useEffect(() => {
    if (!socket) return;

    const handleMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const { type, payload } = data;

        switch (type) {
          case "player-joined": {
            const p: Player = payload;
            if (p.id === playerId) return;
            addRivalRef.current(p);
            break;
          }
          case "player-left": {
            const { playerId: rId } = payload;
            removeRivalRef.current(rId);
            break;
          }
          case "player-state-update": {
            const up = payload;
            if (up.id === playerId) return;
            const rival = racersRef.current[up.id];
            if (rival) {
              // Strictly validate each incoming network coordinate to prevent NaN anomalies from rendering models invisible
              const ux = typeof up.x === 'number' && !isNaN(up.x) ? up.x : rival.targetPos.x;
              const uy = typeof up.y === 'number' && !isNaN(up.y) ? up.y : rival.targetPos.y;
              const uz = typeof up.z === 'number' && !isNaN(up.z) ? up.z : rival.targetPos.z;
              const ury = typeof up.ry === 'number' && !isNaN(up.ry) ? up.ry : rival.targetRy;

              rival.targetPos.set(ux, uy, uz);
              rival.targetRy = ury;
              rival.targetSteering = typeof up.steering === 'number' && !isNaN(up.steering) ? up.steering : (rival.targetSteering || 0);
              rival.player.progress = typeof up.progress === 'number' && !isNaN(up.progress) ? up.progress : (rival.player.progress || 0);
              rival.player.lap = typeof up.lap === 'number' && !isNaN(up.lap) ? up.lap : (rival.player.lap || 1);
              rival.player.speed = typeof up.speed === 'number' && !isNaN(up.speed) ? up.speed : (rival.player.speed || 0);
            }
            break;
          }
          case "countdown-start": {
            setRoomState('countdown');
            setCountdown(payload.duration);
            const counterInterval = setInterval(() => {
              setCountdown(prev => {
                if (prev === null || prev <= 1) {
                  clearInterval(counterInterval);
                  return null;
                }
                return prev - 1;
              });
            }, 1000);
            break;
          }
          case "race-start": {
            setRoomState('racing');
            setCountdown(null);
            setCompletedLapTimes([]);
            setLatestLapBanner(null);
            
            // Reset custom telemetry metrics tracking refs
            nitroUsedCountRef.current = 0;
            driftDurationRef.current = 0;
            collisionCountRef.current = 0;

            myPhysicsRef.current.raceStartTime = payload.startTime;
            myPhysicsRef.current.lapStartTime = payload.startTime;
            myPhysicsRef.current.driveStartTime = 0;
            myPhysicsRef.current.totalLaps = track.isOpen ? 1 : 3;
            myPhysicsRef.current.finished = false;
            myPhysicsRef.current.passedCheckpoints.clear();
            prevTRef.current = 0;
            latestLapRef.current = 1;
            setLap(1);

            // Reset Ghost points data for the new multiplayer race session
            currentLapPointsRef.current = [];
            lastLapGhostPointsRef.current = [];
            bestLapGhostPointsRef.current = [];
            lastRecordedTimeRef.current = 0;

            setSpeedTestRepo({
              time0To100: null,
              time0To200: null,
              time400m: null,
              time1000m: null,
              time3000m: null,
              maxSpeed: 0
            });
            setIsFinished(false);
            setFinishTime(null);
            setRaceTime(0);
            break;
          }
          case "player-finished": {
            const { playerId: fId, bestTime, name } = payload;
            const rival = racersRef.current[fId];
            if (rival) {
              rival.player.bestTime = bestTime;
            }
            // Trigger local log
            addChatMessage({
              senderId: "system",
              senderName: t("matchBroadcast"),
              message: t("rivalFinishedBestMsg").replace("{name}", name).replace("{time}", (bestTime / 1000).toFixed(2)),
              time: Date.now()
            });
            break;
          }
          case "race-over": {
            setRoomState('finished');
            break;
          }
          case "chat-broadcast": {
            // Handled globally in App.tsx
            break;
          }
        }
      } catch (error) {
        console.error("Networking payload receipt failure", error);
      }
    };

    socket.addEventListener("message", handleMessage);
    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket, playerId]);

  // Main 3D Simulation Loop
  useEffect(() => {
    if (!mountRef.current) return;

    // Start synthetic driver engine rumbling sound
    audioSystem.startEngine();
    audioSystem.setTrackAmbient(track.id);

    // 1. Setup Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(track.skyColor);
    scene.fog = new THREE.FogExp2(track.skyColor, 0.007);

    // 2. Setup Camera
    const initialWidth = (mountRef.current && mountRef.current.clientWidth) || window.innerWidth || 800;
    const initialHeight = (mountRef.current && mountRef.current.clientHeight) || window.innerHeight || 600;
    const camera = new THREE.PerspectiveCamera(
      55,
      initialWidth / initialHeight,
      0.1,
      1000
    );

    // 3. Renderer Settings
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
      rendererRef.current = renderer;
      renderer.setSize(initialWidth, initialHeight);
      renderer.shadowMap.enabled = shadowsEnabledRef.current;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if (mountRef.current) {
        mountRef.current.appendChild(renderer.domElement);
      }
    } catch (e) {
      console.error("WebGL context initialization failed:", e);
      if (mountRef.current) {
        mountRef.current.innerHTML = `<div class="p-8 text-center text-rose-400 font-sans font-bold">⚠️ 無法初始化 WebGL 3D 繪圖 context，請確認您的瀏覽器已啟用 GPU 硬體加速。<br/><span class="text-xs text-slate-400 mt-2 block">(WebGL initialization failed)</span></div>`;
      }
      return;
    }

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(track.colorTheme, 0xbbccdd, 0.75);
    scene.add(hemiLight);

    // Sunlight
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
    sunLight.position.set(100, 150, 100);
    sunLight.castShadow = shadowsEnabledRef.current;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    // 5. Generate Environment/Terrain Scenery (Moved after trackSpline is created)
    
    // Smooth CatmullRom spline road geometry build
    const curvePoints = track.points.map(p => new THREE.Vector3(p[0], 0, p[1]));
    const trackSpline = new THREE.CatmullRomCurve3(curvePoints, !track.isOpen);

    // --- [最佳行車引導線] 初始化 3D 導引線模型 ---
    const racingLineSamples = 450;
    const racingLinePoints: RacingLinePoint[] = [];
    const positions: number[] = [];
    const initColors: number[] = [];

    for (let i = 0; i < racingLineSamples; i++) {
      const tVal = i / (racingLineSamples - 1);
      const pt = getModifiedTrackSplinePoint(trackSpline, tVal);
      const h = getTrackHeightAtT(track, tVal) + 0.12; 
      const finalPos = new THREE.Vector3(pt.x, h, pt.z);
      
      const tAhead = track.isOpen ? Math.min(1, tVal + 0.008) : ((tVal + 0.008) % 1);
      const p1 = getModifiedTrackSplinePoint(trackSpline, track.isOpen ? Math.max(0, tAhead - 0.004) : (((tAhead - 0.004 + 1) % 1)));
      const p2 = getModifiedTrackSplinePoint(trackSpline, tAhead);
      const p3 = getModifiedTrackSplinePoint(trackSpline, track.isOpen ? Math.min(1, tAhead + 0.004) : (((tAhead + 0.004) % 1)));
      
      const v1 = new THREE.Vector3().subVectors(p2, p1).normalize();
      const v2 = new THREE.Vector3().subVectors(p3, p2).normalize();
      const dot = v1.dot(v2);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      
      const curveFactor = Math.min(1, angle / 0.14);
      
      let maxSpeed = 165;
      let minSpeed = 45;
      if (track.id === "space-highway") {
        maxSpeed = 150;
        minSpeed = 38;
      } else if (track.id === "desert-rally") {
        maxSpeed = 145;
        minSpeed = 42;
      } else if (track.id === "speed-test") {
        maxSpeed = 260;
        minSpeed = 220;
      }

      const safetySpeed = maxSpeed - (maxSpeed - minSpeed) * curveFactor;
      
      racingLinePoints.push({
        position: finalPos,
        t: tVal,
        safetySpeed
      });

      positions.push(finalPos.x, finalPos.y, finalPos.z);
      initColors.push(0.1, 0.9, 0.2);
    }

    if (!track.isOpen && racingLinePoints.length > 0) {
      const first = racingLinePoints[0];
      positions.push(first.position.x, first.position.y, first.position.z);
      initColors.push(0.1, 0.9, 0.2);
    }

    racingLinePointsRef.current = racingLinePoints;

    const racingLineGeo = new THREE.BufferGeometry();
    racingLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    racingLineGeo.setAttribute('color', new THREE.Float32BufferAttribute(initColors, 3));

    const racingLineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 3,
      transparent: true,
      opacity: 0.85
    });

    const rLine = !track.isOpen 
      ? new THREE.LineLoop(racingLineGeo, racingLineMat)
      : new THREE.Line(racingLineGeo, racingLineMat);
    
    rLine.visible = showRacingLineRef.current;
    scene.add(rLine);
    racingLineRef.current = rLine;

    // Subdivided PlaneGeometry allows carving out the ground under high-altitude bridge
    const terrainGeo = new THREE.PlaneGeometry(2000, 2000, 120, 120);

    // Pre-sample bridge points to carve canyon gorge under bridge (t = 0.38 to t = 0.62)
    const bridgePoints: { x: number; z: number }[] = [];
    const bridgeResolution = 100;
    for (let j = 0; j <= bridgeResolution; j++) {
      const tVal = 0.38 + (0.62 - 0.38) * (j / bridgeResolution);
      const pt = getModifiedTrackSplinePoint(trackSpline, tVal);
      bridgePoints.push({ x: pt.x, z: pt.z });
    }

    const posAttr = terrainGeo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const globalX = vx;
      const globalZ = -vy; // negative local Y represents global Z due to -Math.PI/2 rotation

      let minDist = 999999;
      for (const bp of bridgePoints) {
        const dx = globalX - bp.x;
        const dz = globalZ - bp.z;
        const distSq = dx * dx + dz * dz;
        if (distSq < minDist) {
          minDist = distSq;
        }
      }
      const dist = Math.sqrt(minDist);

      // Define canyon gorge boundaries
      const canyonHalfWidth = 24; // width of ground cut
      const canyonBlendWidth = 16; // width of slope transition on canyon edges
      
      if (dist < canyonHalfWidth + canyonBlendWidth) {
        let depthPct = 0;
        if (dist < canyonHalfWidth) {
          depthPct = 1.0;
        } else {
          depthPct = 1.0 - (dist - canyonHalfWidth) / canyonBlendWidth;
        }
        
        // Push the ground mesh under the bridge down into a deep abyss of depth -50
        const depth = -50.0 * depthPct;
        posAttr.setZ(i, depth);
      }
    }
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: track.groundColor,
      roughness: 0.95,
      metalness: 0.1
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = 0.0;
    terrain.receiveShadow = true;
    scene.add(terrain);

    // Draw track layout grid helper/scenery
    const trackCenterLineGeo = new THREE.BufferGeometry();
    const lineVertices: number[] = [];
    
    const roadResolution = 240;
    const roadWidth = track.width;
    
    const roadVertices: number[] = [];
    const roadNormals: number[] = [];
    const roadUVs: number[] = [];
    const roadIndices: number[] = [];

    const pitDividerPoints: THREE.Vector3[] = [];

    for (let i = 0; i <= roadResolution; i++) {
      const t = i / roadResolution;
      const curveT = track.isOpen ? Math.max(0, Math.min(0.9999, t)) : (t % 1);
      const pt = getModifiedTrackSplinePoint(trackSpline, curveT);
      const tangent = getModifiedTrackSplineTangent(trackSpline, curveT);
      
      // Multi-lane directional normal N in XZ
      const nx = -tangent.z;
      const nz = tangent.x;
      const normal2D = new THREE.Vector2(nx, nz).normalize();

      let pitW = 0;
      if (curveT >= 0.80 && curveT <= 0.95) {
        const factor = Math.sin(((curveT - 0.80) / 0.15) * Math.PI);
        pitW = factor * 7.5;
      }

      // Vertex left & right
      const lx = pt.x + normal2D.x * (roadWidth / 2);
      const lz = pt.z + normal2D.y * (roadWidth / 2);
      const rx = pt.x - normal2D.x * (roadWidth / 2 + pitW);
      const rz = pt.z - normal2D.y * (roadWidth / 2 + pitW);

      const rh = getTrackHeightAtT(track, curveT);

      if (curveT >= 0.80 && curveT <= 0.95) {
        pitDividerPoints.push(new THREE.Vector3(pt.x - normal2D.x * (roadWidth / 2), rh + 0.04, pt.z - normal2D.y * (roadWidth / 2)));
      }

      roadVertices.push(lx, rh, lz); // Point L
      roadVertices.push(rx, rh, rz); // Point R

      roadNormals.push(0, 1, 0);
      roadNormals.push(0, 1, 0);

      roadUVs.push(0, t * 20);
      roadUVs.push(1, t * 20);

      // Construct supportive bridge pillar frames underneath elevated bridges
      if (rh > 0.5 && i % 8 === 0) {
        const pillarGeo = new THREE.CylinderGeometry(0.65, 0.95, rh, 8);
        const pillarMat = new THREE.MeshStandardMaterial({
          color: 0x334155, // concrete gray structure
          roughness: 0.8,
          metalness: 0.15
        });

        // Left pillar
        const lPillar = new THREE.Mesh(pillarGeo, pillarMat);
        lPillar.position.set(lx, rh / 2, lz);
        scene.add(lPillar);

        // Right pillar
        const rPillar = new THREE.Mesh(pillarGeo, pillarMat);
        rPillar.position.set(rx, rh / 2, rz);
        scene.add(rPillar);

        // Transversal structural crossbeam connection
        const crossGeo = new THREE.BoxGeometry(roadWidth + 1.2, 0.7, 0.7);
        const crossMesh = new THREE.Mesh(crossGeo, pillarMat);
        crossMesh.position.set(pt.x, rh - 0.35, pt.z);
        crossMesh.lookAt(pt.x + tangent.x, rh - 0.35, pt.z + tangent.z);
        scene.add(crossMesh);
      }

      if (i < roadResolution) {
        const vIdx = i * 2;
        // Two triangles for section quadrilaterals
        roadIndices.push(vIdx, vIdx + 1, vIdx + 2);
        roadIndices.push(vIdx + 1, vIdx + 3, vIdx + 2);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
    roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(roadNormals, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2));
    roadGeo.setIndex(roadIndices);

    // Neon Asphalt Material with grid texture
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x181822,
      roughness: 0.6,
      metalness: 0.2,
      transparent: true,
      opacity: 0.95
    });
    
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);

    // Glowing Neon glowing edge barriers (霓虹邊緣光條)
    const leftBarrierPoints: THREE.Vector3[] = [];
    const rightBarrierPoints: THREE.Vector3[] = [];

     const barrierRes = track.isOpen ? roadResolution + 1 : roadResolution;
    for (let i = 0; i < barrierRes; i++) {
      const t = i / roadResolution;
      const curveT = track.isOpen ? Math.max(0, Math.min(0.9999, t)) : (t % 1);
      const pt = getModifiedTrackSplinePoint(trackSpline, curveT);
      const tangent = getModifiedTrackSplineTangent(trackSpline, curveT);
      const nx = -tangent.z;
      const nz = tangent.x;
      const normal2D = new THREE.Vector2(nx, nz).normalize();

      const h = getTrackHeightAtT(track, curveT);

      let pitW = 0;
      if (curveT >= 0.80 && curveT <= 0.95) {
        const factor = Math.sin(((curveT - 0.80) / 0.15) * Math.PI);
        pitW = factor * 7.5;
      }

      leftBarrierPoints.push(new THREE.Vector3(pt.x + normal2D.x * (roadWidth / 2 + 0.1), h + 0.1, pt.z + normal2D.y * (roadWidth / 2 + 0.1)));
      rightBarrierPoints.push(new THREE.Vector3(pt.x - normal2D.x * (roadWidth / 2 + pitW + 0.1), h + 0.1, pt.z - normal2D.y * (roadWidth / 2 + pitW + 0.1)));
    }
    // Loop closure
    if (!track.isOpen) {
      leftBarrierPoints.push(leftBarrierPoints[0].clone());
      rightBarrierPoints.push(rightBarrierPoints[0].clone());
    }

    const barrierMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(track.colorTheme),
      linewidth: 3
    });
    const leftBarrierLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftBarrierPoints), barrierMat);
    const rightBarrierLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightBarrierPoints), barrierMat);
    scene.add(leftBarrierLine, rightBarrierLine);

    // Pit Lane Divider Line (Yellow Dashed Neon Line)
    if (pitDividerPoints.length > 0) {
      const pitDividerMat = new THREE.LineDashedMaterial({
        color: 0xffaa00,
        dashSize: 1.5,
        gapSize: 1.0,
        transparent: true,
        opacity: 0.8
      });
      const pitDividerGeo = new THREE.BufferGeometry().setFromPoints(pitDividerPoints);
      const pitDividerLine = new THREE.Line(pitDividerGeo, pitDividerMat);
      pitDividerLine.computeLineDistances();
      scene.add(pitDividerLine);
    }

    // Add 3 glowing Pit Stop pads inside the pit lane
    const pitTs = [0.83, 0.87, 0.91];
    pitTs.forEach((pitT, idx) => {
      const pt = getModifiedTrackSplinePoint(trackSpline, pitT);
      const tangent = getModifiedTrackSplineTangent(trackSpline, pitT);
      const nx = -tangent.z;
      const nz = tangent.x;
      const normal2D = new THREE.Vector2(nx, nz).normalize();
      const h = getTrackHeightAtT(track, pitT) + 0.05;
      
      const factor = Math.sin(((pitT - 0.80) / 0.15) * Math.PI);
      const currentPitW = factor * 7.5;
      
      // Position pad in the middle of the pit lane
      const padX = pt.x - normal2D.x * (roadWidth / 2 + currentPitW / 2);
      const padZ = pt.z - normal2D.y * (roadWidth / 2 + currentPitW / 2);
      
      // Neon cyan/green pit stop pad
      const padGeo = new THREE.BoxGeometry(4, 0.02, 6);
      const padMat = new THREE.MeshStandardMaterial({
        color: 0x00ffcc,
        emissive: 0x00ff88,
        emissiveIntensity: 1.5,
        roughness: 0.1,
        transparent: true,
        opacity: 0.9
      });
      const padMesh = new THREE.Mesh(padGeo, padMat);
      padMesh.position.set(padX, h, padZ);
      
      // Align with track heading
      padMesh.lookAt(padX + tangent.x, h, padZ + tangent.z);
      scene.add(padMesh);

      // Add a cool futuristic holographic light beacon above each pad
      const lightGeo = new THREE.CylinderGeometry(0.1, 0.1, 4, 8, 1, true);
      const lightMat = new THREE.MeshBasicMaterial({
        color: 0x00ffaa,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide
      });
      const beacon = new THREE.Mesh(lightGeo, lightMat);
      beacon.position.set(padX, h + 2.0, padZ);
      scene.add(beacon);
    });

    // Pit Stop Entrance Arch at t = 0.83
    const pitArchT = 0.83;
    const pitArchPt = getModifiedTrackSplinePoint(trackSpline, pitArchT);
    const pitArchTangent = getModifiedTrackSplineTangent(trackSpline, pitArchT);
    const pitArchNx = -pitArchTangent.z;
    const pitArchNz = pitArchTangent.x;
    const pitArchN2d = new THREE.Vector2(pitArchNx, pitArchNz).normalize();
    const pitArchH = getTrackHeightAtT(track, pitArchT);
    const pitArchW = Math.sin(((pitArchT - 0.80) / 0.15) * Math.PI) * 7.5;

    const pitArchCenter = new THREE.Vector3(
      pitArchPt.x - pitArchN2d.x * (roadWidth / 2 + pitArchW / 2),
      pitArchH,
      pitArchPt.z - pitArchN2d.y * (roadWidth / 2 + pitArchW / 2)
    );

    const pitArchGroup = new THREE.Group();
    pitArchGroup.position.copy(pitArchCenter);
    pitArchGroup.lookAt(pitArchCenter.clone().add(pitArchTangent));

    const pLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x2d3748 }));
    pLeft.position.set(-pitArchW / 2 - 0.2, 2.25, 0);
    const pRight = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 4.5, 8), new THREE.MeshStandardMaterial({ color: 0x2d3748 }));
    pRight.position.set(pitArchW / 2 + 0.2, 2.25, 0);

    const pBeam = new THREE.Mesh(new THREE.BoxGeometry(pitArchW + 0.8, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x1a202c }));
    pBeam.position.set(0, 4.5, 0);

    const pPlate = new THREE.Mesh(new THREE.BoxGeometry(pitArchW - 0.4, 0.8, 0.1), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
    pPlate.position.set(0, 3.8, 0.05);

    const pNeon = new THREE.Mesh(new THREE.BoxGeometry(pitArchW - 0.6, 0.08, 0.12), new THREE.MeshBasicMaterial({ color: 0x00ffcc }));
    pNeon.position.set(0, 3.3, 0.06);

    pitArchGroup.add(pLeft, pRight, pBeam, pPlate, pNeon);
    scene.add(pitArchGroup);

    // Start-Finish Arch (終點/起跑大拱門)
    const startPoint = getModifiedTrackSplinePoint(trackSpline, 0);
    const startTangent = getModifiedTrackSplineTangent(trackSpline, 0);
    const startNx = -startTangent.z;
    const startNz = startTangent.x;
    const startN2d = new THREE.Vector2(startNx, startNz).normalize();

    const archGroup = new THREE.Group();
    archGroup.position.copy(startPoint);
    archGroup.lookAt(startPoint.clone().add(startTangent));

    // Arch Pillars
    const pillarLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pillarLeft.position.set(-roadWidth / 2 - 0.5, 3, 0);
    const pillarRight = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 8), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    pillarRight.position.set(roadWidth / 2 + 0.5, 3, 0);

    // Top Beam
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 2, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    crossBeam.position.set(0, 6, 0);

    // Arch sign plate (CHECKER BOARDS)
    const signPlate = new THREE.Mesh(new THREE.BoxGeometry(roadWidth - 2, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x050505 }));
    signPlate.position.set(0, 5.0, 0.15);
    
    archGroup.add(pillarLeft, pillarRight, crossBeam, signPlate);
    scene.add(archGroup);

    // Decorative floating neon pyramids/cube sculptures in background
    const decorGroup = new THREE.Group();
    for (let k = 0; k < 40; k++) {
      const scale = 5 + Math.random() * 20;
      const shapeGeo = Math.random() > 0.5 
        ? new THREE.ConeGeometry(scale * 0.5, scale, 4) 
        : new THREE.BoxGeometry(scale, scale, scale);
      
      const neonColors = [0x00ffff, 0xff00ff, 0xffaa00, 0x00ffaa];
      const selectedColor = neonColors[Math.floor(Math.random() * neonColors.length)];
      const decorMat = new THREE.MeshStandardMaterial({
        color: selectedColor,
        wireframe: true,
        transparent: true,
        opacity: 0.22
      });
      const decor = new THREE.Mesh(shapeGeo, decorMat);
      
      // Spawn at a distance outside the track boundaries
      const distanceScale = 180 + Math.random() * 250;
      const angle = Math.random() * Math.PI * 2;
      const baseY = scale / 2 - 2 + Math.random() * 8;
      decor.position.set(Math.cos(angle) * distanceScale, baseY, Math.sin(angle) * distanceScale);
      
      // Attach movement and rotation dynamics properties to be updated inside gameTick loop
      decor.userData = {
        rotX: Math.random() * 0.4 + 0.1,
        rotY: Math.random() * 0.4 + 0.1,
        bobSpeed: 0.8 + Math.random() * 1.5,
        bobHeight: 3 + Math.random() * 6,
        baseY: baseY
      };
      
      decorGroup.add(decor);
    }
    scene.add(decorGroup);

    // [新增景物 1] Drifting Clouds in the sky (明亮的天空漂浮低面多邊形白雲)
    const cloudsGroup = new THREE.Group();
    for (let i = 0; i < 25; i++) {
      const cloud = new THREE.Group();
      const partsCount = 3 + Math.floor(Math.random() * 4);
      const cloudMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.95,
        metalness: 0.05,
        flatShading: true,
        transparent: true,
        opacity: 0.85
      });
      
      for (let j = 0; j < partsCount; j++) {
        const r = 8 + Math.random() * 10;
        const bit = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), cloudMat);
        bit.position.set(
          (j - partsCount / 2) * 11,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5
        );
        cloud.add(bit);
      }
      
      const cx = (Math.random() - 0.5) * 1200;
      const cy = 130 + Math.random() * 50;
      const cz = (Math.random() - 0.5) * 1200;
      cloud.position.set(cx, cy, cz);
      
      cloud.userData = {
        speed: 6 + Math.random() * 14
      };
      cloudsGroup.add(cloud);
    }
    scene.add(cloudsGroup);

    // [新增景物 2] Cyber windmill/wind turbines along the outer terrain borders (發光風車地景)
    const windmillsGroup = new THREE.Group();
    const trackPointsNum = track.points.length;
    for (let i = 0; i < trackPointsNum; i++) {
      const pt = track.points[i];
      // Offset position left or right from track checkpoints slightly
      const sideSign = i % 2 === 0 ? 1 : -1;
      const x = pt[0] + sideSign * (25 + Math.random() * 15);
      const z = pt[1] + sideSign * (25 + Math.random() * 15);
      
      const windmill = new THREE.Group();
      windmill.position.set(x, 0, z);
      
      // Tower base post
      const towerHeight = 18 + Math.random() * 10;
      const tower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.65, towerHeight, 6),
        new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5 })
      );
      tower.position.y = towerHeight / 2;
      windmill.add(tower);
      
      // Head casing (nacelle)
      const nacelle = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.9, 2.4),
        new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 })
      );
      nacelle.position.set(0, towerHeight, 0);
      windmill.add(nacelle);
      
      // Rotor spinners with glow blades
      const rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, towerHeight, 1.25);
      
      const themeGlowColors = [0x06b6d4, 0xec4899, 0xf59e0b, 0x10b981];
      const selectedGlow = themeGlowColors[i % themeGlowColors.length];
      const bladeMat = new THREE.MeshStandardMaterial({ 
        color: selectedGlow, 
        emissive: selectedGlow,
        emissiveIntensity: 0.8,
        roughness: 0.15 
      });
      
      // 3 blades per windmill rotor
      for (let b = 0; b < 3; b++) {
        const bladeAngle = (b / 3) * Math.PI * 2;
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 7.5, 0.1),
          bladeMat
        );
        blade.rotation.z = bladeAngle;
        // Shift geometry along rotation pivot
        blade.position.set(Math.sin(bladeAngle) * 3, Math.cos(bladeAngle) * 3, 0);
        rotorGroup.add(blade);
      }
      
      windmill.add(rotorGroup);
      
      // Store reference to blade rotor model and speed values inside windmills userData
      windmill.userData = {
        rotor: rotorGroup,
        spinSpeed: 1.2 + Math.random() * 1.8
      };
      
      windmillsGroup.add(windmill);
    }
    scene.add(windmillsGroup);

    // [新增景物 3] Hovering Glow Crystals near the turn curves (空中懸浮發光水晶路標)
    const crystalsGroup = new THREE.Group();
    for (let i = 0; i < trackPointsNum; i++) {
      const pt = track.points[i];
      const crystalColor = [0x06b6d4, 0xec4899, 0xe11d48, 0x10b981][i % 4];
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.5, 0),
        new THREE.MeshStandardMaterial({
          color: crystalColor,
          emissive: crystalColor,
          emissiveIntensity: 1.1,
          transparent: true,
          opacity: 0.85,
          wireframe: true
        })
      );
      
      const sideSign = i % 2 === 0 ? 1 : -1;
      crystal.position.set(pt[0] + sideSign * 18, 4.5, pt[1] - sideSign * 5);
      
      crystal.userData = {
        spinX: 0.6 + Math.random() * 0.8,
        spinY: 1.0 + Math.random() * 1.2,
        bobSpeed: 1.5 + Math.random() * 2.0,
        bobHeight: 1.2,
        baseY: 4.5
      };
      
      crystalsGroup.add(crystal);
    }
    scene.add(crystalsGroup);

    // Clear and reset static colliders list
    staticCollidersRef.current = [];

    // [新增 1] 賽道雙側安全圍欄/柵欄 (Fences along the borders of the track)
    const fencesGroup = new THREE.Group();
    const fenceSteps = 150;
    const fencePostRadius = 0.15;
    const fencePostHeight = 1.6;
    const postGeom = new THREE.CylinderGeometry(fencePostRadius, fencePostRadius, fencePostHeight, 6);
    
    const fenceMetalMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.8,
      roughness: 0.2
    });
    
    const fenceStripedMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, 
      roughness: 0.4
    });

    for (let i = 0; i < fenceSteps; i++) {
      const t1 = i / fenceSteps;
      const t2 = (i + 1) / fenceSteps;
      
      const pt1 = getTrackSplinePoint(track, t1);
      const pt2 = getTrackSplinePoint(track, t2);
      
      const dx = pt2.x - pt1.x;
      const dz = pt2.z - pt1.z;
      const segmentLen = Math.sqrt(dx*dx + dz*dz);
      if (segmentLen < 0.01) continue;
      
      const tx = dx / segmentLen;
      const tz = dz / segmentLen;
      const nx = -tz; 
      const nz = tx;
      
      const angle = Math.atan2(dx, dz);
      const fenceOffset = track.width / 2;
      
      const h1 = getTrackHeightAtT(track, t1);
      const hm = getTrackHeightAtT(track, (t1 + t2) / 2);

      for (const side of [-1, 1]) {
        const sideOffset = fenceOffset * side;
        
        const px = pt1.x + nx * sideOffset;
        const pz = pt1.z + nz * sideOffset;
        
        const post = new THREE.Mesh(postGeom, fenceMetalMat);
        post.position.set(px, h1 + fencePostHeight / 2, pz);
        fencesGroup.add(post);
        
        const rx = (pt1.x + pt2.x) / 2 + nx * sideOffset;
        const rz = (pt1.z + pt2.z) / 2 + nz * sideOffset;
        
        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 0.45, segmentLen),
          i % 2 === 0 ? fenceMetalMat : fenceStripedMat
        );
        rail.position.set(rx, hm + 1.0, rz);
        rail.rotation.y = angle;
        fencesGroup.add(rail);
      }
    }
    scene.add(fencesGroup);

    // [新增 2] 立體低面高山地景 (Majestic low-poly Mountains outside track) or Custom Obstacles
    if (track.obstacles && track.obstacles.length > 0) {
      const customObstaclesGroup = new THREE.Group();
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8, flatShading: true });
      const riverWaterMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7, 
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.75,
        flatShading: true
      });
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
      const leavesMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.85, flatShading: true });

      for (const obs of track.obstacles) {
        if (obs.type === 'mountain') {
          const mHeight = 35 + Math.random() * 20;
          const mRadius = obs.radius;
          const mGeom = new THREE.ConeGeometry(mRadius, mHeight, 5);
          const mountainMesh = new THREE.Mesh(mGeom, rockMat);
          mountainMesh.position.set(obs.x, mHeight / 2, obs.z);
          customObstaclesGroup.add(mountainMesh);

          const capHeight = mHeight * 0.32;
          const capRadius = mRadius * 0.32;
          const capGeom = new THREE.ConeGeometry(capRadius, capHeight, 5);
          const capMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.85, flatShading: true });
          const snowCap = new THREE.Mesh(capGeom, capMat);
          snowCap.position.set(obs.x, mHeight - capHeight / 2, obs.z);
          customObstaclesGroup.add(snowCap);

          staticCollidersRef.current.push({
            x: obs.x,
            z: obs.z,
            radius: obs.radius * 0.82,
            type: 'mountain'
          });
        } else if (obs.type === 'river') {
          const waterRadius = obs.radius;
          const obsT = getClosestTimeOnTrack(track, obs.x, obs.z);
          const distResult = getDistanceFromTrackCenter(track, obs.x, obs.z);
          const baseHeight = distResult.distance < (track.width / 2 + 1.5) ? getTrackHeightAtT(track, obsT) : 0;

          const waterGeo = new THREE.CylinderGeometry(waterRadius, waterRadius - 0.5, 0.4, 8);
          const waterMesh = new THREE.Mesh(waterGeo, riverWaterMat);
          waterMesh.position.set(obs.x, baseHeight + 0.02, obs.z);
          customObstaclesGroup.add(waterMesh);

          for (let j = 0; j < 6; j++) {
            const angle = (j / 6) * Math.PI * 2 + Math.random() * 0.4;
            const dist = waterRadius + 0.5;
            const rxKey = obs.x + Math.sin(angle) * dist;
            const rzKey = obs.z + Math.cos(angle) * dist;
            const rockH = 1.5 + Math.random() * 2.5;

            const rockMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(rockH * 0.5, 1), rockMat);
            rockMesh.position.set(rxKey, baseHeight + rockH * 0.25, rzKey);
            customObstaclesGroup.add(rockMesh);
          }

          staticCollidersRef.current.push({
            x: obs.x,
            z: obs.z,
            radius: obs.radius * 0.95,
            type: 'river'
          });
        } else if (obs.type === 'rock') {
          const obsT = getClosestTimeOnTrack(track, obs.x, obs.z);
          const distResult = getDistanceFromTrackCenter(track, obs.x, obs.z);
          const baseHeight = distResult.distance < (track.width / 2 + 1.5) ? getTrackHeightAtT(track, obsT) : 0;

          const rockMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(obs.radius, 1), rockMat);
          rockMesh.position.set(obs.x, baseHeight + obs.radius * 0.5, obs.z);
          customObstaclesGroup.add(rockMesh);

          staticCollidersRef.current.push({
            x: obs.x,
            z: obs.z,
            radius: obs.radius * 0.9,
            type: 'mountain'
          });
        } else if (obs.type === 'tree') {
          const obsT = getClosestTimeOnTrack(track, obs.x, obs.z);
          const distResult = getDistanceFromTrackCenter(track, obs.x, obs.z);
          const baseHeight = distResult.distance < (track.width / 2 + 1.5) ? getTrackHeightAtT(track, obsT) : 0;

          const treeGroup = new THREE.Group();
          treeGroup.position.set(obs.x, baseHeight, obs.z);

          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.5, 5), trunkMat);
          trunk.position.set(0, 0.75, 0);
          treeGroup.add(trunk);

          const leaves = new THREE.Mesh(new THREE.ConeGeometry(obs.radius, 4.0, 5), leavesMat);
          leaves.position.set(0, 3.5, 0);
          treeGroup.add(leaves);

          customObstaclesGroup.add(treeGroup);

          staticCollidersRef.current.push({
            x: obs.x,
            z: obs.z,
            radius: obs.radius * 0.8,
            type: 'mountain'
          });
        }
      }
      scene.add(customObstaclesGroup);
    } else {
      const mountainsGroup = new THREE.Group();
      for (let m = 0; m < 15; m++) {
        const mx = (Math.random() - 0.5) * 850;
        const mz = (Math.random() - 0.5) * 850;
        
        const td = getDistanceFromTrackCenter(track, mx, mz);
        const minDistanceToTrack = (track.width / 2) + 22; 
        
        if (td.distance < minDistanceToTrack) continue; 
        
        const mHeight = 35 + Math.random() * 55;
        const mRadius = 25 + Math.random() * 25;
        
        const mGeom = new THREE.ConeGeometry(mRadius, mHeight, 5);
        const mColor = track.id === "desert-rally" 
          ? 0x9a3412 
          : track.id === "space-highway" 
          ? 0x3b0764 
          : 0x1e293b;
          
        const mMat = new THREE.MeshStandardMaterial({
          color: mColor,
          roughness: 0.9,
          metalness: 0.1,
          flatShading: true
        });
        
        const mountainMesh = new THREE.Mesh(mGeom, mMat);
        mountainMesh.position.set(mx, mHeight / 2, mz);
        mountainsGroup.add(mountainMesh);
        
        if (track.id !== "desert-rally") {
          const capHeight = mHeight * 0.32;
          const capRadius = mRadius * 0.32;
          const capGeom = new THREE.ConeGeometry(capRadius, capHeight, 5);
          const capMat = new THREE.MeshStandardMaterial({
            color: 0xf8fafc,
            roughness: 0.85,
            flatShading: true
          });
          const snowCap = new THREE.Mesh(capGeom, capMat);
          snowCap.position.set(mx, mHeight - capHeight / 2, mz);
          mountainsGroup.add(snowCap);
        }
        
        staticCollidersRef.current.push({
          x: mx,
          z: mz,
          radius: mRadius * 0.82,
          type: 'mountain'
        });
      }
      scene.add(mountainsGroup);

      // [新增 3] 絕美景觀河流/湖泊 (Scenic water bodies outside track)
      const riversGroup = new THREE.Group();
      const riverWaterMat = new THREE.MeshStandardMaterial({
        color: 0x0284c7, 
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.75,
        flatShading: true
      });
      
      for (let r = 0; r < 8; r++) {
        const rx = (Math.random() - 0.5) * 550;
        const rz = (Math.random() - 0.5) * 550;
        
        const td = getDistanceFromTrackCenter(track, rx, rz);
        if (td.distance < (track.width / 2) + 15) continue;
        
        const waterRadius = 15 + Math.random() * 20;
        const waterGeo = new THREE.CylinderGeometry(waterRadius, waterRadius - 0.5, 0.4, 8);
        const waterMesh = new THREE.Mesh(waterGeo, riverWaterMat);
        waterMesh.position.set(rx, 0.02, rz);
        
        const waterGroup = new THREE.Group();
        waterGroup.add(waterMesh);
        
        const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8, flatShading: true });
        for (let j = 0; j < 6; j++) {
          const angle = (j / 6) * Math.PI * 2 + Math.random() * 0.4;
          const dist = waterRadius + 0.5;
          const rxKey = rx + Math.sin(angle) * dist;
          const rzKey = rz + Math.cos(angle) * dist;
          const rockH = 1.5 + Math.random() * 3.5;
          
          const rTd = getDistanceFromTrackCenter(track, rxKey, rzKey);
          if (rTd.distance > (track.width / 2) + 1.5) {
            const rockMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(rockH * 0.5, 1), rockMat);
            rockMesh.position.set(rxKey, rockH * 0.25, rzKey);
            waterGroup.add(rockMesh);
          }
        }
        riversGroup.add(waterGroup);
        
        staticCollidersRef.current.push({
          x: rx,
          z: rz,
          radius: waterRadius * 0.95,
          type: 'river'
        });
      }
      scene.add(riversGroup);
    }

    // [新增 9] 賽道旁的低多邊形觀眾與加油波浪動畫 (Low-poly spectators cheering alongside the tracks)
    const spectatorsGroup = new THREE.Group();
    const spectatorModelCount = 80;
    
    // Simple blocky body, head, and waving arms
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.7, 0.3);
    const headGeo = new THREE.SphereGeometry(0.2, 5, 5);
    const armGeo = new THREE.BoxGeometry(0.12, 0.4, 0.12);
    
    // Vibrant shirt / spectator colors
    const spectatorColors = [
      0x3b82f6, 0xef4444, 0x10b981, 0xf59e0b, 0xec4899,
      0x8b5cf6, 0x06b6d4, 0xf43f5e, 0x10b981, 0xff7700
    ];
    const skinColor = 0xffd1a4;
    const pantsColor = 0x1e293b;
    
    const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8 });

    for (let s = 0; s < spectatorModelCount; s++) {
      const t = Math.random();
      const pt = getTrackSplinePoint(track, t);
      
      const tNext = (t + 0.005) % 1.0;
      const ptNext = getTrackSplinePoint(track, tNext);
      const dx = ptNext.x - pt.x;
      const dz = ptNext.z - pt.z;
      const len = Math.sqrt(dx*dx + dz*dz) || 1;
      const tx = dx / len;
      const tz = dz / len;
      const nx = -tz;
      const nz = tx;
      
      const side = Math.random() > 0.5 ? 1 : -1;
      const offsetDist = (track.width / 2) + 1.2 + Math.random() * 1.5;
      
      const spectatorX = pt.x + nx * offsetDist * side;
      const spectatorZ = pt.z + nz * offsetDist * side;
      
      const angle = Math.atan2(-nx * side, -nz * side);
      
      const spectator = new THREE.Group();
      spectator.position.set(spectatorX, 0.0, spectatorZ);
      spectator.rotation.y = angle;
      
      const shirtCol = spectatorColors[Math.floor(Math.random() * spectatorColors.length)];
      const shirtMat = new THREE.MeshStandardMaterial({ color: shirtCol, roughness: 0.8 });
      
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.45, 0.25), pantsMat);
      legs.position.set(0, 0.225, 0);
      spectator.add(legs);
      
      const body = new THREE.Mesh(bodyGeo, shirtMat);
      body.position.set(0, 0.75, 0);
      spectator.add(body);
      
      const head = new THREE.Mesh(headGeo, skinMat);
      head.position.set(0, 1.2, 0);
      spectator.add(head);
      
      const armLeft = new THREE.Mesh(armGeo, shirtMat);
      const leftArmGroup = new THREE.Group();
      leftArmGroup.position.set(-0.26, 0.95, 0);
      armLeft.position.set(0, -0.2, 0);
      leftArmGroup.add(armLeft);
      spectator.add(leftArmGroup);
      
      const armRight = new THREE.Mesh(armGeo, shirtMat);
      const rightArmGroup = new THREE.Group();
      rightArmGroup.position.set(0.26, 0.95, 0);
      armRight.position.set(0, -0.2, 0);
      rightArmGroup.add(armRight);
      spectator.add(rightArmGroup);
      
      spectator.userData = {
        leftArm: leftArmGroup,
        rightArm: rightArmGroup,
        waveOffset: Math.random() * Math.PI * 2,
        waveSpeed: 5 + Math.random() * 8,
        jumpSpeed: 3 + Math.random() * 4,
        jumpHeight: 0.1 + Math.random() * 0.15,
        baseY: 0.0
      };
      
      spectatorsGroup.add(spectator);
      
      // Add spectators behind fence as potential static obstacles too (safer collision boundary)
      staticCollidersRef.current.push({
        x: spectatorX,
        z: spectatorZ,
        radius: 0.4,
        type: 'mountain'
      });
    }
    scene.add(spectatorsGroup);

    // [新增 4] 天氣粒子發射器 (Weather points particle precipitation)
    const weatherPartCount = 800;
    const weatherGeo = new THREE.BufferGeometry();
    const weatherPositions = new Float32Array(weatherPartCount * 3);
    const weatherColors = new Float32Array(weatherPartCount * 3);
    const weatherVelocities: { x: number; y: number; z: number }[] = [];
    
    for (let i = 0; i < weatherPartCount; i++) {
      weatherPositions[i * 3] = (Math.random() - 0.5) * 120;
      weatherPositions[i * 3 + 1] = Math.random() * 45;
      weatherPositions[i * 3 + 2] = (Math.random() - 0.5) * 120;
      
      weatherVelocities.push({
        x: (Math.random() - 0.5) * 2.0,
        y: -14 - Math.random() * 18,
        z: (Math.random() - 0.5) * 2.0
      });

      // Neon-cyber colors for the neon fog mode! (magentas, glowing cyans & purples)
      const randValue = Math.random();
      if (randValue < 0.35) {
        // Holographic cyber cyan (0.13, 0.8, 0.95)
        weatherColors[i * 3] = 0.13;
        weatherColors[i * 3 + 1] = 0.82;
        weatherColors[i * 3 + 2] = 0.98;
      } else if (randValue < 0.70) {
        // Hot neon pink/magenta (0.95, 0.15, 0.72)
        weatherColors[i * 3] = 0.98;
        weatherColors[i * 3 + 1] = 0.12;
        weatherColors[i * 3 + 2] = 0.74;
      } else {
        // Electric techno purple (0.65, 0.22, 0.95)
        weatherColors[i * 3] = 0.68;
        weatherColors[i * 3 + 1] = 0.20;
        weatherColors[i * 3 + 2] = 0.96;
      }
    }
    weatherGeo.setAttribute('position', new THREE.BufferAttribute(weatherPositions, 3));
    weatherGeo.setAttribute('color', new THREE.BufferAttribute(weatherColors, 3));
    
    const rainMat = new THREE.PointsMaterial({
      color: 0x06b6d4,
      size: 0.32,
      transparent: true,
      opacity: 0.82
    });
    const snowMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.55,
      transparent: true,
      opacity: 0.95
    });
    const foggyMat = new THREE.PointsMaterial({
      size: 0.85,
      transparent: true,
      opacity: 0.40,
      vertexColors: true,
      blending: THREE.AdditiveBlending
    });
    
    const weatherPoints = new THREE.Points(weatherGeo, rainMat);
    scene.add(weatherPoints);

    // 6. Spawn My Car and initialize position on the grid
    const startOffsetZ = -2.5; // Offset slightly behind start gate
    const offsetRight = -1.5; // Slightly left/right lane
    const myPosStart = startPoint.clone().add(startTangent.clone().multiplyScalar(startOffsetZ)).add(new THREE.Vector3(startN2d.x * offsetRight, 0, startN2d.y * offsetRight));

    const myCarModel = build3DCar(myCarConfig);
    myCarModel.group.position.copy(myPosStart);
    // Align car rotation with start tangent road segment
    const startAngle = Math.atan2(startTangent.x, startTangent.z);
    myCarModel.group.rotation.y = startAngle;
    scene.add(myCarModel.group);

    // --- Create Exhaust Flame Visual Emitters & Point Light ---
    // Outer flame geometry (Cone pointing backward)
    const outerFlameGeo = new THREE.ConeGeometry(0.12, 0.7, 8);
    // Rotate so its tip points backwards
    outerFlameGeo.rotateX(-Math.PI / 2);
    // Shift geometry center so the base of the cone rests at the origin (0, 0, 0)
    outerFlameGeo.translate(0, 0, -0.35);

    const outerFlameMatL = new THREE.MeshBasicMaterial({
      color: 0x00d2ff, // Bright cyan-blue
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const outerFlameMatR = new THREE.MeshBasicMaterial({
      color: 0x00d2ff, // Bright cyan-blue
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });

    const leftExhaust = new THREE.Mesh(outerFlameGeo, outerFlameMatL);
    leftExhaust.position.set(-0.3, -0.18, -1.2);
    myCarModel.group.add(leftExhaust);
    leftExhaustFlameRef.current = leftExhaust;

    const rightExhaust = new THREE.Mesh(outerFlameGeo, outerFlameMatR);
    rightExhaust.position.set(0.3, -0.18, -1.2);
    myCarModel.group.add(rightExhaust);
    rightExhaustFlameRef.current = rightExhaust;

    // Inner core flame geometry (Slightly smaller, hotter core)
    const innerFlameGeo = new THREE.ConeGeometry(0.06, 0.55, 8);
    innerFlameGeo.rotateX(-Math.PI / 2);
    innerFlameGeo.translate(0, 0, -0.275);

    const innerFlameMatL = new THREE.MeshBasicMaterial({
      color: 0xffffff, // White core
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const innerFlameMatR = new THREE.MeshBasicMaterial({
      color: 0xffffff, // White core
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });

    const leftCore = new THREE.Mesh(innerFlameGeo, innerFlameMatL);
    leftExhaust.add(leftCore); // Attached to outer flame
    leftExhaustCoreRef.current = leftCore;

    const rightCore = new THREE.Mesh(innerFlameGeo, innerFlameMatR);
    rightExhaust.add(rightCore);
    rightExhaustCoreRef.current = rightCore;

    // Dynamic point light for the ground glow behind the car
    const exhaustLight = new THREE.PointLight(0x00e5ff, 0, 5, 1.5);
    exhaustLight.position.set(0, -0.18, -1.4);
    myCarModel.group.add(exhaustLight);
    exhaustLightRef.current = exhaustLight;

    myPhysicsRef.current.x = myPosStart.x;
    myPhysicsRef.current.y = 0.01;
    myPhysicsRef.current.z = myPosStart.z;
    myPhysicsRef.current.ry = startAngle;
    myPhysicsRef.current.speed = 0;
    myPhysicsRef.current.steering = 0;
    myPhysicsRef.current.driveStartTime = 0;
    myPhysicsRef.current.totalLaps = track.isOpen ? 1 : 3;

    // Save references to my car
    racersRef.current[playerId] = {
      player: {
        id: playerId,
        name: t("me") + " (Me)",
        carConfig: myCarConfig,
        x: myPhysicsRef.current.x,
        y: myPhysicsRef.current.y,
        z: myPhysicsRef.current.z,
        ry: myPhysicsRef.current.ry,
        speed: 0,
        steering: 0,
        lap: 1,
        progress: 0,
        bestTime: 0,
        isReady: true
      },
      model: myCarModel,
      targetPos: new THREE.Vector3(),
      targetRy: startAngle,
      targetSteering: 0,
      currentProgress: 0
    };

    // 7. Spawn Connected Rivals
    Object.values(initialPlayers).forEach((p) => {
      if (p.id !== playerId) {
        addRivalCarToSceneOnMount(scene, p);
      }
    });

    // Helper functions for dynamically registering online racers
    function addRivalCarToSceneOnMount(targetScene: THREE.Scene, r: Player) {
      if (racersRef.current[r.id]) return;

      const model = build3DCar(r.carConfig);
      
      // Secure numeric fallbacks to prevent NaN or undefined coordinate crashes
      let rx = typeof r.x === 'number' && !isNaN(r.x) ? r.x : 0;
      let ry = typeof r.y === 'number' && !isNaN(r.y) ? r.y : 0.01;
      let rz = typeof r.z === 'number' && !isNaN(r.z) ? r.z : 0;
      let rRotationY = typeof r.ry === 'number' && !isNaN(r.ry) ? r.ry : 0;

      // Align ALL players (AI bots and other human players alike) on the starting grid matching their deterministic slots
      const allRacerIds = Object.keys(initialPlayers).sort();
      const racerIndex = allRacerIds.indexOf(r.id);
      
      if (racerIndex !== -1) {
        // Staggered behind start gate matching the sorted racer registry order
        const botOffsetZ = -2.5 - racerIndex * 4.8;
        // Alternate lanes
        const botOffsetRight = (racerIndex % 2 === 0) ? -1.8 : 1.8;
        
        const botStartPos = startPoint.clone()
          .add(startTangent.clone().multiplyScalar(botOffsetZ))
          .add(new THREE.Vector3(startN2d.x * botOffsetRight, 0, startN2d.y * botOffsetRight));
        
        rx = botStartPos.x;
        ry = 0.01;
        rz = botStartPos.z;
        rRotationY = Math.atan2(startTangent.x, startTangent.z);
        
        // Update model properties
        r.x = rx;
        r.y = ry;
        r.z = rz;
        r.ry = rRotationY;
      }

      model.group.position.set(rx, ry, rz);
      model.group.rotation.y = rRotationY;
      targetScene.add(model.group);

      racersRef.current[r.id] = {
        player: r,
        model,
        targetPos: new THREE.Vector3(rx, ry, rz),
        targetRy: rRotationY,
        targetSteering: r.steering,
        currentProgress: r.progress
      };
    }

    // (Note: Keyboard listeners moved to a dedicated useEffect to support explicit re-binding & auto-focus)

    // --- GAME TICK LOOP (60FPS animation frames) ---
    let frameId: number;
    let lastTickTime = performance.now();
    let networkSendCooldown = 0;
    let leaderboardUpdateCooldown = 0;
    let leaderboardLocked = false;
    let driftFactor = 0;

    const gameTick = () => {
      frameId = requestAnimationFrame(gameTick);
      const now = performance.now();
      const deltaTime = Math.min((now - lastTickTime) / 1000, 0.1); // Cap delta to avoid giant physics jumps
      lastTickTime = now;

      const phys = myPhysicsRef.current;

      // Check if vehicle damage reaches 100% and trigger explosion/teleportation
      if (!isReplayingRef.current && damageRef.current >= 100 && !isExplodedRef.current) {
        if (track.id === "space-highway") {
          // Space Highway special: instantly teleport to the flat ground before going up the bridge (t = 0.36)
          const recoveryT = 0.36;
          const centerPt = getTrackSplinePoint(track, recoveryT);
          phys.x = centerPt.x;
          phys.z = centerPt.z;
          phys.y = getTrackHeightAtT(track, recoveryT);
          phys.speed = 0;
          phys.vx = 0;
          phys.vz = 0;

          // Align vehicle orientation with the track tangent
          const tangent = getModifiedTrackSplineTangent(trackSpline, recoveryT);
          phys.ry = Math.atan2(tangent.x, tangent.z);

          damageRef.current = 0;
          setDamagePercent(0);

          // Clear any active altitude alerts
          setHighAltitudeAlert(null);

          // Spawn warp teleportation visual effects and play sound
          spawnSparkBurst(scene, phys.x, phys.y + 0.3, phys.z, 0x00ffcc, 12.0);
          audioSystem.playClick("high");
        } else {
          // Standard explosion behavior for other tracks
          isExplodedRef.current = true;
          setIsExploded(true);
          explosionTimerRef.current = 2.0;
          
          phys.speed = 0;
          phys.vx = 0;
          phys.vz = 0;
          
          audioSystem.playCrash(12.0);
          spawnCollisionDebris(scene, phys.x, phys.y, phys.z, phys.ry, myCarConfig?.paint || "#ff3366", 40);
          for (let i = 0; i < 8; i++) {
            spawnSparkBurst(scene, phys.x + (Math.random() - 0.5) * 1.5, phys.y + Math.random() * 0.8, phys.z + (Math.random() - 0.5) * 1.5, 0xff5500, 10.0);
            spawnSparkBurst(scene, phys.x + (Math.random() - 0.5) * 1.5, phys.y + Math.random() * 0.8, phys.z + (Math.random() - 0.5) * 1.5, 0xffaa00, 8.0);
          }
          collisionShakeIntensityRef.current = Math.max(collisionShakeIntensityRef.current, 1.2);
        }
      }

      if (isExplodedRef.current) {
        explosionTimerRef.current -= deltaTime;
        phys.speed = 0;
        phys.vx = 0;
        phys.vz = 0;
        
        if (Math.random() > 0.4) {
          spawnSparkBurst(scene, phys.x + (Math.random() - 0.5) * 0.8, phys.y + Math.random() * 0.4, phys.z + (Math.random() - 0.5) * 0.8, 0xff5500, 2.0);
        }
        
        if (explosionTimerRef.current <= 0) {
          isExplodedRef.current = false;
          setIsExploded(false);
          damageRef.current = 0;
          setDamagePercent(0);
          
          const recoveryT = getClosestTimeOnTrack(track, phys.x, phys.z);
          const centerPt = getTrackSplinePoint(track, recoveryT);
          phys.x = centerPt.x;
          phys.z = centerPt.z;
          phys.speed = 0;
          phys.vx = 0;
          phys.vz = 0;
          
          spawnSparkBurst(scene, phys.x, 0.5, phys.z, 0x00ffcc, 6.0);
          audioSystem.playClick("high");
        }
      }

      const keys = isExplodedRef.current ? {} : keysPressed.current;

      // Handle Current Lap Time
      if (roomStateRef.current === 'racing' && !phys.finished) {
        const lapElapsed = Date.now() - phys.lapStartTime;
        setCurrentLapTime(lapElapsed);

        // Ghost Mode Track Recording (Throttle to every 80ms to avoid huge arrays while maintaining high precision)
        const realNow = Date.now();
        if (realNow - lastRecordedTimeRef.current >= 80) {
          currentLapPointsRef.current.push({
            time: lapElapsed,
            x: phys.x,
            y: phys.y,
            z: phys.z,
            ry: phys.ry
          });
          lastRecordedTimeRef.current = realNow;
        }

        const totalRaceElapsed = Date.now() - phys.raceStartTime;
        setRaceTime(totalRaceElapsed);

        // Track speed test statistics in real time on the 3000m straight track
        if (track.id === 'speed-test' || track.isOpen) {
          const speedKmh = Math.round(Math.abs(phys.speed) * 3);
          const currentProgress = latestProgressRef.current;
          const currentDist = currentProgress * (track.id === 'speed-test' ? 3000 : 1000);
          
          let hasChanges = false;
          const nextRepo = { ...speedTestRepoRef.current };

          // Max Speed
          if (speedKmh > nextRepo.maxSpeed) {
            nextRepo.maxSpeed = speedKmh;
            hasChanges = true;
          }

          // We only start counting time once the player starts moving (speed > 1)
          if (Math.abs(phys.speed) > 0.5) {
            if (!phys.driveStartTime) {
              phys.driveStartTime = Date.now();
            }
            const elapsedSec = (Date.now() - phys.driveStartTime) / 1000;

            if (speedKmh >= 100 && nextRepo.time0To100 === null) {
              nextRepo.time0To100 = elapsedSec;
              hasChanges = true;
            }
            if (speedKmh >= 200 && nextRepo.time0To200 === null) {
              nextRepo.time0To200 = elapsedSec;
              hasChanges = true;
            }
            if (currentDist >= 400 && nextRepo.time400m === null) {
              nextRepo.time400m = elapsedSec;
              hasChanges = true;
            }
            if (currentDist >= 1000 && nextRepo.time1000m === null) {
              nextRepo.time1000m = elapsedSec;
              hasChanges = true;
            }
            if (track.id === 'speed-test' && currentDist >= 2950 && nextRepo.time3000m === null) {
              nextRepo.time3000m = elapsedSec;
              hasChanges = true;
            }
          }

          if (hasChanges) {
            setSpeedTestRepo(nextRepo);
          }
        }
      }

      // --- 1. LOCAL PLAYER PHYSICS SIMULATION ---
      const engineLevelNum = Number(myCarConfig?.engineLevel ?? 1) || 1;
      const weightLevelNum = Number(myCarConfig?.weightLevel ?? 3) || 3;
      const wheelTypeStr = myCarConfig?.wheelType || "sport";

      const maxEngineSpeed = 35 + engineLevelNum * 4 - weightLevelNum * 0.8;
      const accelFactor = 12 + (6 - weightLevelNum) * 2;
      const steeringMaxAngle = 0.5; // Radians maximum wheel pivot Visual
      const turnSpeed = 2.4 - weightLevelNum * 0.1; // Rotational factor speed
      const dragGridFriction = track.physicsFriction; // e.g. 0.985
      
      const isDrifting = keys[" "] || keys["spacebar"];

      // Check off-road environment penalty
      const terrainDist = getDistanceFromTrackCenter(track, phys.x, phys.z);
      
      const curveT = getClosestTimeOnTrack(track, phys.x, phys.z);
      const splinePt = getModifiedTrackSplinePoint(trackSpline, curveT);
      const tangent = getModifiedTrackSplineTangent(trackSpline, curveT);
      const nx = -tangent.z;
      const nz = tangent.x;
      const normal2D = new THREE.Vector2(nx, nz).normalize();

      // Vector from track center point to car
      const carVec = new THREE.Vector2(phys.x - splinePt.x, phys.z - splinePt.z);
      const lateralOffset = carVec.dot(normal2D);

      let isOffroad = terrainDist.distance > (track.width / 2);

      // Pit Stop check & logic
      let inPit = false;
      let pitW = 0;
      if (curveT >= 0.80 && curveT <= 0.95) {
        const factor = Math.sin(((curveT - 0.80) / 0.15) * Math.PI);
        pitW = factor * 7.5;
        
        // If the car is on the right-hand side, inside the pit lane zone
        if (lateralOffset < -track.width / 3.5 && lateralOffset >= -track.width / 2 - pitW - 2.0) {
          inPit = true;
          isOffroad = false; // Override: pit lane is part of the track
        }
      }

      // Handle Pit Lane trigger actions
      if (inPit && !isReplayingRef.current) {
        if (!isInPitLaneRef.current) {
          isInPitLaneRef.current = true;
          setIsInPitLane(true);
          audioSystem.playClick("high"); // Play entry sound effect
        }

        // Limit pit speed to 15.0 max (approx. 45 km/h)
        if (phys.speed > 15.0) {
          phys.speed = THREE.MathUtils.lerp(phys.speed, 15.0, deltaTime * 5);
        } else if (phys.speed < -15.0) {
          phys.speed = THREE.MathUtils.lerp(phys.speed, -15.0, deltaTime * 5);
        }

        // 1. Repair damage if damaged
        let isHealing = false;
        if (damageRef.current > 0) {
          damageRef.current = Math.max(0, damageRef.current - 45 * deltaTime);
          setDamagePercent(Math.round(damageRef.current));
          setPitRepairing(true);
          isHealing = true;
          if (Math.random() > 0.4) {
            spawnPitStopHealParticles(scene, phys.x, phys.z, phys.ry, 0x00ffcc);
          }
        } else {
          setPitRepairing(false);
        }

        // 2. Refill nitro energy if not full
        let isRefueling = false;
        if (nitroEnergyRef.current < 100) {
          nitroEnergyRef.current = Math.min(100, nitroEnergyRef.current + 85 * deltaTime);
          setNitroEnergy(Math.round(nitroEnergyRef.current));
          setPitRefueling(true);
          isRefueling = true;
          if (Math.random() > 0.4) {
            spawnPitStopHealParticles(scene, phys.x, phys.z, phys.ry, 0x38bdf8);
          }
        } else {
          setPitRefueling(false);
        }

        // Trigger finish animation when fully repaired and refueled
        if (!isHealing && !isRefueling && (pitRepairing || pitRefueling)) {
          setPitCompleteAnimation(true);
          setTimeout(() => setPitCompleteAnimation(false), 2000);
          setPitRepairing(false);
          setPitRefueling(false);
        }
      } else {
        if (isInPitLaneRef.current) {
          isInPitLaneRef.current = false;
          setIsInPitLane(false);
          setPitRepairing(false);
          setPitRefueling(false);
        }
      }

      setOffroadWarning(isOffroad && !isReplayingRef.current);

      // Calculate proximity warning for tight turns & high obstacle density alert zones
      let nearTurn = false;
      let nearObstacle = false;
      alertZones.forEach(zone => {
        const dist = Math.hypot(phys.x - zone.x, phys.z - zone.z);
        // Warning threshold of 55 meters
        if (dist < 55) {
          if (zone.type === 'turn') {
            nearTurn = true;
          } else if (zone.type === 'obstacle') {
            nearObstacle = true;
          }
        }
      });
      setApproachingTurnAlert(nearTurn && !isReplayingRef.current);
      setApproachingObstacleAlert(nearObstacle && !isReplayingRef.current);

      // Tire Grip Penalty - apply offroad penalty as requested
      const currentFriction = isOffroad ? 0.85 : (isDrifting ? 0.92 : dragGridFriction);

      if (isReplayingRef.current) {
        const replayState = raceReplayStateRef.current;
        if (replayState && replayState.playerPositions.length > 0) {
          const idx = replayIndexRef.current;
          if (idx < replayState.playerPositions.length) {
            const pos = replayState.playerPositions[idx];
            const steer = replayState.steerInputs[idx];
            phys.x = pos.x;
            phys.y = pos.y;
            phys.z = pos.z;
            phys.ry = pos.ry;
            phys.steering = steer;
            phys.speed = pos.speed;
            
            // Synchronously play back other participants' paths matching the player thread timeline scale
            const ratio = idx / (replayState.playerPositions.length || 1);
            Object.keys(racersRef.current).forEach((rId) => {
              if (rId === playerId) return;
              const rival = racersRef.current[rId];
              const pathData = allParticipantsPathsRef.current[rId];
              if (rival && pathData && pathData.points.length > 0) {
                const ptId = Math.min(pathData.points.length - 1, Math.floor(ratio * pathData.points.length));
                const currentPt = pathData.points[ptId];
                rival.targetPos.set(currentPt.x, 0.01, currentPt.z);
                
                const nextPtId = Math.min(pathData.points.length - 1, ptId + 1);
                const nextPt = pathData.points[nextPtId];
                const dx = nextPt.x - currentPt.x;
                const dz = nextPt.z - currentPt.z;
                if (dx * dx + dz * dz > 0.01) {
                  rival.targetRy = Math.atan2(dx, dz);
                }
              }
            });
            
            replayIndexRef.current = idx + 1;
          } else {
            // Loop replay from the beginning
            replayIndexRef.current = 0;
          }
        } else {
          setIsReplaying(false);
        }
      } else if (roomStateRef.current === 'racing' && !phys.finished) {
        // Dynamic weather vehicle physics penalty modifiers
        let finalAccel = accelFactor;
        let finalBrake = accelFactor * 0.8;
        const curW = currentWeatherRef.current;
        if (curW === "rainy") {
          finalAccel *= 0.84; // 16% acceleration delay (wheel spin slipping)
          finalBrake *= 0.62; // 38% brake force loss (hydroplaning)
        } else if (curW === "foggy") {
          finalAccel *= 0.92; // 8% grip slip
          finalBrake *= 0.76; // 24% longer braking distance
        } else if (curW === "snowy") {
          finalAccel *= 0.68; // 32% wheel spin on snow
          finalBrake *= 0.44; // 56% braking force loss
        }

        // Accelerate / Brake keys
        if (keys["w"] || keys["arrowup"] || keys["up"]) {
          phys.speed += finalAccel * deltaTime;
        } else if (keys["s"] || keys["arrowdown"] || keys["down"]) {
          phys.speed -= finalBrake * deltaTime;
        } else {
          // Rolling friction standard (slippery surface allows car to glide longer when coasting)
          const coastDecel = curW === "rainy" ? 0.988 : (curW === "snowy" ? 0.993 : 0.98);
          phys.speed *= Math.pow(coastDecel, deltaTime * 60);
        }

        // Decrement nitro cooldown timer if active
        if (nitroCooldownRef.current > 0.0) {
          nitroCooldownRef.current = Math.max(0.0, nitroCooldownRef.current - deltaTime);
          if (!phys.finished && !isReplayingRef.current) {
            setNitroCooldown(nitroCooldownRef.current);
          }
        }

        // Apply Nitro boost handling if holding Shift and not in cooldown
        if (keys["shift"] && nitroCooldownRef.current <= 0.0 && nitroEnergyRef.current > 0.0) {
          if (!isNitroActiveRef.current) {
            nitroUsedCountRef.current += 1;
            audioSystem.playNitro();
          }
          nitroEnergyRef.current = Math.max(0.0, nitroEnergyRef.current - 35.0 * deltaTime);
          isNitroActiveRef.current = true;
          setIsNitroActive(true);
          
          // Track continuous active duration to prevent abuse
          nitroActiveDurationRef.current += deltaTime;
          
          // Accelerate even faster!
          phys.speed += finalAccel * 1.7 * deltaTime;
          
          // Generate the Blue flame particle effects we implemented!
          if (Math.random() > 0.15) {
            createNitroFlame(scene, phys.x, phys.z, phys.ry);
          }

          // Enforce max continuous limit of 2.5 seconds
          if (nitroActiveDurationRef.current >= 2.5 || nitroEnergyRef.current <= 0.0) {
            isNitroActiveRef.current = false;
            setIsNitroActive(false);
            nitroCooldownRef.current = 6.0; // 6 seconds of cooldown
            setNitroCooldown(6.0);
            nitroActiveDurationRef.current = 0.0;
          }
        } else {
          // If they were boosting but stopped/released/depleted, trigger cooldown immediately
          if (isNitroActiveRef.current) {
            isNitroActiveRef.current = false;
            setIsNitroActive(false);
            nitroCooldownRef.current = 6.0;
            setNitroCooldown(6.0);
            nitroActiveDurationRef.current = 0.0;
          } else {
            // Auto recharge nitro (refill to 100 maximum) if not active and no active boost
            nitroEnergyRef.current = Math.min(100.0, nitroEnergyRef.current + 14.0 * deltaTime);
          }
        }

        if (!phys.finished && !isReplayingRef.current) {
          setNitroEnergy(nitroEnergyRef.current);
        }

        // Steer keys A / D
        let steerTarget = 0;
        if (keys["a"] || keys["arrowleft"] || keys["left"]) {
          steerTarget = -1;
        } else if (keys["d"] || keys["arrowright"] || keys["right"]) {
          steerTarget = 1;
        }

        // Front tire steering angle smoothing (lerping)
        phys.steering = THREE.MathUtils.lerp(phys.steering, steerTarget, deltaTime * 10);

        // Turn speed increases with velocity but declines at high rates or standstill
        const turnScale = Math.min(Math.abs(phys.speed) / 10, 1.0) * (phys.speed > 0 ? 1 : -0.5);
        const slipFrictionAngle = isDrifting ? 1.7 : 1.0;
        
        phys.ry -= phys.steering * turnSpeed * turnScale * slipFrictionAngle * deltaTime;
      } else {
        // AI Decelerate before countdown starts or at race completion screen (converted to frame-rate-independent)
        phys.speed *= Math.pow(0.92, deltaTime * 60);
        phys.steering = THREE.MathUtils.lerp(phys.steering, 0, deltaTime * 6);
        isNitroActiveRef.current = false;
        setIsNitroActive(false);
      }

      if (!isReplayingRef.current) {
        // Apply drag capping - increased top speed cap when using nitro, limit to 10 when offroad
        let currentTerminalSpeed = isNitroActiveRef.current ? maxEngineSpeed * 1.35 : maxEngineSpeed;
        if (isOffroad) {
          currentTerminalSpeed = 10.0;
        }
        if (phys.speed > currentTerminalSpeed) phys.speed = currentTerminalSpeed;
        if (phys.speed < -currentTerminalSpeed * 0.3) phys.speed = -currentTerminalSpeed * 0.3;

        // Friction applied using frame-rate-independent power calculation
        phys.speed *= Math.pow(currentFriction, deltaTime * 60);

        // Update position using persistent lateral drift vectors
        const targetVx = phys.speed * Math.sin(phys.ry);
        const targetVz = phys.speed * Math.cos(phys.ry);

        // Drift low-grip physical properties triggered by Spacebar
        const activeDrift = (keys[" "] || keys["spacebar"]) && Math.abs(phys.speed) > 3.0;
        
        // Fine-tune ground tire lateral grip based on current weather condition to increase driving difficulty
        let weatherGripMultiplier = 1.0;
        const curW = currentWeatherRef.current;
        if (curW === "rainy") {
          // Misty Drizzle: wet asphalt causing 38% grip loss
          weatherGripMultiplier = 0.62;
        } else if (curW === "foggy") {
          // Neon Fog: dew condensation causing 24% grip loss
          weatherGripMultiplier = 0.76;
        } else if (curW === "snowy") {
          // Snowy icy slippery surface: extreme 60% grip slippage
          weatherGripMultiplier = 0.40;
        }

        const gripCoeff = (activeDrift ? 2.8 : 22.0) * weatherGripMultiplier;

        if (phys.vx === 0 && phys.vz === 0 && phys.speed !== 0) {
          phys.vx = targetVx;
          phys.vz = targetVz;
        }

        phys.vx = THREE.MathUtils.lerp(phys.vx || 0, targetVx, deltaTime * gripCoeff);
        phys.vz = THREE.MathUtils.lerp(phys.vz || 0, targetVz, deltaTime * gripCoeff);

        // Retain engine fuel or slide tire friction resistance
        if (activeDrift && Math.abs(phys.steering) > 0.15) {
          phys.speed *= Math.pow(0.978, deltaTime * 60);
        }

        phys.x += phys.vx * deltaTime;
        phys.z += phys.vz * deltaTime;

        // --- SPEED-GATED ELEVATION REGION LOGIC ---
        const currentPhysT = getClosestTimeOnTrack(track, phys.x, phys.z);
        const targetTrackHeight = getTrackHeightAtT(track, currentPhysT);

        if (targetTrackHeight > 0.01) {
          // Drive smoothly up and down the bridge with no speed-gated limits!
          phys.y = THREE.MathUtils.lerp(phys.y, targetTrackHeight, deltaTime * 8);
        } else {
          // Standard ground-level driving
          phys.y = THREE.MathUtils.lerp(phys.y, 0.01, deltaTime * 8);
        }
        setHighAltitudeAlert(null); // Explicitly disable any high-altitude overlay alerts

        // Initialize frame-specific scraping state trackers
        let isScrapingThisFrame = false;
        let highestScrapeIntensity = 0;

        // [新增 5] 雙側柵欄實體碰撞反應 (Track-side fences physical collision and bounce responses)
        const fenceCollisionDistance = (track.width / 2) - 0.6;
        
        // Check for active high-frequency rubbing / side-brushing against fences
        if (terrainDist.distance >= fenceCollisionDistance - 0.18 && Math.abs(phys.speed) > 1.5) {
          isScrapingThisFrame = true;
          highestScrapeIntensity = Math.max(highestScrapeIntensity, Math.min(3.0, Math.abs(phys.speed) * 0.45));
        }

        if (terrainDist.distance > fenceCollisionDistance) {
          const dx = phys.x - terrainDist.trackPoint.x;
          const dz = phys.z - terrainDist.trackPoint.z;
          const dist = Math.sqrt(dx*dx + dz*dz);
          if (dist > 0.01) {
            const nx = dx / dist;
            const nz = dz / dist;
            
            phys.x = terrainDist.trackPoint.x + nx * fenceCollisionDistance;
            phys.z = terrainDist.trackPoint.z + nz * fenceCollisionDistance;
            
            const impactSpeed = Math.abs(phys.speed);
            
            // Push their dynamic velocities away from the wall (bounce effect)
            const normalX = nx;
            const normalZ = nz;
            const bounceForce = Math.max(3.0, impactSpeed * 0.4);
            phys.vx = normalX * bounceForce;
            phys.vz = normalZ * bounceForce;
            
            // Reduce forward speed without reversing sign to avoid rapid oscillation/lock-up
            phys.speed = Math.max(0, phys.speed * 0.55);
            
            // Apply damage and physical dent deformation on collision
            if (impactSpeed > 2.0 && !isReplayingRef.current) {
              const damageAmount = Math.min(25, Math.ceil(impactSpeed * 0.9));
              damageRef.current = Math.min(100, damageRef.current + damageAmount);
              if (!phys.finished && !isReplayingRef.current) {
                setDamagePercent(damageRef.current);
              }
              applyVisualDamageToMesh(myCarModel.bodyMesh, damageAmount);
              flashCarBodyMaterial(myCarModel.bodyMesh);
              
              if (impactSpeed > 4.5) {
                const debrisCount = Math.min(10, Math.floor(impactSpeed * 1.2));
                spawnCollisionDebris(scene, phys.x, phys.y, phys.z, phys.ry, myCarConfig.paint, debrisCount);
              }
            }
            
            spawnSparkBurst(scene, phys.x, 0.4, phys.z, 0xffaa00, impactSpeed);
            audioSystem.playCrash(impactSpeed);
            if (!isReplayingRef.current) {
              collisionCountRef.current += 1;
            }
            
            // Subtle collision screen shake proportional to impact speed
            const shakeVal = Math.min(0.45, impactSpeed * 0.055);
            if (shakeVal > 0.02) {
              collisionShakeIntensityRef.current = Math.max(collisionShakeIntensityRef.current, shakeVal);
            }
            
            isScrapingThisFrame = true;
            highestScrapeIntensity = Math.max(highestScrapeIntensity, Math.min(4.5, impactSpeed));
          }
        }

        // [新增 6] 靜態背景高山與河流/湖底實體阻隔 (Static physical obstacles colliders - Mountains & Rivers)
        for (const col of staticCollidersRef.current) {
          const dx = phys.x - col.x;
          const dz = phys.z - col.z;
          const distSq = dx*dx + dz*dz;
          const colLimit = col.radius + 1.25; 
          
          // Check for gentle rubbing / sliding close to static barriers
          if (distSq < (colLimit + 0.18) * (colLimit + 0.18) && Math.abs(phys.speed) > 1.5) {
            isScrapingThisFrame = true;
            highestScrapeIntensity = Math.max(highestScrapeIntensity, Math.min(3.0, Math.abs(phys.speed) * 0.40));
          }

          if (distSq < colLimit * colLimit) {
            const dist = Math.sqrt(distSq) || 0.001;
            const px = dx / dist;
            const pz = dz / dist;
            
            phys.x = col.x + px * colLimit;
            phys.z = col.z + pz * colLimit;
            
            const impactSpeed = Math.abs(phys.speed);
            phys.speed = -phys.speed * 0.3; // bounce back
            
            // Apply extra impact wear from heavy static background colliders
            if (impactSpeed > 2.0 && !isReplayingRef.current) {
              const damageAmount = Math.min(30, Math.ceil(impactSpeed * 1.2));
              damageRef.current = Math.min(100, damageRef.current + damageAmount);
              if (!phys.finished && !isReplayingRef.current) {
                setDamagePercent(damageRef.current);
              }
              applyVisualDamageToMesh(myCarModel.bodyMesh, damageAmount);
              flashCarBodyMaterial(myCarModel.bodyMesh);
              
              if (impactSpeed > 4.2) {
                const debrisCount = Math.min(10, Math.floor(impactSpeed * 1.2));
                spawnCollisionDebris(scene, phys.x, phys.y, phys.z, phys.ry, myCarConfig.paint, debrisCount);
              }
            }
            
            const particleColor = col.type === 'river' ? 0x0ea5e9 : 0xef4444;
            spawnSparkBurst(scene, phys.x, 0.4, phys.z, particleColor, impactSpeed);
            audioSystem.playCrash(impactSpeed);

            // Subtle collision screen shake proportional to impact speed
            const shakeVal = Math.min(0.45, impactSpeed * 0.055);
            if (shakeVal > 0.02) {
              collisionShakeIntensityRef.current = Math.max(collisionShakeIntensityRef.current, shakeVal);
            }

            isScrapingThisFrame = true;
            highestScrapeIntensity = Math.max(highestScrapeIntensity, Math.min(4.5, impactSpeed));
          }
        }

        // --- [新增] 車輛間物理碰撞、火花與畫面震動反應 (Vehicle-to-Vehicle collision, sparks & screen shake) ---
        Object.keys(racersRef.current).forEach((rId) => {
          if (rId === playerId) return;
          const rival = racersRef.current[rId];
          if (!rival) return;

          const rx = rival.model?.group?.position?.x !== undefined ? rival.model.group.position.x : rival.player.x;
          const rz = rival.model?.group?.position?.z !== undefined ? rival.model.group.position.z : rival.player.z;

          const vdx = phys.x - rx;
          const vdz = phys.z - rz;
          const distSq = vdx * vdx + vdz * vdz;
          const colLimit = 2.4; // 1.2 radius for each vehicle to prevent inter-clipping

          if (distSq < colLimit * colLimit) {
            const dist = Math.sqrt(distSq) || 0.001;
            const px = vdx / dist;
            const pz = vdz / dist;

            // Push player out of collision smoothly to avoid overlap
            const overlap = colLimit - dist;
            phys.x += px * overlap * 0.5;
            phys.z += pz * overlap * 0.5;

            // Push AI bot in the opposite direction if it's an AI opponent
            const botData = (rival as any).userData;
            if (rId.startsWith("ai-bot-") && botData && botData.isInitialized) {
              botData.physicalX -= px * overlap * 0.5;
              botData.physicalZ -= pz * overlap * 0.5;
              
              // Apply physical impulse velocity
              const impulse = Math.max(1.5, Math.abs(phys.speed)) * 0.75;
              botData.pushX -= px * impulse;
              botData.pushZ -= pz * impulse;
              
              // Reduce bot's speed on collision impact
              botData.speed = Math.max(3.0, botData.speed * 0.4);
            }

            const impactSpeed = Math.abs(phys.speed);
            phys.speed = -phys.speed * 0.25; // Soft bounce back

            // Screen-shake intensity proportional to impact speed
            const shakeVal = Math.min(0.5, impactSpeed * 0.06);
            if (shakeVal > 0.02) {
              collisionShakeIntensityRef.current = Math.max(collisionShakeIntensityRef.current, shakeVal);
            }

            if (!isReplayingRef.current) {
              // Bright golden sparks for metal-on-metal vehicle collisions!
              spawnSparkBurst(scene, (phys.x + rx) / 2, phys.y + 0.3, (phys.z + rz) / 2, 0xffd700, Math.max(1.5, impactSpeed));
              audioSystem.playCrash(Math.max(1.0, impactSpeed));
              collisionCountRef.current += 1;

              // Vehicle structural damage calculations
              const damageAmount = Math.min(15, Math.ceil(impactSpeed * 0.6));
              if (damageAmount > 0) {
                damageRef.current = Math.min(100, damageRef.current + damageAmount);
                if (!phys.finished) {
                  setDamagePercent(damageRef.current);
                }
                applyVisualDamageToMesh(myCarModel.bodyMesh, damageAmount);
                flashCarBodyMaterial(myCarModel.bodyMesh);

                // Also apply visual physical denting & body red flash to the rival's model to signify solid impact
                if (rival.model && rival.model.bodyMesh) {
                  applyVisualDamageToMesh(rival.model.bodyMesh, damageAmount);
                  flashCarBodyMaterial(rival.model.bodyMesh);
                }
              }
            }
          }
        });

        // Trigger continuous scraping effects dynamically based on track friction states
        if (isScrapingThisFrame && !isReplayingRef.current) {
          audioSystem.setScrapeRattle(true, highestScrapeIntensity);
          
          // Spawn continuous metal stream sparks with velocity vectors following vehicle motion
          if (Math.random() > 0.08) {
            const sparkY = 0.15 + Math.random() * 0.3;
            // Place sparks slightly back or side to simulation realistic friction contact
            const backOffsetX = -Math.sin(phys.ry) * 0.4 + (Math.random() - 0.5) * 0.35;
            const backOffsetZ = -Math.cos(phys.ry) * 0.4 + (Math.random() - 0.5) * 0.35;
            spawnSparkBurst(scene, phys.x + backOffsetX, sparkY, phys.z + backOffsetZ, 0xffbb00, highestScrapeIntensity * 0.7);
          }
        } else {
          audioSystem.setScrapeRattle(false);
        }

        // Outer Bounds check for bottomless space tracks (太空高架 fell into outer-space!)
        if (track.id === "space-highway" && terrainDist.distance > 40) {
          // Respawn on nearest track lane center!
          const recoveryT = getClosestTimeOnTrack(track, phys.x, phys.z);
          const centerPt = getTrackSplinePoint(track, recoveryT);
          phys.x = centerPt.x;
          phys.z = centerPt.z;
          phys.speed = 0;
          
          // Spawn sparks
          spawnSparkBurst(scene, phys.x, 0.5, phys.z, 0xff00ff, 6.0);
          audioSystem.playCrash(6.0);
        }

        // Continuously record replay frame during active racing using the Ring Buffer (past 30 seconds)
        if (roomStateRef.current === 'racing' && !phys.finished) {
          ringBufferRef.current.push({
            x: phys.x,
            y: phys.y,
            z: phys.z,
            ry: phys.ry,
            steering: phys.steering,
            speed: phys.speed
          });
        }
      }

      if (isExplodedRef.current) {
        phys.speed = 0;
        phys.vx = 0;
        phys.vz = 0;
      }

      // Update visual meshes of my own car
      myCarModel.group.position.set(phys.x, phys.y, phys.z);
      myCarModel.group.rotation.y = phys.ry;

      // --- 最佳行車路徑引導線：動態色彩更新邏輯 (Optimal Racing Line Dynamic Coloring Updates) ---
      if (racingLineRef.current) {
        if (!showRacingLineRef.current) {
          racingLineRef.current.visible = false;
        } else {
          racingLineRef.current.visible = true;
          
          const currentT = getClosestTimeOnTrack(track, phys.x, phys.z);
          const playerSpeedKmh = Math.abs(phys.speed) * 3.6;
          
          const geom = racingLineRef.current.geometry;
          const colorAttr = geom.getAttribute('color') as THREE.BufferAttribute;
          
          if (colorAttr && racingLinePointsRef.current.length > 0) {
            const rPoints = racingLinePointsRef.current;
            const len = rPoints.length;
            
            for (let i = 0; i < len; i++) {
              const pt = rPoints[i];
              
              let diffT = pt.t - currentT;
              if (!track.isOpen) {
                while (diffT < -0.5) diffT += 1;
                while (diffT > 0.5) diffT -= 1;
              }
              
              let r = 0.1, g = 0.9, b = 0.2; 
              
              const isAheadOfPlayer = diffT >= 0 && diffT <= 0.16;
              
              if (isAheadOfPlayer) {
                const ratio = playerSpeedKmh / pt.safetySpeed;
                
                if (ratio <= 0.95) {
                  r = 0.1; g = 0.95; b = 0.2;
                } else if (ratio <= 1.25) {
                  const p = (ratio - 0.95) / 0.3;
                  r = 0.1 + p * 0.85;
                  g = 0.95 - p * 0.15;
                  b = 0.2 - p * 0.15;
                } else {
                  const p = Math.min(1, (ratio - 1.25) / 0.35);
                  r = 0.95 + p * 0.05;
                  g = 0.8 - p * 0.75;
                  b = 0.05 - p * 0.05;
                }
                
                const distFactor = diffT / 0.16;
                const brightness = 1.0 - 0.3 * distFactor;
                r *= brightness;
                g *= brightness;
                b *= brightness;
              } else {
                let maxRef = 165;
                let minRef = 45;
                if (track.id === "space-highway") {
                  maxRef = 150;
                  minRef = 38;
                } else if (track.id === "desert-rally") {
                  maxRef = 145;
                  minRef = 42;
                } else if (track.id === "speed-test") {
                  maxRef = 260;
                  minRef = 220;
                }

                const diff = maxRef - minRef;
                const curvePct = 1.0 - Math.min(1, Math.max(0, (pt.safetySpeed - minRef) / (diff || 1)));
                
                if (curvePct < 0.2) {
                  r = 0.05; g = 0.7; b = 0.15;
                } else if (curvePct < 0.6) {
                  const p = (curvePct - 0.2) / 0.4;
                  r = 0.05 + p * 0.75;
                  g = 0.7 + p * 0.1;
                  b = 0.15 - p * 0.1;
                } else {
                  const p = (curvePct - 0.6) / 0.4;
                  r = 0.8 + p * 0.15;
                  g = 0.8 - p * 0.75;
                  b = 0.05 - p * 0.05;
                }

                if (diffT < 0 && diffT > -0.06) {
                  const fade = (diffT + 0.06) / 0.06;
                  r *= (0.2 + 0.8 * fade);
                  g *= (0.2 + 0.8 * fade);
                  b *= (0.2 + 0.8 * fade);
                } else if (diffT <= -0.06 || diffT > 0.16) {
                  r *= 0.35;
                  g *= 0.35;
                  b *= 0.35;
                }
              }
              
              colorAttr.setXYZ(i, r, g, b);
            }
            
            if (!track.isOpen && colorAttr.count > len) {
              colorAttr.setXYZ(len, colorAttr.getX(0), colorAttr.getY(0), colorAttr.getZ(0));
            }
            
            colorAttr.needsUpdate = true;
          }
        }
      }

      // --- Ghost Mode Visual Update ---
      const isGhostEnabled = ghostModeEnabledRef.current;
      const ghostPoints = ghostTypeRef.current === 'best' ? bestLapGhostPointsRef.current : lastLapGhostPointsRef.current;

      if (isGhostEnabled && ghostPoints && ghostPoints.length > 0 && roomStateRef.current === 'racing' && !phys.finished) {
        // Find current elapsed time on this lap
        const currentLapTimeVal = Date.now() - phys.lapStartTime;

        // Perform linear interpolation over the ghost data points
        let index = -1;
        for (let i = 0; i < ghostPoints.length - 1; i++) {
          if (currentLapTimeVal >= ghostPoints[i].time && currentLapTimeVal <= ghostPoints[i+1].time) {
            index = i;
            break;
          }
        }

        let gx = 0, gy = 0, gz = 0, gry = 0;
        if (index !== -1) {
          const p1 = ghostPoints[index];
          const p2 = ghostPoints[index + 1];
          const tLerp = (currentLapTimeVal - p1.time) / (p2.time - p1.time);

          gx = p1.x + (p2.x - p1.x) * tLerp;
          gy = p1.y + (p2.y - p1.y) * tLerp;
          gz = p1.z + (p2.z - p1.z) * tLerp;

          let diffRy = p2.ry - p1.ry;
          while (diffRy < -Math.PI) diffRy += Math.PI * 2;
          while (diffRy > Math.PI) diffRy -= Math.PI * 2;
          gry = p1.ry + diffRy * tLerp;
        } else {
          // If out of bounds of the tracked time arrays
          if (currentLapTimeVal > ghostPoints[ghostPoints.length - 1].time) {
            const lastPt = ghostPoints[ghostPoints.length - 1];
            gx = lastPt.x;
            gy = lastPt.y;
            gz = lastPt.z;
            gry = lastPt.ry;
          } else {
            const firstPt = ghostPoints[0];
            gx = firstPt.x;
            gy = firstPt.y;
            gz = firstPt.z;
            gry = firstPt.ry;
          }
        }

        // Lazy initialize the ghost 3D model
        if (!ghostCarModelRef.current) {
          try {
            const ghostModel = build3DCar(myCarConfig);
            makeGhostly(ghostModel.group);
            scene.add(ghostModel.group);
            ghostCarModelRef.current = ghostModel;
          } catch (e) {
            console.error("Failed to build ghost model", e);
          }
        }

        if (ghostCarModelRef.current) {
          ghostCarModelRef.current.group.position.set(gx, gy, gz);
          ghostCarModelRef.current.group.rotation.y = gry;
          ghostCarModelRef.current.group.visible = true;
        }
      } else {
        // Hide ghost car if disabled or no track recording exists
        if (ghostCarModelRef.current) {
          ghostCarModelRef.current.group.visible = false;
        }
      }

      // Rotate wheels visually
      const tireSpin = phys.speed * deltaTime * 3.5;
      myCarModel.wheelsFrontLeft.children[0].rotation.x += tireSpin;
      myCarModel.wheelsFrontRight.children[0].rotation.x += tireSpin;
      myCarModel.wheelsRearLeft.children[0].rotation.x += tireSpin;
      myCarModel.wheelsRearRight.children[0].rotation.x += tireSpin;

      // Steer visual representation of front wheels
      const targetSteerAngle = phys.steering * steeringMaxAngle;
      myCarModel.wheelsFrontLeft.rotation.y = targetSteerAngle;
      myCarModel.wheelsFrontRight.rotation.y = targetSteerAngle;

      const numericSpeed = Math.round(Math.abs(phys.speed) * 3);
      if (!phys.finished && !isReplayingRef.current) {
        setCurrentSpeed(numericSpeed);
        setSteeringInput(phys.steering);
        setIsHandbrakeActive(!!(keys[" "] || keys["spacebar"]));

        // Calculate dynamic engine's RPM and gear selection for tachometer feedback
        let calculatedGear = "N";
        let calculatedRpm = 1000;
        const isAccelerating = !!(keys["w"] || keys["arrowup"] || keys["up"]);

        if (phys.speed < -0.4) {
          calculatedGear = "R";
          const reversePct = Math.min(Math.abs(phys.speed) / 12, 1.0);
          calculatedRpm = 1000 + Math.round(reversePct * 4800);
        } else if (numericSpeed === 0) {
          calculatedGear = "N";
          calculatedRpm = isAccelerating ? 3200 : 1000;
        } else {
          let g = 1;
          let minSpeed = 0;
          let maxSpeed = 35;
          let minRpm = 1000;
          let maxRpm = 7200;

          if (numericSpeed <= 35) {
            g = 1;
            minSpeed = 0;
            maxSpeed = 35;
            minRpm = 1000;
            maxRpm = 7200;
          } else if (numericSpeed <= 65) {
            g = 2;
            minSpeed = 35;
            maxSpeed = 65;
            minRpm = 3800;
            maxRpm = 7500;
          } else if (numericSpeed <= 100) {
            g = 3;
            minSpeed = 65;
            maxSpeed = 100;
            minRpm = 4200;
            maxRpm = 7800;
          } else if (numericSpeed <= 140) {
            g = 4;
            minSpeed = 100;
            maxSpeed = 140;
            minRpm = 4600;
            maxRpm = 8000;
          } else if (numericSpeed <= 180) {
            g = 5;
            minSpeed = 140;
            maxSpeed = 180;
            minRpm = 5000;
            maxRpm = 8200;
          } else {
            g = 6;
            minSpeed = 180;
            maxSpeed = 250;
            minRpm = 5400;
            maxRpm = 9500;
          }

          calculatedGear = String(g);
          const range = maxSpeed - minSpeed;
          const progress = Math.min(Math.max((numericSpeed - minSpeed) / (range || 1), 0.0), 1.0);
          let targetRpm = minRpm + progress * (maxRpm - minRpm);

          if (!isAccelerating) {
            targetRpm = Math.max(minRpm, targetRpm * 0.72);
          } else {
            targetRpm += (Math.random() - 0.5) * 75;
          }
          calculatedRpm = Math.round(targetRpm);
        }

        setGear(calculatedGear);
        setRpm(calculatedRpm);
      } else if (isReplayingRef.current) {
        setCurrentSpeed(numericSpeed);
        setSteeringInput(phys.steering);
        setIsHandbrakeActive(Math.abs(phys.steering) > 0.35 && Math.abs(phys.speed) > 10.0);
        const replaySpeed = Math.round(Math.abs(phys.speed) * 3);
        let g = 1;
        if (replaySpeed > 180) g = 6;
        else if (replaySpeed > 140) g = 5;
        else if (replaySpeed > 100) g = 4;
        else if (replaySpeed > 65) g = 3;
        else if (replaySpeed > 35) g = 2;
        setGear(String(g));
        setRpm(1000 + Math.round((replaySpeed % 45) / 45 * 5500));
      }

      // Update synthetic cockpit audio pitch and soundscapes automatically
      const isAccelerating = !!(keys["w"] || keys["arrowup"] || keys["up"]);
      audioSystem.updateEnginePitch(phys.speed, isAccelerating);
      audioSystem.setDriftSqueal(!!isDrifting && Math.abs(phys.speed) > 5);

      // Check and trigger achievements dynamically
      if (roomStateRef.current === 'racing') {
        if (numericSpeed >= 100) {
          unlockAchievement("speed_demon");
        }
        if (isDrifting && numericSpeed > 45) {
          unlockAchievement("drift_expert");
        }
        if (isOffroad && wheelTypeStr === 'offroad' && numericSpeed > 15) {
          unlockAchievement("offroad_master");
        }
      }

      // --- 2. TRAILING PARTICLE DRIFT EMITTER ---
      const isTurningSharply = Math.abs(phys.steering) > 0.4 && Math.abs(phys.speed) > 8.0;
      if (Math.abs(phys.speed) > 4) {
        if ((isDrifting || isTurningSharply) && Math.random() > 0.15) {
          // Drift smoke color corresponds to track themes or standard heavy rubber smoke
          const smokeCol = track.id === 'neon-grid' ? 0x22d3ee : (track.id === 'desert-rally' ? 0xd97706 : 0xf1f5f9);
          
          // Spawn rich smoke particles from both rear tires
          const sideOffset = 0.45;  // Half-width car lateral distance
          const backOffset = -0.85; // Rear wheel distance behind center of mass

          [ -1, 1 ].forEach((side) => {
            // Transform local wheel coordinates to world space coordinates
            const wx = phys.x + backOffset * Math.sin(phys.ry) + (side * sideOffset) * Math.cos(phys.ry);
            const wz = phys.z + backOffset * Math.cos(phys.ry) - (side * sideOffset) * Math.sin(phys.ry);

            const smokeSize = 0.28 + Math.random() * 0.22;
            const smokeGeo = new THREE.BoxGeometry(smokeSize, smokeSize, smokeSize);
            const smokeMat = new THREE.MeshBasicMaterial({
              color: smokeCol,
              transparent: true,
              opacity: 0.25 + Math.random() * 0.35
            });
            const smoke = new THREE.Mesh(smokeGeo, smokeMat);
            smoke.position.set(wx + (Math.random() - 0.5) * 0.12, 0.05 + Math.random() * 0.08, wz + (Math.random() - 0.5) * 0.12);

            scene.add(smoke);
            particlesRef.current.push(smoke);
          });
        } else if (Math.random() > 0.82) {
          // Tiny default grey engine exhaust puffs
          createExhaustSmoke(scene, phys.x, phys.z, phys.ry, 0x444444);
        }
      }

      // --- 3. HOOD DAMAGE RENDER EMITTERS (Engine wear visual signaling) ---
      if (!isReplayingRef.current && damageRef.current > 20) {
        const rand = Math.random();
        // If damage > 75%, spit sparks and very thick black smoke from front hood
        if (damageRef.current > 75) {
          if (rand > 0.7) {
            createEngineDamageSmoke(scene, phys.x, phys.z, phys.ry, 0x111111);
          }
          if (rand > 0.9) {
            spawnEngineDamageSparks(scene, phys.x, phys.z, phys.ry, 0xff5500);
          }
        } 
        // If damage > 45%, spit dark grey smoke
        else if (damageRef.current > 45) {
          if (rand > 0.8) {
            createEngineDamageSmoke(scene, phys.x, phys.z, phys.ry, 0x555555);
          }
          if (rand > 0.97) {
            spawnEngineDamageSparks(scene, phys.x, phys.z, phys.ry, 0xffaa00);
          }
        } 
        // If damage > 20%, spit light grey puffs
        else if (damageRef.current > 20) {
          if (rand > 0.88) {
            createEngineDamageSmoke(scene, phys.x, phys.z, phys.ry, 0xb0b0b0);
          }
        }
      }

      // Track checkpoints / loop progression
      const currentT = getClosestTimeOnTrack(track, phys.x, phys.z);
      const prevT = prevTRef.current;
      prevTRef.current = currentT;
      latestProgressRef.current = currentT;
      
      // Lap scoring segments detection / pass start-finish gate (ONLY track while actively racing, not finished or replaying)
      if (!isReplayingRef.current && !phys.finished) {
        const checkAndTriggerCheckpoint = (cpId: number) => {
          if (!phys.passedCheckpoints.has(cpId)) {
            phys.passedCheckpoints.add(cpId);
            audioSystem.playCheckpoint();
          }
        };

        if (track.isOpen) {
          if (currentT > 0.20) checkAndTriggerCheckpoint(1);
          if (currentT > 0.45) checkAndTriggerCheckpoint(2);
          if (currentT > 0.70) checkAndTriggerCheckpoint(3);
        } else {
          // Closed track checkpoints with broad progressive windows
          if (currentT >= 0.15) checkAndTriggerCheckpoint(1);
          if (currentT >= 0.40 && phys.passedCheckpoints.has(1)) checkAndTriggerCheckpoint(2);
          if (currentT >= 0.65 && phys.passedCheckpoints.has(2)) checkAndTriggerCheckpoint(3);
        }

        // Pass start-finish gate or reach end of the track
        let isCrossingFinishLine = false;
        if (track.isOpen) {
          isCrossingFinishLine = (currentT > 0.95 && phys.passedCheckpoints.size >= 2);
        } else {
          // Closed loop track: crossed if wrapped around start-finish (prevT > 0.80 && currentT < 0.20) or reached end (currentT >= 0.96)
          const wrappedStartFinish = (prevT > 0.80 && currentT < 0.20);
          const reachedEnd = (currentT >= 0.96);
          if ((wrappedStartFinish || reachedEnd) && phys.passedCheckpoints.size >= 2) {
            isCrossingFinishLine = true;
          }
        }

        if (isCrossingFinishLine) {
          // Player completed a lap!
          const lastLap = latestLapRef.current;
          const finishedLapTime = Date.now() - phys.lapStartTime;

          // --- Ghost Mode Lap Save ---
          lastLapGhostPointsRef.current = [...currentLapPointsRef.current];
          if (bestLapTime === null || finishedLapTime < bestLapTime) {
            bestLapGhostPointsRef.current = [...currentLapPointsRef.current];
          }
          currentLapPointsRef.current = [];
          lastRecordedTimeRef.current = 0;

          // Record lap stats and display banner
          setCompletedLapTimes((prev) => [...prev, finishedLapTime]);
          setLatestLapBanner({ lap: lastLap, time: finishedLapTime });
          setTimeout(() => {
            setLatestLapBanner((prev) => {
              if (prev && prev.lap === lastLap) return null;
              return prev;
            });
          }, 5000);
          audioSystem.playLapFanfare(lastLap === phys.totalLaps); // Dynamic lap pass chime FX

          if (lastLap < phys.totalLaps) {
            if (finishedLapTime < 30000) {
              unlockAchievement("race_perfect");
            }

            setBestLapTime((prev) => {
              if (prev === null || finishedLapTime < prev) return finishedLapTime;
              return prev;
            });

            // Reset checkpoint parameters and shift active lap counter
            phys.lapStartTime = Date.now();
            phys.passedCheckpoints.clear();
            
            const nextLap = lastLap + 1;
            latestLapRef.current = nextLap;
            setLap(nextLap);

            addChatMessage({
              senderId: "system",
              senderName: t("systemAnnouncement"),
              message: t("lapCompletedMsg").replace("{lap}", String(lastLap)).replace("{time}", (finishedLapTime / 1000).toFixed(2)),
              time: Date.now()
            });
          } else if (lastLap === phys.totalLaps && !phys.finished) {
            // Completed full race course!
            phys.finished = true;
            audioSystem.playVictory();
            unlockAchievement("race_complete");

            // Keep final lap time inside Best Lap determination too
            setBestLapTime((prev) => {
              const currentBest = (prev === null || finishedLapTime < prev) ? finishedLapTime : prev;
              
              const savedBestLap = safeStorage.getItem(`giga_racer_all_time_best_lap_${track.id}`);
              const allTimeBest = savedBestLap ? parseFloat(savedBestLap) : null;
              
              if (allTimeBest === null || currentBest < allTimeBest) {
                safeStorage.setItem(`giga_racer_all_time_best_lap_${track.id}`, String(currentBest));
                setAllTimeBestLap(currentBest);
              }
              
              return currentBest;
            });
            
            const totalRaceElapsed = Date.now() - phys.raceStartTime;
            safeStorage.setItem(`giga_racer_last_finish_time_${track.id}`, String(totalRaceElapsed));

            setIsFinished(true);
            setFinishTime(totalRaceElapsed);
            setRaceTime(totalRaceElapsed);
            stopHighlightRecording();

          // Get final race replay from the Ring Buffer
          const orderedFrames = ringBufferRef.current.getOrderedFrames();
          if (orderedFrames.length > 0) {
            const replayObj = {
              playerPositions: orderedFrames.map(f => ({
                x: f.x,
                y: f.y,
                z: f.z,
                ry: f.ry,
                speed: f.speed
              })),
              steerInputs: orderedFrames.map(f => f.steering)
            };
            setRaceReplayState(replayObj);
            raceReplayStateRef.current = replayObj;
            replayFramesRef.current = orderedFrames;
          }

          // Report completion coordinates to the server orchestrator
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
              type: "race-finished",
              payload: { bestTime: totalRaceElapsed }
            }));
          }
        }
      }
      }

      // Update sync records
      if (racersRef.current[playerId]) {
        racersRef.current[playerId].player.lap = latestLapRef.current;
        racersRef.current[playerId].player.progress = currentT;
      }

      // --- 3. PROCESS RIVALS CO-PLAYER INTERPOLATION ---
      Object.keys(racersRef.current).forEach((rId) => {
        if (rId === playerId) return;
        const rival = racersRef.current[rId];
        if (!rival) return;

        // AI driver robot calculations
        if (rId.startsWith("ai-bot-")) {
          const isHostLocal = roomId === "PRACTICE" ? true : (
            Object.keys(racersRef.current)
              .filter(id => !id.startsWith("ai-bot-"))
              .sort()[0] === playerId
          );

          if (isHostLocal) {
            if (roomStateRef.current === 'racing' && !rival.player.finished) {
            // Get or initialize bot state variables inside userData dynamically
            if (!rival.player.hasOwnProperty('userData') || (rival as any).userData === undefined) {
              const defaultOffset = (parseInt(rId.split("-").pop() || "1", 10) % 2 === 0) ? -1.6 : 1.6;
              (rival as any).userData = {
                speed: 10 + Math.random() * 5,
                currentT: 0.0,
                laneOffset: defaultOffset,
                targetLaneOffset: defaultOffset,
                basePerformanceMultiplier: 0.85 + (parseInt(rId.split("-").pop() || "1", 10) * 0.05),
                pushX: 0,
                pushZ: 0,
                physicalX: 0,
                physicalZ: 0,
                isInitialized: false,
                laneChangeCooldown: 0.0
              };
              
              // Find matching starting track progress
              const closetTime = getClosestTimeOnTrack(track, rival.model.group.position.x, rival.model.group.position.z) || 0.0;
              (rival as any).userData.currentT = closetTime;
            }

            const botData = (rival as any).userData;
            if (botData.targetLaneOffset === undefined) {
              botData.targetLaneOffset = botData.laneOffset || 0;
            }
            if (botData.laneChangeCooldown === undefined) {
              botData.laneChangeCooldown = 0.0;
            }

            // Decrement lane change cooldown
            if (botData.laneChangeCooldown > 0) {
              botData.laneChangeCooldown -= deltaTime;
            }

            // Determine maximum speed depending on AI performance parameters or difficulty
            const botBaseMaxSpeed = botData.basePerformanceMultiplier * (
              track.id === "space-highway" ? 22 : 18
            );
            // Difficulty bias
            const difficultyBias = rId.includes("bot-1") ? 5 : rId.includes("bot-2") ? 2.5 : 0;
            const difficultyMulti = track.id === "space-highway" ? 1.45 : 1.15;
            
            // Speed fluctuate curves inside turns (AI brake logic before tight turns)
            const lookaheadT = (botData.currentT + 0.025) % 1.0;
            const currentTangent = getModifiedTrackSplineTangent(trackSpline, botData.currentT);
            const futureTangent = getModifiedTrackSplineTangent(trackSpline, lookaheadT);
            const dotProduct = currentTangent.dot(futureTangent);
            
            let steerDecelFactor = 1.0;
            if (dotProduct < 0.96) {
              steerDecelFactor = THREE.MathUtils.lerp(0.55, 0.9, (dotProduct - 0.7) / 0.3);
            }

            let targetMaxSpeed = botBaseMaxSpeed * difficultyMulti + difficultyBias;
            // Apply drift curves slowdown
            targetMaxSpeed = targetMaxSpeed * steerDecelFactor;

            // Sample positions on 3D CatmullRom spline segment to obtain current normals
            const splinePt = getModifiedTrackSplinePoint(trackSpline, botData.currentT);
            const botTangent = getModifiedTrackSplineTangent(trackSpline, botData.currentT);

            const botNx = -botTangent.z;
            const botNz = botTangent.x;
            const botN2d = new THREE.Vector2(botNx, botNz).normalize();

            // AI Radar / Vision Sensor System: Scan other cars (bots and local players alike) in front of this bot
            let isObstacleAhead = false;
            let obstacleSpeed = 0;

            Object.keys(racersRef.current).forEach((otherId) => {
              if (otherId === rId) return; // ignore self
              
              let otherX = 0;
              let otherZ = 0;
              let otherSpeed = 0;
              const isOtherAi = otherId.startsWith("ai-bot-");
              
              if (otherId === playerId) {
                otherX = myPhysicsRef.current.x;
                otherZ = myPhysicsRef.current.z;
                otherSpeed = myPhysicsRef.current.speed;
              } else {
                const otherRival = racersRef.current[otherId];
                if (!otherRival) return;
                
                if (isOtherAi) {
                  const otherData = (otherRival as any).userData;
                  if (otherData && otherData.isInitialized) {
                    otherX = otherData.physicalX;
                    otherZ = otherData.physicalZ;
                    otherSpeed = otherData.speed;
                  } else {
                    return;
                  }
                } else {
                  otherX = otherRival.model?.group?.position?.x ?? otherRival.targetPos.x;
                  otherZ = otherRival.model?.group?.position?.z ?? otherRival.targetPos.z;
                  otherSpeed = otherRival.player.speed || 0;
                }
              }

              // Compute distance
              const dx = otherX - botData.physicalX;
              const dz = otherZ - botData.physicalZ;
              const distSq = dx * dx + dz * dz;

              // Check if they are within 25 meters (distSq < 625)
              if (distSq < 625) {
                const dist = Math.sqrt(distSq) || 0.001;
                
                // Project onto forward direction
                const forwardDist = dx * botTangent.x + dz * botTangent.z;

                // If obstacle is directly in front (forwardDist > 0.5 meters and up to 25 meters)
                if (forwardDist > 0.5 && forwardDist < 25) {
                  // Check lateral offset from our road position
                  const lateralDist = dx * botN2d.x + dz * botN2d.y;
                  
                  // If they share our current lane line (within 2.0 meters window)
                  if (Math.abs(lateralDist - botData.laneOffset) < 2.0) {
                    isObstacleAhead = true;
                    obstacleSpeed = Math.max(obstacleSpeed, otherSpeed);

                    // If our lane change cooldown allows, try an overtaking steer maneuver!
                    if (botData.laneChangeCooldown <= 0) {
                      // Attempt to steer to the opposite lane (e.g., if on left side, go to right, or vice versa)
                      if (botData.laneOffset < 0) {
                        botData.targetLaneOffset = 1.6;
                      } else {
                        botData.targetLaneOffset = -1.6;
                      }
                      // Introduce some randomness in cooldowns to keep behaviors natural and organic
                      botData.laneChangeCooldown = 1.0 + Math.random() * 1.5;
                    }
                  }
                }
              }
            });

            // If an obstacle is detected in our lane ahead, adaptively brake/decelerate to avoid a crash
            if (isObstacleAhead) {
              const safeTargetSpeed = Math.max(2.0, obstacleSpeed - 1.5);
              if (targetMaxSpeed > safeTargetSpeed) {
                targetMaxSpeed = safeTargetSpeed;
              }
            }

            // Smoothly move current laneOffset towards targetLaneOffset for natural steering
            botData.laneOffset = THREE.MathUtils.lerp(botData.laneOffset, botData.targetLaneOffset, deltaTime * 4.5);

            // Simple check: accelerate or decelerate
            const pEngineLevel = rival.player.carConfig.engineLevel || 1;
            const aiAccel = 8.0 + pEngineLevel * 2.0;

            if (botData.speed < targetMaxSpeed) {
              botData.speed += aiAccel * deltaTime;
              if (botData.speed > targetMaxSpeed) botData.speed = targetMaxSpeed;
            } else if (botData.speed > targetMaxSpeed) {
              botData.speed -= 10.0 * deltaTime; // Brake faster
              if (botData.speed < targetMaxSpeed) botData.speed = targetMaxSpeed;
            }

            // Calculate advanced 3D track progression step
            const trackLen = trackSpline.getLength();
            const dProgress = (botData.speed / trackLen) * deltaTime;
            const oldT = botData.currentT;
            botData.currentT = (botData.currentT + dProgress) % 1.0;

            // Recalculate physical target positions based on smoothly changing laneOffset
            const bx = splinePt.x + botN2d.x * botData.laneOffset;
            const bz = splinePt.z + botN2d.y * botData.laneOffset;
            const by = getTrackHeightAtT(track, botData.currentT);

            const bAngle = Math.atan2(botTangent.x, botTangent.z);

            // Initialize physical coordinates to spline target on first tick
            if (botData.isInitialized === false || botData.physicalX === undefined || botData.physicalX === 0) {
              botData.physicalX = bx;
              botData.physicalZ = bz;
              botData.isInitialized = true;
            }

            // Move physical coordinates smoothly towards target spline coordinates
            const moveSpeed = Math.min(1.0, deltaTime * 12.0);
            botData.physicalX = THREE.MathUtils.lerp(botData.physicalX, bx, moveSpeed);
            botData.physicalZ = THREE.MathUtils.lerp(botData.physicalZ, bz, moveSpeed);

            // Apply push impulse forces
            botData.physicalX += botData.pushX;
            botData.physicalZ += botData.pushZ;

            // Decay push impulse forces
            botData.pushX *= Math.pow(0.08, deltaTime);
            botData.pushZ *= Math.pow(0.08, deltaTime);

            // Enforce physical boundary collision with fences for AI bots
            const botTerrainDist = getDistanceFromTrackCenter(track, botData.physicalX, botData.physicalZ);
            const fenceCollisionDistance = (track.width / 2) - 0.6;
            if (botTerrainDist.distance > fenceCollisionDistance) {
              const bdx = botData.physicalX - splinePt.x;
              const bdz = botData.physicalZ - splinePt.z;
              const bdist = Math.sqrt(bdx*bdx + bdz*bdz) || 0.001;
              const bnx = bdx / bdist;
              const bnz = bdz / bdist;
              
              // Push bot back
              botData.physicalX = splinePt.x + bnx * fenceCollisionDistance;
              botData.physicalZ = splinePt.z + bnz * fenceCollisionDistance;
              
              // Set target lane offset to the opposite side to steer away from the fence!
              if (botData.laneOffset < 0) {
                botData.targetLaneOffset = 1.6; // steer to right lane
              } else {
                botData.targetLaneOffset = -1.6; // steer to left lane
              }
              botData.laneChangeCooldown = 1.5; // lock lane change so they steer away

              // Apply bot slowdown and bounce without reversing forward track speed
              botData.speed = Math.max(track.id === "space-highway" ? 12.0 : 5.0, botData.speed * 0.65);
              
              // Track continuous fence grinding to prevent sliding forever
              if (botData.fenceGrindTimer === undefined) botData.fenceGrindTimer = 0;
              botData.fenceGrindTimer += deltaTime;

              if (botData.fenceGrindTimer > 1.2) {
                // Warp back to track center with speed boost!
                const centerPt = getTrackSplinePoint(track, botData.currentT);
                botData.physicalX = centerPt.x;
                botData.physicalZ = centerPt.z;
                botData.speed = track.id === "space-highway" ? 22.0 : 16.0;
                botData.fenceGrindTimer = 0;
                if (scene) {
                  spawnSparkBurst(scene, botData.physicalX, 0.4, botData.physicalZ, 0x00ffcc, 4.0);
                }
              }

              // Spawn sparks on wall grind!
              if (Math.random() > 0.45 && scene) {
                spawnSparkBurst(scene, botData.physicalX, 0.4, botData.physicalZ, 0xff7700, 1.5);
              }
            } else {
              // Reset fence grind timer when not colliding
              botData.fenceGrindTimer = 0;
            }

            // AI stuck detection and recovery (if speed is extremely low, auto-warp back to road center)
            const stuckThreshold = track.id === "space-highway" ? 5.0 : 1.5;
            const stuckDuration = track.id === "space-highway" ? 1.2 : 2.5;
            if (botData.speed < stuckThreshold) {
              if (botData.stuckTimer === undefined) botData.stuckTimer = 0;
              botData.stuckTimer += deltaTime;
              if (botData.stuckTimer > stuckDuration) {
                const centerPt = getTrackSplinePoint(track, botData.currentT);
                botData.physicalX = centerPt.x;
                botData.physicalZ = centerPt.z;
                botData.speed = track.id === "space-highway" ? 22.0 : 12.0; // recovery speed
                botData.stuckTimer = 0;
                if (scene) {
                  spawnSparkBurst(scene, botData.physicalX, 0.4, botData.physicalZ, 0x00ffcc, 4.0);
                }
              }
            } else {
              botData.stuckTimer = 0;
            }

            // AI-to-All physical collisions (with other AI bots and human players)
            Object.keys(racersRef.current).forEach((otherId) => {
              if (otherId === rId) return; // don't collide with self
              
              let otherX = 0;
              let otherZ = 0;
              let isOtherAi = otherId.startsWith("ai-bot-");
              
              if (otherId === playerId) {
                // Local player (host)
                otherX = myPhysicsRef.current.x;
                otherZ = myPhysicsRef.current.z;
              } else {
                const otherRival = racersRef.current[otherId];
                if (!otherRival) return;
                
                if (isOtherAi) {
                  const otherData = (otherRival as any).userData;
                  if (!otherData || !otherData.isInitialized) return;
                  otherX = otherData.physicalX;
                  otherZ = otherData.physicalZ;
                } else {
                  // Other human players
                  otherX = otherRival.model?.group?.position?.x ?? otherRival.targetPos.x;
                  otherZ = otherRival.model?.group?.position?.z ?? otherRival.targetPos.z;
                }
              }

              const abdx = botData.physicalX - otherX;
              const abdz = botData.physicalZ - otherZ;
              const abdistSq = abdx * abdx + abdz * abdz;
              const abcolLimit = 2.4; // vehicle collision radius combined
              
              if (abdistSq < abcolLimit * abcolLimit) {
                const abdist = Math.sqrt(abdistSq) || 0.001;
                const abnx = abdx / abdist;
                const abnz = abdz / abdist;
                const aboverlap = abcolLimit - abdist;

                // Push bot back
                botData.physicalX += abnx * aboverlap * 0.5;
                botData.physicalZ += abnz * aboverlap * 0.5;

                // If other is also an AI bot, push it back too
                if (isOtherAi) {
                  const otherRival = racersRef.current[otherId];
                  const otherData = (otherRival as any).userData;
                  if (otherData) {
                    otherData.physicalX -= abnx * aboverlap * 0.5;
                    otherData.physicalZ -= abnz * aboverlap * 0.5;
                    
                    // Swap/reduce velocities slightly
                    const tempSpeed = botData.speed;
                    botData.speed = otherData.speed * 0.4;
                    otherData.speed = tempSpeed * 0.4;
                  }
                } else {
                  // For human players, slow down the bot upon hitting them
                  botData.speed = Math.max(2.0, botData.speed * 0.5);
                }

                // Spawn collision sparks
                if (Math.random() > 0.3 && scene) {
                  spawnSparkBurst(scene, (botData.physicalX + otherX) / 2, by + 0.3, (botData.physicalZ + otherZ) / 2, 0xffd700, 1.2);
                }
              }
            });

            // Handle lap crossings
            let currentBotLap = rival.player.lap || 1;
            if (oldT > 0.85 && botData.currentT < 0.15) {
              currentBotLap += 1;
              const totalLaps = myPhysicsRef.current?.totalLaps || 3;
              
              if (currentBotLap > totalLaps) {
                rival.player.finished = true;
                const finalBotTime = Date.now() - (myPhysicsRef.current?.raceStartTime || Date.now());
                rival.player.bestTime = finalBotTime;

                // Fire custom finish announcer chat statement log
                addChatMessage({
                  senderId: "system",
                  senderName: t("systemAnnouncement"),
                  message: t("rivalFinishedMsg").replace("{name}", rival.player.name).replace("{time}", (finalBotTime / 1000).toFixed(2)),
                  time: Date.now()
                });
              } else {
                rival.player.lap = currentBotLap;
                // Announce CPU lap crossing
                addChatMessage({
                  senderId: "system",
                  senderName: t("systemAnnouncement"),
                  message: t("rivalLapStartMsg").replace("{name}", rival.player.name).replace("{lap}", String(currentBotLap)),
                  time: Date.now()
                });
              }
            }

            rival.player.progress = botData.currentT;
            rival.player.lap = currentBotLap;
            rival.player.speed = botData.speed;

            // Propagate target coordinates for lerp updates
            rival.targetPos.set(botData.physicalX, by, botData.physicalZ);
            rival.targetRy = bAngle;
            rival.targetSteering = (dotProduct < 0.98) ? (botData.laneOffset > 0 ? 0.35 : -0.35) : 0;
          } else if (roomStateRef.current !== 'racing') {
            // Keep speed 0
            rival.player.speed = 0;
            rival.targetSteering = 0;
          }
          }
        }

        // Smooth position LERP
        rival.model.group.position.lerp(rival.targetPos, 0.15);
        
        // Smooth rotation angle interpolation
        let angleDiff = rival.targetRy - rival.model.group.rotation.y;
        // Normalize rotation angle to prevent extreme 360 snapping spins
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        rival.model.group.rotation.y += angleDiff * 0.15;

        // Dynamic tires sync visual steering direction
        const rivalRWheelSteer = rival.targetSteering * steeringMaxAngle;
        rival.model.wheelsFrontLeft.rotation.y = THREE.MathUtils.lerp(rival.model.wheelsFrontLeft.rotation.y, rivalRWheelSteer, 0.15);
        rival.model.wheelsFrontRight.rotation.y = THREE.MathUtils.lerp(rival.model.wheelsFrontRight.rotation.y, rivalRWheelSteer, 0.15);

        // Spin wheels based on rival velocity speed
        const rivalTireSpin = (rival.player.speed || 0) * deltaTime * 3.5;
        rival.model.wheelsFrontLeft.children[0].rotation.x += rivalTireSpin;
        rival.model.wheelsFrontRight.children[0].rotation.x += rivalTireSpin;
        rival.model.wheelsRearLeft.children[0].rotation.x += rivalTireSpin;
        rival.model.wheelsRearRight.children[0].rotation.x += rivalTireSpin;

        // Spawn colored exhaust smoke trails for AI/rival cars dynamically to make them visible and alive
        if (roomStateRef.current === 'racing' && !rival.player.finished && Math.abs(rival.player.speed || 0) > 1.5) {
          if (Math.random() > 0.88) {
            const paintColorStr = rival.player.carConfig?.paint || "#ff3366";
            const colHex = parseInt(paintColorStr.replace("#", "0x"), 16) || 0x444444;
            createExhaustSmoke(scene, rival.model.group.position.x, rival.model.group.position.z, rival.model.group.rotation.y, colHex);
          }
        }
      });

      // Update exhaust trailing particles animations
      updateExhaustSmokeParticles(deltaTime);

      // Calculate screen projections of all other rivals/AI bots for floating HUD markers
      const tempV = new THREE.Vector3();
      const tags: any[] = [];
      const container = canvasContainerRef.current;
      if (container && camera) {
        const width = container.clientWidth;
        const height = container.clientHeight;

        Object.keys(racersRef.current).forEach((rId) => {
          if (rId === playerId) return;
          const rival = racersRef.current[rId];
          if (!rival || !rival.model || !rival.model.group) return;

          const group = rival.model.group;
          tempV.setFromMatrixPosition(group.matrixWorld);
          tempV.y += 1.35; // Position the marker beautifully above the car roof

          // Project the 3D position to 2D screen coordinates
          tempV.project(camera);

          // If tempV.z is greater than 1, it is behind the camera plane
          const isBehind = tempV.z > 1.0;

          const x = (tempV.x * 0.5 + 0.5) * width;
          const y = (-tempV.y * 0.5 + 0.5) * height;

          const dx = group.position.x - phys.x;
          const dz = group.position.z - phys.z;
          const distance = Math.sqrt(dx * dx + dz * dz);

          // Find their placement rank
          let rank = 1;
          if (Array.isArray(leaderboardRef.current)) {
            const idx = leaderboardRef.current.findIndex((item: any) => item.id === rId);
            if (idx !== -1) rank = idx + 1;
          }

          tags.push({
            id: rId,
            name: rival.player.name,
            x,
            y,
            visible: !isBehind,
            distance: Math.round(distance),
            rank,
            color: rival.player.carConfig?.paint || "#ff3366"
          });
        });
      }
      setRivalTags(tags);
      rivalTagsRef.current = tags;

      // --- 3.9 DRIFT INTENSITY CALCULATION FOR CAMERA EFFECTS ---
      const isPlayerDrifting = !isReplayingRef.current && (keys[" "] || keys["spacebar"]) && Math.abs(phys.speed) > 3.0;
      if (isPlayerDrifting) {
        driftFactor = THREE.MathUtils.lerp(driftFactor, 1.0, deltaTime * 8.0);
        driftDurationRef.current += deltaTime;
      } else {
        driftFactor = THREE.MathUtils.lerp(driftFactor, 0.0, deltaTime * 5.0);
      }

      // --- 4. CAMERA FOLLOWING ENGINE (多維平滑自動追焦) ---
      if (isReplayingRef.current) {
        const replayCamMode = replayCameraModeRef.current;
        if (replayCamMode === 'rearFollow') {
          camera.up.set(0, 1, 0);
          const forwardX = Math.sin(phys.ry);
          const forwardZ = Math.cos(phys.ry);
          const behindPos = new THREE.Vector3(
            phys.x - 9.0 * forwardX,
            phys.y + 3.2,
            phys.z - 9.0 * forwardZ
          );
          camera.position.lerp(behindPos, 0.15);

          const lookTarget = new THREE.Vector3(
            phys.x + 3.0 * forwardX,
            phys.y + 0.4,
            phys.z + 3.0 * forwardZ
          );
          camera.lookAt(lookTarget);
        } else { // sideFixed
          camera.up.set(0, 1, 0);
          const forwardX = Math.sin(phys.ry);
          const forwardZ = Math.cos(phys.ry);
          const rightX = Math.cos(phys.ry);
          const rightZ = -Math.sin(phys.ry);

          const sidePos = new THREE.Vector3(
            phys.x - 3.5 * forwardX + 7.5 * rightX,
            phys.y + 2.8,
            phys.z - 3.5 * forwardZ + 7.5 * rightZ
          );
          camera.position.lerp(sidePos, 0.08);

          const lookTarget = new THREE.Vector3(phys.x, phys.y + 0.4, phys.z);
          camera.lookAt(lookTarget);
        }
      } else {
        const activeCamMode = cameraModeRef.current;

        if (activeCamMode === 'overhead') {
          const targetCamPosition = new THREE.Vector3(
            phys.x,
            phys.y + 18, // 18 units directly above the car
            phys.z
          );
          camera.position.lerp(targetCamPosition, 0.1);

          // Align the camera up vector along the car's forward-direction so the car always faces "up" on screen
          const forwardX = Math.sin(phys.ry);
          const forwardZ = Math.cos(phys.ry);
          camera.up.set(forwardX, 0, forwardZ);

          const idealLookAt = new THREE.Vector3(phys.x, phys.y, phys.z);
          camera.lookAt(idealLookAt);

        } else if (activeCamMode === 'cockpit') {
          camera.up.set(0, 1, 0);
          const forwardX = Math.sin(phys.ry);
          const forwardZ = Math.cos(phys.ry);

          // Position camera inside cockpit slightly forward and raised from local car origin
          const cockpitPos = new THREE.Vector3(
            phys.x + 0.3 * forwardX,
            phys.y + 0.9,
            phys.z + 0.3 * forwardZ
          );
          camera.position.copy(cockpitPos);

          // Look straight forward on the highway track spline
          const lookTarget = new THREE.Vector3(
            phys.x + 12.0 * forwardX,
            phys.y + 0.7,
            phys.z + 12.0 * forwardZ
          );
          camera.lookAt(lookTarget);

        } else if (activeCamMode === 'farFollow') {
          camera.up.set(0, 1, 0);
          const forwardX = Math.sin(phys.ry);
          const forwardZ = Math.cos(phys.ry);

          // Camera position placed behind the sports car
          const behindPos = new THREE.Vector3(
            phys.x - 13.0 * forwardX,
            phys.y + 5.0,
            phys.z - 13.0 * forwardZ
          );
          camera.position.lerp(behindPos, 0.1);

          const lookTarget = new THREE.Vector3(
            phys.x + 3.0 * forwardX,
            phys.y + 0.5,
            phys.z + 3.0 * forwardZ
          );
          camera.lookAt(lookTarget);

        } else if (activeCamMode === 'cinematic') {
          camera.up.set(0, 1, 0);

          // Spline tracking calculations
          const advancedT = (currentT + 0.08) % 1.0;
          const splinePt = getTrackSplinePoint(track, advancedT);
          
          // Offset side distance perpendicular to current angle orientation
          const sideX = Math.sin(phys.ry + Math.PI / 2) * 11;
          const sideZ = Math.cos(phys.ry + Math.PI / 2) * 11;

          const targetStation = new THREE.Vector3(
            splinePt.x + sideX,
            4.5,
            splinePt.z + sideZ
          );

          camera.position.lerp(targetStation, 0.06);
          camera.lookAt(phys.x, phys.y + 0.5, phys.z);
        }
      }

      // --- 4.1 DRIFT & COLLISION CAMERA EFFECTS (FOV ZOOM & SCREEN SHAKE) ---
      // 同步調整物理引擎與不同相機模式下的視野(FOV)參數 (Sync Physics Engine Field-of-View parameters based on camera views)
      const activeCamMode = cameraModeRef.current;
      let baseFov = 55;
      let speedFovFactor = 0.12;

      if (activeCamMode === 'cockpit') {
        baseFov = 72; // 駕駛艙視野加寬，提供更佳的第一人稱前方與側向餘光
        speedFovFactor = 0.45; // 駕駛艙高速時視野拉伸效果更強烈，體現極限穿梭感
      } else if (activeCamMode === 'farFollow') {
        baseFov = 56; // 第三人稱 follow 標準視野
        speedFovFactor = 0.22; // 溫和的速度拉伸
      } else if (activeCamMode === 'overhead') {
        baseFov = 50; // 俯視視野稍微集中
        speedFovFactor = 0.05;
      } else {
        baseFov = 55;
        speedFovFactor = 0.15;
      }

      // 視野因車速、甩尾、以及氮氣噴射動態拉伸 (Dynamic FOV Warping based on Speed, Drift, and Nitro)
      const speedKmh = Math.abs(phys.speed) * 3.6; // 換算成公里/小時
      const speedWarp = speedKmh * speedFovFactor;
      const nitroWarp = isNitroActiveRef.current ? 18.0 : 0.0;
      const driftWarp = driftFactor * 12.0;

      const targetFov = baseFov + speedWarp + driftWarp + nitroWarp;

      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, deltaTime * 8.0);
        camera.updateProjectionMatrix();
      }

      // Decay collision shake intensity exponentially
      if (collisionShakeIntensityRef.current > 0.0) {
        collisionShakeIntensityRef.current *= Math.exp(-6.5 * deltaTime);
        if (collisionShakeIntensityRef.current < 0.001) {
          collisionShakeIntensityRef.current = 0.0;
        }
      }

      // Calculate combined screen shake from active drifting, collisions, and high frequency nitro vibration
      const driftShake = driftFactor > 0.01 ? driftFactor * 0.16 : 0.0;
      const nitroShake = isNitroActiveRef.current ? 0.045 : 0.0; // High frequency rumble on nitro
      const totalShakeIntensity = driftShake + collisionShakeIntensityRef.current + nitroShake;

      if (totalShakeIntensity > 0.001) {
        camera.position.x += (Math.random() - 0.5) * totalShakeIntensity;
        camera.position.y += (Math.random() - 0.5) * totalShakeIntensity;
        camera.position.z += (Math.random() - 0.5) * totalShakeIntensity;
      }

      // Re-compile rankings list metrics: Throttle during active race, and freeze/lock completely when finished or replaying!
      const isRaceOver = (phys && phys.finished) || roomStateRef.current === 'finished';
      if (isRaceOver) {
        if (!leaderboardLocked) {
          updateLeaderboardList();
          leaderboardLocked = true;
        }
      } else if (!isReplayingRef.current) {
        // Reset lock when starting a new countdown or active race
        leaderboardLocked = false;
        
        // While active, compile every 250ms instead of every frame to optimize CPU overhead & prevent DOM update stuttering
        leaderboardUpdateCooldown += deltaTime;
        if (leaderboardUpdateCooldown > 0.25) {
          leaderboardUpdateCooldown = 0;
          updateLeaderboardList();
        }
      }

      // --- 5. NETWORK PAYLOAD SYNC SEND COOLDOWN CONTROL ---
      networkSendCooldown += deltaTime;
      if (networkSendCooldown > 0.05) { // every 50ms
        networkSendCooldown = 0;
        if (socket && socket.readyState === WebSocket.OPEN && roomStateRef.current !== 'lobby') {
          // Send local player state
          socket.send(JSON.stringify({
            type: "update-state",
            payload: {
              x: phys.x,
              y: phys.y,
              z: phys.z,
              ry: phys.ry,
              speed: phys.speed,
              steering: phys.steering,
              progress: currentT,
              lap: latestLapRef.current
            }
          }));

          // Send state updates for AI bots if this player is the host
          const isHostLocal = roomId === "PRACTICE" ? true : (
            Object.keys(racersRef.current)
              .filter(id => !id.startsWith("ai-bot-"))
              .sort()[0] === playerId
          );

          if (isHostLocal && roomId !== "PRACTICE") {
            Object.keys(racersRef.current).forEach((rId) => {
              if (rId.startsWith("ai-bot-")) {
                const rival = racersRef.current[rId];
                if (rival) {
                  socket.send(JSON.stringify({
                    type: "update-state",
                    payload: {
                      id: rId,
                      x: rival.targetPos.x,
                      y: rival.targetPos.y,
                      z: rival.targetPos.z,
                      ry: rival.targetRy,
                      speed: rival.player.speed || 0,
                      steering: rival.targetSteering || 0,
                      progress: rival.player.progress || 0,
                      lap: rival.player.lap || 1
                    }
                  }));
                }
              }
            });
          }
        }
      }

      // --- [新增景物動畫 & 使造型動起來] ---
      const elapsedSeconds = now / 1000;

      // 1. 旋轉並上下浮動背景多面體 (decorGroup)
      if (decorGroup) {
        decorGroup.children.forEach((child) => {
          if (child.userData) {
            child.rotation.x += child.userData.rotX * deltaTime;
            child.rotation.y += child.userData.rotY * deltaTime;
            child.position.y = child.userData.baseY + Math.sin(elapsedSeconds * child.userData.bobSpeed) * child.userData.bobHeight;
          }
        });
      }

      // 2. 漂浮移動高空雲朵 (cloudsGroup, 超出邊界繞回)
      if (cloudsGroup) {
        cloudsGroup.children.forEach((cloud) => {
          cloud.position.x += cloud.userData.speed * deltaTime;
          if (cloud.position.x > 600) {
            cloud.position.x = -600;
          }
        });
      }

      // 3. 轉動發光高科技風力發電扇葉 (windmillsGroup)
      if (windmillsGroup) {
        windmillsGroup.children.forEach((windmill) => {
          if (windmill.userData && windmill.userData.rotor) {
            windmill.userData.rotor.rotation.z += windmill.userData.spinSpeed * deltaTime;
          }
        });
      }

      // 4. 自轉且上下飄浮發光檢查點水晶 (crystalsGroup)
      if (crystalsGroup) {
        crystalsGroup.children.forEach((crystal) => {
          if (crystal.userData) {
            crystal.rotation.x += crystal.userData.spinX * deltaTime;
            crystal.rotation.y += crystal.userData.spinY * deltaTime;
            crystal.position.y = crystal.userData.baseY + Math.sin(elapsedSeconds * crystal.userData.bobSpeed) * crystal.userData.bobHeight;
          }
        });
      }

      // 5. 賽道邊緣觀眾隨機 waving 與 hopping wave 動畫 (spectatorsGroup)
      if (spectatorsGroup) {
        spectatorsGroup.children.forEach((spectator) => {
          if (spectator.userData) {
            const ud = spectator.userData;
            const leftArm = ud.leftArm;
            const rightArm = ud.rightArm;
            
            // Waving shoulder angle (Z rot and X rot to raise / lower arms)
            const waveAngle = Math.sin(elapsedSeconds * ud.waveSpeed + ud.waveOffset) * 1.2;
            if (leftArm) {
              leftArm.rotation.z = -Math.abs(waveAngle) - 0.2; 
            }
            if (rightArm) {
              rightArm.rotation.z = Math.abs(waveAngle) + 0.2; 
            }
            
            // Hopping bounce animation representing audience cheering
            const hop = Math.max(0, Math.sin(elapsedSeconds * ud.jumpSpeed + ud.waveOffset));
            spectator.position.y = ud.baseY + hop * ud.jumpHeight;
          }
        });
      }

      // [新增 7] 天氣隨時間進行動態變化 (Dynamic weather cycles and sky styling over time)
      const cycleTime = 25; // Rotate every 25 seconds for highly engaging, non-stagnant environment changes
      const cycleNumber = Math.floor(elapsedSeconds / cycleTime);
      const weatherModes: ('sunny' | 'rainy' | 'foggy' | 'snowy')[] = ['sunny', 'rainy', 'foggy', 'snowy'];
      
      // Deterministic cycle selector that feels beautifully random yet constant within the 25-sec frame block
      const cycleHash = (cycleNumber * 7247 + 59233) % 233280;
      const autoWeather = weatherModes[cycleHash % weatherModes.length];
      const targetWeather = weatherSettingRef.current === 'auto' ? autoWeather : weatherSettingRef.current;
      
      if (currentWeatherRef.current !== targetWeather) {
        currentWeatherRef.current = targetWeather;
        setCurrentWeather(targetWeather);
        
        let skyCol = 0x111827; 
        let fogDensity = 0.007;

        if (targetWeather === 'sunny') {
          skyCol = new THREE.Color(track.skyColor).getHex();
          fogDensity = 0.007;
          sunLight.intensity = 1.25;
          ambientLight.intensity = 0.65;
        } else if (targetWeather === 'rainy') {
          // Dark moody slate rain
          skyCol = 0x0a0f1d; 
          fogDensity = 0.015;
          sunLight.intensity = 0.30;
          ambientLight.intensity = 0.45;
        } else if (targetWeather === 'foggy') {
          // Thick, high-glamour cyberpunk neon fog (indigo/violet background)
          skyCol = 0x160c28; 
          fogDensity = 0.045; // immersive heavy fog density
          sunLight.intensity = 0.12;
          ambientLight.intensity = 0.70;
        } else if (targetWeather === 'snowy') {
          skyCol = 0xdae2ed; 
          fogDensity = 0.011;
          sunLight.intensity = 0.85;
          ambientLight.intensity = 0.70;
        }

        scene.background = new THREE.Color(skyCol);
        if (scene.fog && scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.setHex(skyCol);
          scene.fog.density = fogDensity;
        }
      }

      // [新增 8] 降水粒子空間運動更新 (Update weather particle translations relative to viewport camera)
      if (currentWeatherRef.current === 'rainy' || currentWeatherRef.current === 'snowy' || currentWeatherRef.current === 'foggy') {
        weatherPoints.visible = true;
        if (currentWeatherRef.current === 'rainy') {
          weatherPoints.material = rainMat;
        } else if (currentWeatherRef.current === 'snowy') {
          weatherPoints.material = snowMat;
        } else {
          weatherPoints.material = foggyMat;
        }
        
        const posAttr = weatherGeo.getAttribute('position') as THREE.BufferAttribute;
        const camPos = camera.position;
        const currentW = currentWeatherRef.current;
        
        for (let i = 0; i < weatherPartCount; i++) {
          let px = posAttr.getX(i);
          let py = posAttr.getY(i);
          let pz = posAttr.getZ(i);
          
          const vel = weatherVelocities[i];
          
          if (currentW === 'rainy') {
            // Rapid vertical droplets with minor horizontal wind drift
            px += vel.x * 0.45 * deltaTime;
            py += vel.y * 1.55 * deltaTime;
            pz += vel.z * 0.45 * deltaTime;
          } else if (currentW === 'snowy') {
            // Quiet, slow-falling snow
            px += vel.x * 0.25 * deltaTime;
            py += vel.y * 0.28 * deltaTime;
            pz += vel.z * 0.25 * deltaTime;
          } else {
            // Neon Fog: drifting slowly and swirling with horizontal sinusoidal winds
            const swirlFreq = 1.2;
            const swirlStrength = 0.95;
            const swirlX = Math.sin(elapsedSeconds * swirlFreq + (i * 0.05)) * swirlStrength;
            const swirlZ = Math.cos(elapsedSeconds * 0.8 + (i * 0.05)) * swirlStrength * 0.7;
            px += (vel.x * 0.4 + swirlX) * deltaTime;
            py += (vel.y * 0.04 + Math.sin(elapsedSeconds * 0.4 + i) * 0.12) * deltaTime;
            pz += (vel.z * 0.4 + swirlZ) * deltaTime;
          }
          
          const dx = px - camPos.x;
          const dz = pz - camPos.z;
          const distSq = dx*dx + dz*dz;
          
          // Re-spawn wrapper boundaries
          if (py < -3 || py > camPos.y + 35 || distSq > 95 * 95) {
            px = camPos.x + (Math.random() - 0.5) * 125;
            // Drizzle and snow fall from the sky, but fog drifts all around the camera scope
            if (currentW === 'foggy') {
              py = camPos.y - 6 + Math.random() * 22; // surround cockpit/overhead camera
            } else {
              py = camPos.y + 15 + Math.random() * 25;
            }
            pz = camPos.z + (Math.random() - 0.5) * 125;
          }
          
          posAttr.setXYZ(i, px, py, pz);
        }
        posAttr.needsUpdate = true;
      } else {
        weatherPoints.visible = false;
      }

      // 1. Position recording: if actively racing, sample coordinate
      if (roomStateRef.current === 'racing') {
        if (!phys.finished) {
          const currentPos = new THREE.Vector3(phys.x, phys.y, phys.z);
          if (playerPathRef.current.length === 0) {
            playerPathRef.current.push(currentPos);
          } else {
            const lastPos = playerPathRef.current[playerPathRef.current.length - 1];
            if (lastPos.distanceTo(currentPos) > 1.0) { // store points every 1 meter
              playerPathRef.current.push(currentPos);
            }
          }
        }

        // Record footprints for all participants
        Object.keys(racersRef.current).forEach((rId) => {
          const racer = racersRef.current[rId];
          if (!racer || racer.player.finished) return;
          
          const rx = rId === playerId ? phys.x : (racer.model?.group?.position?.x ?? racer.player.x);
          const rz = rId === playerId ? phys.z : (racer.model?.group?.position?.z ?? racer.player.z);

          if (!allParticipantsPathsRef.current[rId]) {
            allParticipantsPathsRef.current[rId] = {
              name: racer.player.name,
              color: racer.player.color || (rId === playerId ? "#22d3ee" : "#f43f5e"),
              points: []
            };
          }

          const pts = allParticipantsPathsRef.current[rId].points;
          if (pts.length === 0) {
            pts.push({ x: rx, z: rz });
          } else {
            const last = pts[pts.length - 1];
            const dx = rx - last.x;
            const dz = rz - last.z;
            if (dx * dx + dz * dz > 2.25) { // 1.5 meters displacement threshold
              pts.push({ x: rx, z: rz });
            }
          }
        });
      }

      // 2. Trajectory mesh rendering checking
      const trajLineMesh = scene.getObjectByName("playerTrajectoryLine");
      const trajStartMarker = scene.getObjectByName("playerTrajStartMarker");
      const trajEndMarker = scene.getObjectByName("playerTrajEndMarker");

      const isPostRaceOrReplay = roomStateRef.current === 'finished' || isReplayingRef.current || phys.finished;

      if (isPostRaceOrReplay && showTrajectoryLineRef.current && playerPathRef.current.length > 1) {
        if (!trajLineMesh) {
          const geom = new THREE.BufferGeometry().setFromPoints(playerPathRef.current);
          const mat = new THREE.LineBasicMaterial({
            color: 0x06b6d4, // Vibrant Cyber Cyan
            linewidth: 3,
          });
          const line = new THREE.Line(geom, mat);
          line.name = "playerTrajectoryLine";
          scene.add(line);
        }
        if (!trajStartMarker) {
          const startGeo = new THREE.SphereGeometry(1.2, 16, 16);
          const startMat = new THREE.MeshBasicMaterial({ color: 0x22c55e }); // Emerald green start
          const startMesh = new THREE.Mesh(startGeo, startMat);
          startMesh.name = "playerTrajStartMarker";
          startMesh.position.copy(playerPathRef.current[0]);
          scene.add(startMesh);
        }
        if (!trajEndMarker) {
          const endGeo = new THREE.SphereGeometry(1.2, 16, 16);
          const endMat = new THREE.MeshBasicMaterial({ color: 0xef4444 }); // Coral red finish
          const endMesh = new THREE.Mesh(endGeo, endMat);
          endMesh.name = "playerTrajEndMarker";
          endMesh.position.copy(playerPathRef.current[playerPathRef.current.length - 1]);
          scene.add(endMesh);
        }
      } else {
        if (trajLineMesh) scene.remove(trajLineMesh);
        if (trajStartMarker) scene.remove(trajStartMarker);
        if (trajEndMarker) scene.remove(trajEndMarker);
      }

      // 3. Draw 2D Minimap (HUD Overlay)
      const minimapCanvas = minimapCanvasRef.current;
      if (minimapCanvas) {
        const mCtx = minimapCanvas.getContext('2d');
        if (mCtx) {
          const mWidth = minimapCanvas.width;
          const mHeight = minimapCanvas.height;
          mCtx.clearRect(0, 0, mWidth, mHeight);

          // Get min/max bounds of track points
          let minX = Infinity, maxX = -Infinity;
          let minZ = Infinity, maxZ = -Infinity;
          track.points.forEach(([tx, tz]) => {
            if (tx < minX) minX = tx;
            if (tx > maxX) maxX = tz;
            if (tz < minZ) minZ = tz;
            if (tz > maxZ) maxZ = tz;
          });

          // Fallback bounds
          if (minX === Infinity) { minX = -100; maxX = 100; minZ = -100; maxZ = 100; }

          const pad = 24;
          const mapW = (maxX - minX) || 1;
          const mapH = (maxZ - minZ) || 1;

          // Scale factor to keep aspect ratio
          const mScale = Math.min((mWidth - pad * 2) / mapW, (mHeight - pad * 2) / mapH);
          const offX = (mWidth - mapW * mScale) / 2;
          const offY = (mHeight - mapH * mScale) / 2;

          const toMinimap = (gX: number, gZ: number) => {
            return {
              mx: offX + (gX - minX) * mScale,
              my: offY + (gZ - minZ) * mScale
            };
          };

          // Helper to draw color-coded rotating 2D vehicle silhouettes with high contrast
          const drawMinimapVehicle = (x: number, y: number, angle: number, color: string, isPlayer: boolean) => {
            mCtx.save();
            mCtx.translate(x, y);
            mCtx.rotate(angle);

            // Draw dark wheels
            mCtx.fillStyle = "#020617";
            // Front tires
            mCtx.fillRect(-5.0, 1.2, 2.0, 3.8);
            mCtx.fillRect(3.0, 1.2, 2.0, 3.8);
            // Rear tires
            mCtx.fillRect(-5.5, -5.0, 2.3, 4.2);
            mCtx.fillRect(3.2, -5.0, 2.3, 4.2);

            // Main vehicle chassis shadow
            mCtx.fillStyle = "rgba(15, 23, 42, 0.85)";
            mCtx.beginPath();
            mCtx.rect(-4.0, -5.5, 8.0, 11.0);
            mCtx.fill();

            // Color-coded primary paint body panels
            mCtx.fillStyle = color;
            mCtx.beginPath();
            mCtx.moveTo(-3.2, -5.0);
            mCtx.lineTo(-3.2, 4.0);
            mCtx.quadraticCurveTo(0, 7.0, 3.2, 4.0);
            mCtx.lineTo(3.2, -5.0);
            mCtx.closePath();
            mCtx.fill();

            // Futuristic neon accent racing stripes
            mCtx.strokeStyle = isPlayer ? "#ffffff" : "rgba(255, 255, 255, 0.7)";
            mCtx.lineWidth = 0.8;
            mCtx.beginPath();
            mCtx.moveTo(-1.5, -1.8);
            mCtx.lineTo(-1.5, 3.2);
            mCtx.moveTo(1.5, -1.8);
            mCtx.lineTo(1.5, 3.2);
            mCtx.stroke();

            // Cockpit windshield glass (sky blue tint with high gloss)
            mCtx.fillStyle = "rgba(14, 165, 233, 0.95)"; // sky-500
            mCtx.beginPath();
            mCtx.moveTo(-1.8, -0.8);
            mCtx.lineTo(1.8, -0.8);
            mCtx.lineTo(1.4, 2.2);
            mCtx.lineTo(-1.4, 2.2);
            mCtx.closePath();
            mCtx.fill();
            
            // Front nose reflection shine
            mCtx.fillStyle = "#ffffff";
            mCtx.beginPath();
            mCtx.arc(0, 4.5, 0.9, 0, Math.PI * 2);
            mCtx.fill();

            // High-downforce spoiler wing assembly
            mCtx.fillStyle = "#1e293b";
            mCtx.fillRect(-6.0, -6.0, 12.0, 1.5);
            mCtx.fillStyle = color;
            mCtx.fillRect(-4.5, -6.0, 9.0, 0.8);

            // Outline body contour with high contrast crisp line
            mCtx.strokeStyle = isPlayer ? "#ffffff" : "rgba(255, 255, 255, 0.8)";
            mCtx.lineWidth = 1.0;
            mCtx.beginPath();
            mCtx.moveTo(-3.2, -5.0);
            mCtx.lineTo(-3.2, 4.0);
            mCtx.quadraticCurveTo(0, 7.0, 3.2, 4.0);
            mCtx.lineTo(3.2, -5.0);
            mCtx.closePath();
            mCtx.stroke();

            mCtx.restore();
          };

          // Draw futuristic radar radar lines/circles in background
          mCtx.strokeStyle = "rgba(6, 182, 212, 0.04)";
          mCtx.lineWidth = 1;
          mCtx.beginPath();
          mCtx.arc(mWidth / 2, mHeight / 2, mWidth / 2 - 4, 0, Math.PI * 2);
          mCtx.stroke();
          
          mCtx.beginPath();
          mCtx.arc(mWidth / 2, mHeight / 2, mWidth / 3, 0, Math.PI * 2);
          mCtx.stroke();

          // Draw radar grid crosshairs
          mCtx.strokeStyle = "rgba(6, 182, 212, 0.08)";
          mCtx.beginPath();
          mCtx.moveTo(4, mHeight / 2);
          mCtx.lineTo(mWidth - 4, mHeight / 2);
          mCtx.moveTo(mWidth / 2, 4);
          mCtx.lineTo(mWidth / 2, mHeight - 4);
          mCtx.stroke();

          // 3a. Draw Track Layout Line
          mCtx.beginPath();
          track.points.forEach(([tx, tz], idx) => {
            const { mx, my } = toMinimap(tx, tz);
            if (idx === 0) {
              mCtx.moveTo(mx, my);
            } else {
              mCtx.lineTo(mx, my);
            }
          });
          if (!track.isOpen) {
            mCtx.closePath();
          }

          // Back shadow track road
          mCtx.strokeStyle = "rgba(15, 23, 42, 0.45)";
          mCtx.lineWidth = 7;
          mCtx.lineCap = "round";
          mCtx.lineJoin = "round";
          mCtx.stroke();

          // Glowing foreground line
          mCtx.strokeStyle = "rgba(6, 182, 212, 0.6)";
          mCtx.lineWidth = 3.5;
          mCtx.stroke();

          mCtx.strokeStyle = "#ffffff";
          mCtx.lineWidth = 1.2;
          mCtx.stroke();

          // 3_alerts. Draw red flashing alert markers for sharp turns and high obstacle density zones
          alertZones.forEach(zone => {
            const { mx, my } = toMinimap(zone.x, zone.z);
            
            if (zone.type === 'turn') {
              // 1. Tight turn hazard alert: Pulsing Red warning triangle
              mCtx.save();
              mCtx.translate(mx, my);
              
              const alpha = 0.45 + Math.sin(now / 110) * 0.45;
              mCtx.shadowColor = "rgba(239, 68, 68, 0.9)"; // red-500
              mCtx.shadowBlur = 8 + Math.sin(now / 110) * 4;
              
              // Pulsing outer glow ring
              mCtx.strokeStyle = `rgba(239, 68, 68, ${alpha})`;
              mCtx.lineWidth = 1.5;
              mCtx.beginPath();
              mCtx.arc(0, 0, 9 + Math.sin(now / 140) * 3.5, 0, Math.PI * 2);
              mCtx.stroke();
              
              // Central high-contrast red warning triangle
              mCtx.fillStyle = "rgba(220, 38, 38, 0.95)"; // red-600
              mCtx.strokeStyle = "#ffffff";
              mCtx.lineWidth = 1;
              mCtx.beginPath();
              mCtx.moveTo(0, -7.5);
              mCtx.lineTo(-7.5, 5.5);
              mCtx.lineTo(7.5, 5.5);
              mCtx.closePath();
              mCtx.fill();
              mCtx.stroke();
              
              // White exclamation symbol inside
              mCtx.fillStyle = "#ffffff";
              mCtx.font = "black 9px monospace";
              mCtx.textAlign = "center";
              mCtx.textBaseline = "middle";
              mCtx.fillText("!", 0, 1);
              
              mCtx.restore();
            } else {
              // 2. Obstacle dense hazard alert: Pulsing Orange flashing warning diamond
              mCtx.save();
              mCtx.translate(mx, my);
              
              const alpha = 0.45 + Math.sin(now / 130) * 0.45;
              mCtx.shadowColor = "rgba(249, 115, 22, 0.9)"; // orange-500
              mCtx.shadowBlur = 8 + Math.sin(now / 130) * 4;
              
              // Pulsing outer warning diamond frame
              mCtx.strokeStyle = `rgba(249, 115, 22, ${alpha})`;
              mCtx.lineWidth = 1.5;
              const dSize = 10 + Math.sin(now / 130) * 3;
              mCtx.beginPath();
              mCtx.moveTo(0, -dSize);
              mCtx.lineTo(dSize, 0);
              mCtx.lineTo(0, dSize);
              mCtx.lineTo(-dSize, 0);
              mCtx.closePath();
              mCtx.stroke();
              
              // Central orange hazard block
              mCtx.fillStyle = "rgba(234, 88, 12, 0.95)"; // orange-600
              mCtx.strokeStyle = "#ffffff";
              mCtx.lineWidth = 1;
              mCtx.beginPath();
              mCtx.moveTo(0, -6.5);
              mCtx.lineTo(6.5, 0);
              mCtx.lineTo(0, 6.5);
              mCtx.lineTo(-6.5, 0);
              mCtx.closePath();
              mCtx.fill();
              mCtx.stroke();
              
              // Cross obstacle hazard indicator
              mCtx.fillStyle = "#ffffff";
              mCtx.font = "bold 8px monospace";
              mCtx.textAlign = "center";
              mCtx.textBaseline = "middle";
              mCtx.fillText("X", 0, 0);
              
              mCtx.restore();
            }
          });

          // 3_pathways. Draw full participants driving pathways if in Replay/Finished states
          if (isReplayingRef.current || roomStateRef.current === 'finished' || phys.finished) {
            Object.keys(allParticipantsPathsRef.current).forEach((rId) => {
              const rData = allParticipantsPathsRef.current[rId];
              if (!rData || rData.points.length < 2) return;

              mCtx.beginPath();
              rData.points.forEach((pt, idx) => {
                const { mx, my } = toMinimap(pt.x, pt.z);
                if (idx === 0) {
                  mCtx.moveTo(mx, my);
                } else {
                  mCtx.lineTo(mx, my);
                }
              });

              mCtx.strokeStyle = rData.color;
              mCtx.lineWidth = 2.4;
              mCtx.globalAlpha = 0.55;
              mCtx.setLineDash([5, 3]); // Cyberpunk dashed track traces
              mCtx.stroke();
              mCtx.setLineDash([]); // Reset line style
              mCtx.globalAlpha = 1.0;
            });
          }

          // 3b. Draw Starts / Finish line
          if (track.points.length > 0) {
            const startNode = track.points[0];
            const { mx: smx, my: smy } = toMinimap(startNode[0], startNode[1]);
            mCtx.fillStyle = "#10b981"; // Green gate marker
            mCtx.beginPath();
            mCtx.arc(smx, smy, 4, 0, Math.PI * 2);
            mCtx.fill();
            mCtx.strokeStyle = "#ffffff";
            mCtx.lineWidth = 1;
            mCtx.stroke();
          }

           // 3c. Draw Rivals & Opponents Positions
          Object.keys(racersRef.current).forEach((rId) => {
            if (rId === playerId) return;
            const rival = racersRef.current[rId];
            if (!rival || !rival.model || !rival.model.group) return;

            const rx = rival.model.group.position.x;
            const rz = rival.model.group.position.z;
            const { mx: rmx, my: rmy } = toMinimap(rx, rz);

            const rivalColor = rival.player.color || "#f43f5e";

            // Pulse ring around rivals
            mCtx.strokeStyle = "rgba(244, 63, 94, 0.25)";
            mCtx.lineWidth = 1;
            mCtx.beginPath();
            mCtx.arc(rmx, rmy, 8 + Math.sin(now / 150) * 2, 0, Math.PI * 2);
            mCtx.stroke();

            // Draw color-coded rotating rival vehicle icon
            const rAngle = -rival.model.group.rotation.y;
            drawMinimapVehicle(rmx, rmy, rAngle, rivalColor, false);

            // Clean short labels
            mCtx.fillStyle = "#cbd5e1";
            mCtx.font = "bold 8px monospace";
            mCtx.textAlign = "center";
            mCtx.textBaseline = "top";
            mCtx.fillText(rival.player.name.substring(0, 4), rmx, rmy + 9);
          });

          // 3d. Draw Player Position (Local)
          const px = phys.x;
          const pz = phys.z;
          const { mx: pmx, my: pmy } = toMinimap(px, pz);

          const playerColor = myCarConfig.paint || "#22d3ee";

          // Pulsing halo for player
          mCtx.strokeStyle = "rgba(34, 211, 238, 0.4)";
          mCtx.lineWidth = 1.5;
          mCtx.beginPath();
          mCtx.arc(pmx, pmy, 9 + Math.sin(now / 100) * 2.5, 0, Math.PI * 2);
          mCtx.stroke();

          // Draw color-coded rotating player vehicle icon
          const pAngle = -phys.ry; // Correct 2D direction map orientation
          drawMinimapVehicle(pmx, pmy, pAngle, playerColor, true);

          // Player name label (shifted above car to prevent overlap)
          mCtx.fillStyle = "#38bdf8";
          mCtx.font = "bold 8px monospace";
          mCtx.textAlign = "center";
          mCtx.textBaseline = "top";
          const localName = initialPlayers[playerId]?.name || "YOU";
          mCtx.fillText(localName.substring(0, 5), pmx, pmy - 17);

          // 3_overtake. Draw overtaking badges with labels on top!
          if (isReplayingRef.current || roomStateRef.current === 'finished' || phys.finished) {
            overtakingPointsRef.current.forEach((otPt) => {
              const { mx, my } = toMinimap(otPt.x, otPt.z);
              
              // Draw outer glowing circle badge
              mCtx.fillStyle = "rgba(15, 23, 42, 0.95)";
              mCtx.strokeStyle = "#f59e0b"; // Warm amber/gold border
              mCtx.lineWidth = 1.5;
              mCtx.shadowColor = "rgba(245, 158, 11, 0.55)";
              mCtx.shadowBlur = 6;
              mCtx.beginPath();
              mCtx.arc(mx, my, 8.5, 0, Math.PI * 2);
              mCtx.fill();
              mCtx.stroke();
              mCtx.shadowBlur = 0; // reset shadow blur

              // Draw beautiful crossing sword symbol inside
              mCtx.fillStyle = "#f59e0b";
              mCtx.font = "9px system-ui, sans-serif";
              mCtx.textAlign = "center";
              mCtx.textBaseline = "middle";
              mCtx.fillText("⚔️", mx, my);

              // Draw small text detailing the action (e.g. "Name A ⚡ Name B")
              mCtx.fillStyle = "#f8fafc";
              mCtx.font = "bold 8px monospace";
              mCtx.textAlign = "center";
              mCtx.textBaseline = "bottom";

              const labelText = `${otPt.passer.substring(0, 3)}⚡${otPt.passed.substring(0, 3)}`;
              mCtx.fillText(labelText, mx, my - 10);
            });
          }
        }
      }

      // --- Update 3D Exhaust Flame Visual Emitters & Point Light ---
      const isNitroActive = isNitroActiveRef.current && roomStateRef.current === 'racing';
      const leftEx = leftExhaustFlameRef.current;
      const rightEx = rightExhaustFlameRef.current;
      const leftCore = leftExhaustCoreRef.current;
      const rightCore = rightExhaustCoreRef.current;
      const exLight = exhaustLightRef.current;

      if (leftEx && rightEx && leftCore && rightCore) {
        if (isNitroActive) {
          // Glow and flicker of the flames!
          const pulsate = 1.0 + Math.random() * 0.45;
          const flickerWidth = 0.95 + Math.random() * 0.15;
          
          leftEx.scale.set(flickerWidth, flickerWidth, pulsate);
          rightEx.scale.set(flickerWidth, flickerWidth, pulsate);

          // Animate materials opacities and colors
          const outerMatL = leftEx.material as THREE.MeshBasicMaterial;
          const outerMatR = rightEx.material as THREE.MeshBasicMaterial;
          const innerMatL = leftCore.material as THREE.MeshBasicMaterial;
          const innerMatR = rightCore.material as THREE.MeshBasicMaterial;

          outerMatL.opacity = 0.85 + Math.random() * 0.15;
          outerMatR.opacity = outerMatL.opacity;
          innerMatL.opacity = 0.95 + Math.random() * 0.05;
          innerMatR.opacity = innerMatL.opacity;

          // Shift outer flame color slightly to simulate high-temperature plasma
          const shiftColor = Math.sin(now * 0.05) > 0 ? 0x00d2ff : 0x0077ff;
          outerMatL.color.setHex(shiftColor);
          outerMatR.color.setHex(shiftColor);

          // Point light updates (flashing cyan-blue color glow on road)
          if (exLight) {
            exLight.intensity = 3.5 + Math.random() * 1.5;
            exLight.distance = 5 + Math.random() * 1.5;
          }
        } else {
          // Gracefully lerp to invisible and tiny scales
          leftEx.scale.z = THREE.MathUtils.lerp(leftEx.scale.z, 0.01, deltaTime * 12);
          rightEx.scale.z = THREE.MathUtils.lerp(rightEx.scale.z, 0.01, deltaTime * 12);
          leftEx.scale.x = THREE.MathUtils.lerp(leftEx.scale.x, 0.01, deltaTime * 12);
          rightEx.scale.x = THREE.MathUtils.lerp(rightEx.scale.x, 0.01, deltaTime * 12);
          leftEx.scale.y = leftEx.scale.x;
          rightEx.scale.y = rightEx.scale.x;

          const outerMatL = leftEx.material as THREE.MeshBasicMaterial;
          const outerMatR = rightEx.material as THREE.MeshBasicMaterial;
          const innerMatL = leftCore.material as THREE.MeshBasicMaterial;
          const innerMatR = rightCore.material as THREE.MeshBasicMaterial;

          outerMatL.opacity = THREE.MathUtils.lerp(outerMatL.opacity, 0, deltaTime * 12);
          outerMatR.opacity = outerMatL.opacity;
          innerMatL.opacity = THREE.MathUtils.lerp(innerMatL.opacity, 0, deltaTime * 12);
          innerMatR.opacity = innerMatL.opacity;

          if (exLight) {
            exLight.intensity = THREE.MathUtils.lerp(exLight.intensity, 0, deltaTime * 12);
          }
        }
      }

      renderer.render(scene, camera);
    };
    gameTick();

    // Responsive Canvas Resizing Handler
    let resizeFrameId: number;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrameId);
      resizeFrameId = requestAnimationFrame(() => {
        if (!mountRef.current) return;
        const width = mountRef.current.clientWidth || window.innerWidth || 800;
        const height = mountRef.current.clientHeight || window.innerHeight || 600;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      });
    });
    if (canvasContainerRef.current) {
      resizeObserver.observe(canvasContainerRef.current);
    }

    // Helper functions inside local context scope
    function createNitroFlame(targetScene: THREE.Scene, cx: number, cz: number, cry: number) {
      // Spawn two jets of flames representing left and right exhaust pipes!
      const exhaustOffsets = [-0.3, 0.3];
      exhaustOffsets.forEach((offsetX) => {
        // Compute position at the rear offset correctly
        const backDist = 1.25;
        // Transform offset from car local coordinates to world space
        const sx = cx - backDist * Math.sin(cry) + offsetX * Math.cos(cry);
        const sz = cz - backDist * Math.cos(cry) - offsetX * Math.sin(cry);
        
        // Dynamic flaming color particles (neon cyan to bright deep blue)
        const isCyan = Math.random() > 0.35;
        const pColor = isCyan ? 0x0ea5e9 : 0x2563eb;
        
        const flameGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
        const flameMat = new THREE.MeshBasicMaterial({
          color: pColor,
          transparent: true,
          opacity: 0.95
        });
        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(sx, 0.22, sz);
        
        // Shoot particles fast backward
        const speedMultiplier = -18 - Math.random() * 12;
        const vx = speedMultiplier * Math.sin(cry) + (Math.random() - 0.5) * 1.5;
        const vz = speedMultiplier * Math.cos(cry) + (Math.random() - 0.5) * 1.5;
        const vy = 0.5 + Math.random() * 1.5;
        
        flame.userData = {
          vx,
          vy,
          vz,
          life: 0.18 + Math.random() * 0.14,
          isFlame: true
        };
        
        targetScene.add(flame);
        particlesRef.current.push(flame);

        // Add extreme high temperature white/yellow sparks occasionally!
        if (Math.random() > 0.6) {
          const sparkSize = 0.05 + Math.random() * 0.05;
          const sparkMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0
          });
          const spark = new THREE.Mesh(new THREE.BoxGeometry(sparkSize, sparkSize, sparkSize), sparkMat);
          spark.position.set(sx, 0.22, sz);
          spark.userData = {
            vx: vx * 0.8 + (Math.random() - 0.5) * 4,
            vy: vy * 0.5 + Math.random() * 2,
            vz: vz * 0.8 + (Math.random() - 0.5) * 4,
            life: 0.25 + Math.random() * 0.25,
            isSpark: true
          };
          targetScene.add(spark);
          particlesRef.current.push(spark);
        }
      });
    }

    function createExhaustSmoke(targetScene: THREE.Scene, cx: number, cz: number, cry: number, pColor: number) {
      const smokeGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
      const smokeMat = new THREE.MeshBasicMaterial({
        color: pColor,
        transparent: true,
        opacity: 0.8
      });
      const smoke = new THREE.Mesh(smokeGeo, smokeMat);
      
      // Spawn slightly behind exhaust coordinate vector
      const sx = cx - 1.2 * Math.sin(cry) + (Math.random() - 0.5) * 0.2;
      const sz = cz - 1.2 * Math.cos(cry) + (Math.random() - 0.5) * 0.2;
      smoke.position.set(sx, 0.1, sz);
      
      targetScene.add(smoke);
      particlesRef.current.push(smoke);
    }

    function spawnPitStopHealParticles(targetScene: THREE.Scene, cx: number, cz: number, cry: number, sprColor: number) {
      const offsetX = (Math.random() - 0.5) * 1.5;
      const offsetZ = (Math.random() - 0.5) * 1.5;
      const sx = cx + offsetX;
      const sz = cz + offsetZ;
      const h = 0.05 + Math.random() * 0.25;
      
      const geom = Math.random() > 0.4
        ? new THREE.BoxGeometry(0.12, 0.12, 0.12)
        : new THREE.DodecahedronGeometry(0.1, 0);
        
      const spark = new THREE.Mesh(
        geom,
        new THREE.MeshBasicMaterial({ 
          color: sprColor,
          transparent: true,
          opacity: 0.95
        })
      );
      spark.position.set(sx, h, sz);
      spark.userData = {
        vx: (Math.random() - 0.5) * 0.8,
        vy: 1.5 + Math.random() * 2.0, // Rising speed
        vz: (Math.random() - 0.5) * 0.8,
        isPitHeal: true,
        life: 0.6 + Math.random() * 0.5
      };
      targetScene.add(spark);
      particlesRef.current.push(spark);
    }

    function spawnSparkBurst(targetScene: THREE.Scene, sx: number, sy: number, sz: number, sprColor: number, intensity: number = 1.0) {
      const sparkCount = Math.round(10 + Math.min(30, intensity * 7));
      const velocityScale = 4 + Math.min(16, intensity * 3.0);
      
      for (let j = 0; j < sparkCount; j++) {
        const sparkSize = 0.05 + Math.random() * 0.07 * Math.min(2.0, intensity / 4.0);
        const sparkMat = new THREE.MeshBasicMaterial({ 
          color: sprColor,
          transparent: true,
          opacity: 0.95
        });
        const spark = new THREE.Mesh(
          new THREE.BoxGeometry(sparkSize, sparkSize, sparkSize),
          sparkMat
        );
        spark.position.set(sx + (Math.random() - 0.5) * 0.15, sy, sz + (Math.random() - 0.5) * 0.15);
        
        // Inject random velocity attributes scaled dynamically base on collision force intensity
        spark.userData = {
          vx: (Math.random() - 0.5) * velocityScale,
          vy: (Math.random() * 2) + Math.min(10, intensity * 2.0),
          vz: (Math.random() - 0.5) * velocityScale,
          life: 0.35 + Math.random() * 0.45,
          isSpark: true
        };
        targetScene.add(spark);
        particlesRef.current.push(spark);
      }
    }

    function createEngineDamageSmoke(targetScene: THREE.Scene, cx: number, cz: number, cry: number, pColor: number) {
      const smokeGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
      const smokeMat = new THREE.MeshBasicMaterial({
        color: pColor,
        transparent: true,
        opacity: 0.75
      });
      const smoke = new THREE.Mesh(smokeGeo, smokeMat);
      
      // Spawn at the front hood instead of rear exhaust
      // Front hood is roughly +0.8 units along the car heading direction
      const sx = cx + 0.82 * Math.sin(cry) + (Math.random() - 0.5) * 0.15;
      const sz = cz + 0.82 * Math.cos(cry) + (Math.random() - 0.5) * 0.15;
      smoke.position.set(sx, 0.38, sz); // higher elevation (hood height)
      
      targetScene.add(smoke);
      particlesRef.current.push(smoke);
    }

    function spawnEngineDamageSparks(targetScene: THREE.Scene, cx: number, cz: number, cry: number, sprColor: number) {
      const sx = cx + 0.82 * Math.sin(cry);
      const sz = cz + 0.82 * Math.cos(cry);
      const spark = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.06),
        new THREE.MeshBasicMaterial({ color: sprColor })
      );
      spark.position.set(sx, 0.38, sz);
      spark.userData = {
        vx: (Math.random() - 0.5) * 4,
        vy: 1.5 + Math.random() * 3,
        vz: (Math.random() - 0.5) * 4,
        life: 0.3 + Math.random() * 0.3
      };
      targetScene.add(spark);
      particlesRef.current.push(spark);
    }

    function spawnCollisionDebris(targetScene: THREE.Scene, cx: number, cy: number, cz: number, cry: number, paintColorStr: string, count: number = 8) {
      const paintColor = new THREE.Color(paintColorStr || "#ff3366");
      const darkMaterialColor = new THREE.Color(0x222222); 
      const glassMaterialColor = new THREE.Color(0x33aaff); 
      
      const shardGeometries = [
        new THREE.BoxGeometry(0.18, 0.04, 0.18), 
        new THREE.BoxGeometry(0.12, 0.12, 0.03), 
        new THREE.ConeGeometry(0.08, 0.18, 4), 
      ];

      for (let i = 0; i < count; i++) {
        const geoIndex = Math.floor(Math.random() * shardGeometries.length);
        const geom = shardGeometries[geoIndex].clone();
        
        let matColor = paintColor;
        let isGlass = false;
        const colorRand = Math.random();
        if (colorRand > 0.7) {
          matColor = darkMaterialColor;
        } else if (colorRand > 0.5) {
          matColor = glassMaterialColor;
          isGlass = true;
        }

        const mat = new THREE.MeshStandardMaterial({
          color: matColor,
          roughness: isGlass ? 0.05 : 0.22,
          metalness: isGlass ? 0.95 : 0.8,
          transparent: isGlass,
          opacity: isGlass ? 0.7 : 1.0,
        });

        const shardMesh = new THREE.Mesh(geom, mat);
        shardMesh.castShadow = true;
        shardMesh.receiveShadow = true;
        
        const sx = cx + (Math.random() - 0.5) * 0.6;
        const sy = cy + 0.15 + Math.random() * 0.35;
        const sz = cz + (Math.random() - 0.5) * 0.6;
        shardMesh.position.set(sx, sy, sz);

        shardMesh.rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2
        );

        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 9;
        const vx = Math.sin(angle) * speed + Math.sin(cry) * 1.5;
        const vz = Math.cos(angle) * speed + Math.cos(cry) * 1.5;
        const vy = 4 + Math.random() * 5;

        const rxVelocity = (Math.random() - 0.5) * 12;
        const ryVelocity = (Math.random() - 0.5) * 12;
        const rzVelocity = (Math.random() - 0.5) * 12;

        shardMesh.userData = {
          vx,
          vy,
          vz,
          rxVelocity,
          ryVelocity,
          rzVelocity,
          life: 1.0 + Math.random() * 0.8,
          isDebris: true
        };

        targetScene.add(shardMesh);
        particlesRef.current.push(shardMesh);
      }
    }

    function applyVisualDamageToMesh(bodyMesh: THREE.Mesh, impactStrength: number) {
      if (!bodyMesh || !bodyMesh.geometry) return;
      const geometry = bodyMesh.geometry;
      const pos = geometry.attributes.position;
      if (!pos) return;

      const count = pos.count;
      // Scale deformation factor based on impact strength (up to a safe limit of 0.30 to avoid rendering artifacts)
      const factor = Math.min(0.30, (impactStrength / 25) * 0.16);

      for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);

        // Frontbumper / Hood crunched back
        if (z > 0.3) {
          const multiplier = Math.max(0.1, (z - 0.3) * 1.5);
          const dentZ = z - (Math.random() * factor * 0.8 * multiplier);
          const dentX = x + (Math.random() - 0.5) * factor * 0.45 * multiplier;
          const dentY = y + (Math.random() - 0.5) * factor * 0.3 * multiplier;
          pos.setXYZ(i, dentX, dentY, dentZ);
        }
        // Rear collision denting
        else if (z < -0.3) {
          const multiplier = Math.max(0.1, (Math.abs(z) - 0.3) * 1.5);
          const dentZ = z + (Math.random() * factor * 0.8 * multiplier);
          const dentX = x + (Math.random() - 0.5) * factor * 0.45 * multiplier;
          const dentY = y + (Math.random() - 0.5) * factor * 0.3 * multiplier;
          pos.setXYZ(i, dentX, dentY, dentZ);
        }
        // Side doors and panels scraped or pushed inward
        else if (Math.abs(x) > 0.35) {
          const sideSign = Math.sign(x);
          const multiplier = Math.max(0.1, (Math.abs(x) - 0.35) * 1.5);
          const dentX = x - sideSign * (Math.random() * factor * 0.55 * multiplier);
          const dentY = y + (Math.random() - 0.5) * factor * 0.25 * multiplier;
          const dentZ = z + (Math.random() - 0.5) * factor * 0.3 * multiplier;
          pos.setXYZ(i, dentX, dentY, dentZ);
        }
      }
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
    }

    function flashCarBodyMaterial(bodyMesh: THREE.Mesh) {
      if (!bodyMesh || !bodyMesh.material) return;
      const mat = bodyMesh.material as THREE.MeshStandardMaterial;
      if (mat && mat.emissive) {
        // High visibility bright red-orange glow
        mat.emissive.setHex(0xff3300);
        setTimeout(() => {
          // Safely set back to black (no emission)
          if (mat && mat.emissive) {
            mat.emissive.setHex(0x000000);
          }
        }, 120);
      }
    }

    function updateExhaustSmokeParticles(dt: number) {
      const activeSmoke: THREE.Mesh[] = [];
      particlesRef.current.forEach((smoke) => {
        if (smoke.userData && smoke.userData.life !== undefined) {
          // Dynamic physics spark/flame mesh
          smoke.userData.life -= dt;
          smoke.position.x += smoke.userData.vx * dt;
          smoke.position.y += smoke.userData.vy * dt;
          smoke.position.z += smoke.userData.vz * dt;
          
          if (smoke.userData.isFlame) {
            // Shrink and fade flame over time
            smoke.scale.multiplyScalar(Math.max(0.6, 1.0 - dt * 2.2));
            const mat = smoke.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0, smoke.userData.life / 0.32);
          } else if (smoke.userData.isSpark) {
            // Shrink and fade hot metal sparks over time
            smoke.scale.multiplyScalar(Math.max(0.4, 1.0 - dt * 1.6));
            const mat = smoke.material as THREE.MeshBasicMaterial;
            if (mat) {
              mat.opacity = Math.max(0, smoke.userData.life / 0.75);
            }
            smoke.userData.vy -= 9.8 * dt; // gravity
          } else if (smoke.userData.isPitHeal) {
            // Floating pit stop particles
            smoke.scale.multiplyScalar(Math.max(0.4, 1.0 - dt * 0.8));
            const mat = smoke.material as THREE.MeshBasicMaterial;
            if (mat) {
              mat.opacity = Math.max(0, smoke.userData.life / 1.1);
            }
            // No gravity pull, just straight floating rising motion!
          } else {
            smoke.userData.vy -= 9.8 * dt; // gravity
          }

          if (smoke.userData.isDebris) {
            smoke.rotation.x += smoke.userData.rxVelocity * dt;
            smoke.rotation.y += smoke.userData.ryVelocity * dt;
            smoke.rotation.z += smoke.userData.rzVelocity * dt;
            
            // Ground bounce interaction
            if (smoke.position.y < 0.08) {
              smoke.position.y = 0.08;
              smoke.userData.vy = -smoke.userData.vy * 0.45; // Bounce off pavement
              smoke.userData.vx *= 0.75; // Friction
              smoke.userData.vz *= 0.75;
            }
          }

          if (smoke.userData.life > 0) {
            activeSmoke.push(smoke);
          } else {
            scene.remove(smoke);
            smoke.geometry.dispose();
            (smoke.material as THREE.Material).dispose();
          }
        } else {
          // Generic dust clouds
          const originalMat = smoke.material as THREE.MeshBasicMaterial;
          originalMat.opacity -= dt * 1.5;
          smoke.scale.multiplyScalar(1.03); // expand
          smoke.position.y += dt * 0.4; // float up

          if (originalMat.opacity > 0) {
            activeSmoke.push(smoke);
          } else {
            scene.remove(smoke);
            smoke.geometry.dispose();
            originalMat.dispose();
          }
        }
      });
      particlesRef.current = activeSmoke;
    }

    function updateLeaderboardList() {
      const list = (Object.values(racersRef.current) as any[]).map((r) => ({
        id: r.player.id,
        name: r.player.name,
        progress: r.player.progress || 0,
        lap: r.player.lap || 1,
        finished: (r.player.bestTime || 0) > 0,
        bestTime: r.player.bestTime || 0,
        carConfig: r.player.carConfig,
        color: r.player.color,
        team: r.player.team || ""
      }));

      // Sort by lap descending, then progress descending, then bestTime check
      list.sort((a, b) => {
        if (a.finished && b.finished) return a.bestTime - b.bestTime;
        if (a.finished) return -1;
        if (b.finished) return 1;

        if (a.lap !== b.lap) return b.lap - a.lap;
        return b.progress - a.progress;
      });

      // Calculate any new overtaking occurrences if we have a previous rank reference
      const currentRankingIds = list.map(r => r.id);
      if (prevRanksRef.current && prevRanksRef.current.length > 0 && roomStateRef.current === 'racing') {
        const prevRanks = prevRanksRef.current;
        for (let i = 0; i < currentRankingIds.length; i++) {
          const passerId = currentRankingIds[i];
          const passerRacer = racersRef.current[passerId];
          if (!passerRacer) continue;

          for (let j = i + 1; j < currentRankingIds.length; j++) {
            const passedId = currentRankingIds[j];
            const passedRacer = racersRef.current[passedId];
            if (!passedRacer) continue;

            const prevPassedIndex = prevRanks.indexOf(passedId);
            const prevPasserIndex = prevRanks.indexOf(passerId);

            if (prevPassedIndex !== -1 && prevPasserIndex !== -1 && prevPassedIndex < prevPasserIndex) {
              // Valid overtaking event: passerId was behind passedId but has now crossed them!
              const rx = passerId === playerId ? myPhysicsRef.current.x : (passerRacer.model?.group?.position?.x ?? passerRacer.player.x);
              const rz = passerId === playerId ? myPhysicsRef.current.z : (passerRacer.model?.group?.position?.z ?? passerRacer.player.z);
              const pLap = passerRacer.player.lap || 1;

              // Prevent duplicates if multiple frames toggle rapidly in same 15-meter zone
              const alreadySpotted = overtakingPointsRef.current.some(pt => {
                const dx = pt.x - rx;
                const dz = pt.z - rz;
                const isSamePair = (pt.passer === passerRacer.player.name && pt.passed === passedRacer.player.name) ||
                                  (pt.passer === passedRacer.player.name && pt.passed === passerRacer.player.name);
                return isSamePair && (dx * dx + dz * dz < 15 * 15);
              });

              if (!alreadySpotted) {
                overtakingPointsRef.current.push({
                  x: rx,
                  z: rz,
                  passer: passerRacer.player.name,
                  passed: passedRacer.player.name,
                  passerColor: passerRacer.player.color || (passerId === playerId ? "#22d3ee" : "#f43f5e"),
                  passedColor: passedRacer.player.color || (passedId === playerId ? "#22d3ee" : "#f43f5e"),
                  time: `${t("lap")} ${pLap}`
                });

                // Post a war report message in the chat log HUD
                addChatMessage({
                  senderId: "system",
                  senderName: t("overtakeReport"),
                  message: t("overtakeMsg").replace("{passer}", passerRacer.player.name).replace("{lap}", String(pLap)).replace("{passed}", passedRacer.player.name),
                  time: Date.now()
                });
              }
            }
          }
        }
      }

      prevRanksRef.current = currentRankingIds;
      setLeaderboard(list);
      leaderboardRef.current = list;
    }

    // Dynamic co-player adder
    function addRivalCarToScene(r: Player) {
      if (racersRef.current[r.id]) return;

      const model = build3DCar(r.carConfig);
      
      // Secure numeric fallbacks to prevent NaN or undefined coordinate crashes
      const rx = typeof r.x === 'number' && !isNaN(r.x) ? r.x : 0;
      const ry = typeof r.y === 'number' && !isNaN(r.y) ? r.y : 0.01;
      const rz = typeof r.z === 'number' && !isNaN(r.z) ? r.z : 0;
      const rRy = typeof r.ry === 'number' && !isNaN(r.ry) ? r.ry : 0;

      model.group.position.set(rx, ry, rz);
      model.group.rotation.y = rRy;
      scene.add(model.group);

      racersRef.current[r.id] = {
        player: r,
        model,
        targetPos: new THREE.Vector3(rx, ry, rz),
        targetRy: rRy,
        targetSteering: r.steering,
        currentProgress: r.progress
      };
    }

    function removeRivalFromScene(rId: string) {
      const rival = racersRef.current[rId];
      if (rival) {
        scene.remove(rival.model.group);
        delete racersRef.current[rId];
      }
    }

    // Set globally scoped reference pointer hooks for networking actions
    addRivalRef.current = addRivalCarToScene;
    removeRivalRef.current = removeRivalFromScene;

    // Cleanup mounting lifecycle Hook
    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(resizeFrameId);
      resizeObserver.disconnect();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      
      // Stop continuous engine and drift sounds
      audioSystem.stopEngine();
      audioSystem.setDriftSqueal(false);
      audioSystem.setScrapeRattle(false);

      // Dispose Geometries/Materials
      scene.clear();
      renderer.dispose();
    };
  }, [track, finalReloadTokenTrigger(roomState)]);

  function finalReloadTokenTrigger(state: string) {
    // Return empty tokens if not resetting rooms
    return state === 'lobby' ? 1 : 0;
  }

  // Handle typing send and closing chat overlay
  const onSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (trimmed) {
      if (onSendChatMessage) {
        onSendChatMessage(trimmed);
      } else if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: "chat-message",
          payload: { message: trimmed }
        }));
        unlockAchievement("active_social");
      }
    }
    
    setChatInput("");
    setChatActiveState(false);
    
    // Smoothly restore focus to the 3D game canvas container
    setTimeout(() => {
      try {
        if (mountRef.current) {
          mountRef.current.focus();
        } else {
          window.focus();
        }
      } catch (err) {}
    }, 50);
  };

  // Allow Esc key to exit chat without sending
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setChatInput("");
      setChatActiveState(false);
      setTimeout(() => {
        try {
          if (mountRef.current) {
            mountRef.current.focus();
          } else {
            window.focus();
          }
        } catch (err) {}
      }, 50);
    }
  };

  // Auto-scroll chat log to bottom whenever a message is added
  useEffect(() => {
    const logElem = document.getElementById("chat-messages-log");
    if (logElem) {
      logElem.scrollTop = logElem.scrollHeight;
    }
  }, [chatLog]);

  const totalLaps = myPhysicsRef.current?.totalLaps || 3;
  const isLastLap = !track.isOpen && lap === totalLaps;

  return (
    <div id="game-arena-layout" className="flex flex-col lg:flex-row h-full w-full bg-slate-950 text-white select-none font-sans overflow-hidden">
      
      {/* 3D Game Canvas Left Pane */}
      <div ref={canvasContainerRef} className="relative flex-1 h-[400px] lg:h-full bg-slate-900 overflow-hidden">
        <div 
          ref={mountRef} 
          tabIndex={0}
          className="w-full h-full pointer-events-auto cursor-pointer outline-none transition-all duration-300"
          style={{
            filter: isNitroActive ? 'blur(3.5px) contrast(1.25) saturate(1.4) brightness(1.12)' : 'none',
            transform: isNitroActive ? 'scale(1.035)' : 'scale(1)',
          }}
          onClick={() => {
            try { window.focus(); } catch (e) {}
            try {
              if (mountRef.current) {
                mountRef.current.focus();
              }
            } catch (e) {}
          }}
          title={t("clickToFocus")}
        />

        {/* Floating 3D/2D HUD Name Tags & Indicators above other vehicles */}
        <div id="rival-hud-tags" className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {Array.isArray(rivalTags) && rivalTags.map((tag) => {
            if (!tag.visible) return null;
            const tagX = tag.x;
            const tagY = tag.y;

            // Only show tags that are within active visibility or rendering bounds
            if (tagX < -100 || tagX > 2000 || tagY < -100 || tagY > 2000) return null;

            return (
              <div
                key={tag.id}
                className="absolute transform -translate-x-1/2 -translate-y-full flex flex-col items-center transition-all duration-75 ease-out"
                style={{
                  left: `${tagX}px`,
                  top: `${tagY}px`,
                  // Scale down the name tag dynamically if it is far away to keep the viewport clean
                  transform: `translate(-50%, -100%) scale(${Math.max(0.65, Math.min(1.0, 45 / Math.max(15, tag.distance)))})`,
                  opacity: Math.max(0.2, Math.min(1.0, 100 / Math.max(10, tag.distance)))
                }}
              >
                {/* Modern futuristic arrow pointing downwards */}
                <div 
                  className="w-2.5 h-2.5 rotate-45 border-r border-b mb-1 animate-bounce"
                  style={{
                    borderColor: tag.color,
                    boxShadow: `2px 2px 8px ${tag.color}44`
                  }}
                />

                {/* Cyberpunk neon text badge */}
                <div 
                  className="px-2.5 py-1 bg-slate-950/90 border rounded-lg flex items-center space-x-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.65)] backdrop-blur-sm"
                  style={{ borderColor: `${tag.color}77` }}
                >
                  {/* Position Badge */}
                  <span 
                    className="text-[9px] font-black px-1 py-0.5 rounded leading-none"
                    style={{
                      backgroundColor: tag.color,
                      color: '#000000'
                    }}
                  >
                    {tag.rank}
                  </span>

                  {/* Name */}
                  <span className="text-[10px] font-bold text-white tracking-wide font-mono drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {tag.name}
                  </span>

                  {/* Distance (m) */}
                  <span className="text-[8px] font-medium text-slate-400 font-mono">
                    {tag.distance}m
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Nitro speed lines & radial motion warp blur overlay */}
        <div className={`absolute inset-0 pointer-events-none z-20 transition-all duration-500 ${
          isNitroActive ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
        }`}>
          {/* Chromatic speed vignette around borders */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_45%,rgba(6,182,212,0.15)_75%,rgba(14,165,233,0.3)_100%)] shadow-[inset_0_0_100px_rgba(6,182,212,0.45)]" />
          
          {/* Speed-streak horizontal warp flares */}
          <div className="absolute inset-x-0 top-[25%] h-[2px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent w-full animate-pulse blur-[0.5px]" />
          <div className="absolute inset-x-0 bottom-[25%] h-[3px] bg-gradient-to-r from-transparent via-sky-400/30 to-transparent w-full animate-pulse blur-[1px]" />
          
          {/* Animated SVG radial lines that pulse and fly outwards from center */}
          <div className="absolute inset-0 overflow-hidden mix-blend-screen opacity-50">
            <svg className="w-full h-full animate-[spin_6s_linear_infinite]" viewBox="0 0 100 100" preserveAspectRatio="none">
              <g stroke="rgba(56,189,248,0.75)" strokeWidth="0.25">
                <line x1="50" y1="50" x2="5" y2="5" strokeDasharray="6, 12" className="animate-[pulse_0.07s_infinite]" />
                <line x1="50" y1="50" x2="95" y2="5" strokeDasharray="5, 10" className="animate-[pulse_0.09s_infinite]" />
                <line x1="50" y1="50" x2="5" y2="95" strokeDasharray="7, 14" className="animate-[pulse_0.06s_infinite]" />
                <line x1="50" y1="50" x2="95" y2="95" strokeDasharray="4, 11" className="animate-[pulse_0.11s_infinite]" />
                <line x1="50" y1="50" x2="1" y2="50" strokeDasharray="3, 9" className="animate-[pulse_0.08s_infinite]" />
                <line x1="50" y1="50" x2="99" y2="50" strokeDasharray="5, 13" className="animate-[pulse_0.12s_infinite]" />
                <line x1="50" y1="50" x2="50" y2="1" strokeDasharray="4, 10" className="animate-[pulse_0.05s_infinite]" />
                <line x1="50" y1="50" x2="50" y2="99" strokeDasharray="3, 11" className="animate-[pulse_0.1s_infinite]" />
              </g>
            </svg>
          </div>
        </div>

        {/* Real-time Center-Top Lap Counter & Steering Indicator HUD */}
        {roomState === 'racing' && !isReplaying && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center pointer-events-none select-none z-30 space-y-1.5">
            <div className={`px-6 py-2 rounded-2xl border backdrop-blur-md flex items-center space-x-4 shadow-2xl transition-all duration-300 ${
              isLastLap 
                ? 'bg-rose-950/90 border-rose-500 shadow-[0_0_25px_rgba(239,68,68,0.4)] animate-pulse' 
                : 'bg-slate-950/85 border-slate-800/85 shadow-[0_0_15px_rgba(0,0,0,0.5)]'
            }`}>
              <div className="flex flex-col items-center min-w-[80px]">
                <span className={`text-[9px] font-mono tracking-widest font-extrabold uppercase ${
                  isLastLap ? 'text-rose-400' : 'text-slate-400'
                }`}>
                  {isLastLap ? '⚠️ LAST LAP' : `${t("lap")} / LAP`}
                </span>
                <span className={`text-2xl font-black font-mono leading-none tracking-tight ${
                  isLastLap ? 'text-rose-100' : 'text-white'
                }`}>
                  {track.isOpen ? '1 / 1' : `${lap} / ${totalLaps}`}
                </span>
              </div>
            </div>

            {/* Steering Input Gauge HUD at top center */}
            <div className="px-4 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-md shadow-lg flex items-center space-x-3">
              <span className={`text-xs font-black font-mono transition-all duration-100 flex items-center gap-1 ${
                steeringInput < -0.1 ? 'text-cyan-400 scale-125 animate-pulse drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'text-slate-600'
              }`}>
                ◀ <span>左 L</span>
              </span>

              {/* Dynamic Steering Gauge Bar */}
              <div className="w-28 sm:w-36 h-2.5 bg-slate-900 rounded-full border border-slate-800 relative overflow-hidden flex items-center justify-center">
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-slate-600 z-10" />
                <div 
                  className={`h-full transition-all duration-75 rounded-full ${
                    steeringInput < -0.1 ? 'bg-gradient-to-l from-cyan-400 to-sky-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]' :
                    steeringInput > 0.1 ? 'bg-gradient-to-r from-cyan-400 to-sky-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]' : 'bg-slate-700/50'
                  }`}
                  style={{
                    width: `${Math.abs(steeringInput) * 50}%`,
                    left: steeringInput < 0 ? `${50 - Math.abs(steeringInput) * 50}%` : '50%',
                    position: 'absolute'
                  }}
                />
              </div>

              <span className={`text-xs font-black font-mono transition-all duration-100 flex items-center gap-1 ${
                steeringInput > 0.1 ? 'text-cyan-400 scale-125 animate-pulse drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]' : 'text-slate-600'
              }`}>
                <span>右 R</span> ▶
              </span>
            </div>
            
            {/* Flashing alert banner specifically for the final lap */}
            {isLastLap && (
              <div className="px-3 py-0.5 bg-rose-500 text-white text-[8px] font-black uppercase tracking-widest rounded-md animate-bounce shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                FINAL LAP / 最後一圈
              </div>
            )}
          </div>
        )}

        {/* Soft Glowing Edge Steering Indicators */}
        {roomState === 'racing' && !isReplaying && (
          <>
            {/* Left Edge Indicator */}
            {steeringInput < -0.08 && (
              <div className="fixed left-3 sm:left-6 top-1/2 -translate-y-1/2 z-40 pointer-events-none select-none flex items-center space-x-2 bg-slate-950/85 border-2 border-cyan-400/90 text-cyan-300 px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl backdrop-blur-md shadow-[0_0_35px_rgba(6,182,212,0.6)] animate-pulse transition-all">
                <span className="text-2xl sm:text-3xl font-black font-mono animate-bounce">◀</span>
                <div className="flex flex-col">
                  <span className="text-[10px] sm:text-xs font-black tracking-widest text-cyan-300 uppercase">STEER LEFT</span>
                  <span className="text-[8px] sm:text-[10px] font-mono text-cyan-200/90">向左轉向中 ({Math.abs(Math.round(steeringInput * 100))}%)</span>
                </div>
              </div>
            )}
            {steeringInput < -0.08 && (
              <div className="fixed inset-y-0 left-0 w-28 bg-gradient-to-r from-cyan-500/25 via-cyan-500/10 to-transparent pointer-events-none transition-opacity duration-150 z-30" />
            )}

            {/* Right Edge Indicator */}
            {steeringInput > 0.08 && (
              <div className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-40 pointer-events-none select-none flex items-center space-x-2 bg-slate-950/85 border-2 border-cyan-400/90 text-cyan-300 px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl backdrop-blur-md shadow-[0_0_35px_rgba(6,182,212,0.6)] animate-pulse transition-all">
                <div className="flex flex-col text-right">
                  <span className="text-[10px] sm:text-xs font-black tracking-widest text-cyan-300 uppercase">STEER RIGHT</span>
                  <span className="text-[8px] sm:text-[10px] font-mono text-cyan-200/90">向右轉向中 ({Math.abs(Math.round(steeringInput * 100))}%)</span>
                </div>
                <span className="text-2xl sm:text-3xl font-black font-mono animate-bounce">▶</span>
              </div>
            )}
            {steeringInput > 0.08 && (
              <div className="fixed inset-y-0 right-0 w-28 bg-gradient-to-l from-cyan-500/25 via-cyan-500/10 to-transparent pointer-events-none transition-opacity duration-150 z-30" />
            )}
          </>
        )}

        {/* 浮動式半透明排行榜 UI (Floating Semi-transparent Leaderboard HUD) */}
        {roomState === 'racing' && !isReplaying && showSpeedometer && (
          <div 
            id="floating-hud-leaderboard" 
            className="absolute top-4 right-4 z-40 w-72 bg-slate-950/75 border border-slate-800/80 rounded-2xl p-3 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)] text-slate-100 font-sans pointer-events-auto select-none max-h-[250px] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-2 mb-2 flex-shrink-0">
              <span className="text-[10px] font-black tracking-widest text-pink-400 font-mono flex items-center gap-1.5">
                <span className="animate-pulse">🏁</span> {t("realtimeRankings") || "即時名次"} (LIVE)
              </span>
              <span className="text-[8px] font-mono text-slate-400">
                {track.name} ({trackLength}m)
              </span>
            </div>

            {/* List */}
            <div className="space-y-1.5 overflow-y-auto flex-1 pr-0.5 scrollbar-thin scrollbar-thumb-slate-800">
              {leaderboard.map((playerItem, index) => {
                const player = playerItem as any;
                const isMe = player.id === playerId;
                
                // Calculate distance/progress to finish
                const playerLaps = player.lap || 1;
                const playerProgress = player.progress || 0;
                const totalLapsCount = totalLaps;
                
                let completedDist = 0;
                if (player.finished) {
                  completedDist = totalLapsCount * trackLength;
                } else {
                  completedDist = Math.min(totalLapsCount * trackLength, ((playerLaps - 1) * trackLength) + (playerProgress * trackLength));
                }
                
                const remainingDist = Math.max(0, (totalLapsCount * trackLength) - completedDist);
                const progressPercent = Math.min(100, Math.max(0, (completedDist / (totalLapsCount * trackLength)) * 100));

                const placeColors = ["text-yellow-400", "text-slate-300", "text-amber-600", "text-slate-400"];
                const medalColor = placeColors[index] || "text-slate-500";

                return (
                  <div 
                    key={player.id || index}
                    className={`p-1.5 rounded-xl border transition-all duration-150 ${
                      isMe 
                        ? 'bg-cyan-500/15 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.15)]' 
                        : 'bg-slate-900/40 border-slate-850 hover:border-slate-800'
                    }`}
                  >
                    {/* Position, Name and Time */}
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <div className="flex items-center space-x-2 overflow-hidden truncate">
                        <span className={`font-mono font-black w-4 text-center ${medalColor}`}>
                          #{index + 1}
                        </span>
                        {/* Car Color Dot */}
                        <span 
                          className="w-1.5 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: player.color || player.carConfig?.paint || '#ff3366' }}
                        />
                        <span className={`font-bold truncate ${isMe ? 'text-cyan-300' : 'text-slate-200'}`}>
                          {player.name} {isMe && `(${t("me")})`}
                        </span>
                      </div>

                      <div className="font-mono text-[9px] text-right">
                        {player.finished ? (
                          <span className="text-yellow-400 font-bold">
                            {formatRaceTimeLocal(player.bestTime)}
                          </span>
                        ) : isMe ? (
                          <span className="text-cyan-400 font-bold">
                            {formatRaceTimeLocal(currentLapTime)}
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            Lap {playerLaps}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar and Distance Remaining */}
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between text-[8px] text-slate-400 font-mono scale-95 origin-left">
                        <span>進度: {progressPercent.toFixed(0)}%</span>
                        <span>
                          {player.finished ? '完賽 🏁' : `剩餘: ${remainingDist.toFixed(0)}m`}
                        </span>
                      </div>
                      <div className="w-full h-1 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                        <div 
                          className={`h-full transition-all duration-300 ${
                            isMe ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.5)]' : 'bg-slate-400'
                          }`}
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Back button */}
        {!isReplaying && showSpeedometer && (
          <button
            onClick={onBackToLobby}
            id="back-to-lobby-btn"
            className="absolute top-4 left-4 flex items-center space-x-2 bg-slate-950/80 hover:bg-slate-900 border border-slate-800 text-slate-300 font-bold px-4 py-2.5 rounded-xl transition cursor-pointer text-xs z-30"
          >
            <ArrowLeft className="w-4 h-4 text-cyan-400" />
            <span>{t("quitRace")}</span>
          </button>
        )}

        {/* Camera Perspective Selector Toggle Panel */}
        {showSpeedometer && (
          <div 
            id="camera-mode-tabs" 
            className="absolute top-18 left-4 bg-slate-950/85 p-3 rounded-2xl border border-slate-800/80 backdrop-blur w-48 space-y-2 select-none z-30"
          >
          <div className="text-[9px] font-mono tracking-widest text-slate-500 uppercase font-semibold pl-1 flex items-center justify-between">
            <span>{t("cameraSwitch")}</span>
          </div>

          {/* Quick Dual Switch button for FPV 1P vs TPV 3P */}
          <div className="pb-1">
            <button
              onClick={() => {
                const nextMode = cameraMode === 'cockpit' ? 'farFollow' : 'cockpit';
                changeCameraMode(nextMode);
              }}
              className="w-full py-1.5 px-2 bg-cyan-950/20 hover:bg-cyan-900/30 border border-cyan-500/35 rounded-xl text-[10px] font-black tracking-wider text-cyan-300 flex items-center justify-between transition cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
              title="極速在駕駛艙(第一人稱)與車後(第三人稱)視角之間雙向切換"
            >
              <span className="flex items-center space-x-1">
                <span>🔄</span>
                <span>{t("viewSwitchDual") || "FPV ↔ TPV 快速切換"}</span>
              </span>
              <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 px-1.5 py-0.2 rounded text-[8px] font-mono font-black">F</span>
            </button>
          </div>

          <div className="flex flex-col space-y-1">
            <button
              onClick={() => changeCameraMode('cockpit')}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                cameraMode === 'cockpit'
                  ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <span className="text-[10px] font-mono text-cyan-500/80">[1]</span>
                <span className="text-xs">🏎️</span>
                <span className="truncate">{t("cameraCockpit")}</span>
              </div>
            </button>
            <button
              onClick={() => changeCameraMode('farFollow')}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                cameraMode === 'farFollow'
                  ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <span className="text-[10px] font-mono text-cyan-500/80">[2]</span>
                <span className="text-xs">🎥</span>
                <span className="truncate">{t("cameraChase")}</span>
              </div>
            </button>
            <button
              onClick={() => changeCameraMode('overhead')}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                cameraMode === 'overhead'
                  ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <span className="text-[10px] font-mono text-cyan-500/80">[3]</span>
                <span className="text-xs">📌</span>
                <span className="truncate">{t("cameraOverhead")}</span>
              </div>
            </button>
            <button
              onClick={() => changeCameraMode('cinematic')}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                cameraMode === 'cinematic'
                  ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent'
              }`}
            >
              <div className="flex items-center space-x-2 truncate">
                <span className="text-[10px] font-mono text-cyan-500/80">[4]</span>
                <span className="text-xs">🎬</span>
                <span className="truncate">{t("cameraCinematic")}</span>
              </div>
            </button>
          </div>
          <div className="pt-2 border-t border-slate-800/60 flex flex-col space-y-1.5 pl-1">
            <div className="text-[9px] font-mono text-slate-400 flex items-center justify-between">
              <span>{t("viewSwitchDual") || "FPV ↔ TPV 快速切換"}</span>
              <span className="text-cyan-400 bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/30 font-bold">[F]</span>
            </div>
            <div className="text-[9px] font-mono text-slate-400 flex items-center justify-between">
              <span>{t("toggleDashboard")}</span>
              <span className="text-cyan-400 bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/30 font-bold">[H]</span>
            </div>
            <div className="text-[9px] font-mono text-slate-400 flex items-center justify-between">
              <span>{t("handbrakeDrift")}</span>
              <span className="text-amber-400 bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-800/30 font-bold">[Space]</span>
            </div>
            <div className="text-[9px] font-mono text-slate-400 flex items-center justify-between">
              <span>{t("nitroOverload")}</span>
              <span className="text-pink-400 bg-pink-950/50 px-1.5 py-0.5 rounded border border-pink-800/30 font-bold">[Shift]</span>
            </div>
          </div>

          {/* Ghost Mode settings panel */}
          <div className="pt-2.5 border-t border-slate-800/60 flex flex-col space-y-2 pl-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center space-x-1.5">
                <span className="text-sm">👻</span>
                <span>{t("ghostMode") || "幽靈模式"}</span>
              </span>
              <button
                onClick={() => setGhostModeEnabled(!ghostModeEnabled)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide transition cursor-pointer border ${
                  ghostModeEnabled 
                    ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-400' 
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                }`}
              >
                {ghostModeEnabled ? (t("on") || "ON") : (t("off") || "OFF")}
              </button>
            </div>
            
            {ghostModeEnabled && (
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[9px] font-medium text-slate-400">{t("ghostType") || "幽靈來源"}</span>
                <div className="flex bg-slate-900 rounded p-0.5 border border-slate-800/80">
                  <button
                    onClick={() => setGhostType('best')}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider transition uppercase cursor-pointer ${
                      ghostType === 'best'
                        ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={t("ghostBestDesc") || "顯示本場最佳單圈軌跡"}
                  >
                    {t("ghostBest") || "最佳"}
                  </button>
                  <button
                    onClick={() => setGhostType('last')}
                    className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider transition uppercase cursor-pointer ${
                      ghostType === 'last'
                        ? 'bg-cyan-500/20 text-cyan-400 font-bold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                    title={t("ghostLastDesc") || "顯示上一圈的軌跡"}
                  >
                    {t("ghostLast") || "上一圈"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Optimal Racing Line Switch Panel */}
          <div className="pt-2.5 border-t border-slate-800/60 flex flex-col space-y-2 pl-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center space-x-1.5">
                <span className="text-[11px]">🟢</span>
                <span>{t("racingLineTitle") || "最佳行車線"}</span>
              </span>
              <button
                onClick={() => setShowRacingLine(!showRacingLine)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide transition cursor-pointer border ${
                  showRacingLine 
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' 
                    : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
                }`}
              >
                {showRacingLine ? (t("on") || "ON") : (t("off") || "OFF")}
              </button>
            </div>
          </div>

          {/* Weather Settings Panel */}
          <div className="pt-2.5 border-t border-slate-800/60 flex flex-col space-y-2 pl-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center space-x-1.5">
                <span className="text-sm">🌤️</span>
                <span>{t("weatherSettingTitle") || "環境天氣系統"}</span>
              </span>
            </div>
            <div className="grid grid-cols-5 gap-0.5 bg-slate-900 p-0.5 rounded border border-slate-800/80">
              {(['auto', 'sunny', 'rainy', 'foggy', 'snowy'] as const).map((mode) => {
                let emoji = '🔄';
                if (mode === 'sunny') emoji = '☀️';
                if (mode === 'rainy') emoji = '🌧️';
                if (mode === 'foggy') emoji = '🌫️';
                if (mode === 'snowy') emoji = '❄️';
                
                let label = t("weatherAuto") || "自動";
                if (mode === 'sunny') label = t("weatherSunnyLabel") || "晴朗";
                if (mode === 'rainy') label = t("weatherRainyLabel") || "細雨";
                if (mode === 'foggy') label = t("weatherFoggyLabel") || "大霧";
                if (mode === 'snowy') label = t("weatherSnowyLabel") || "冰雪";

                const isSelected = weatherSetting === mode;

                return (
                  <button
                    key={mode}
                    onClick={() => setWeatherSetting(mode)}
                    className={`flex flex-col items-center justify-center py-1 rounded text-[8px] font-bold transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/25 text-amber-400 border border-amber-500/40 font-black'
                        : 'text-slate-500 hover:text-slate-300 border border-transparent font-medium'
                    }`}
                    title={label}
                  >
                    <span className="text-[10px] mb-0.5">{emoji}</span>
                    <span className="scale-[0.8] origin-center tracking-tighter">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shadow Settings Switch Panel */}
          <div className="pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs font-bold text-slate-300 pl-1">
            <span className="flex items-center space-x-1.5">
              <span className="text-[11px]">👥</span>
              <span>立體陰影 (Shadows)</span>
            </span>
            <button
              onClick={() => {
                const nextVal = !shadowsEnabled;
                setShadowsEnabled(nextVal);
                safeStorage.setItem("giga_racer_shadows_enabled", nextVal ? "true" : "false");
                // Reload to apply WebGL renderer settings cleanly
                window.location.reload();
              }}
              className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide transition cursor-pointer border ${
                shadowsEnabled 
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400' 
                  : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400'
              }`}
            >
              {shadowsEnabled ? (t("on") || "ON") : (t("off") || "OFF")}
            </button>
          </div>
        </div>
        )}

        {/* Speed Test Telemetry Real-time Dashboard Panel */}
        {(track.id === 'speed-test' || track.isOpen) && !isReplaying && showSpeedometer && (
          <div 
            id="speed-test-hud-panel"
            className="absolute top-[285px] left-4 bg-slate-950/90 p-4 rounded-2xl border border-cyan-500/30 backdrop-blur w-48 space-y-3 shadow-[0_0_15px_rgba(6,182,212,0.15)] z-30"
          >
            <div className="flex items-center space-x-1.5 border-b border-slate-800 pb-1.5">
              <span className="text-cyan-400">⚡</span>
              <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-black">
                {t("performanceMonitor")}
              </span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500 text-[10px]">{t("maxSpeed")} MAX SPEED</span>
                <span className="text-cyan-400 font-bold">{speedTestRepo.maxSpeed} km/h</span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500 text-[10px]">0-100 km/h</span>
                <span className="text-amber-400 font-bold">
                  {speedTestRepo.time0To100 !== null ? `${speedTestRepo.time0To100.toFixed(2)}s` : '--'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500 text-[10px]">0-200 km/h</span>
                <span className="text-amber-400 font-bold">
                  {speedTestRepo.time0To200 !== null ? `${speedTestRepo.time0To200.toFixed(2)}s` : '--'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500 text-[10px]">{t("time400m")}</span>
                <span className="text-emerald-400 font-bold">
                  {speedTestRepo.time400m !== null ? `${speedTestRepo.time400m.toFixed(2)}s` : '--'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-900 pb-1">
                <span className="text-slate-500 text-[10px]">{t("time1000m")}</span>
                <span className="text-emerald-400 font-bold">
                  {speedTestRepo.time1000m !== null ? `${speedTestRepo.time1000m.toFixed(2)}s` : '--'}
                </span>
              </div>
              {track.id === 'speed-test' && (
                <div className="flex justify-between pb-1">
                  <span className="text-slate-500 text-[10px]">{t("time3000m")}</span>
                  <span className="text-pink-400 font-bold">
                    {speedTestRepo.time3000m !== null ? `${speedTestRepo.time3000m.toFixed(2)}s` : '--'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top-Right HUD & Mini-map Column */}
        {showSpeedometer && (
          <div className="absolute top-4 right-4 flex flex-col items-end space-y-2 pointer-events-none z-30">
            {/* Interactive 2D Tactical Mini-map HUD */}
            {showMinimap ? (
              <div id="minimap-overlay" className="bg-slate-950/80 p-3 rounded-2xl border border-cyan-500/20 backdrop-blur-md flex flex-col space-y-1.5 shadow-[0_0_20px_rgba(6,182,212,0.1)] pointer-events-auto select-none">
                <div className="flex items-center justify-between border-b border-slate-900 pb-1.5 min-w-[160px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-cyan-400 text-[10px]">🗺️</span>
                    <span className="text-[9px] font-black uppercase text-slate-300 tracking-wider font-mono">
                      {t("miniMapTitle")} / MINI-MAP
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      audioSystem.playClick("low");
                      setShowMinimap(false);
                    }}
                    className="text-slate-500 hover:text-slate-300 transition text-[9px] font-mono uppercase bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 hover:border-slate-700 cursor-pointer"
                    title={t("hideMapTitle")}
                  >
                    {t("closeLabel")} OFF
                  </button>
                </div>
                
                <div className="relative flex items-center justify-center p-0.5 bg-slate-950/40 rounded-xl border border-slate-900 overflow-hidden">
                  <canvas
                    ref={minimapCanvasRef}
                    width={170}
                    height={170}
                    className="w-[170px] h-[170px]"
                  />
                </div>
                <div className="text-[7.5px] text-slate-500 text-center font-mono uppercase flex justify-between px-1">
                  <span className="text-cyan-400">{t("playerMarkerLegend")}</span>
                  <span className="text-rose-400">{t("opponentMarkerLegend")}</span>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  audioSystem.playClick("high");
                  setShowMinimap(true);
                }}
                className="bg-slate-950/95 border border-cyan-500/30 hover:border-cyan-400 text-slate-300 text-[9px] font-extrabold uppercase rounded-xl transition cursor-pointer flex items-center px-3 py-2 space-x-1.5 shadow-lg shadow-cyan-950/10 hover:shadow-cyan-500/10 pointer-events-auto"
                title={t("showMapButton")}
              >
                <span>🗺️ {t("showMapButton")} (SHOW MAP)</span>
              </button>
            )}

            {/* HUD Overlay instrument clusters */}
            <div className="flex flex-col space-y-2 items-end">
              <div className="bg-slate-950/85 px-4 py-3 rounded-xl border border-cyan-500/30 backdrop-blur text-right pointer-events-auto">
                <div className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">TRACK COURSE / {t("trackCourse")}</div>
                <div className="text-sm font-bold text-slate-100">{track.name === 'Random Track' || track.name === '隨機賽道' ? t("randomTrack") : getTrackName(track.id, track.name)}</div>
              </div>

              {/* Dynamics weather status HUD */}
              <div className="bg-slate-950/85 px-4 py-2 flex items-center justify-between space-x-3 rounded-xl border border-amber-500/35 backdrop-blur w-64 text-right pointer-events-auto">
                <span className="text-lg animate-bounce select-none">
                  {currentWeather === 'sunny' && '☀️'}
                  {currentWeather === 'rainy' && '🌧️'}
                  {currentWeather === 'foggy' && '🌫️'}
                  {currentWeather === 'snowy' && '❄️'}
                </span>
                <div>
                  <div className="text-[8px] text-amber-500 font-mono tracking-widest uppercase">WEATHER & GRIP / {t("currentWeather")}</div>
                  <div className="text-xs font-semibold text-slate-100 font-mono">
                    {currentWeather === 'sunny' && t("weatherSunny")}
                    {currentWeather === 'rainy' && <span className="text-cyan-400">{t("weatherRainy")}</span>}
                    {currentWeather === 'foggy' && <span className="text-fuchsia-400">{t("weatherFoggy")}</span>}
                    {currentWeather === 'snowy' && <span className="text-blue-200">{t("weatherSnowy")}</span>}
                  </div>
                </div>
              </div>

              <div className={`px-4 py-3 rounded-xl backdrop-blur text-right flex items-center justify-end space-x-4 pointer-events-auto transition-all duration-300 ${
                isLastLap 
                  ? 'bg-rose-950/95 border-2 border-rose-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse' 
                  : 'bg-slate-950/85 border border-pink-500/30'
              }`}>
                <div>
                  <div className={`text-[10px] font-mono tracking-widest uppercase ${isLastLap ? 'text-rose-400 font-extrabold animate-pulse' : 'text-pink-400'}`}>
                    {isLastLap ? '⚠️ LAST LAP' : `${t("lap")} / LAP`}
                  </div>
                  <div className={`text-lg font-bold font-mono ${isLastLap ? 'text-rose-200' : 'text-pink-500'}`}>
                    {track.isOpen ? t("straightTrack") : `${lap} / ${totalLaps}`}
                  </div>
                </div>
                <div className="w-[1px] h-8 bg-slate-800" />
                <div>
                  <div className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">LAP TIMER / {t("lapTimer")}</div>
                  <div className="text-lg font-bold font-mono text-cyan-400">
                    {(currentLapTime / 1000).toFixed(2)}s
                  </div>
                </div>
                <div className="w-[1px] h-8 bg-slate-800" />
                <div>
                  <div className="text-[10px] text-emerald-400 font-mono tracking-widest uppercase flex items-center justify-end space-x-1">
                    <Timer className="w-3 h-3 animate-pulse" />
                    <span>{t("totalRaceTimer")} TOTAL</span>
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-400">
                    {(raceTime / 1000).toFixed(2)}s
                  </div>
                </div>
              </div>
              
              {/* Temporary lap banner removed */}

              {bestLapTime && (
                <div className="bg-slate-950/85 px-4 py-2 rounded-xl border border-yellow-500/20 backdrop-blur text-right pointer-events-auto">
                  <span className="text-[10px] text-yellow-400 font-mono mr-2">⭐ {t("personalBestLap")}</span>
                  <span className="font-mono text-xs text-yellow-500/90 font-bold">{(bestLapTime / 1000).toFixed(2)}s</span>
                </div>
              )}

              {completedLapTimes.length > 0 && (
                <div className="bg-slate-950/85 px-4 py-2.5 rounded-xl border border-slate-800/80 backdrop-blur text-right space-y-1.5 w-52 pointer-events-auto">
                  <div className="text-[9px] text-slate-500 font-mono tracking-wider uppercase font-bold">{t("lapRecordBoard")}</div>
                  <div className="space-y-1">
                    {completedLapTimes.map((time, idx) => (
                      <div key={idx} className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-slate-400">Lap {idx + 1}:</span>
                        <span className={`${time === bestLapTime ? 'text-yellow-400 font-bold' : 'text-cyan-400'}`}>
                          {(time / 1000).toFixed(3)}s {time === bestLapTime && "★"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Big visual warnings for Off-road terrain drops */}
        {offroadWarning && roomState === 'racing' && (
          <div className="absolute top-[30%] left-1/2 transform -translate-x-1/2 bg-yellow-500/10 border border-yellow-500/40 text-yellow-400 px-6 py-2 rounded-xl text-xs font-bold tracking-widest uppercase animate-pulse flex items-center space-x-2 backdrop-blur-sm shadow-[0_0_15px_rgba(234,179,8,0.2)]">
            <ShieldAlert className="w-4 h-4" />
            <span>{t("offRoadPenalty")} (OFF ROAD - FRICTION CAP)</span>
          </div>
        )}

        {/* Pit Stop UI overlays */}
        {isInPitLane && roomState === 'racing' && (
          <div className="absolute top-[32%] left-1/2 transform -translate-x-1/2 bg-black/90 border-2 border-emerald-500 text-white p-5 rounded-2xl w-80 sm:w-96 backdrop-blur-md shadow-[0_0_30px_rgba(16,185,129,0.5)] z-50 animate-bounce flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-2">
              <span className="text-emerald-400 font-extrabold text-sm tracking-wider uppercase flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                {t("pitStopActive")}
              </span>
              <span className="text-[10px] font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {t("pitLaneAlert")}
              </span>
            </div>

            {/* Repair State */}
            <div className="flex flex-col space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <span className={`${pitRepairing ? 'inline-block animate-spin text-emerald-400' : 'text-slate-400'}`}>🔧</span>
                  {t("pitRepairing")}
                </span>
                <span className="font-mono text-emerald-400 font-bold">{100 - damagePercent}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-150" 
                  style={{ width: `${100 - damagePercent}%` }}
                />
              </div>
            </div>

            {/* Refuel State */}
            <div className="flex flex-col space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <span className={`${pitRefueling ? 'inline-block animate-pulse text-sky-400' : 'text-slate-400'}`}>⚡</span>
                  {t("pitRefueling")}
                </span>
                <span className="font-mono text-sky-400 font-bold">{nitroEnergy}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-sky-500 h-full rounded-full transition-all duration-150" 
                  style={{ width: `${nitroEnergy}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {pitCompleteAnimation && roomState === 'racing' && (
          <div className="absolute top-[35%] left-1/2 transform -translate-x-1/2 bg-emerald-600/90 border border-emerald-400 text-white px-8 py-3 rounded-2xl text-xs font-black tracking-widest uppercase animate-bounce flex items-center space-x-2 backdrop-blur-md shadow-[0_0_25px_rgba(16,185,129,0.4)] z-50">
            <span>🏁</span>
            <span className="font-sans">{t("pitComplete")}</span>
          </div>
        )}

        {/* Proximity warnings for Tight Turns / Obstacle Clusters */}
        {approachingTurnAlert && roomState === 'racing' && (
          <div className="absolute top-[38%] left-1/2 transform -translate-x-1/2 bg-rose-600/15 border border-rose-500/50 text-rose-400 px-6 py-2.5 rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase animate-bounce flex items-center space-x-2 backdrop-blur-sm shadow-[0_0_20px_rgba(239,68,68,0.35)] z-20">
            <span className="text-sm">⚠️</span>
            <span className="font-mono">{t("tightTurnWarning")}</span>
          </div>
        )}

        {approachingObstacleAlert && roomState === 'racing' && (
          <div className="absolute top-[44%] left-1/2 transform -translate-x-1/2 bg-orange-600/15 border border-orange-500/50 text-orange-400 px-6 py-2.5 rounded-xl text-[10px] sm:text-xs font-black tracking-widest uppercase animate-pulse flex items-center space-x-2 backdrop-blur-sm shadow-[0_0_20px_rgba(249,115,22,0.35)] z-20">
            <span className="text-sm">🚧</span>
            <span className="font-mono">{t("obstacleDenseWarning")}</span>
          </div>
        )}

        {/* Speed-Gated High Altitude Bridge Warning alert overlay */}
        {highAltitudeAlert && roomState === 'racing' && (
          <div className={`absolute top-[22%] left-1/2 transform -translate-x-1/2 border px-8 py-3 rounded-2xl text-xs font-bold tracking-widest uppercase flex items-center space-x-2 backdrop-blur-md transition-all duration-300 z-30 ${
            highAltitudeAlert.includes("🟢") || highAltitudeAlert.includes("⚡")
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] animate-pulse"
              : highAltitudeAlert.includes("🚫") || highAltitudeAlert.includes("💥")
              ? "bg-rose-500/15 border-rose-500/40 text-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.35)] animate-bounce"
              : "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
          }`}>
            <Zap className={`w-4 h-4 ${highAltitudeAlert.includes("🟢") || highAltitudeAlert.includes("⚡") ? "text-emerald-400 animate-pulse" : highAltitudeAlert.includes("🚫") || highAltitudeAlert.includes("💥") ? "text-rose-500" : "text-amber-400"}`} />
            <span>{highAltitudeAlert}</span>
          </div>
        )}

        {/* Nitro active speed lines fullscreen action visual effects */}
        {isNitroActive && roomState === 'racing' && (
          <div className="absolute inset-0 pointer-events-none border-[6px] border-sky-500/25 shadow-[inset_0_0_60px_rgba(14,165,233,0.35)] animate-pulse select-none z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,rgba(14,165,233,0.1)_100%)]" />
            <div className="absolute top-1/2 left-4 transform -translate-y-1/2 text-[8px] font-mono tracking-widest text-sky-400 uppercase [writing-mode:vertical-lr] opacity-70">NITRO ACTIVE / {t("nitroActive")}</div>
            <div className="absolute top-1/2 right-4 transform -translate-y-1/2 text-[8px] font-mono tracking-widest text-sky-400 uppercase [writing-mode:vertical-lr] rotate-180 opacity-70">WARP ENGINE ENGAGED</div>
          </div>
        )}

        {/* Overlay Speedometer Instrument Clutter Bottom Center */}
        {!isReplaying && showSpeedometer && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-950/90 py-3 px-6 rounded-2xl border border-slate-800 backdrop-blur flex flex-col md:flex-row items-center md:space-x-5 space-y-2 md:space-y-0 min-w-[320px] md:min-w-[500px] justify-between shadow-2xl z-20 pointer-events-none select-none">
            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Dynamic Double-Gauge Dashboard Cluster */}
              <div className="relative w-[210px] h-[95px] flex-shrink-0 bg-slate-950/40 rounded-xl border border-slate-900 overflow-hidden shadow-inner">
                <svg width="210" height="95" viewBox="0 0 210 95" className="w-full h-full">
                  {/* Left Gauge (Tachometer) center at x=50, y=48 */}
                  <g>
                    {/* Ring background */}
                    <path d="M 23 74 A 28 28 0 1 1 77 74" fill="none" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
                    {/* Danger redline sweep background */}
                    <path d="M 67 24 A 28 28 0 0 1 77 74" fill="none" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
                    
                    {/* Left dial labels */}
                    <text x="50" y="88" textAnchor="middle" fontSize="6px" fill="#475569" fontWeight="bold" className="font-mono uppercase tracking-wider">RPM x1000</text>
                    <text x="21" y="71" textAnchor="middle" fontSize="6px" fill="#64748b" className="font-mono">1</text>
                    <text x="22" y="40" textAnchor="middle" fontSize="6px" fill="#64748b" className="font-mono">3</text>
                    <text x="50" y="27" textAnchor="middle" fontSize="6px" fill="#64748b" className="font-mono">6</text>
                    <text x="73" y="44" textAnchor="middle" fontSize="6px" fill="#f43f5e" className="font-mono font-bold">8</text>
                    <text x="70" y="71" textAnchor="middle" fontSize="6px" fill="#f43f5e" className="font-mono font-bold">10</text>

                    {/* Core Gear Display Box inside tachometer */}
                    <rect x="40" y="38" width="20" height="20" rx="3" fill="#020617" stroke={rpm > 7500 ? "#f43f5e" : "#334155"} strokeWidth="1" />
                    <text 
                      x="50" 
                      y="53" 
                      textAnchor="middle" 
                      fontSize="14px" 
                      fontWeight="900" 
                      fill={gear === 'R' ? "#f43f5e" : gear === 'N' ? "#64748b" : "#22d3ee"} 
                      className="font-mono"
                      style={{ filter: gear === 'N' ? 'none' : gear === 'R' ? 'drop-shadow(0 0 3px #ef4444)' : 'drop-shadow(0 0 3px #06b6d4)' }}
                    >
                      {gear}
                    </text>
                    
                    {/* Shift Light / Redline flashing trigger */}
                    {rpm > 7500 && (
                      <g>
                        <circle cx="50" cy="30" r="3" fill="#ef4444" className="animate-ping" />
                        <circle cx="50" cy="30" r="2" fill="#ef4444" />
                      </g>
                    )}

                    {/* Tachometer needle */}
                    <line 
                      x1="50" 
                      y1="48" 
                      x2="50" 
                      y2="21" 
                      stroke="#fbbf24" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      style={{ 
                        transform: `rotate(${-135 + Math.min(rpm / 10000, 1.0) * 270}deg)`, 
                        transformOrigin: '50px 48px', 
                        transition: 'transform 0.08s cubic-bezier(0.1, 0.7, 0.2, 1)' 
                      }} 
                    />
                    <circle cx="50" cy="48" r="3.5" fill="#fbbf24" />
                  </g>

                  {/* Right Gauge (Speedometer) center at x=150, y=48 */}
                  <g>
                    {/* Dial ring background */}
                    <path d="M 123 74 A 28 28 0 1 1 177 74" fill="none" stroke="#1e293b" strokeWidth="4" strokeLinecap="round" />
                    
                    {/* Speed labels on dial */}
                    <text x="120" y="71" textAnchor="middle" fontSize="6px" fill="#64748b" className="font-mono">0</text>
                    <text x="122" y="40" textAnchor="middle" fontSize="6px" fill="#64748b" className="font-mono">60</text>
                    <text x="150" y="27" textAnchor="middle" fontSize="6px" fill="#64748b" className="font-mono">120</text>
                    <text x="178" y="40" textAnchor="middle" fontSize="6px" fill="#64748b" className="font-mono">180</text>
                    <text x="176" y="71" textAnchor="middle" fontSize="6px" fill="#64748b" className="font-mono">240</text>

                    {/* Integrated Digital HUD value inside right gauge */}
                    <text x="150" y="48" textAnchor="middle" fontSize="14px" fontWeight="900" fill="#f1f5f9" className="font-mono tracking-tighter">{currentSpeed}</text>
                    <text x="150" y="56" textAnchor="middle" fontSize="6px" fontWeight="bold" fill="#64748b" className="font-mono tracking-widest">KM/H</text>

                    {/* Animated needle */}
                    <line 
                      x1="150" 
                      y1="48" 
                      x2="150" 
                      y2="21" 
                      stroke="#ef4444" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      style={{ 
                        transform: `rotate(${-135 + Math.min(currentSpeed / 240, 1.0) * 270}deg)`, 
                        transformOrigin: '150px 48px', 
                        transition: 'transform 0.05s cubic-bezier(0.1, 0.8, 0.3, 1)' 
                      }} 
                    />
                    <circle cx="150" cy="48" r="3.5" fill="#ef4444" />
                    <circle cx="150" cy="48" r="1" fill="#ffffff" />
                  </g>
                </svg>
              </div>

              <div className="w-[1px] h-10 bg-slate-800" />
              
              <div className="text-xs text-left min-w-[75px] hidden sm:block">
                <div className="text-slate-500 uppercase tracking-widest text-[8px]">TIRES / {t("tires")}</div>
                <div className="font-bold text-slate-300 font-mono text-[9px] truncate">
                  {myCarConfig.wheelType === 'offroad' ? t("tireOffroad") : myCarConfig.wheelType === 'sport' ? t("tireSport") : t("tireClassic")}
                </div>
                <div className="text-slate-500 uppercase tracking-widest text-[8px] mt-1">ENGINE / {t("engineUpgrade")}</div>
                <div className="font-mono text-[9px] text-pink-500 font-bold">LV.{myCarConfig.engineLevel}</div>
              </div>
            </div>
            
            <div className="hidden md:block w-[1px] h-10 bg-slate-800" />
            
            <div className="flex items-center space-x-4 w-full md:w-auto md:flex-1 justify-between">
              {/* NITRO Energy bar column */}
              <div className="flex-1 min-w-[105px] text-left">
                {nitroCooldown > 0 ? (
                  <>
                    <div className="flex justify-between items-center text-[9px] font-mono tracking-widest mb-1 text-red-500 font-extrabold animate-pulse">
                      <span>NITRO COOLDOWN</span>
                      <span>{nitroCooldown.toFixed(1)}s</span>
                    </div>
                    <div className="w-full h-2 bg-slate-900 rounded-full border border-red-950 overflow-hidden relative">
                      <div 
                        className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 rounded-full transition-all duration-75"
                        style={{ width: `${(nitroCooldown / 6.0) * 100}%` }}
                      />
                    </div>
                    <div className="text-[8px] text-red-400 mt-1 font-mono flex items-center space-x-1 animate-pulse">
                      <span>🔒 LOCKED ({nitroCooldown.toFixed(1)}s)</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center text-[9px] font-mono tracking-widest mb-1 text-sky-400 font-bold">
                      <span>NITRO (SHIFT)</span>
                      <span>{Math.round(nitroEnergy)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-900 rounded-full border border-sky-950 overflow-hidden relative">
                      <div 
                        className={`h-full bg-gradient-to-r from-blue-500 via-sky-400 to-cyan-300 rounded-full transition-all duration-75 ${
                          isNitroActive ? 'animate-pulse shadow-[0_0_8px_#38bdf8] scale-y-110' : ''
                        }`}
                        style={{ width: `${nitroEnergy}%` }}
                      />
                    </div>
                    <div className="text-[8px] text-slate-500 mt-1 font-mono">
                      {isNitroActive ? (
                        <span className="text-sky-400 font-bold animate-pulse">▶ {t("nitroActive")}</span>
                      ) : nitroEnergy < 15 ? (
                        <span className="text-red-500 font-semibold">⚡ CHARGING</span>
                      ) : (
                        <span className="text-slate-400">SHIFT TO BOOST</span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="w-[1px] h-10 bg-slate-800" />

              {/* DAMAGE Bar Column */}
              <div className="flex-1 min-w-[105px] text-left">
                <div className="flex justify-between items-center text-[9px] font-mono tracking-widest mb-1 text-rose-500 font-bold">
                  <span>DAMAGE / {t("carDamage")}</span>
                  <span className={`${damagePercent > 60 ? 'text-red-500 font-black animate-pulse' : ''}`}>{damagePercent}%</span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full border border-rose-950 overflow-hidden relative">
                  <div 
                    className={`h-full bg-gradient-to-r from-yellow-500 via-orange-500 to-rose-600 rounded-full transition-all duration-300 ${
                      damagePercent > 50 ? 'animate-pulse shadow-[0_0_8px_#ef4444]' : ''
                    }`}
                    style={{ width: `${damagePercent}%` }}
                  />
                </div>
                <div className="text-[8px] text-slate-500 mt-1 font-mono truncate">
                  {damagePercent > 75 ? (
                    <span className="text-red-500 font-black animate-bounce block">⚠️ ENGINE ON FIRE!</span>
                  ) : damagePercent > 40 ? (
                    <span className="text-amber-500 font-bold block">⚠️ HEAVY SCRAPING</span>
                  ) : damagePercent > 0 ? (
                    <span className="text-yellow-500 block">LIGHT DAMAGE</span>
                  ) : (
                    <span className="text-emerald-400 block font-semibold">✓ CHASSIS OK</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Exploded / Respawning Overlay */}
        {isExploded && (
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center z-40 select-none pointer-events-none">
            <div className="bg-rose-950/40 border border-rose-500/30 p-8 rounded-3xl text-center space-y-4 max-w-sm shadow-[0_0_50px_rgba(239,68,68,0.25)] animate-pulse">
              <div className="text-5xl animate-bounce">💥</div>
              <h2 className="text-lg font-black text-rose-400 tracking-wider uppercase font-sans">
                {t("vehicleExploded")}
              </h2>
              <p className="text-[10px] text-slate-300 tracking-widest font-mono uppercase">
                {t("respawning")}
              </p>
              <div className="flex items-center justify-center space-x-1.5">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping [animation-delay:0.2s]" />
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}

        {/* Countdown big digits banner */}
        {countdown !== null && (
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs flex flex-col items-center justify-center">
            <div className="text-xs text-cyan-400 font-mono tracking-[0.3em] uppercase mb-2 animate-pulse">Race starts in...</div>
            <div className="text-8xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-indigo-600 animate-ping">
              {countdown}
            </div>
          </div>
        )}

        {/* Race Finished overlay */}
        {isFinished && !isReplaying && (
          <div id="finish-race-overlay" className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-start p-6 text-center overflow-y-auto select-none z-50">
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-3 rounded-full mt-2 mb-2 shadow-[0_0_20px_rgba(234,179,8,0.4)]">
              <Trophy className="w-10 h-10 text-slate-950" />
            </div>
            
            <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-500 uppercase tracking-widest">
              {t("raceFinishedTitle")} RACE FINISHED
            </h1>
            <p className="text-slate-400 text-[11px] mb-4 max-w-md">{t("raceFinishedDesc")}</p>

            {/* Total time block */}
            {finishTime && (
              <div className="bg-slate-900 border border-slate-800/80 rounded-2xl px-6 py-2.5 mb-3 font-mono flex items-center justify-between w-full max-w-xl">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">{t("totalTime")} (TOTAL TIME)</span>
                <span className="text-2xl font-extrabold text-cyan-400">{(finishTime / 1000).toFixed(3)}s</span>
              </div>
            )}

            {/* Race Records Feature (比賽記錄功能) */}
            <div className="bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800/60 rounded-2xl p-4 mb-5 w-full max-w-xl">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800/50 pb-2">
                <span className="text-xs text-yellow-400 font-mono font-bold tracking-wider uppercase flex items-center gap-1.5">
                  <span>📊</span> {t("raceRecordsTitle")}
                </span>
                <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">PERSONAL DATABASE</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Last Race Completion Time Column */}
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-850/40 font-mono text-left">
                  <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1 truncate">
                    <span>⏱️</span> {t("lastRaceCompletionTime")}
                  </div>
                  <div className="text-lg font-black text-rose-400">
                    {lastSavedFinishTime ? `${(lastSavedFinishTime / 1000).toFixed(3)}s` : <span className="text-slate-600 text-xs">{t("noRecordYet")}</span>}
                  </div>
                </div>

                {/* All-time Best Lap Time Column */}
                <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-850/40 font-mono text-left">
                  <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1 truncate">
                    <span>⚡</span> {t("currentBestLapTime")}
                  </div>
                  <div className="text-lg font-black text-emerald-400">
                    {allTimeBestLap ? `${(allTimeBestLap / 1000).toFixed(3)}s` : <span className="text-slate-600 text-xs">{t("noRecordYet")}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* 賽事性能終局總結統計 (Race Telemetry & Performance Summary) */}
            <div className="w-full max-w-xl bg-gradient-to-r from-slate-900/90 to-slate-950/90 border border-slate-800/85 p-4 rounded-2xl mb-4 text-left shadow-2xl font-sans">
              <div className="text-[10px] text-cyan-400 font-mono tracking-wider uppercase mb-3 font-bold border-b border-slate-800 pb-2 flex justify-between">
                <span>📊 賽事終局數據總結 (RACE SUMMARY STATISTICS)</span>
                <span className="text-slate-500">TELEMETRY ANALYTICS</span>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* 最高車速 */}
                <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850/40 text-center flex flex-col justify-between">
                  <div className="text-[9px] text-slate-400 mb-1 font-bold">🚀 最高車速</div>
                  <div className="text-sm font-black text-cyan-400 font-mono">
                    {Math.round(speedTestRepo.maxSpeed || 0)} km/h
                  </div>
                </div>

                {/* 平均單圈 */}
                <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850/40 text-center flex flex-col justify-between">
                  <div className="text-[9px] text-slate-400 mb-1 font-bold">⏱️ 平均單圈</div>
                  <div className="text-sm font-black text-pink-400 font-mono">
                    {completedLapTimes.length > 0 
                      ? `${(completedLapTimes.reduce((a, b) => a + b, 0) / completedLapTimes.length / 1000).toFixed(3)}s`
                      : "N/A"
                    }
                  </div>
                </div>

                {/* 氮氣使用次數 */}
                <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850/40 text-center flex flex-col justify-between">
                  <div className="text-[9px] text-slate-400 mb-1 font-bold">⚡ 氮氣推進</div>
                  <div className="text-sm font-black text-yellow-400 font-mono">
                    {nitroUsedCountRef.current} 次
                  </div>
                </div>

                {/* 甩尾與碰撞 */}
                <div className="bg-slate-950/50 p-2.5 rounded-xl border border-slate-850/40 text-center flex flex-col justify-between">
                  <div className="text-[9px] text-slate-400 mb-1 font-bold">🌪️ 甩尾 / 💥 碰撞</div>
                  <div className="text-xs font-black text-emerald-400 font-mono">
                    {driftDurationRef.current.toFixed(1)}s / {collisionCountRef.current}次
                  </div>
                </div>
              </div>

              {/* 駕駛風格評語 (Driving Style Evaluation) */}
              <div className="mt-3 bg-slate-950/40 p-2 rounded-xl border border-slate-900 text-[10px] text-slate-450 flex items-center justify-between font-mono">
                <span className="font-bold text-slate-300">🏅 駕駛風格判定 (DRIVE STYLE):</span>
                <span className="font-black text-white uppercase tracking-wider">
                  {collisionCountRef.current === 0 && completedLapTimes.length > 0
                    ? "✨ 完美無瑕的賽車手 (Flawless Racer)"
                    : collisionCountRef.current < 3
                      ? "🏎️ 專業敏捷駕駛 (Pro Driver)"
                      : collisionCountRef.current < 7
                        ? "🔧 街頭飆車好手 (Street Racer)"
                        : "💥 破壞王 (Wall Scraper)"
                  }
                </span>
              </div>
            </div>

            {/* Interactive 3D Podium Ceremony Stage Overlay */}
            <PodiumCeremony leaderboard={leaderboard} onClose={onBackToLobby} />

            {/* Grid Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-xl mb-6 text-left">
              
              {/* Left Box: Personal Lap Breakdown */}
              <div className="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl flex flex-col">
                <div className="text-[10px] text-pink-400 font-mono tracking-wider uppercase mb-3 font-bold border-b border-slate-800 pb-2 flex justify-between">
                  <span>⏱️ {t("personalLapTimes")}</span>
                  <span className="text-slate-500">LAP CHRONO</span>
                </div>
                <div className="space-y-2 flex-grow">
                  {completedLapTimes.map((time, idx) => {
                    const isBest = time === bestLapTime;
                    return (
                      <div 
                        key={idx} 
                        className={`p-2.5 rounded-xl flex items-center justify-between font-mono text-xs border ${
                          isBest 
                            ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-100' 
                            : 'bg-slate-950/40 border-slate-900 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-slate-400">LAP {idx + 1}</span>
                          {isBest && (
                            <span className="bg-yellow-500/20 text-yellow-400 text-[8px] font-black uppercase px-1.5 py-0.5 rounded">
                              {t("bestLapLabel")}
                            </span>
                          )}
                        </div>
                        <span className="font-extrabold">{(time / 1000).toFixed(3)}s</span>
                      </div>
                    );
                  })}
                  {completedLapTimes.length === 0 && (
                    <div className="text-center text-slate-500 text-xs py-8">{t("noLapRecords")}</div>
                  )}
                </div>
              </div>

              {/* Right Box: Best Lap Times Leaderboard of all players */}
              <div className="bg-slate-900/60 p-4 border border-slate-800 rounded-2xl flex flex-col">
                <div className="text-[10px] text-yellow-400 font-mono tracking-wider uppercase mb-3 font-bold border-b border-slate-800 pb-2 flex justify-between">
                  <span>🏆 {t("trackBestLaps")}</span>
                  <span className="text-slate-500">LOBBY BESTS</span>
                </div>
                <div className="space-y-1.5 overflow-y-auto max-h-[160px] flex-grow">
                  {[...leaderboard]
                    .sort((a, b) => {
                      // Sort by those who have bestTime, ascending (faster first)
                      const tA = a.finished ? a.bestTime : (a.bestTime || 999999);
                      const tB = b.finished ? b.bestTime : (b.bestTime || 999999);
                      return tA - tB;
                    })
                    .map((p, index) => {
                      const isMe = p.name.includes(t("me")) || p.name.includes("Me") || p.name.includes("我") || p.name.includes("已抵達") || p.name.includes("完賽") || p.name.includes("完走");
                      const finishTimeDisplay = p.bestTime && p.bestTime < 999999
                        ? `${(p.bestTime / 1000).toFixed(3)}s`
                        : t("racingStatus");
                      
                      const placingColors = ["text-yellow-400 font-black", "text-slate-300 font-black", "text-amber-600 font-black"];
                      const placingClass = placingColors[index] || "text-slate-400";

                      return (
                        <div 
                          key={index} 
                          className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono border ${
                            isMe 
                              ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-200' 
                              : 'bg-slate-950/30 border-slate-900/80 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span className={placingClass}>#{index + 1}</span>
                            <span className="truncate max-w-[100px] font-bold">{p.name}</span>
                          </div>
                          <span className={`${index === 0 ? 'text-yellow-400 font-bold' : ''}`}>{finishTimeDisplay}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

            </div>

            {/* Highlights Recording & 3D trajectory Panel */}
            <div className="w-full max-w-xl bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-6 text-left flex flex-col space-y-3.5 shadow-xl font-sans">
              <div className="text-[10px] text-cyan-400 font-mono tracking-wider uppercase font-bold border-b border-slate-800 pb-2 flex justify-between">
                <span>🤖 {t("smartReplaySystem")}</span>
                <span className="text-slate-500">AI VIDEO & 3D TRAJECTORY</span>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                {/* 3D Trajectory Switch */}
                <div className="flex flex-col space-y-1">
                  <span className="text-xs text-slate-200 font-bold">🧬 {t("show3dTrajectory")}</span>
                  <span className="text-[10px] text-slate-400">{t("show3dTrajectoryDesc")}</span>
                </div>
                <button
                  onClick={() => {
                    audioSystem.playClick("low");
                    setShowTrajectoryLine(!showTrajectoryLine);
                  }}
                  className={`px-3 py-1.5 text-[10px] font-mono font-black uppercase rounded-lg border transition duration-250 cursor-pointer ${
                    showTrajectoryLine
                      ? "bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                      : "bg-slate-950 border-slate-800 text-slate-500"
                  }`}
                >
                  {showTrajectoryLine ? t("enabledLabel") : t("disabledLabel")}
                </button>
              </div>

              {highlightVideoUrl ? (
                <div className="border-t border-slate-800/60 pt-3 flex flex-col space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col space-y-1">
                      <span className="text-xs text-slate-200 font-bold">🎬 {t("matchHighlightVideo")}</span>
                      <span className="text-[10px] text-slate-400">{t("matchHighlightVideoDesc")}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          audioSystem.playClick("high");
                          setIsWatchingHighlight(true);
                        }}
                        className="px-3 py-1.5 bg-cyan-400 text-slate-950 text-[10px] font-extrabold uppercase rounded-lg hover:bg-cyan-300 transition cursor-pointer flex items-center shadow-md shadow-cyan-400/10"
                      >
                        {t("playHighlight")}
                      </button>
                      <button
                        onClick={handleDownloadHighlight}
                        disabled={isDownloadingHighlight}
                        className={`px-3 py-1.5 border text-slate-300 text-[10px] font-extrabold uppercase rounded-lg transition cursor-pointer flex items-center ${
                          isDownloadingHighlight 
                            ? 'bg-slate-900 border-slate-800 text-slate-500 animate-pulse' 
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {isDownloadingHighlight ? "⏳ Downloading..." : t("downloadVideo")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-800/60 pt-3 text-[10px] text-slate-500 text-center font-mono py-1">
                  ⏳ {t("encodingVideo")}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xl justify-center items-center">
              {raceReplayState && raceReplayState.playerPositions.length > 0 && (
                <button
                  onClick={() => {
                    audioSystem.playClick("high");
                    replayIndexRef.current = 0;
                    setIsReplaying(true);
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-extrabold rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 text-xs uppercase shadow-lg shadow-emerald-500/20 active:scale-95 border border-emerald-400/20"
                >
                  <span>🎥 {t("playLast30sReplay")} (PLAY REPLAY)</span>
                </button>
              )}

              <button
                onClick={() => {
                  audioSystem.playClick("high");
                  onBackToLobby();
                }}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-extrabold rounded-xl transition cursor-pointer flex items-center justify-center space-x-2 text-xs uppercase shadow-lg shadow-cyan-500/20 active:scale-95 animate-pulse"
              >
                <span>{t("returnToLobby")} (RETURN TO LOBBY)</span>
              </button>
            </div>
          </div>
        )}

        {/* Floating Replay Progress Control Overlay HUD */}
        {isReplaying && showSpeedometer && (
          <div className="absolute inset-x-0 bottom-6 z-40 flex flex-col items-center px-4">
            <div className="bg-slate-950/95 border border-cyan-500/40 rounded-3xl py-4 px-6 shadow-[0_0_25px_rgba(6,182,212,0.15)] backdrop-blur-md w-full max-w-lg flex flex-col space-y-3 pointer-events-auto">
              <div className="flex items-center justify-between select-none">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping" />
                  <span className="text-xs font-black uppercase text-cyan-400 tracking-wider font-mono">
                    📽️ {t("replayingClassicMoments")} (RACE REPLAY)
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 bg-slate-900/90 border border-slate-800/80 px-2 py-0.5 rounded-full ml-1.5 flex items-center gap-1">
                    <span className="text-cyan-400 font-bold">H</span> 隱藏視窗
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {Math.min(30, Math.round((replayIndexRef.current / ((raceReplayState?.playerPositions.length) || 1)) * 30))}s / 30s
                </div>
              </div>

              <div className="relative w-full h-1.5 bg-slate-800 rounded-full overflow-hidden select-none">
                <div 
                  className="absolute h-full bg-cyan-400 rounded-full transition-all duration-75"
                  style={{ width: `${(replayIndexRef.current / ((raceReplayState?.playerPositions.length) || 1)) * 100}%` }}
                />
              </div>

              {/* 重播鏡頭視角切換 Replay Camera Switcher */}
              <div className="flex flex-col space-y-1.5 border-t border-slate-900/60 pt-2.5 select-none">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">
                  {t("replayCameraPerspectives")} / REPLAY CAMERA PERSPECTIVES
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      audioSystem.playClick("low");
                      setReplayCameraMode('rearFollow');
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-bold font-mono transition border cursor-pointer ${
                      replayCameraMode === 'rearFollow'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    🚀 {t("rearFollow")} (REAR FOLLOW)
                  </button>
                  <button
                    onClick={() => {
                      audioSystem.playClick("low");
                      setReplayCameraMode('sideFixed');
                    }}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-[10px] font-bold font-mono transition border cursor-pointer ${
                      replayCameraMode === 'sideFixed'
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-300'
                    }`}
                  >
                    📐 {t("sideFixed")} (SIDE FIXED)
                  </button>
                </div>
              </div>

              {/* 3D Replay Trajectory Switch */}
              <div className="flex items-center justify-between border-t border-slate-900/60 pt-2 select-none">
                <span className="text-[9px] text-slate-500 uppercase tracking-widest font-mono">
                  {t("trajectoryNeonLine")} / 3D REPLAY TRAJECTORY
                </span>
                <button
                  onClick={() => {
                    audioSystem.playClick("low");
                    setShowTrajectoryLine(!showTrajectoryLine);
                  }}
                  className={`px-2 py-0.5 text-[9px] font-mono font-black uppercase rounded transition cursor-pointer ${
                    showTrajectoryLine
                      ? "bg-cyan-500/10 text-cyan-400 border border-cyan-400/40"
                      : "bg-slate-900 text-slate-500 border border-slate-800"
                  }`}
                >
                  {showTrajectoryLine ? t("showLabel") : t("hideLabel")}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-[10px] text-slate-400 font-bold font-mono select-none">
                  {t("carSpeedReplay")}: <span className="text-cyan-400 font-extrabold">{currentSpeed} KM/H</span>
                </div>
                <button
                  onClick={() => {
                    audioSystem.playClick("high");
                    setIsReplaying(false);
                  }}
                  className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 text-slate-950 font-black rounded-xl text-[10px] tracking-widest transition uppercase cursor-pointer"
                >
                  {t("stopReplay")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Watch Highlight Video Modal Overlay */}
        {isWatchingHighlight && highlightVideoUrl && (
          <div className="absolute inset-0 bg-slate-950/98 backdrop-blur-lg flex flex-col items-center justify-center p-4 z-50 select-none">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 w-full max-w-2xl flex flex-col space-y-4 shadow-2xl relative font-sans">
              <div className="flex items-center justify-between border-b border-slate-850 pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping" />
                  <span className="text-xs font-black uppercase text-rose-400 tracking-wider font-mono">
                    🎬 {t("raceHighlightPlayer")} / RACE HIGHLIGHT PLAYER
                  </span>
                </div>
                <button
                  onClick={() => {
                    audioSystem.playClick("low");
                    setIsWatchingHighlight(false);
                  }}
                  className="text-slate-400 hover:text-white rounded-lg p-1 bg-slate-950 border border-slate-800 hover:bg-slate-900 text-xs font-bold px-2 py-1 cursor-pointer"
                >
                  {t("closeLabel")} OFF
                </button>
              </div>

              {/* Video elements player */}
              <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
                <video
                  src={highlightVideoUrl}
                  controls
                  autoPlay
                  loop
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 border-t border-slate-800 pb-3 mt-4 pt-3">
                <span>{t("webApiMediaCapable")}</span>
                <button
                  onClick={handleDownloadHighlight}
                  disabled={isDownloadingHighlight}
                  className={`text-cyan-400 font-bold hover:underline bg-transparent border-none cursor-pointer ${
                    isDownloadingHighlight ? 'opacity-50 cursor-not-allowed animate-pulse' : ''
                  }`}
                >
                  {isDownloadingHighlight ? "⏳ Preparing Download... / 正在準備下載中..." : `${t("downloadThisVideo")} (.webm)`}
                </button>
              </div>
            </div>
          </div>
        )}



        {/* Cockpit Perspective Accessories HUD Overlay */}
        {cameraMode === 'cockpit' && (
          <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between overflow-hidden select-none">
            {/* Windshield frame & pillars for immersive cabin environment */}
            <div className="absolute inset-0 flex justify-between pointer-events-none">
              {/* Left A-Pillar */}
              <div 
                className="w-10 sm:w-16 md:w-24 h-full bg-gradient-to-r from-slate-950 via-slate-900 to-transparent opacity-85 relative"
                style={{
                  clipPath: 'polygon(0% 0%, 100% 0%, 25% 100%, 0% 100%)',
                  boxShadow: 'inset -5px 0 15px rgba(0,0,0,0.8)'
                }}
              >
                <div className="absolute inset-y-0 right-1 w-[1px] bg-cyan-500/20" />
              </div>

              {/* Top Visor strip */}
              <div className="absolute top-0 inset-x-0 h-6 sm:h-10 bg-gradient-to-b from-slate-950 to-transparent opacity-90">
                <div className="h-2 bg-slate-950 flex items-center justify-center">
                  <span className="text-[7px] sm:text-[9px] font-mono tracking-[0.4em] text-cyan-500/50 uppercase font-black">
                    /// GIGA RACING SYSTEM ALPHA ///
                  </span>
                </div>
              </div>

              {/* Right A-Pillar */}
              <div 
                className="w-10 sm:w-16 md:w-24 h-full bg-gradient-to-l from-slate-950 via-slate-900 to-transparent opacity-85 relative"
                style={{
                  clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 75% 100%)',
                  boxShadow: 'inset 5px 0 15px rgba(0,0,0,0.8)'
                }}
              >
                <div className="absolute inset-y-0 left-1 w-[1px] bg-cyan-500/20" />
              </div>
            </div>

            {/* Top rearview mirror */}
            <div className="absolute top-8 left-1/2 transform -translate-x-1/2 flex flex-col items-center z-40">
              <div className="w-48 sm:w-64 h-10 sm:h-14 bg-slate-950/95 border-b-2 border-x border-slate-800 rounded-b-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.8)] relative flex flex-col items-center justify-center">
                <div className="absolute inset-0 bg-gradient-to-t from-sky-950/40 to-slate-900 opacity-60 pointer-events-none" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.3)_1px,transparent_1px)] bg-[size:100%_4px] pointer-events-none animate-pulse opacity-40" />
                
                <div className="flex flex-col items-center z-10">
                  <div className="text-[7px] sm:text-[9px] font-mono font-bold text-cyan-400 tracking-wider">
                    REARVIEW MONITOR
                  </div>
                  <div className="flex items-center space-x-1 mt-0.5 sm:mt-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[6px] sm:text-[8px] font-mono text-slate-400 uppercase tracking-widest">
                      CAM STATUS: ACTIVE
                    </span>
                  </div>
                </div>

                <div className="absolute bottom-0 inset-x-0 h-4 overflow-hidden opacity-30">
                  <div className="w-full h-full border-t border-cyan-500/50 flex justify-around">
                    <div className="w-0.5 h-full bg-cyan-500/30 transform rotate-12" />
                    <div className="w-0.5 h-full bg-cyan-500/30 transform -rotate-12" />
                  </div>
                </div>
              </div>
              <div className="w-3 h-2 bg-slate-900 border-x border-slate-800" />
            </div>

            {/* Dashboard at the bottom housing steering wheel, speedometer and handbrake */}
            <div className="flex-1" />

            <div className="w-full bg-gradient-to-t from-slate-950 via-slate-950/98 to-slate-950/80 border-t border-slate-800/80 py-4 px-4 sm:px-8 flex flex-col items-center relative shadow-[0_-15px_40px_rgba(0,0,0,0.95)] z-40 backdrop-blur-sm">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 px-6 py-1 bg-slate-950 border-t border-x border-slate-800 rounded-t-xl flex items-center space-x-4 shadow-[0_-5px_10px_rgba(0,0,0,0.5)]">
                <div className="flex items-center space-x-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${damagePercent > 50 ? 'bg-rose-500 animate-ping' : 'bg-slate-700'}`} />
                  <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">DAMAGE HAZARD</span>
                </div>
                <div className="w-[1px] h-3 bg-slate-800" />
                <div className="flex items-center space-x-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${isNitroActive ? 'bg-sky-500 animate-pulse' : 'bg-slate-700'}`} />
                  <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">NITRO COMPONENT</span>
                </div>
              </div>

              <div className="w-full max-w-5xl grid grid-cols-3 items-center gap-2 sm:gap-6 mt-1">
                {/* Handbrake */}
                <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-900/40 border border-slate-800/50 min-h-[110px] relative">
                  <div className="text-[8px] sm:text-[10px] font-mono font-black text-slate-400 tracking-wider mb-2 uppercase flex items-center space-x-1">
                    <span>{t("handbrake") || "HANDBRAKE"}</span>
                    <span className="text-[7px] text-orange-500 font-mono">/ 手煞車</span>
                  </div>

                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <div className="absolute bottom-2 w-8 h-3 bg-slate-950 border border-slate-800 rounded-full" />
                    
                    <div 
                      className="absolute origin-bottom-center transition-transform duration-200 ease-out"
                      style={{
                        bottom: '12px',
                        transform: `rotate(${isHandbrakeActive ? -25 : 5}deg)`,
                        transformOrigin: 'bottom center',
                      }}
                    >
                      <div className="w-2.5 h-10 bg-gradient-to-r from-slate-400 to-slate-600 rounded-t-sm shadow-md" />
                      <div className="absolute top-0 left-0 right-0 h-6 bg-slate-950 border border-slate-700 rounded-t-md flex flex-col justify-around items-center py-0.5">
                        <div className="w-1.5 h-[1px] bg-slate-500" />
                        <div className="w-1.5 h-[1px] bg-slate-500" />
                        <div className="w-1.5 h-[1px] bg-slate-500" />
                      </div>
                      <div className="absolute -top-1.5 left-1 w-1 h-1.5 bg-rose-500 rounded-t-full" />
                    </div>
                  </div>

                  <div className={`mt-2 px-2.5 py-0.5 rounded-md border text-[7px] sm:text-[9px] font-mono font-bold tracking-widest uppercase transition-all duration-150 ${
                    isHandbrakeActive 
                      ? 'bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.4)] animate-pulse'
                      : 'bg-slate-950/60 border-slate-800 text-slate-500'
                  }`}>
                    {isHandbrakeActive ? '⚠️ DRIFT ENGAGED' : 'READY'}
                  </div>
                </div>

                {/* Steering Wheel */}
                <div className="flex flex-col items-center justify-center p-2 relative min-h-[140px]">
                  <div 
                    className="w-24 sm:w-28 md:w-32 h-24 sm:h-28 md:h-32 transition-transform duration-75 ease-out relative z-10"
                    style={{
                      transform: `rotate(${steeringInput * 110}deg)`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_8px_16px_rgba(0,0,0,0.85)]">
                      <path 
                        d="M 22 24 A 42 42 0 0 1 78 24 C 84 32, 90 45, 88 58 A 42 42 0 0 1 12 58 C 10 45, 16 32, 22 24 Z" 
                        fill="none" 
                        stroke="#1e293b" 
                        strokeWidth="11" 
                        strokeLinecap="round" 
                      />
                      <path 
                        d="M 12 50 C 10 41, 13 32, 18 26" 
                        fill="none" 
                        stroke="#06b6d4" 
                        strokeWidth="11" 
                        strokeLinecap="round" 
                        opacity="0.8"
                      />
                      <path 
                        d="M 88 50 C 90 41, 87 32, 82 26" 
                        fill="none" 
                        stroke="#06b6d4" 
                        strokeWidth="11" 
                        strokeLinecap="round" 
                        opacity="0.8"
                      />
                      
                      <path d="M 16 50 L 38 50" fill="none" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
                      <path d="M 84 50 L 62 50" fill="none" stroke="#475569" strokeWidth="8" strokeLinecap="round" />
                      <path d="M 50 50 L 50 78" fill="none" stroke="#475569" strokeWidth="8" strokeLinecap="round" />

                      <circle cx="50" cy="50" r="16" fill="#0f172a" stroke="#334155" strokeWidth="2.5" />
                      
                      <rect x="40" y="42" width="20" height="12" rx="2" fill="#020617" stroke="#06b6d4" strokeWidth="1" />
                      
                      <text x="50" y="47" textAnchor="middle" fontSize="4.5px" fill="#22d3ee" fontWeight="bold" className="font-mono">GEAR</text>
                      <text x="50" y="52" textAnchor="middle" fontSize="6px" fill="#ffffff" fontWeight="black" className="font-mono">{gear}</text>

                      <circle cx="34" cy="40" r="2.5" fill="#ef4444" />
                      <circle cx="66" cy="40" r="2.5" fill="#eab308" />
                      
                      <path d="M 10 32 L 6 42" fill="none" stroke="#64748b" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
                      <path d="M 90 32 L 94 42" fill="none" stroke="#64748b" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
                    </svg>
                  </div>

                  <div className="mt-1 flex flex-col items-center">
                    <span className="text-[7px] sm:text-[9px] font-mono font-bold text-slate-500 tracking-wider">
                      STEER INPUT: {Math.round(steeringInput * 100)}%
                    </span>
                    <div className="flex space-x-3 mt-0.5">
                      <span className={`text-[9px] font-mono ${steeringInput < -0.15 ? 'text-cyan-400 font-bold animate-pulse' : 'text-slate-700'}`}>◀ L</span>
                      <span className={`text-[9px] font-mono ${steeringInput > 0.15 ? 'text-cyan-400 font-bold animate-pulse' : 'text-slate-700'}`}>R ▶</span>
                    </div>
                  </div>
                </div>

                {/* Speedometer */}
                <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-slate-900/40 border border-slate-800/50 min-h-[110px] relative">
                  <div className="text-[8px] sm:text-[10px] font-mono font-black text-slate-400 tracking-wider mb-1 uppercase flex items-center space-x-1">
                    <span>{t("speedometer") || "SPEEDOMETER"}</span>
                    <span className="text-[7px] text-cyan-400 font-mono">/ 速度表</span>
                  </div>

                  <div className="flex flex-col items-center">
                    <div className="flex items-baseline space-x-1">
                      <span className="text-3xl sm:text-4xl font-mono font-black text-cyan-400 tracking-tighter drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                        {currentSpeed}
                      </span>
                      <span className="text-[9px] font-mono font-black text-slate-400 tracking-wider">
                        KM/H
                      </span>
                    </div>

                    <div className="w-24 sm:w-32 h-1.5 bg-slate-950 border border-slate-800 rounded-full mt-1.5 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-cyan-500 to-sky-400 rounded-full transition-all duration-75"
                        style={{ width: `${Math.min((currentSpeed / 240) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-2 text-center">
                    <div className="text-[7px] sm:text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest flex items-center justify-center space-x-1.5">
                      <span>RPM</span>
                      <span className="text-emerald-400 font-extrabold">{rpm}</span>
                    </div>
                    {rpm > 7500 ? (
                      <span className="text-[7px] sm:text-[9px] font-mono text-rose-500 font-bold tracking-widest uppercase animate-pulse">
                        ⚠️ REDLINE SHIFT
                      </span>
                    ) : (
                      <span className="text-[7px] sm:text-[9px] font-mono text-slate-600 tracking-wider">
                        AUTO TRANSMISSION
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cyberpunk Chat HUD Overlay */}
        <div
          id="game-chat-overlay"
          className={`absolute bottom-20 left-6 z-40 w-80 max-w-[calc(100%-3rem)] rounded-2xl border backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex flex-col transition-all duration-300 pointer-events-auto ${
            isChatActive
              ? 'bg-slate-950/90 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
              : 'bg-slate-950/40 border-slate-800/40 hover:bg-slate-950/60 hover:border-slate-700/60'
          }`}
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b border-slate-800/40 px-3 py-2 select-none">
            <div className="flex items-center space-x-2">
              <MessageSquare className={`w-3.5 h-3.5 ${isChatActive ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`} />
              <span className="text-[9px] font-mono tracking-wider text-slate-400 uppercase font-black">
                {t("lobbyVoiceChat") ? (t("lobbyVoiceChat").includes("聊") ? "即時聊聊 / CHAT CHANNEL" : "CHAT CHANNEL") : "CHAT CHANNEL"}
              </span>
            </div>
            {!isChatActive && (
              <span className="text-[8px] font-mono text-slate-500 animate-pulse">
                [Press ENTER]
              </span>
            )}
          </div>

          {/* Chat Messages Log */}
          <div
            id="chat-messages-log"
            className="p-3 space-y-1.5 max-h-[140px] overflow-y-auto font-mono text-[10.5px] select-text scrollbar-thin scrollbar-thumb-slate-800 flex-1"
          >
            {chatLog.length === 0 ? (
              <div className="text-slate-600 text-[9px] italic py-2 select-none">
                No active transmissions. / 尚無對話訊息。
              </div>
            ) : (
              chatLog.map((msg, idx) => {
                let nameColor = "#38bdf8"; // cyan-400
                if (msg.senderId === "system") {
                  nameColor = "#fbbf24"; // amber-400
                } else if (msg.senderName.includes(t("me")) || msg.senderName.includes("Me") || msg.senderName.includes("我") || msg.senderId === playerId) {
                  nameColor = "#ec4899"; // pink-500
                }
                
                return (
                  <div key={idx} className="leading-relaxed break-words">
                    <span className="font-bold" style={{ color: nameColor }}>
                      {msg.senderName}:
                    </span>{" "}
                    <span className="text-slate-100">{msg.message}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Chat Input Area */}
          {isChatActive && (
            <div className="p-2 border-t border-slate-800/40 bg-slate-950/45">
              <form onSubmit={onSendChat} className="flex items-center gap-1.5 bg-slate-900/70 border border-slate-800 focus-within:border-cyan-500 rounded-lg p-1 transition-all">
                <input
                  id="chat-input-field"
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type a message... / 輸入訊息..."
                  className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-[11px] text-white placeholder-slate-600 px-2 font-mono py-0.5"
                  maxLength={80}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold font-mono text-[9px] uppercase rounded-md transition cursor-pointer"
                >
                  SEND
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Left corner steering feedback indicator */}
        <div className="absolute bottom-6 left-6 bg-slate-950/70 p-3 rounded-full border border-slate-800/80 pointer-events-none hidden sm:flex items-center justify-center">
          <Gauge className="w-5 h-5 text-cyan-400 animate-pulse" />
        </div>

        {/* Mobile / Touch Screen On-screen Driving Controls */}
        <div className="absolute inset-x-0 bottom-16 sm:bottom-20 px-4 sm:px-8 pointer-events-none flex justify-between items-end z-20 select-none">
          {/* Left steering controls cluster */}
          <div className="flex items-center space-x-2 pointer-events-auto">
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                keysPressed.current["a"] = true;
                keysPressed.current["arrowleft"] = true;
                keysPressed.current["left"] = true;
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                keysPressed.current["a"] = false;
                keysPressed.current["arrowleft"] = false;
                keysPressed.current["left"] = false;
              }}
              onPointerLeave={(e) => {
                e.preventDefault();
                keysPressed.current["a"] = false;
                keysPressed.current["arrowleft"] = false;
                keysPressed.current["left"] = false;
              }}
              className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-950/80 hover:bg-slate-900 active:bg-cyan-500/30 border-2 border-slate-700/80 active:border-cyan-400 rounded-2xl flex items-center justify-center text-cyan-400 text-2xl font-black shadow-xl backdrop-blur-md transition-transform active:scale-95 cursor-pointer"
            >
              ◀
            </button>
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                keysPressed.current["d"] = true;
                keysPressed.current["arrowright"] = true;
                keysPressed.current["right"] = true;
              }}
              onPointerUp={(e) => {
                e.preventDefault();
                keysPressed.current["d"] = false;
                keysPressed.current["arrowright"] = false;
                keysPressed.current["right"] = false;
              }}
              onPointerLeave={(e) => {
                e.preventDefault();
                keysPressed.current["d"] = false;
                keysPressed.current["arrowright"] = false;
                keysPressed.current["right"] = false;
              }}
              className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-950/80 hover:bg-slate-900 active:bg-cyan-500/30 border-2 border-slate-700/80 active:border-cyan-400 rounded-2xl flex items-center justify-center text-cyan-400 text-2xl font-black shadow-xl backdrop-blur-md transition-transform active:scale-95 cursor-pointer"
            >
              ▶
            </button>
          </div>

          {/* Right action controls cluster */}
          <div className="flex items-center space-x-2 pointer-events-auto">
            {/* Nitro & Drift */}
            <div className="flex flex-col space-y-2">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  keysPressed.current["shift"] = true;
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  keysPressed.current["shift"] = false;
                }}
                onPointerLeave={(e) => {
                  e.preventDefault();
                  keysPressed.current["shift"] = false;
                }}
                className="w-11 h-11 sm:w-12 sm:h-12 bg-amber-950/80 hover:bg-amber-900 active:bg-amber-500/40 border-2 border-amber-600/80 active:border-amber-400 rounded-xl flex items-center justify-center text-amber-400 text-lg font-black shadow-xl backdrop-blur-md transition-transform active:scale-95 cursor-pointer"
                title="Nitro"
              >
                ⚡
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  keysPressed.current[" "] = true;
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  keysPressed.current[" "] = false;
                }}
                onPointerLeave={(e) => {
                  e.preventDefault();
                  keysPressed.current[" "] = false;
                }}
                className="w-11 h-11 sm:w-12 sm:h-12 bg-purple-950/80 hover:bg-purple-900 active:bg-purple-500/40 border-2 border-purple-600/80 active:border-purple-400 rounded-xl flex items-center justify-center text-purple-400 text-lg font-black shadow-xl backdrop-blur-md transition-transform active:scale-95 cursor-pointer"
                title="Drift"
              >
                💨
              </button>
            </div>

            {/* Gas & Brake */}
            <div className="flex flex-col space-y-2">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  keysPressed.current["w"] = true;
                  keysPressed.current["arrowup"] = true;
                  keysPressed.current["up"] = true;
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  keysPressed.current["w"] = false;
                  keysPressed.current["arrowup"] = false;
                  keysPressed.current["up"] = false;
                }}
                onPointerLeave={(e) => {
                  e.preventDefault();
                  keysPressed.current["w"] = false;
                  keysPressed.current["arrowup"] = false;
                  keysPressed.current["up"] = false;
                }}
                className="w-14 h-14 sm:w-16 sm:h-16 bg-emerald-950/80 hover:bg-emerald-900 active:bg-emerald-500/40 border-2 border-emerald-600/80 active:border-emerald-400 rounded-2xl flex items-center justify-center text-emerald-400 text-2xl font-black shadow-xl backdrop-blur-md transition-transform active:scale-95 cursor-pointer"
              >
                ▲
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  keysPressed.current["s"] = true;
                  keysPressed.current["arrowdown"] = true;
                  keysPressed.current["down"] = true;
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  keysPressed.current["s"] = false;
                  keysPressed.current["arrowdown"] = false;
                  keysPressed.current["down"] = false;
                }}
                onPointerLeave={(e) => {
                  e.preventDefault();
                  keysPressed.current["s"] = false;
                  keysPressed.current["arrowdown"] = false;
                  keysPressed.current["down"] = false;
                }}
                className="w-14 h-14 sm:w-16 sm:h-16 bg-rose-950/80 hover:bg-rose-900 active:bg-rose-500/40 border-2 border-rose-600/80 active:border-rose-400 rounded-2xl flex items-center justify-center text-rose-400 text-2xl font-black shadow-xl backdrop-blur-md transition-transform active:scale-95 cursor-pointer"
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard, Multi-Player List Right Panel */}
      <div 
        id="game-status-sidebar" 
        className={`w-full ${isLeaderboardCollapsed ? 'lg:w-16 h-[50px] lg:h-full pb-2' : 'lg:w-80 h-[350px] lg:h-full'} border-t lg:border-t-0 lg:border-l border-slate-900 bg-slate-950 flex flex-col transition-all duration-300 ease-in-out relative`}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsLeaderboardCollapsed(!isLeaderboardCollapsed)}
          className={`absolute ${isLeaderboardCollapsed ? 'top-1.5 left-1/2 -translate-x-1/2 p-1.5 w-8' : 'top-3 right-4 px-2 py-1'} z-20 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition flex items-center justify-center text-[10px] cursor-pointer`}
          title={isLeaderboardCollapsed ? t("expandLeaderboard") : t("collapseLeaderboard")}
        >
          {isLeaderboardCollapsed ? "❯" : `❮ ${t("collapseLeaderboard")}`}
        </button>

        {/* Real-time Rankings Leaderboard */}
        <div className={`flex-1 flex flex-col overflow-hidden ${isLeaderboardCollapsed ? 'p-1 pt-10' : 'p-4'}`}>
          <div className={`flex items-center ${isLeaderboardCollapsed ? 'justify-center mb-1' : 'space-x-2 mb-3 border-b border-slate-900 pb-3 h-7'}`}>
            <Flag className="w-4 h-4 text-pink-500 flex-shrink-0" />
            {!isLeaderboardCollapsed && (
              <h2 className="text-xs font-bold tracking-widest uppercase text-slate-400">{t("realtimeRankings")} RANKINGS</h2>
            )}
          </div>
          
          <div className="space-y-1.5 overflow-y-auto flex-1 select-none">
            {leaderboard.map((player, index) => {
              const placeColors = ["text-yellow-400", "text-slate-300", "text-amber-600", "text-slate-400"];
              const medalColor = placeColors[index] || "text-slate-500";
              const isMe = player.name.includes(t("me")) || player.name.includes("Me") || player.name.includes("我") || player.name.includes("已抵達") || player.name.includes("完賽") || player.name.includes("完走");

              if (isLeaderboardCollapsed) {
                return (
                  <div
                    key={index}
                    className={`flex flex-col items-center justify-center p-1 rounded border transition ${
                      isMe 
                        ? 'bg-cyan-500/25 border-cyan-500/50' 
                        : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-800'
                    }`}
                    title={`${player.name} - ${player.finished ? t("finishedLabel") : `${t("lap")}: ${player.lap}`}`}
                  >
                    <span className={`font-mono font-black text-[11px] ${medalColor}`}>
                      #{index + 1}
                    </span>
                    <span className="text-[8px] text-slate-400 font-mono scale-90 mt-0.5">
                      {player.finished ? "🏁" : (player.progress * 100).toFixed(0) + "%"}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={index}
                  className={`flex items-center justify-between p-2 rounded-lg border transition ${
                    isMe 
                      ? 'bg-cyan-500/10 border-cyan-500/40' 
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2 overflow-hidden truncate">
                    <span className={`font-mono font-bold w-5 text-center text-sm ${medalColor}`}>
                      #{index + 1}
                    </span>
                    <div className="flex items-center space-x-1.5 overflow-hidden">
                      {(player as any).team && (
                        <span className="inline-flex items-center space-x-0.5 px-1 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/20 text-[8px] text-cyan-400 font-mono font-bold select-none" title={`車隊: ${(player as any).team}`}>
                          <span>{getTeamFlag((player as any).team)}</span>
                          <span className="scale-95 leading-none">{(player as any).team.toUpperCase()}</span>
                        </span>
                      )}
                      <span className="text-xs font-bold truncate max-w-[120px]">{player.name}</span>
                    </div>
                  </div>

                  <div className="text-right font-mono text-[10px]">
                    {player.finished ? (
                      <span className="text-yellow-400 font-bold block">
                        {(player.bestTime / 1000).toFixed(2)}s
                      </span>
                    ) : (
                      <>
                        <span className="text-pink-500 block">Lap {player.lap}</span>
                        <span className="text-slate-400">{(player.progress * 100).toFixed(0)}%</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
