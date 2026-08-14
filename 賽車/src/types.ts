export interface CarConfig {
  paint: string;          // Hex code e.g. "#ff3366"
  wheelType: 'sport' | 'offroad' | 'retro';
  spoilerType: 'none' | 'sport' | 'super';
  bodyStyle: 'coupe' | 'f1' | 'muscle';
  engineLevel: number;    // 1-5
  weightLevel: number;    // 1-5 (heavy body = stable handling, light body = faster acceleration)
  gripLevel: number;      // 1-5 (grip)
}

export interface Player {
  id: string;
  name: string;
  carConfig: CarConfig;
  x: number;
  y: number;
  z: number;
  ry: number;
  speed: number;
  steering: number;
  lap: number;
  progress: number; // 0 to 1 along tracking curve
  bestTime: number; // ms, 0 if not finished
  isReady: boolean;
  isMuted?: boolean; // WebRTC mic mute status
  team?: string;     // Team code / tag e.g. "TEAM"
  finished?: boolean;
  color?: string;
}

export interface Track {
  id: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'medium' | 'hard';
  colorTheme: string;
  skyColor: string;
  groundColor: string;
  points: [number, number][]; // x, z coordinates defining track path centers
  width: number;
  physicsFriction: number;
  isOpen?: boolean;            // true if linear test track rather than closed loop
  obstacles?: { x: number; z: number; type: 'rock' | 'tree' | 'mountain' | 'river'; radius: number }[];
}

export interface ChatMessage {
  senderId: string;
  senderName: string;
  message: string;
  time: number;
}

export interface RoomInfo {
  id: string;
  trackId: string;
  state: 'lobby' | 'countdown' | 'racing' | 'finished';
  playerCount: number;
}
