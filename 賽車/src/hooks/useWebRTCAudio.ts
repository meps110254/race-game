import { useState, useEffect, useRef } from "react";
import { Player } from "../types";

export function useWebRTCAudio(
  socket: WebSocket | null,
  currentRoom: { id: string; players: Record<string, Player>; state: string } | null,
  playerId: string
) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Record<string, RTCPeerConnection>>({});
  const audioElements = useRef<Record<string, HTMLAudioElement>>({});

  // 1. Initialize Local Stream
  const initLocalStream = async () => {
    try {
      if (localStreamRef.current) return localStreamRef.current;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("WebRTC: getUserMedia is not supported in this environment.");
        setPermissionError("getUserMedia not supported");
        return null;
      }

      console.log("WebRTC: Requesting microphone permissions...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Keep tracks disabled initially (start muted)
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setPermissionError(null);
      console.log("WebRTC: Local microphone stream acquired successfully.");

      // Bind local stream tracks to any already existing peer connections
      Object.entries(peerConnections.current).forEach(([remoteId, pConn]) => {
        const pConnection = pConn as RTCPeerConnection;
        stream.getTracks().forEach((track) => {
          // Check if already added
          const senders = pConnection.getSenders();
          const alreadyAdded = senders.some((s) => s.track?.kind === track.kind);
          if (!alreadyAdded) {
            pConnection.addTrack(track, stream);
          }
        });
      });

      return stream;
    } catch (err: any) {
      console.warn("WebRTC: Unable to acquire microphone stream:", err);
      setPermissionError(err.message || String(err));
      return null;
    }
  };

  // 2. Play Remote Audio Stream
  const playRemoteStream = (remoteId: string, stream: MediaStream) => {
    console.log(`WebRTC: Playing incoming audio stream from peer: ${remoteId}`);
    
    // Check if audio element already exists
    let audio = audioElements.current[remoteId];
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      (audio as any).playsInline = true;
      audio.setAttribute("id", `remote-audio-${remoteId}`);
      document.body.appendChild(audio);
      audioElements.current[remoteId] = audio;
    }

    audio.srcObject = stream;
    audio.play().catch((err) => {
      console.warn(`WebRTC: Play audio failed for peer ${remoteId}:`, err);
    });
  };

  // Toggle local mute state
  const toggleMute = async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    let stream = localStreamRef.current;
    if (!stream && !nextMuted) {
      // Lazy init microphone when they unmute if not already acquired
      stream = await initLocalStream();
    }

    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    // Broadcast state to room
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "mic-status",
          payload: { isMuted: nextMuted }
        })
      );
    }
  };

  // 3. Setup RTCPeerConnection helper
  const createPeerConnection = async (remoteId: string) => {
    if (peerConnections.current[remoteId]) {
      return peerConnections.current[remoteId];
    }

    console.log(`WebRTC: Configuring peer connection for remote peer: ${remoteId}`);
    const pConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

    peerConnections.current[remoteId] = pConnection;

    // Set up local stream track forwarding
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        pConnection.addTrack(track, stream);
      });
    }

    // Handlers
    pConnection.onicecandidate = (event) => {
      if (event.candidate && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "webrtc-signal",
            payload: {
              targetId: remoteId,
              signal: { type: "candidate", candidate: event.candidate }
            }
          })
        );
      }
    };

    pConnection.ontrack = (event) => {
      const streams = event.streams;
      if (streams && streams[0]) {
        playRemoteStream(remoteId, streams[0]);
      }
    };

    pConnection.onconnectionstatechange = () => {
      console.log(`WebRTC: Peer ${remoteId} connection state:`, pConnection.connectionState);
    };

    return pConnection;
  };

  // 4. Handle incoming signals
  const receiveWebRTCSignal = async (senderId: string, signal: any) => {
    try {
      const pConnection = await createPeerConnection(senderId);

      if (signal.type === "offer") {
        console.log(`WebRTC: Received offer from: ${senderId}`);
        await pConnection.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pConnection.createAnswer();
        await pConnection.setLocalDescription(answer);

        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "webrtc-signal",
              payload: {
                targetId: senderId,
                signal: { type: answer.type, sdp: answer.sdp }
              }
            })
          );
        }
      } else if (signal.type === "answer") {
        console.log(`WebRTC: Received answer response from: ${senderId}`);
        await pConnection.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === "candidate") {
        console.log(`WebRTC: Received ICE Candidate from: ${senderId}`);
        if (signal.candidate) {
          await pConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      }
    } catch (err) {
      console.error(`WebRTC: Error processing signals for peer ${senderId}:`, err);
    }
  };

  // Clean peer resource
  const cleanupPeer = (remoteId: string) => {
    console.log(`WebRTC: Cleaning up peer: ${remoteId}`);
    if (peerConnections.current[remoteId]) {
      peerConnections.current[remoteId].close();
      delete peerConnections.current[remoteId];
    }
    if (audioElements.current[remoteId]) {
      audioElements.current[remoteId].pause();
      audioElements.current[remoteId].remove();
      delete audioElements.current[remoteId];
    }
  };

  // 5. Watch Room members to initiate connection if needed
  useEffect(() => {
    if (!currentRoom || currentRoom.state !== "lobby") {
      // Only do lobby voice chat
      return;
    }

    const remotePlayers = Object.keys(currentRoom.players).filter((id) => id !== playerId);

    // Identify players that left
    Object.keys(peerConnections.current).forEach((pId) => {
      if (!currentRoom.players[pId]) {
        cleanupPeer(pId);
      }
    });

    // Make connection if needed
    remotePlayers.forEach((rId) => {
      (async () => {
        if (!peerConnections.current[rId]) {
          // Deterministic negotiator: Only the peer with alphabetically LARGER ID triggers the initial offer
          if (playerId > rId) {
            try {
              const pConnection = await createPeerConnection(rId);
              const offer = await pConnection.createOffer();
              await pConnection.setLocalDescription(offer);

              if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(
                  JSON.stringify({
                    type: "webrtc-signal",
                    payload: {
                      targetId: rId,
                      signal: { type: offer.type, sdp: offer.sdp }
                    }
                  })
                );
              }
            } catch (err) {
              console.error(`WebRTC: Offer creation failed for peer: ${rId}`, err);
            }
          }
        }
      })().catch((err) => console.warn(`WebRTC connection attempt failed for peer ${rId}:`, err));
    });

  }, [currentRoom?.players, currentRoom?.state, playerId]);

  // Handle entry and exit room cleanup
  useEffect(() => {
    if (!currentRoom) {
      // Leave room cleanup
      Object.keys(peerConnections.current).forEach((pId) => cleanupPeer(pId));
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
      setLocalStream(null);
      setIsMuted(true);
    }

    return () => {
      // Unmount cleanup
      Object.keys(peerConnections.current).forEach((pId) => cleanupPeer(pId));
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [currentRoom?.id]);

  return {
    localStream,
    isMuted,
    permissionError,
    toggleMute,
    receiveWebRTCSignal
  };
}
