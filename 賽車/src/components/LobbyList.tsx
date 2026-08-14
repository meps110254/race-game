import React, { useState, useRef, useEffect } from "react";
import { Track, RoomInfo, Player, ChatMessage } from "../types";
import { TRACKS } from "../tracks";
import { t, getTrackName, getTrackDesc } from "../utils/i18n";
import { Users, Plus, ShieldCheck, Flag, Play, RefreshCw, Car, Mic, MicOff, MessageSquare, Send } from "lucide-react";
import { getTeamFlag } from "../utils/teamUtils";

interface LobbyListProps {
  rooms: RoomInfo[];
  currentJoinedRoom: { id: string; trackId?: string; state: 'lobby' | 'countdown' | 'racing' | 'finished'; players: Record<string, Player> } | null;
  playerId: string;
  myReadyState: boolean;
  onRefreshRooms: () => void;
  onJoinOrCreateRoom: (roomId: string, trackId: string) => void;
  onToggleReady: () => void;
  onOpenGarage: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  permissionError: string | null;
  onAddAiBot?: () => void;
  onRemoveAiBot?: (botId: string) => void;
  onKickPlayer?: (playerId: string) => void;
  chatLog?: ChatMessage[];
  onSendChatMessage?: (msg: string) => void;
  playerName?: string;
}

