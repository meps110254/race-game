var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_http = __toESM(require("http"), 1);
var import_path = __toESM(require("path"), 1);
var import_ws = require("ws");
var import_vite = require("vite");
var import_genai = require("@google/genai");
var import_crypto = require("crypto");
var app = (0, import_express.default)();
app.use(import_express.default.json({ limit: "100mb" }));
app.use(import_express.default.urlencoded({ limit: "100mb", extended: true }));
var server = import_http.default.createServer(app);
var wss = new import_ws.WebSocketServer({ noServer: true });
var PORT = 3e3;
var rooms = {};
server.on("upgrade", (request, socket, head) => {
  try {
    const pathname = request.url ? new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname : "/";
    if (pathname === "/ws" || pathname === "/") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  } catch (err) {
    console.error("WebSocket upgrade error:", err);
  }
});
function broadcastToRoom(roomId, message, excludePlayerId) {
  const room = rooms[roomId];
  if (!room) return;
  const payload = JSON.stringify(message);
  Object.keys(room.players).forEach((pId) => {
    if (pId === excludePlayerId) return;
    const clientWs = clients.get(pId);
    if (clientWs && clientWs.readyState === import_ws.WebSocket.OPEN) {
      clientWs.send(payload);
    }
  });
}
var clients = /* @__PURE__ */ new Map();
var wsMetadata = /* @__PURE__ */ new Map();
wss.on("connection", (ws) => {
  const playerId = Math.random().toString(36).substring(2, 9);
  clients.set(playerId, ws);
  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      const { type, payload } = data;
      switch (type) {
        case "get-rooms": {
          const roomList = Object.values(rooms).map((r) => ({
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
          const existing = wsMetadata.get(ws);
          if (existing) {
            leaveRoom(existing.roomId, existing.playerId);
          }
          if (!rooms[roomId]) {
            rooms[roomId] = {
              id: roomId,
              trackId: trackId || "neon-grid",
              state: "lobby",
              players: {},
              startTime: 0
            };
          }
          const room = rooms[roomId];
          const newPlayer = {
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
          broadcastToRoom(roomId, {
            type: "player-joined",
            payload: newPlayer
          }, playerId);
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
            const allPlayers = Object.values(room.players);
            const allReady = allPlayers.length > 0 && allPlayers.every((p) => p.isReady);
            if (allReady && room.state === "lobby") {
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
          if (!room || room.state !== "lobby") return;
          const existingBotsCount = Object.keys(room.players).filter((id) => id.startsWith("ai-bot-")).length;
          if (existingBotsCount >= 5) return;
          const botIndex = existingBotsCount + 1;
          const botId = `ai-bot-${Date.now()}-${botIndex}`;
          const aiNames = [
            "Auri (AI)",
            "Ally (AI)",
            "Sean (AI)",
            "Mark (AI)",
            "Apex (AI)",
            "Shift (AI)"
          ];
          const aiPaints = ["#ef4444", "#3b82f6", "#10b981", "#ec4899", "#f59e0b", "#8b5cf6"];
          const aiBodies = ["f1", "muscle", "coupe"];
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
          room.players[botId] = botPlayer;
          broadcastToRoom(meta.roomId, {
            type: "player-joined",
            payload: botPlayer
          });
          broadcastGlobalRoomsList();
          const allPlayers = Object.values(room.players);
          const allReady = allPlayers.length > 0 && allPlayers.every((p) => p.isReady);
          if (allReady && room.state === "lobby") {
            startRoomRaceCountdown(meta.roomId);
          }
          break;
        }
        case "remove-ai-bot": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;
          const room = rooms[meta.roomId];
          if (!room || room.state !== "lobby") return;
          const { botId } = payload;
          if (botId && botId.startsWith("ai-bot-") && room.players[botId]) {
            delete room.players[botId];
            broadcastToRoom(meta.roomId, {
              type: "player-left",
              payload: { playerId: botId }
            });
            broadcastGlobalRoomsList();
            const allPlayers = Object.values(room.players);
            const allReady = allPlayers.length > 0 && allPlayers.every((p) => p.isReady);
            if (allReady && room.state === "lobby") {
              startRoomRaceCountdown(meta.roomId);
            }
          }
          break;
        }
        case "kick-player": {
          const meta = wsMetadata.get(ws);
          if (!meta) return;
          const room = rooms[meta.roomId];
          if (!room || room.state !== "lobby") return;
          const { targetPlayerId } = payload;
          if (!targetPlayerId) return;
          const humanPlayerIds = Object.keys(room.players).filter((id) => !id.startsWith("ai-bot-")).sort();
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
          if (!room || room.state === "lobby") return;
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
              }, meta.playerId);
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
            const playersList = Object.values(room.players);
            const finishedAll = playersList.every((p) => p.bestTime > 0);
            if (finishedAll) {
              room.state = "finished";
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
              if (client.readyState === import_ws.WebSocket.OPEN) {
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
          if (targetWs && targetWs.readyState === import_ws.WebSocket.OPEN) {
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
function leaveRoom(roomId, pId) {
  const room = rooms[roomId];
  if (!room) return;
  delete room.players[pId];
  broadcastToRoom(roomId, {
    type: "player-left",
    payload: { playerId: pId }
  });
  if (Object.keys(room.players).length === 0) {
    delete rooms[roomId];
  } else {
    if (room.state === "lobby") {
      const allPlayers = Object.values(room.players);
      const allReady = allPlayers.length > 0 && allPlayers.every((p) => p.isReady);
      if (allReady) {
        startRoomRaceCountdown(roomId);
      }
    }
  }
  broadcastGlobalRoomsList();
}
function startRoomRaceCountdown(roomId) {
  const room = rooms[roomId];
  if (!room || room.state !== "lobby") return;
  room.state = "countdown";
  broadcastToRoom(roomId, {
    type: "countdown-start",
    payload: { duration: 5 }
    // 5 seconds countdown
  });
  broadcastGlobalRoomsList();
  setTimeout(() => {
    const verifiedRoom = rooms[roomId];
    if (!verifiedRoom || verifiedRoom.state !== "countdown") return;
    verifiedRoom.state = "racing";
    verifiedRoom.startTime = Date.now();
    broadcastToRoom(roomId, {
      type: "race-start",
      payload: { startTime: verifiedRoom.startTime }
    });
    broadcastGlobalRoomsList();
  }, 5e3);
}
function broadcastGlobalRoomsList() {
  const payload = Object.values(rooms).map((r) => ({
    id: r.id,
    trackId: r.trackId,
    state: r.state,
    playerCount: Object.keys(r.players).length
  }));
  wss.clients.forEach((client) => {
    if (client.readyState === import_ws.WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "rooms-list", payload }));
    }
  });
}
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", online_players: clients.size, active_rooms: Object.keys(rooms).length });
});
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
    const ai = new import_genai.GoogleGenAI({ apiKey });
    const missingKeys = {};
    for (const [key, val] of Object.entries(source)) {
      if (!existing || !existing[key]) {
        missingKeys[key] = val;
      }
    }
    if (Object.keys(missingKeys).length === 0) {
      return res.json({ success: true, translation: existing || source });
    }
    const prompt = `Translate the following UI key-value pairs from English into language code '${lang}'. Return ONLY a JSON object mapping the key to the translated string. Do not wrap in markdown or code fences.
${JSON.stringify(missingKeys)}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    const text = response.text;
    if (text) {
      const translatedChunk = JSON.parse(text);
      const merged = { ...existing || {}, ...translatedChunk };
      return res.json({ success: true, translation: merged });
    }
    return res.json({ success: false, message: "Empty response from translation model" });
  } catch (err) {
    console.error("Translation API error:", err);
    return res.status(500).json({ success: false, error: err?.message || "Translation error" });
  }
});
var videoStore = /* @__PURE__ */ new Map();
app.post("/api/upload-video", (req, res) => {
  try {
    const { videoBase64, mimeType } = req.body || {};
    if (!videoBase64) {
      return res.status(400).json({ error: "No video data provided" });
    }
    const id = (0, import_crypto.randomUUID)();
    const base64Data = videoBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    videoStore.set(id, { buffer, mimeType: mimeType || "video/webm" });
    setTimeout(() => videoStore.delete(id), 15 * 60 * 1e3);
    return res.json({ id });
  } catch (err) {
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
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[Giga Racer 3D] Setting up Vite Development Middleware...");
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Giga Racer 3D] Serving Production Static Builds...");
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Giga Racer 3D] Express server listening on http://0.0.0.0:${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server / setup Vite middleware:", err);
});
//# sourceMappingURL=server.cjs.map
