import { Track } from "./types";

export const TRACKS: Record<string, Track> = {
  "neon-grid": {
    id: "neon-grid",
    name: "電光網格 (Neon Grid)",
    description: "極速霓虹極限跑道，適合練習賽車與最高速度改裝。",
    difficulty: "easy",
    colorTheme: "#00ffff",
    skyColor: "#99f3ff",
    groundColor: "#173652",
    points: [
      [0, 0],
      [120, 0],
      [240, 40],
      [280, 140],
      [200, 240],
      [0, 240],
      [-100, 180],
      [-80, 60]
    ],
    width: 20,
    physicsFriction: 0.985
  },
  "desert-rally": {
    id: "desert-rally",
    name: "荒漠拉力 (Desert Rally)",
    description: "黃沙飛揚的拉力賽道，起伏彎道大。選用『越野胎』能大幅提升抓地力！",
    difficulty: "medium",
    colorTheme: "#ffaa00",
    skyColor: "#ffeaab",
    groundColor: "#cc8b43",
    points: [
      [0, 0],
      [80, 30],
      [130, -60],
      [220, -30],
      [240, 80],
      [150, 160],
      [50, 100],
      [0, 180],
      [-120, 110],
      [-60, 20]
    ],
    width: 18,
    physicsFriction: 0.96 // lower drag, sand is slippery!
  },
  "space-highway": {
    id: "space-highway",
    name: "太空高架 (Space Highway)",
    description: "飄浮於星際之中的無邊際賽道！充滿複雜的S彎道，考驗控車技巧，小心別掉下去！",
    difficulty: "hard",
    colorTheme: "#ff00ff",
    skyColor: "#e6eefc",
    groundColor: "#293754",
    points: [
      [0, 0],
      [60, 80],
      [180, 50],
      [130, -100],
      [260, -150],
      [300, -30],
      [200, 120],
      [90, 220],
      [-140, 160],
      [-90, -50]
    ],
    width: 16, // Narrower road
    physicsFriction: 0.99
  },
  "speed-test": {
    id: "speed-test",
    name: "直線性能測試 (3000m Straight)",
    description: "長達 3000 公尺的直線加速跑道，專門用來測試賽車的極速、加速度、起步扭力與防漂移穩定度！",
    difficulty: "easy",
    colorTheme: "#3b82f6",
    skyColor: "#020617",
    groundColor: "#022c22", // A beautiful dark forest field
    points: [
      [0, 500],
      [0, 0],
      [0, -500],
      [0, -1000],
      [0, -1500],
      [0, -2000],
      [0, -2500]
    ],
    width: 25,
    physicsFriction: 0.994, // Ultra-high traction racing strip rubber
    isOpen: true
  }
};

// Simple linear interpolation between track points
export function getTrackSplinePoint(track: Track, t: number): { x: number; z: number } {
  const normT = track.isOpen ? Math.max(0, Math.min(0.9999, t)) : (((t % 1) + 1) % 1);

  const getBasePoint = (timeVal: number) => {
    const numPoints = track.points.length;
    const numSegments = track.isOpen ? numPoints - 1 : numPoints;
    const exactIndex = timeVal * numSegments;
    const index1 = Math.floor(exactIndex) % numPoints;
    const index2 = track.isOpen ? Math.min(numPoints - 1, index1 + 1) : ((index1 + 1) % numPoints);
    const localT = exactIndex - Math.floor(exactIndex);

    const p1 = track.points[index1];
    const p2 = track.points[index2];

    return {
      x: p1[0] + (p2[0] - p1[0]) * localT,
      z: p1[1] + (p2[1] - p1[1]) * localT
    };
  };

  if (normT >= 0.28 && normT <= 0.38) {
    const pStart = getBasePoint(0.28);
    const pEnd = getBasePoint(0.38);
    const pct = (normT - 0.28) / (0.38 - 0.28);
    return {
      x: pStart.x + (pEnd.x - pStart.x) * pct,
      z: pStart.z + (pEnd.z - pStart.z) * pct
    };
  }

  return getBasePoint(normT);
}

// Find closest t along the track points for a given point (x, z)
export function getClosestTimeOnTrack(track: Track, x: number, z: number): number {
  let bestT = 0;
  let minDist = Infinity;
  
  // Sample 200 points on current track to find closest match
  const samples = 200;
  for (let i = 0; i < samples; i++) {
    const t = i / samples;
    const pt = getTrackSplinePoint(track, t);
    const distSq = (pt.x - x) ** 2 + (pt.z - z) ** 2;
    if (distSq < minDist) {
      minDist = distSq;
      bestT = t;
    }
  }

  return bestT;
}

// Calculate cross-track distance (how far from target spline center of track)
export function getDistanceFromTrackCenter(track: Track, x: number, z: number): { distance: number; trackPoint: { x: number; z: number } } {
  const t = getClosestTimeOnTrack(track, x, z);
  const trackPoint = getTrackSplinePoint(track, t);
  const distance = Math.sqrt((trackPoint.x - x) ** 2 + (trackPoint.z - z) ** 2);
  
  return { distance, trackPoint };
}