export default function LobbyList({
  rooms,
  currentJoinedRoom,
  playerId,
  myReadyState,
  onRefreshRooms,
  onJoinOrCreateRoom,
  onToggleReady,
  onOpenGarage,
  isMuted,
  onToggleMute,
  permissionError,
  onAddAiBot,
  onRemoveAiBot,
  onKickPlayer,
  chatLog = [],
  onSendChatMessage,
  playerName
}: LobbyListProps) {
  
  const [customRoomId, setCustomRoomId] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("neon-grid");
  const [lobbyChatInput, setLobbyChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog?.length]);

  const handleSendLobbyChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (lobbyChatInput.trim() && onSendChatMessage) {
      onSendChatMessage(lobbyChatInput.trim());
      setLobbyChatInput("");
    }
  };

  const humanPlayerIds = currentJoinedRoom
    ? Object.keys(currentJoinedRoom.players).filter(id => !id.startsWith("ai-bot-")).sort()
    : [];
  const hostId = humanPlayerIds[0] || "";
  const isHost = hostId === playerId;

  return (
    <div id="lobby-matchmaker-container" className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 h-full text-slate-100 bg-slate-950 font-sans overflow-y-auto">
      
      {/* LEFT COLUMN: ROOM CREATOR & TRACK SELECTOR (7 Cols) */}
      <div className="md:col-span-7 space-y-6">
        
        {/* Active room details card view if connected to room */}
        {currentJoinedRoom ? (
          <div id="joined-lobby-pane" className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 shadow-[0_4px_30px_rgba(0,255,255,0.1)]">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 px-3 py-1 rounded-full font-mono font-bold tracking-wider uppercase">
                  {t("connected")} {t("lobby")}
                </span>
                <h2 className="text-2xl font-black font-sans uppercase mt-2">
                  {t("roomNumber")}: {currentJoinedRoom.id}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {t("chooseTrack")}: {getTrackName(currentJoinedRoom.trackId, TRACKS[currentJoinedRoom.trackId]?.name || "...")}
                </p>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={onOpenGarage}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 rounded-xl transition text-xs font-bold flex items-center space-x-1 cursor-pointer"
                >
                  <Car className="w-4 h-4 text-pink-500" />
                  <span>{t("enterGarage")}</span>
                </button>
              </div>
            </div>

            {/* Voice Chat Control Panel */}
            <div className="mb-4 p-4 rounded-xl border border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-lg border ${isMuted ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'}`}>
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5 animate-pulse" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider font-mono">{t("lobbyVoiceChat")}</h4>
                  {permissionError ? (
                    <p className="text-[10px] text-rose-400 mt-0.5 font-sans">
                      {t("voicePermissionDenied")}: {permissionError}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {isMuted ? t("micMutedDesc") : t("micActiveDesc")}
                    </p>
                  )}
                </div>
              </div>

              <button
                onClick={onToggleMute}
                type="button"
                className={`px-4 py-2 rounded-xl font-bold transition text-xs flex items-center space-x-2 border shadow-sm cursor-pointer whitespace-nowrap uppercase tracking-wider ${
                  isMuted 
                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30' 
                    : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 border-emerald-400'
                }`}
              >
                {isMuted ? <Mic className="w-4 h-4 animate-bounce" /> : <MicOff className="w-4 h-4" />}
                <span>{isMuted ? t("mic_unmute") : t("mic_mute")}</span>
              </button>
            </div>

            {/* Players list in lobby room */}
            <div className="space-y-3 mb-6 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
              <h3 className="text-xs font-bold uppercase text-slate-400 font-mono tracking-widest flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span>{t("lobbyPlayers")} ({Object.keys(currentJoinedRoom.players).length})</span>
                </div>
                {onAddAiBot && (
                  <button
                    onClick={onAddAiBot}
                    type="button"
                    className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 hover:border-cyan-500/30 rounded-lg text-[10px] font-bold flex items-center space-x-1 cursor-pointer transition uppercase tracking-wider"
                  >
                    <Plus className="w-3 h-3" />
                    <span>{t("addAiBot")}</span>
                  </button>
                )}
              </h3>

              <div className="space-y-2 mt-3">
                {Object.values(currentJoinedRoom.players).map((p) => {
                  const isMe = p.id === playerId;
                  const ready = p.isReady;

                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-3 rounded-lg border transition ${
                        isMe 
                          ? 'bg-cyan-500/5 border-cyan-500/30' 
                          : 'bg-slate-900/40 border-slate-900'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                          style={{ backgroundColor: p.carConfig.paint }}
                        />
                        <div>
                          <div className="flex items-center space-x-2">
                            {p.team && (
                              <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/20 text-[10px] text-cyan-400 font-mono font-bold select-none" title={`${t("team_label")}: ${p.team}`}>
                                <span>{getTeamFlag(p.team)}</span>
                                <span className="tracking-wide">[{p.team.trim().toUpperCase()}]</span>
                              </span>
                            )}
                            <span className="text-sm font-bold">{p.name} {isMe && `(${t("me")})`}</span>
                            {p.id === hostId && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] text-amber-400 font-mono font-bold uppercase tracking-wider">
                                👑 {t("hostLabel")}
                              </span>
                            )}
                            {p.isMuted ? (
                              <span className="flex items-center text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-mono space-x-1" title="Muted">
                                <MicOff className="w-2.5 h-2.5 text-slate-600" />
                                <span>{t("muted")}</span>
                              </span>
                            ) : (
                              <span className="flex items-center text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-500/20 font-mono space-x-1 font-bold animate-pulse" title="Speaking">
                                <Mic className="w-2.5 h-2.5 text-cyan-400" />
                                <span>{t("speaking")}</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                            {p.carConfig.bodyStyle === 'f1' ? t("formulaStyle") : p.carConfig.bodyStyle === 'muscle' ? t("muscleStyle") : t("sedanStyle")}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        {p.id.startsWith("ai-bot-") && onRemoveAiBot && (
                          <button
                            onClick={() => onRemoveAiBot(p.id)}
                            type="button"
                            className="text-[10px] text-rose-400 hover:text-rose-300 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 rounded-lg transition cursor-pointer font-bold uppercase tracking-wider mr-1"
                          >
                            {t("remove")}
                          </button>
                        )}
                        {!isMe && !p.id.startsWith("ai-bot-") && isHost && onKickPlayer && (
                          <button
                            onClick={() => onKickPlayer(p.id)}
                            type="button"
                            className="text-[10px] text-rose-400 hover:text-rose-300 px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 rounded-lg transition cursor-pointer font-bold uppercase tracking-wider mr-1"
                          >
                            {t("kickPlayer")}
                          </button>
                        )}
                        {ready ? (
                          <span className="text-xs font-bold text-emerald-400 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center space-x-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>{t("ready")}</span>
                          </span>
                        ) : (
                          <span className="text-xs text-amber-500 px-3 py-1 rounded-full bg-amber-500/5 border border-amber-500/10">
                            {t("notReady")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Toggle ready button */}
            <button
              onClick={onToggleReady}
              id="ready-checkbox-toggle"
              className={`w-full py-4 rounded-xl font-bold transition flex items-center justify-center space-x-2 shadow-lg tracking-widest text-sm uppercase cursor-pointer ${
                myReadyState
                  ? 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-750'
                  : 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-cyan-500/20'
              }`}
            >
              <Play className="w-4 h-4" />
              <span>{myReadyState ? t("cancelReady") : t("confirmReady")}</span>
            </button>
            <p className="text-center text-[10px] text-slate-500 mt-3 font-mono">
              {t("readyLobbyTip")}
            </p>
          </div>
        ) : (
          /* Match creation & hosting settings if not in a room */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-black tracking-wider uppercase mb-5 flex items-center space-x-2 text-cyan-400">
              <Plus className="w-5 h-5" />
              <span>{t("hostNewGame")}</span>
            </h2>

            {/* Select track presets */}
            <div className="space-y-3 mb-6">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">
                {t("chooseTrack")}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {Object.values(TRACKS).map((trackOpt) => (
                  <button
                    key={trackOpt.id}
                    onClick={() => setSelectedTrackId(trackOpt.id)}
                    className={`relative p-4 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer h-36 ${
                      selectedTrackId === trackOpt.id
                        ? 'border-cyan-500 bg-cyan-500/5 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                        : 'border-slate-800 hover:border-slate-750 bg-slate-950/60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-bold">{getTrackName(trackOpt.id, trackOpt.name)}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase font-mono ${
                          trackOpt.difficulty === 'easy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          trackOpt.difficulty === 'medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {trackOpt.difficulty}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-normal line-clamp-2 mt-1.5">{getTrackDesc(trackOpt.id, trackOpt.description)}</p>
                    </div>
                    <div className="flex items-center space-x-1.5 text-[9px] text-slate-500 font-mono mt-2">
                      <Flag className="w-3 h-3 text-cyan-400" />
                      <span>{t("trackWidth")} {trackOpt.width}m</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Set custom room ID */}
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
              <input
                type="text"
                placeholder={t("roomNamePlaceholder")}
                value={customRoomId}
                onChange={(e) => setCustomRoomId(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 text-slate-200"
              />
              <button
                onClick={() => onJoinOrCreateRoom(customRoomId.trim().toUpperCase() || Math.random().toString(36).substring(2, 7).toUpperCase(), selectedTrackId)}
                id="create-room-btn"
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold rounded-xl transition text-sm uppercase cursor-pointer"
              >
                {t("createRoom")}
              </button>
            </div>
          </div>
        )}

        {/* Tracks details display showcase */}
        <div className="bg-slate-900 border border-slate-830 rounded-2xl p-6 hidden md:block">
          <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider font-mono mb-4">
            {t("trackSpecs")}
          </h3>
          <div className="space-y-4 text-xs font-mono">
            <div className="flex justify-between py-1 border-b border-slate-800">
              <span className="text-slate-500">{t("neonGrid")}</span>
              <span className="text-cyan-400 font-bold">{t("track_neon_desc")}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800">
              <span className="text-slate-500">{t("desertRally")}</span>
              <span className="text-amber-500 font-bold">{t("track_desert_desc")}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">{t("spaceHighway")}</span>
              <span className="text-pink-500 font-bold">{t("track_space_desc")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: REFRESH ACTIVE ONLINE ROOMS LIST (5 Cols) */}
      <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between min-h-[400px]">
        <div>
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-lg font-black tracking-wider uppercase flex items-center space-x-2 text-cyan-400">
              <Users className="w-5 h-5 animate-pulse" />
              <span>{t("joinOnlineLobby")}</span>
            </h2>

            <button
              onClick={onRefreshRooms}
              id="refresh-channels-btn"
              title={t("refreshLobby")}
              className="p-2 border border-slate-805 hover:bg-slate-800 rounded-lg text-slate-400 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {rooms.length === 0 ? (
              <div className="text-center py-12 text-slate-600 flex flex-col items-center">
                <Users className="w-8 h-8 text-slate-800 mb-2" />
                <p className="text-xs">{t("noOneOnline")}</p>
                <p className="text-[10px] text-slate-700 mt-1">{t("noOneOnlineTip")}</p>
              </div>
            ) : (
              rooms.map((rm) => (
                <div
                  key={rm.id}
                  id={`room-item-${rm.id}`}
                  className="p-4 rounded-xl border border-slate-800 bg-slate-950/40 hover:bg-slate-950/80 transition flex items-center justify-between"
                >
                  <div className="overflow-hidden truncate">
                    <div className="font-mono font-bold text-sm text-cyan-400">{rm.id}</div>
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider block mt-1">
                      {t("mapLabel")}: {getTrackName(rm.trackId, TRACKS[rm.trackId]?.name || "...")}
                    </span>
                    <span className="text-[10px] text-slate-600 block mt-0.5">
                      {t("statusLabel")}: {rm.state === 'lobby' ? t("stateLobby") : rm.state === 'racing' ? t("stateRacing") : t("stateEnded")}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 pl-2">
                    <span className="text-xs font-mono text-slate-400 font-bold whitespace-nowrap">
                      {rm.playerCount} {t("playersCountUnit")}
                    </span>
                    <button
                      onClick={() => onJoinOrCreateRoom(rm.id, rm.trackId)}
                      disabled={rm.state === 'racing'}
                      className={`px-3 py-2 rounded-lg text-xs font-bold uppercase transition cursor-pointer ${
                        rm.state === 'racing'
                          ? 'bg-slate-800 text-slate-600 border border-slate-850 cursor-not-allowed'
                          : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                      }`}
                    >
                      {rm.state === 'racing' ? t("spectateOrFull") : t("joinLabel")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* LOBBY CHAT CHANNEL PANEL */}
        <div id="lobby-chat-panel" className="mt-5 bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div className="flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black uppercase tracking-wider font-mono text-slate-200">
                {t("lobbyVoiceChat") ? (t("lobbyVoiceChat").includes("聊") ? "大廳聊天頻道" : "LOBBY CHAT CHANNEL") : "LOBBY CHAT CHANNEL"}
              </h3>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 border border-cyan-800/60 px-2 py-0.5 rounded-full font-bold">
              ONLINE
            </span>
          </div>

          {/* Messages list */}
          <div id="lobby-chat-messages" className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3 space-y-2 max-h-[180px] min-h-[110px] overflow-y-auto font-mono text-xs select-text scrollbar-thin">
            {chatLog.length === 0 ? (
              <div className="text-slate-600 text-xs italic py-6 text-center select-none">
                尚無對話訊息，發送第一條訊息吧！ / No chat messages yet.
              </div>
            ) : (
              chatLog.map((msg, idx) => {
                let nameColor = "text-cyan-400 font-bold";
                if (msg.senderId === "system") {
                  nameColor = "text-amber-400 font-bold";
                } else if (msg.senderId === playerId || msg.senderName === playerName) {
                  nameColor = "text-pink-400 font-bold";
                }

                return (
                  <div key={idx} className="leading-snug break-words">
                    <span className={`text-[11px] ${nameColor}`}>
                      {msg.senderName}:
                    </span>{" "}
                    <span className="text-slate-100 text-xs">{msg.message}</span>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input form */}
          <form onSubmit={handleSendLobbyChat} className="flex items-center gap-2 mt-3">
            <input
              type="text"
              value={lobbyChatInput}
              onChange={(e) => setLobbyChatInput(e.target.value)}
              placeholder="輸入訊息傳送給大廳玩家... / Type a message..."
              className="flex-1 bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition font-mono"
              maxLength={120}
              autoComplete="off"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs uppercase rounded-xl transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>傳送</span>
            </button>
          </form>
        </div>

        {/* Global summary tips footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed font-sans">
          <p className="font-bold text-slate-300">{t("crossplayTipTitle")}</p>
          <p className="mt-1">{t("crossplayTipDesc")}</p>
        </div>
      </div>

    </div>
  );
}
