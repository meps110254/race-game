import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "crypto";

interface CarConfig {
  paint: string;
  wheelType: string;
  spoilerType: string;
  bodyStyle: string;
  engineLevel: number;
  weightLevel: number;
  gripLevel: number;
}

interface Player {
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
  progress: number;
  bestTime: number;
  isReady: boolean;
  isMuted?: boolean;
  team?: string;
}

interface Room {
  id: string;
  trackId: string;
  state: 'lobby' | 'countdown' | 'racing' | 'finished';
  players: Record<string, Player>;
  startTime: number;
  countdownTimer?: number;
}

const app = express();
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = 3000;

// In-memory state for rooms
const rooms: Record<string, Room> = {};

// Handle HTTP upgrades to WebSocket (only for game WebSocket path /ws or root if specified)
server.on("upgrade", (request, socket, head) => {
  try {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host || 'localhost'}`).pathname : "/";
    if (pathname === "/ws" || pathname === "/") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  } catch (err) {
    console.error("WebSocket upgrade error:", err);
  }
});

// Broadcast helper for specific room
function broadcastToRoom(roomId: string, message: any, excludePlayerId?: string) {
  const room = rooms[roomId];
  if (!room) return;

  const payload = JSON.stringify(message);
  Object.keys(room.players).forEach((pId) => {
    if (pId === excludePlayerId) return;
    const clientWs = clients.get(pId);
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(payload);
    }
  });
}

// Map player IDs to WebSocket connections
const clients = new Map<string, WebSocket>();
// Map WebSocket connections to their metadata (roomId, playerId)
const wsMetadata = new Map<WebSocket, { roomId: string; playerId: string }>();

wss.on("connection", (ws: WebSocket) => {
  const playerId = Math.random().toString(36).substring(2, 9);
  clients.set(playerId, ws);

  ws.on("message", (message: string) => {
    try {
      const data = JSON.parse(message);
      const { type, payload } = data;

      switch (type) {
        case "get-rooms": {
          const roomList = Object.values(rooms).map(r => ({
            id: r.id,
            trackId: r.trackId,
            state: r.state,
            playerCount: Object.keys(r.players).length
          }));
          ws.send(JSON.stringify({ type: "rooms-list", payload: roomList }));
          break;
        }

        case "join-room": {
          const { roomId, name, carConfig, trackId, team } = payload;
          
          // Clean up player's previous records if any
          const existing = wsMetadata.get(ws);
          if (existing) {
            leaveRoom(existing.roomId, existing.playerId);
          }

          if (!rooms[roomId]) {
            rooms[roomId] = {
              id: roomId,
              trackId: trackId || "neon-grid",
              state: 'lobby',
              players: {},
              startTime: 0
            };
          }

          const room = rooms[roomId];

          const newPlayer: Player = {
            id: playerId,
            name: name || `Racer ${playerId}`,
            carConfig: carConfig || { paint: "#ff3366", wheelType: "sport", spoilerType: "none", bodyStyle: "coupe", engineLevel: 1, weightLevel: 3, gripLevel: 3 },
            x: 0,
            y: 0.5,
            z: 0,
            ry: 0,
            speed: 0,
            steering: 0,
            lap: 1,
            progress: 0,
            bestTime: 0,
            isReady: false,
            isMuted: true,
            team: team || ""
          };

          room.players[playerId] = newPlayer;
          wsMetadata.set(ws, { roomId, playerId });

          // Reply self confirmation
          ws.send(JSON.stringify({
            type: "joined-successfully",
            payload: {
              playerId,
              roomState: {
                id: room.id,
                trackId: room.trackId,
                state: room.state,
                players: room.players
              }
            }
          }));

          // Notify others
          broadcastToRoom(roomId, {
            type: "player-joined",
            payload: newPlayer
          }, playerId);

          // Update general rooms list to all lobbies
          broadcastGlobalRoomsList();
          break;
        }

        case "ready-state": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomId];
          if (!room) return;

          const player = room.players[meta.playerId];
          if (player) {
            player.isReady = payload.isReady;
            
            broadcastToRoom(meta.roomId, {
              type: "player-ready-updated",
              payload: { playerId: meta.playerId, isReady: player.isReady }
            });

            // Check if all players isReady and trigger start if lobby
            const allPlayers = Object.values(room.players);
            const allReady = allPlayers.length > 0 && allPlayers.every(p => p.isReady);
            if (allReady && room.state === 'lobby') {
              startRoomRaceCountdown(meta.roomId);
            }
          }
          break;
        }

        case "update-car-config": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomId];
          if (!room) return;

          const player = room.players[meta.playerId];
          if (player) {
            player.carConfig = payload.carConfig;
            
            // Broadcast the updated config to everyone in the room
            broadcastToRoom(meta.roomId, {
              type: "player-car-updated",
              payload: { playerId: meta.playerId, carConfig: player.carConfig }
            });
          }
          break;
        }

        case "add-ai-bot": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomId];
          if (!room || room.state !== 'lobby') return;

          const existingBotsCount = Object.keys(room.players).filter(id => id.startsWith("ai-bot-")).length;
          if (existingBotsCount >= 5) return;

          const botIndex = existingBotsCount + 1;
          const botId = `ai-bot-${Date.now()}-${botIndex}`;

          const aiNames = [
            "Auri (AI)", "Ally (AI)", "Sean (AI)", "Mark (AI)", "Apex (AI)", "Shift (AI)"
          ];
          const aiPaints = ["#ef4444", "#3b82f6", "#10b981", "#ec4899", "#f59e0b", "#8b5cf6"];
          const aiBodies = ["f1", "muscle", "coupe"] as const;
          const aiTeams = ["CPU", "INTEL", "NVIDIA", "AMD"];

          const botPlayer = {
            id: botId,
            name: aiNames[botIndex % aiNames.length],
            carConfig: {
              paint: aiPaints[botIndex % aiPaints.length],
              wheelType: botIndex % 2 === 0 ? "sport" : "retro",
              spoilerType: botIndex % 3 === 0 ? "super" : botIndex % 3 === 1 ? "sport" : "none",
              bodyStyle: aiBodies[botIndex % aiBodies.length],
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
            team: aiTeams[botIndex % aiTeams.length]
          };

          room.players[botId] = botPlayer as any;

          broadcastToRoom(meta.roomId, {
            type: "player-joined",
            payload: botPlayer
          });

          broadcastGlobalRoomsList();

          // Check if all players isReady and trigger start if lobby
          const allPlayers = Object.values(room.players);
          const allReady = allPlayers.length > 0 && allPlayers.every(p => p.isReady);
          if (allReady && room.state === 'lobby') {
            startRoomRaceCountdown(meta.roomId);
          }
          break;
        }

        case "remove-ai-bot": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomId];
          if (!room || room.state !== 'lobby') return;

          const { botId } = payload;
          if (botId && botId.startsWith("ai-bot-") && room.players[botId]) {
            delete room.players[botId];

            broadcastToRoom(meta.roomId, {
              type: "player-left",
              payload: { playerId: botId }
            });

            broadcastGlobalRoomsList();

            // Check if all players isReady and trigger start if lobby after bot removal
            const allPlayers = Object.values(room.players);
            const allReady = allPlayers.length > 0 && allPlayers.every(p => p.isReady);
            if (allReady && room.state === 'lobby') {
              startRoomRaceCountdown(meta.roomId);
            }
          }
          break;
        }

        case "kick-player": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomId];
          if (!room || room.state !== 'lobby') return;

          const { targetPlayerId } = payload;
          if (!targetPlayerId) return;

          // Verify sender is the host (first non-bot player sorted by id)
          const humanPlayerIds = Object.keys(room.players)
            .filter(id => !id.startsWith("ai-bot-"))
            .sort();
          const hostId = humanPlayerIds[0];

          if (meta.playerId === hostId && room.players[targetPlayerId]) {
            const targetWs = clients.get(targetPlayerId);
            if (targetWs) {
              targetWs.send(JSON.stringify({
                type: "you-were-kicked",
                payload: { roomId: meta.roomId }
              }));
              wsMetadata.delete(targetWs);
            }

            leaveRoom(meta.roomId, targetPlayerId);
          }
          break;
        }

        case "update-state": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomId];
          if (!room || room.state === 'lobby') return;

          if (payload.id && payload.id.startsWith("ai-bot-")) {
            const bot = room.players[payload.id];
            if (bot) {
              bot.x = payload.x;
              bot.y = payload.y;
              bot.z = payload.z;
              bot.ry = payload.ry;
              bot.speed = payload.speed;
              bot.steering = payload.steering;
              bot.progress = payload.progress;
              bot.lap = payload.lap;

              // Broadcast the AI bot state update to other clients in the room
              broadcastToRoom(meta.roomId, {
                type: "player-state-update",
                payload: {
                  id: payload.id,
                  x: bot.x,
                  y: bot.y,
                  z: bot.z,
                  ry: bot.ry,
                  speed: bot.speed,
                  steering: bot.steering,
                  progress: bot.progress,
                  lap: bot.lap
                }
              }, meta.playerId); // Exclude the host who sent it
            }
          } else {
            const player = room.players[meta.playerId];
            if (player) {
              player.x = payload.x;
              player.y = payload.y;
              player.z = payload.z;
              player.ry = payload.ry;
              player.speed = payload.speed;
              player.steering = payload.steering;
              player.progress = payload.progress;
              player.lap = payload.lap;
              
              // Broadcast in real-time to other clients
              broadcastToRoom(meta.roomId, {
                type: "player-state-update",
                payload: {
                  id: meta.playerId,
                  x: player.x,
                  y: player.y,
                  z: player.z,
                  ry: player.ry,
                  speed: player.speed,
                  steering: player.steering,
                  progress: player.progress,
                  lap: player.lap
                }
              }, meta.playerId);
            }
          }
          break;
        }

        case "race-finished": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;

          const room = rooms[meta.roomId];
          if (!room) return;

          const player = room.players[meta.playerId];
          if (player) {
            player.bestTime = payload.bestTime;
            
            broadcastToRoom(meta.roomId, {
              type: "player-finished",
              payload: {
                playerId: meta.playerId,
                bestTime: payload.bestTime,
                name: player.name
              }
            });

            // Check if everybody finished
            const playersList = Object.values(room.players);
            const finishedAll = playersList.every(p => p.bestTime > 0);
            if (finishedAll) {
              room.state = 'finished';
              broadcastToRoom(meta.roomId, {
                type: "race-over",
                payload: { players: room.players }
              });
              broadcastGlobalRoomsList();
            }
          }
          break;
        }

        case "chat-message": {
          const meta = wsMetadata.get(ws);
          let senderName = payload.senderName || "Racer";
          let senderId = payload.senderId || "guest";

          if (meta && rooms[meta.roomId]) {
            const room = rooms[meta.roomId];
            const player = room.players[meta.playerId];
            if (player) senderName = player.name;
            senderId = meta.playerId;

            broadcastToRoom(meta.roomId, {
              type: "chat-broadcast",
              payload: {
                senderId,
                senderName,
                message: payload.message,
                time: Date.now()
              }
            });
          } else {
            // Global lobby chat broadcast for users before joining a specific room
            const msgData = {
              type: "chat-broadcast",
              payload: {
                senderId,
                senderName,
                message: payload.message,
                time: Date.now()
              }
            };
            for (const client of clients.values()) {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(msgData));
              }
            }
          }
          break;
        }

        case "leave": {
          const meta = wsMetadata.get(ws);
          if (meta) {
            leaveRoom(meta.roomId, meta.playerId);
            wsMetadata.delete(ws);
          }
          break;
        }

        case "webrtc-signal": {
          const { targetId, signal } = payload;
          const meta = wsMetadata.get(ws);
          if (!meta) return;

          const targetWs = clients.get(targetId);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: "webrtc-signal",
              payload: {
                senderId: meta.playerId,
                signal
              }
            }));
          }
          break;
        }

        case "mic-status": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;
          const room = rooms[meta.roomId];
          if (room && room.players[meta.playerId]) {
            room.players[meta.playerId].isMuted = payload.isMuted;
          }
          broadcastToRoom(meta.roomId, {
            type: "mic-status-updated",
            payload: {
              playerId: meta.playerId,
              isMuted: payload.isMuted
            }
          }, meta.playerId);
          break;
        }
      }
    } catch (e) {
      console.error("Error processing websocket message", e);
    }
  });

  ws.on("close", () => {
    clients.delete(playerId);
    const meta = wsMetadata.get(ws);
    if (meta) {
      leaveRoom(meta.roomId, meta.playerId);
      wsMetadata.delete(ws);
    }
  });
});

function leaveRoom(roomId: string, pId: string) {
  const room = rooms[roomId];
  if (!room) return;

  delete room.players[pId];
  
  // Notify others about player leaving
  broadcastToRoom(roomId, {
    type: "player-left",
    payload: { playerId: pId }
  });

  // Clean room up if empty
  if (Object.keys(room.players).length === 0) {
    delete rooms[roomId];
  } else {
    // If we're down to empty or remaining players, update ready states check
    if (room.state === 'lobby') {
      const allPlayers = Object.values(room.players);
      const allReady = allPlayers.length > 0 && allPlayers.every(p => p.isReady);
      if (allReady) {
        startRoomRaceCountdown(roomId);
      }
    }
  }

  broadcastGlobalRoomsList();
}

function startRoomRaceCountdown(roomId: string) {
  const room = rooms[roomId];
  if (!room || room.state !== 'lobby') return;

  room.state = 'countdown';
  broadcastToRoom(roomId, {
    type: "countdown-start",
    payload: { duration: 5 } // 5 seconds countdown
  });

  broadcastGlobalRoomsList();

  setTimeout(() => {
    const verifiedRoom = rooms[roomId];
    if (!verifiedRoom || verifiedRoom.state !== 'countdown') return;

    verifiedRoom.state = 'racing';
    verifiedRoom.startTime = Date.now();
    
    broadcastToRoom(roomId, {
      type: "race-start",
      payload: { startTime: verifiedRoom.startTime }
    });
    
    broadcastGlobalRoomsList();
  }, 5000);
}

function broadcastGlobalRoomsList() {
  const payload = Object.values(rooms).map(r => ({
    id: r.id,
    trackId: r.trackId,
    state: r.state,
    playerCount: Object.keys(r.players).length
  }));

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      // Send rooms state update for lobbies
      client.send(JSON.stringify({ type: "rooms-list", payload }));
    }
  });
}

// Health check API
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", online_players: clients.size, active_rooms: Object.keys(rooms).length });
});

// Translation API endpoint with Gemini AI support
app.post("/api/translate", async (req, res) => {
  try {
    const { lang, source, existing } = req.body || {};
    if (!lang || !source) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.json({ success: false, message: "GEMINI_API_KEY not configured" });
    }

    const ai = new GoogleGenAI({ apiKey });
    const missingKeys: Record<string, string> = {};
    for (const [key, val] of Object.entries(source)) {
      if (!existing || !existing[key]) {
        missingKeys[key] = val as string;
      }
    }

    if (Object.keys(missingKeys).length === 0) {
      return res.json({ success: true, translation: existing || source });
    }

    const prompt = `Translate the following UI key-value pairs from English into language code '${lang}'. Return ONLY a JSON object mapping the key to the translated string. Do not wrap in markdown or code fences.\n${JSON.stringify(missingKeys)}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });

    const text = response.text;
    if (text) {
      const translatedChunk = JSON.parse(text);
      const merged = { ...(existing || {}), ...translatedChunk };
      return res.json({ success: true, translation: merged });
    }

    return res.json({ success: false, message: "Empty response from translation model" });
  } catch (err: any) {
    console.error("Translation API error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Translation error" });
  }
});

// Temporary in-memory video storage for video highlights download
const videoStore = new Map<string, { buffer: Buffer; mimeType: string }>();

app.post("/api/upload-video", (req, res) => {
  try {
    const { videoBase64, mimeType } = req.body || {};
    if (!videoBase64) {
      return res.status(400).json({ error: "No video data provided" });
    }
    const id = randomUUID();
    const base64Data = videoBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    videoStore.set(id, { buffer, mimeType: mimeType || "video/webm" });

    setTimeout(() => videoStore.delete(id), 15 * 60 * 1000);

    return res.json({ id });
  } catch (err: any) {
    console.error("Upload video error:", err);
    return res.status(500).json({ error: "Failed to process video upload" });
  }
});

app.get("/api/download-video/:id", (req, res) => {
  const item = videoStore.get(req.params.id);
  if (!item) {
    return res.status(404).send("Video not found or expired");
  }
  res.setHeader("Content-Type", item.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="race-highlight-${Date.now()}.webm"`);
  return res.send(item.buffer);
});

// Configure Vite or Static Asset delivery & start server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Giga Racer 3D] Setting up Vite Development Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Giga Racer 3D] Serving Production Static Builds...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Giga Racer 3D] Express server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server / setup Vite middleware:", err);
});
