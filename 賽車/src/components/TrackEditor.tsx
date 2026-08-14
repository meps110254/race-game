import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Play, Save, ArrowLeft, Check, Compass, Trees, Mountain, Droplet, Layers, HelpCircle, Trophy, Sparkles, Award } from "lucide-react";
import { Track } from "../types";
import { unlockAchievement } from "../utils/achievementSystem";
import { audioSystem } from "../utils/audioSystem";
import { t } from "../utils/i18n";

// Standard UI icons mapping
interface TrackEditorProps {
  onBackToLobby: () => void;
  onInstantPlay: (customTrack: Track) => void;
  savedTracks: Record<string, Track>;
  onSaveTrack: (track: Track) => void;
}

export default function TrackEditor({
  onBackToLobby,
  onInstantPlay,
  savedTracks,
  onSaveTrack
}: TrackEditorProps) {
  // Config States
  const [trackName, setTrackName] = useState(t("defaultTrackName"));
  const [showCongrats, setShowCongrats] = useState(false);
  const [selectedPresetStyle, setSelectedPresetStyle] = useState<"neon" | "desert" | "space" | "forest">("neon");
  const [roadWidth, setRoadWidth] = useState(20);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedTrackIdToEdit, setSelectedTrackIdToEdit] = useState<string>("");

  // Style Settings
  const [colorTheme, setColorTheme] = useState("#00ffff");
  const [skyColor, setSkyColor] = useState("#0f172a");
  const [groundColor, setGroundColor] = useState("#1e293b");
  const [physicsFriction, setPhysicsFriction] = useState(0.985);

  // Editor mode: "path" or "obstacle"
  const [editMode, setEditMode] = useState<"path" | "obstacle">("path");
  const [selectedObstacleType, setSelectedObstacleType] = useState<"tree" | "rock" | "mountain" | "river">("tree");

  // Track points (x, z in game coordinates)
  const [points, setPoints] = useState<[number, number][]>([
    [0, 150],
    [150, 150],
    [150, -150],
    [-150, -150],
    [-150, 150]
  ]);

  // Placed obstacles state
  const [obstacles, setObstacles] = useState<{ x: number; z: number; type: "rock" | "tree" | "mountain" | "river"; radius: number }[]>([]);

  // Dragging states
  const [activeDragIndex, setActiveDragIndex] = useState<number | null>(null);
  const [activeDragObstacleIndex, setActiveDragObstacleIndex] = useState<number | null>(null);
  const [selectedObstacleIndex, setSelectedObstacleIndex] = useState<number | null>(null);
  const [showColliders, setShowColliders] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSize = 420;
  const scale = 0.6; // 1 game coordinate = 0.6 canvas pixels
  const centerOffset = canvasSize / 2;

  // Apply visual style presets
  useEffect(() => {
    if (selectedPresetStyle === "neon") {
      setColorTheme("#00ffff");
      setSkyColor("#0f172a");
      setGroundColor("#111827");
      setPhysicsFriction(0.985);
    } else if (selectedPresetStyle === "desert") {
      setColorTheme("#ffaa00");
      setSkyColor("#fef3c7");
      setGroundColor("#cc8b43");
      setPhysicsFriction(0.96);
    } else if (selectedPresetStyle === "space") {
      setColorTheme("#ff00ff");
      setSkyColor("#090514");
      setGroundColor("#1e1b4b");
      setPhysicsFriction(0.99);
    } else if (selectedPresetStyle === "forest") {
      setColorTheme("#10b981");
      setSkyColor("#ecfdf5");
      setGroundColor("#065f46");
      setPhysicsFriction(0.995);
    }
  }, [selectedPresetStyle]);

  // Convert game coordinates to canvas coordinates
  const gameToCanvas = (x: number, z: number) => {
    return {
      cx: centerOffset + x * scale,
      cy: centerOffset + z * scale // Visual z translates to canvas y axis
    };
  };

  // Convert canvas coordinates back to game coordinates
  const canvasToGame = (cx: number, cy: number) => {
    return {
      gx: Math.round((cx - centerOffset) / scale),
      gz: Math.round((cy - centerOffset) / scale)
    };
  };

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Helper to calculate polyline points at parameter t (0-1)
    const getPolylinePointAt = (t: number) => {
      if (points.length < 2) return { x: 0, z: 0 };
      const segs: { p1: [number, number]; p2: [number, number]; len: number }[] = [];
      let totalLen = 0;
      const numPoints = points.length;
      const numSegs = isOpen ? numPoints - 1 : numPoints;
      
      for (let i = 0; i < numSegs; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % numPoints];
        const dx = p2[0] - p1[0];
        const dz = p2[1] - p1[1];
        const len = Math.sqrt(dx * dx + dz * dz);
        segs.push({ p1, p2, len });
        totalLen += len;
      }
      
      if (totalLen === 0) return { x: points[0][0], z: points[0][1] };
      
      const targetDist = t * totalLen;
      let accumulated = 0;
      
      for (const seg of segs) {
        if (accumulated + seg.len >= targetDist) {
          const segT = (targetDist - accumulated) / seg.len;
          return {
            x: seg.p1[0] + (seg.p2[0] - seg.p1[0]) * segT,
            z: seg.p1[1] + (seg.p2[1] - seg.p1[1]) * segT
          };
        }
        accumulated += seg.len;
      }
      
      const lastSeg = segs[segs.length - 1];
      return { x: lastSeg.p2[0], z: lastSeg.p2[1] };
    };

    // Reset Canvas background
    ctx.fillStyle = groundColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Draw Grid Lines helper (Space reference)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 30;
    for (let x = 0; x < canvasSize; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasSize);
      ctx.stroke();
    }
    for (let y = 0; y < canvasSize; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasSize, y);
      ctx.stroke();
    }

    // Draw Center Point Crosshair
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerOffset, 0);
    ctx.lineTo(centerOffset, canvasSize);
    ctx.moveTo(0, centerOffset);
    ctx.lineTo(canvasSize, centerOffset);
    ctx.stroke();

    // 1. Draw actual track roadway (Line connection representation)
    if (points.length > 1) {
      ctx.beginPath();
      const firstPt = gameToCanvas(points[0][0], points[0][1]);
      ctx.moveTo(firstPt.cx, firstPt.cy);

      for (let i = 1; i < points.length; i++) {
        const pt = gameToCanvas(points[i][0], points[i][1]);
        ctx.lineTo(pt.cx, pt.cy);
      }

      if (!isOpen) {
        ctx.closePath();
      }

      // Draw thick semi-transparent road overlay representing roadWidth
      ctx.strokeStyle = "rgba(0,0,0,0.45)";
      ctx.lineWidth = roadWidth * scale * 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();

      // If showColliders is true, highlight the elevated sections and physical border fences
      if (showColliders) {
        // A. Highlight physical elevated regions (bridges and ramps)
        const drawRoadSectHighlight = (tStart: number, tEnd: number, color: string, labelText: string) => {
          const samples = 30;
          ctx.beginPath();
          const pStart = getPolylinePointAt(tStart);
          const canvasStart = gameToCanvas(pStart.x, pStart.z);
          ctx.moveTo(canvasStart.cx, canvasStart.cy);

          for (let j = 1; j <= samples; j++) {
            const tVal = tStart + (tEnd - tStart) * (j / samples);
            const pt = getPolylinePointAt(tVal);
            const cp = gameToCanvas(pt.x, pt.z);
            ctx.lineTo(cp.cx, cp.cy);
          }

          ctx.strokeStyle = color;
          ctx.lineWidth = roadWidth * scale * 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();

          // Text marker
          const pMid = getPolylinePointAt((tStart + tEnd) / 2);
          const canvasMid = gameToCanvas(pMid.x, pMid.z);

          // Dark plate behind text for legibility
          ctx.font = "bold 9px sans-serif";
          const measure = ctx.measureText(labelText);
          ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
          ctx.fillRect(canvasMid.cx - measure.width / 2 - 4, canvasMid.cy - 7, measure.width + 8, 14);

          ctx.fillStyle = "#38bdf8";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(labelText, canvasMid.cx, canvasMid.cy);
        };

        drawRoadSectHighlight(0.38, 0.45, "rgba(249, 115, 22, 0.35)", "🧗‍♀️ 爬坡起點 (100km/h+)");
        drawRoadSectHighlight(0.45, 0.55, "rgba(239, 68, 68, 0.35)", "🌉 高架橋面段");
        drawRoadSectHighlight(0.55, 0.62, "rgba(249, 115, 22, 0.35)", "下坡段");

        // B. Draw side fence physical collision boundaries (at fenceCollisionDistance = halfWidth - 0.6)
        const leftBoundary: { cx: number; cy: number }[] = [];
        const rightBoundary: { cx: number; cy: number }[] = [];
        const barrierDist = (roadWidth / 2) - 0.6;
        const numPoints = points.length;

        for (let i = 0; i < numPoints; i++) {
          let prevPt = points[(i - 1 + numPoints) % numPoints];
          let nextPt = points[(i + 1) % numPoints];

          if (isOpen) {
            if (i === 0) {
              prevPt = points[0];
              nextPt = points[1];
            } else if (i === numPoints - 1) {
              prevPt = points[numPoints - 2];
              nextPt = points[numPoints - 1];
            } else {
              prevPt = points[i - 1];
              nextPt = points[i + 1];
            }
          }

          const dx = nextPt[0] - prevPt[0];
          const dz = nextPt[1] - prevPt[1];
          const len = Math.sqrt(dx * dx + dz * dz) || 1;
          const tx = dx / len;
          const tz = dz / len;

          const nx = -tz;
          const nz = tx;

          const currentPt = points[i];
          const lx = currentPt[0] + nx * barrierDist;
          const lz = currentPt[1] + nz * barrierDist;
          const rx = currentPt[0] - nx * barrierDist;
          const rz = currentPt[1] - nz * barrierDist;

          leftBoundary.push(gameToCanvas(lx, lz));
          rightBoundary.push(gameToCanvas(rx, rz));
        }

        // Draw Left Fence collider line
        ctx.beginPath();
        ctx.moveTo(leftBoundary[0].cx, leftBoundary[0].cy);
        for (let i = 1; i < leftBoundary.length; i++) {
          ctx.lineTo(leftBoundary[i].cx, leftBoundary[i].cy);
        }
        if (!isOpen) ctx.closePath();
        ctx.strokeStyle = "#f43f5e";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        // Draw Right Fence collider line
        ctx.beginPath();
        ctx.moveTo(rightBoundary[0].cx, rightBoundary[0].cy);
        for (let i = 1; i < rightBoundary.length; i++) {
          ctx.lineTo(rightBoundary[i].cx, rightBoundary[i].cy);
        }
        if (!isOpen) ctx.closePath();
        ctx.strokeStyle = "#f43f5e";
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.setLineDash([]); // Reset
      }

      // Draw bright glowing track neon center line
      ctx.strokeStyle = colorTheme;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // 2. Draw Obstacles & Rivers
    obstacles.forEach((obs, idx) => {
      const { cx, cy } = gameToCanvas(obs.x, obs.z);
      const visualRadius = obs.radius * scale;

      ctx.beginPath();
      ctx.arc(cx, cy, visualRadius, 0, Math.PI * 2);

      // Colors matching standard obstacle theme
      if (obs.type === "river") {
        ctx.fillStyle = "rgba(2, 132, 199, 0.75)";
        ctx.strokeStyle = "#38bdf8";
      } else if (obs.type === "mountain") {
        ctx.fillStyle = "rgba(71, 85, 105, 0.85)";
        ctx.strokeStyle = "#94a3b8";
      } else if (obs.type === "rock") {
        ctx.fillStyle = "rgba(100, 116, 139, 0.9)";
        ctx.strokeStyle = "#64748b";
      } else { // tree
        ctx.fillStyle = "rgba(34, 197, 94, 0.85)";
        ctx.strokeStyle = "#16a34a";
      }

      ctx.lineWidth = selectedObstacleIndex === idx ? 3 : 1;
      ctx.fill();
      ctx.stroke();

      // Display short text tag
      ctx.fillStyle = "#ffffff";
      ctx.font = "8px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      let label = "🌲";
      if (obs.type === "river") label = "💧";
      if (obs.type === "mountain") label = "🏔️";
      if (obs.type === "rock") label = "🪨";
      ctx.fillText(label, cx, cy);

      // If selected obstacle, highlight with pulsating circle
      if (selectedObstacleIndex === idx) {
        ctx.beginPath();
        ctx.arc(cx, cy, visualRadius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw obstacle collision circle and radius label if showColliders is active
      if (showColliders) {
        ctx.beginPath();
        ctx.arc(cx, cy, visualRadius, 0, Math.PI * 2);
        ctx.strokeStyle = "#f43f5e"; // Rose neon outline
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label offset above
        ctx.fillStyle = "#f43f5e";
        ctx.font = "bold 7px monospace";
        ctx.fillText(`R:${obs.radius}m`, cx, cy - visualRadius - 5);
      }
    });

    // 3. Draw Track nodes / handle points (Only clickable inside Path editing mode)
    points.forEach((pt, idx) => {
      const { cx, cy } = gameToCanvas(pt[0], pt[1]);

      // Center start gate marker
      if (idx === 0) {
        ctx.fillStyle = "#ef4444"; // Red starting node
        ctx.beginPath();
        ctx.arc(cx, cy, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 8px sans-serif";
        ctx.fillText("🏁", cx, cy);
      } else {
        ctx.fillStyle = editMode === "path" ? colorTheme : "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = "#020617";
        ctx.font = "8px sans-serif";
        ctx.fillText(idx.toString(), cx, cy);
      }
    });

    // Draw HUD text representing limits
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("X/Z 範圍: [-350, 350]", 10, 20);
    ctx.fillText(`路徑點: ${points.length}  障礙: ${obstacles.length}`, 10, 35);
    ctx.fillText(`模式: ${editMode === "path" ? "路徑編輯 [Node]" : "放置物件 [Obstacles]"}`, 10, 50);

  }, [points, obstacles, editMode, groundColor, colorTheme, isOpen, roadWidth, selectedObstacleIndex, showColliders]);

  // Handle Loading saved track
  const handleLoadTrack = (id: string) => {
    const target = savedTracks[id];
    if (!target) return;
    setTrackName(target.name);
    setRoadWidth(target.width);
    setDifficulty(target.difficulty);
    setPoints(target.points);
    setIsOpen(!!target.isOpen);
    setObstacles(target.obstacles || []);
    setSelectedTrackIdToEdit(target.id);

    // Try to guess preset style or restore individual values
    setSkyColor(target.skyColor);
    setGroundColor(target.groundColor);
    setColorTheme(target.colorTheme);
    setPhysicsFriction(target.physicsFriction);
  };

  // Canvas Mouse Down
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { gx, gz } = canvasToGame(cx, cy);

    if (editMode === "path") {
      // Find if clicked near an existing node
      let foundIdx = -1;
      points.forEach((pt, idx) => {
        const { cx: ncx, cy: ncy } = gameToCanvas(pt[0], pt[1]);
        const distSq = (ncx - cx) ** 2 + (ncy - cy) ** 2;
        if (distSq < 15 * 15) { // Click radius threshold
          foundIdx = idx;
        }
      });

      if (foundIdx !== -1) {
        if (e.shiftKey && foundIdx !== 0) {
          // Shift Click to delete point
          const nextPts = [...points];
          nextPts.splice(foundIdx, 1);
          setPoints(nextPts);
        } else {
          // Drag Point
          setActiveDragIndex(foundIdx);
        }
      } else {
        // Did not click a point, create one at end of splines
        setPoints([...points, [gx, gz]]);
      }
    } else {
      // Obstacle mode
      // First check if clicked near existing obstacle to select or drag
      let clickedObstacleIdx = -1;
      obstacles.forEach((obs, idx) => {
        const { cx: ncx, cy: ncy } = gameToCanvas(obs.x, obs.z);
        const distSq = (ncx - cx) ** 2 + (ncy - cy) ** 2;
        const visualR = obs.radius * scale;
        if (distSq < Math.max(12 * 12, visualR * visualR)) {
          clickedObstacleIdx = idx;
        }
      });

      if (clickedObstacleIdx !== -1) {
        setSelectedObstacleIndex(clickedObstacleIdx);
        setActiveDragObstacleIndex(clickedObstacleIdx);
      } else {
        // Add new obstacle
        let radius = 1.5;
        if (selectedObstacleType === "rock") radius = 3.5;
        if (selectedObstacleType === "mountain") radius = 25.0;
        if (selectedObstacleType === "river") radius = 15.0;

        const newObs = {
          x: gx,
          z: gz,
          type: selectedObstacleType,
          radius
        };
        setObstacles([...obstacles, newObs]);
        setSelectedObstacleIndex(obstacles.length);
      }
    }
  };

  // Canvas Mouse Move
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const { gx, gz } = canvasToGame(cx, cy);

    // Limit layout bounds
    const claimG = (val: number) => Math.max(-350, Math.min(350, val));
    const finalGx = claimG(gx);
    const finalGz = claimG(gz);

    if (activeDragIndex !== null) {
      const nextPts = [...points];
      nextPts[activeDragIndex] = [finalGx, finalGz];
      setPoints(nextPts);
    } else if (activeDragObstacleIndex !== null) {
      const nextObs = [...obstacles];
      nextObs[activeDragObstacleIndex] = {
        ...nextObs[activeDragObstacleIndex],
        x: finalGx,
        z: finalGz
      };
      setObstacles(nextObs);
    }
  };

  // Canvas Mouse Up
  const handleCanvasMouseUp = () => {
    setActiveDragIndex(null);
    setActiveDragObstacleIndex(null);
  };

  const handleClearAll = () => {
    if (window.confirm("確定清除目前編輯的整個跑道嗎？")) {
      setPoints([[0, 150], [150, 150], [150, -150], [-150, -150]]);
      setObstacles([]);
      setTrackName("全新設計自訂賽道");
      setSelectedTrackIdToEdit("");
    }
  };

  const handleBuildTrackObject = (): Track => {
    const uniqId = selectedTrackIdToEdit || `custom-${Date.now()}`;
    return {
      id: uniqId,
      name: trackName.trim() || `自訂賽道 ${uniqId.split('-')[1]}`,
      description: `自建設計玩家賽道，總路徑點數 ${points.length}，含有 ${obstacles.length} 個障礙河流物。`,
      difficulty,
      colorTheme,
      skyColor,
      groundColor,
      points,
      width: roadWidth,
      physicsFriction,
      isOpen,
      obstacles
    };
  };

  const handleSave = () => {
    const finalTrack = handleBuildTrackObject();
    onSaveTrack(finalTrack);
    setSelectedTrackIdToEdit(finalTrack.id);
    
    // Play celebratory high click sound
    audioSystem.playClick("high");
    
    // Unlock the "Track Designer" achievement which triggers global toast decoration
    unlockAchievement("track_designer");
    
    // Open the custom congratulations overlay window
    setShowCongrats(true);
  };

  const handlePlayNow = () => {
    const finalTrack = handleBuildTrackObject();
    // Auto save prior to playing
    onSaveTrack(finalTrack);
    onInstantPlay(finalTrack);
  };

  return (
    <div className="flex flex-col xl:flex-row w-full max-w-6xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden p-6 gap-6 relative z-10 text-left my-4">
      
      {/* Absolute Header background flair */}
      <div className="absolute top-0 right-0 w-60 h-60 bg-cyan-500/5 filter blur-[60px] pointer-events-none" />

      {/* LEFT COLUMN: Controls Panel */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
              {t("trackBuilderTitle")}
            </h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono mt-0.5">
              CUSTOM DESIGN & SCENERY EDITOR LAB
            </p>
          </div>
          <button
            onClick={onBackToLobby}
            className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center space-x-1 transition cursor-pointer text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
            <span>{t("backToLobby")}</span>
          </button>
        </div>

        {/* Load saved tracks list */}
        {Object.keys(savedTracks).length > 0 && (
          <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800">
            <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono tracking-wider mb-1.5">
              {t("loadSavedTrack")}
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {Object.values(savedTracks).map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleLoadTrack(t.id)}
                  className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition flex items-center space-x-1 ${
                    selectedTrackIdToEdit === t.id
                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                      : "bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-300"
                  }`}
                >
                  <span className="truncate max-w-[120px]">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form Inputs */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950/30 p-4 border border-slate-850 rounded-xl">
          <div className="col-span-2">
            <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">
              {t("trackNameLabel")}
            </label>
            <input
              type="text"
              value={trackName}
              onChange={(e) => setTrackName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs font-bold rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-cyan-500"
              placeholder={t("trackNamePlaceholder")}
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">
              {t("trackStructure")}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className={`py-1.5 rounded-lg border text-[10px] font-black cursor-pointer transition ${
                  !isOpen
                    ? "bg-cyan-500/10 border-cyan-500 text-cyan-400"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300"
                }`}
              >
                {t("structureLoops")}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={`py-1.5 rounded-lg border text-[10px] font-black cursor-pointer transition ${
                  isOpen
                    ? "bg-cyan-500/10 border-cyan-500 text-cyan-400"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300"
                }`}
              >
                {t("structureStraight")}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">
              {t("difficultyLabel")}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {["easy", "medium", "hard"].map((diff) => (
                <button
                  key={diff}
                  type="button"
                  onClick={() => setDifficulty(diff as any)}
                  className={`py-1.5 rounded-lg border text-[10px] uppercase font-black cursor-pointer transition ${
                    difficulty === diff
                      ? "bg-pink-500/10 border-pink-500 text-pink-400"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300"
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">
              {t("roadWidthLabel")}: <span className="text-cyan-400">{roadWidth}m</span>
            </label>
            <input
              type="range"
              min="12"
              max="35"
              value={roadWidth}
              onChange={(e) => setRoadWidth(Number(e.target.value))}
              className="w-full accent-cyan-500 bg-slate-950 rounded-lg cursor-pointer h-2"
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1">
              {t("frictionLabel")}: <span className="text-cyan-400">{physicsFriction.toFixed(3)}</span>
            </label>
            <input
              type="range"
              min="0.94"
              max="0.998"
              step="0.001"
              value={physicsFriction}
              onChange={(e) => setPhysicsFriction(Number(e.target.value))}
              className="w-full accent-cyan-500 bg-slate-950 rounded-lg cursor-pointer h-2"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-[9px] font-bold text-slate-400 uppercase font-mono mb-1.5">
              {t("biomeThemeLabel")}
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { id: "neon", name: t("biomeNeon"), theme: "#00ffff" },
                { id: "desert", name: t("biomeDesert"), theme: "#ffaa00" },
                { id: "space", name: t("biomeSpace"), theme: "#ff00ff" },
                { id: "forest", name: t("biomeForest"), theme: "#10b981" }
              ].map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedPresetStyle(style.id as any)}
                  className={`py-2 rounded-lg border text-[10px] font-bold cursor-pointer transition flex flex-col items-center justify-center space-y-1 ${
                    selectedPresetStyle === style.id
                      ? "bg-slate-900 border-slate-400 text-slate-100 shadow-md"
                      : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-300"
                  }`}
                >
                  <span>{style.name}</span>
                  <div className="w-10 h-1 rounded" style={{ backgroundColor: style.theme }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Dynamic Color customizers details */}
        <div className="grid grid-cols-3 gap-2.5 bg-slate-950/20 p-3 border border-slate-850/60 rounded-xl text-center">
          <div>
            <div className="text-[8px] font-mono text-slate-500 uppercase">{t("scenerySubColor")}</div>
            <input 
              type="color" 
              value={colorTheme} 
              onChange={e => setColorTheme(e.target.value)}
              className="w-full h-7 rounded border border-slate-810 bg-transparent cursor-pointer py-0.5 mt-1"
            />
          </div>
          <div>
            <div className="text-[8px] font-mono text-slate-500 uppercase">{t("scenerySkyColor")}</div>
            <input 
              type="color" 
              value={skyColor} 
              onChange={e => setSkyColor(e.target.value)}
              className="w-full h-7 rounded border border-slate-810 bg-transparent cursor-pointer py-0.5 mt-1"
            />
          </div>
          <div>
            <div className="text-[8px] font-mono text-slate-500 uppercase">{t("sceneryGroundColor")}</div>
            <input 
              type="color" 
              value={groundColor} 
              onChange={e => setGroundColor(e.target.value)}
              className="w-full h-7 rounded border border-slate-810 bg-transparent cursor-pointer py-0.5 mt-1"
            />
          </div>
        </div>

        {/* Actions Save & Play */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="p-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-200 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-2 w-full shadow-lg"
          >
            <Save className="w-4 h-4 text-cyan-400" />
            <span>{t("saveTrackBtn")}</span>
          </button>

          <button
            type="button"
            onClick={handlePlayNow}
            className="p-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 hover:from-emerald-400 hover:to-teal-400 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-2 w-full shadow-xl"
          >
            <Play className="w-4 h-4 fill-slate-950" />
            <span>{t("playNowBtn")}</span>
          </button>

          <button
            type="button"
            onClick={handleClearAll}
            className="col-span-2 p-2.5 bg-slate-950/20 hover:bg-red-950/20 border border-slate-850 hover:border-red-500/20 text-slate-500 hover:text-red-400 rounded-xl text-[10px] font-bold uppercase transition cursor-pointer text-center"
          >
            {t("clearChassisBtn")}
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Visual Map Canvas Board */}
      <div className="flex-none flex flex-col items-center bg-slate-950 p-4 border border-slate-850 rounded-3xl w-full xl:w-[452px]">
        {/* Toggle Editor Modes Toolbar */}
        <div className="flex w-full bg-slate-900 p-1.5 rounded-2xl border border-slate-800 mb-3 gap-1">
          <button
            type="button"
            onClick={() => {
              setEditMode("path");
              setSelectedObstacleIndex(null);
            }}
            className={`flex-1 py-2 text-xs font-black uppercase rounded-xl transition cursor-pointer ${
              editMode === "path"
                ? "bg-cyan-500 text-slate-950 shadow-md font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t("editPathBtn")}
          </button>
          <button
            type="button"
            onClick={() => setEditMode("obstacle")}
            className={`flex-1 py-2 text-xs font-black uppercase rounded-xl transition cursor-pointer flex items-center justify-center space-x-1 ${
              editMode === "obstacle"
                ? "bg-amber-500 text-slate-950 shadow-md font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {t("placeObstacleBtn")}
          </button>
        </div>

        {/* Path editing guide or Obstacle Palette toolbar */}
        {editMode === "path" ? (
          <div className="text-[10px] text-slate-400 bg-slate-900/40 p-2.5 rounded-xl border border-slate-850 w-full mb-3 text-center leading-normal">
            💡 <strong className="text-slate-200">{t("nodesTutorialTitle")}</strong>：{t("nodesTutorialDesc1")}
            {t("nodesTutorialDesc2")}
          </div>
        ) : (
          <div className="flex flex-col w-full bg-slate-900/40 p-2 border border-slate-850 rounded-xl mb-3">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-1.5 font-mono text-center">
              {t("selectColliderType")}
            </span>
            <div className="grid grid-cols-4 gap-1">
              {[
                { id: "tree", name: t("pineTree"), icon: Trees, col: "#22c55e", desc: "r=1.5m" },
                { id: "rock", name: t("rock"), icon: Layers, col: "#64748b", desc: "r=3.5m" },
                { id: "mountain", name: t("mountain"), icon: Mountain, col: "#475569", desc: "r=25m" },
                { id: "river", name: t("river"), icon: Droplet, col: "#0284c7", desc: "r=15m" }
              ].map((item) => {
                const SelectedIcon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedObstacleType(item.id as any);
                      setSelectedObstacleIndex(null);
                    }}
                    className={`p-1.5 rounded-lg border text-center transition cursor-pointer flex flex-col items-center justify-center ${
                      selectedObstacleType === item.id
                        ? "bg-slate-950 border-amber-500 text-amber-400"
                        : "bg-slate-950 border-transparent text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <SelectedIcon className="w-4 h-4" style={{ color: item.col }} />
                    <span className="text-[10px] font-bold mt-1">{item.name}</span>
                    <span className="text-[8px] text-slate-500 font-mono scale-90">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Toggle showColliders switch */}
        <div className="flex items-center justify-between w-full bg-slate-900 border border-slate-800 p-3 rounded-2xl mb-3">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-[11px] font-bold text-slate-300">📦 {t("showPhysicsBounds")}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setShowColliders(!showColliders);
              audioSystem.playClick("medium");
            }}
            className={`px-3 py-1 text-xs font-black uppercase rounded-lg border transition cursor-pointer ${
              showColliders
                ? "bg-rose-500/10 border-rose-500 text-rose-400"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300"
            }`}
          >
            {showColliders ? "ON" : "OFF"}
          </button>
        </div>

        {/* DRAWING BOARD CANVAS */}
        <div className="relative border border-slate-800 rounded-2xl overflow-hidden shadow-inner bg-slate-950">
          <canvas
            ref={canvasRef}
            width={canvasSize}
            height={canvasSize}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            className="block cursor-crosshair"
          />
        </div>

        {/* Selected Obstacle operations */}
        {editMode === "obstacle" && selectedObstacleIndex !== null && obstacles[selectedObstacleIndex] && (
          <div className="flex items-center justify-between w-full bg-slate-900 border border-slate-850 rounded-xl p-2.5 mt-3">
            <div className="flex items-center space-x-2">
              <span className="text-yellow-400 text-xs font-bold">
                {t("selectedObstacle")} #{selectedObstacleIndex} (
                {obstacles[selectedObstacleIndex].type === "tree" && t("pineTree")}
                {obstacles[selectedObstacleIndex].type === "rock" && t("rock")}
                {obstacles[selectedObstacleIndex].type === "mountain" && t("mountain")}
                {obstacles[selectedObstacleIndex].type === "river" && t("river")}
                )
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                ({obstacles[selectedObstacleIndex].x}, {obstacles[selectedObstacleIndex].z})
              </span>
            </div>
            
            <button
              type="button"
              onClick={() => {
                const nextObs = [...obstacles];
                nextObs.splice(selectedObstacleIndex, 1);
                setObstacles(nextObs);
                setSelectedObstacleIndex(null);
              }}
              className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-[10px] font-bold text-white flex items-center space-x-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>{t("deleteFromMap")}</span>
            </button>
          </div>
        )}
      </div>

      {/* 恭喜解鎖與存檔成功視窗 / CONGRATS UNIQUE MODAL OVERLAY */}
      {showCongrats && (
        <div id="congrats-modal-overlay" className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[60] flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-violet-500/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden select-none">
            
            {/* Ambient glows behind */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-violet-600/20 filter blur-[40px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-fuchsia-600/20 filter blur-[40px] rounded-full pointer-events-none" />

            {/* Achievement Ribbon Head */}
            <div className="absolute top-3 right-3 bg-violet-500/20 border border-violet-500/30 px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-widest text-violet-400 font-mono font-black animate-pulse">
              ACHIEVEMENT UNLOCKED
            </div>

            {/* Decorative Icon */}
            <div className="flex flex-col items-center text-center mt-3">
              <div className="relative mb-4 flex items-center justify-center">
                <div className="absolute inset-0 bg-violet-500/25 filter blur-[15px] rounded-full animate-ping" />
                <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 border border-violet-400 p-4 rounded-full relative z-10 w-16 h-16 flex items-center justify-center shadow-lg shadow-violet-500/30">
                  <Award className="w-8 h-8 text-white animate-bounce" />
                </div>
              </div>

              {/* Title & Celebration Header */}
              <span className="text-[10px] text-fuchsia-400 font-mono tracking-widest uppercase font-black">
                {t("congratsDesigner")}
              </span>
              <h3 className="text-xl font-black text-white mt-1 mb-2 tracking-wide">
                {t("congratsTitle")}
              </h3>
              
              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/80 w-full text-left my-3 flex items-start space-x-3">
                <div className="bg-violet-500/10 p-2 rounded-xl mt-0.5 border border-violet-500/20">
                  <Layers className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <span className="text-xs font-bold text-violet-300 block">{t("congratsBadgeName")}</span>
                  <span className="text-[11px] text-slate-300 block mt-1 leading-relaxed">
                    {t("congratsBadgeDesc")}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-emerald-400 block mt-2">
                    {t("congratsReward")}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 mt-2 mb-4 leading-relaxed px-1">
                {t("congratsSuccessAlert")}
              </p>

              {/* Action Buttons to play or continue */}
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  type="button"
                  onClick={() => {
                    audioSystem.playClick("low");
                    setShowCongrats(false);
                  }}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold rounded-xl text-center text-xs transition cursor-pointer"
                >
                  {t("remainInEditor")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audioSystem.playClick("medium");
                    setShowCongrats(false);
                    handlePlayNow();
                  }}
                  className="py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 text-white font-black rounded-xl text-center text-xs transition shadow-lg shadow-violet-500/20 cursor-pointer"
                >
                  {t("testImmediately")}
                </button>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
