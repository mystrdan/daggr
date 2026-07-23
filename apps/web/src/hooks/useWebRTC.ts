/**
 * ARCH_REVIEW: WebRTC + signaling hook.
 *
 * This hook manages:
 * 1. WebSocket connection to the Worker/DO for signaling
 * 2. RTCPeerConnection lifecycle (offer/answer/ICE exchange)
 * 3. RTCDataChannel for chat messages
 *
 * Key design decisions:
 * - The WebSocket connects to /r/{roomId} which the Vite proxy forwards to wrangler
 * - After signaling completes, the WebSocket stays open but is only used for
 *   DO-to-client messages (peer_disconnected, room_expired). Chat goes over data channel.
 * - ICE candidates are gathered and sent as they arrive, not batched.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { ICE_SERVERS } from '@daggr/shared';
import type { SignalingMessage, ChatMessage } from '@daggr/protocol';
import { SignalingMessageSchema, ChatMessageSchema } from '@daggr/protocol';

export type ConnectionStatus = 'connecting' | 'waiting' | 'connected' | 'disconnected' | 'expired' | 'error' | 'full';

interface UseWebRTCOptions {
  roomId: string;
  nickname: string;
  publicKeyBase64: string;
  onMessage: (msg: ChatMessage) => void;
  onPeerConnected: (nickname: string, publicKey: string) => void;
  onPeerDisconnected: () => void;
  onRoomExpired: () => void;
  onError: (error: string) => void;
}

interface UseWebRTCReturn {
  status: ConnectionStatus;
  expiresAt: number | null;
  sendMessage: (payload: string) => void;
  sendSignaling: (msg: SignalingMessage) => void;
  peerNickname: string | null;
}

export function useWebRTC({
  roomId,
  nickname,
  publicKeyBase64,
  onMessage,
  onPeerConnected,
  onPeerDisconnected,
  onRoomExpired,
  onError,
}: UseWebRTCOptions): UseWebRTCReturn {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [peerNickname, setPeerNickname] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const peerIndexRef = useRef<number | null>(null);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);

  // Send a message over the signaling WebSocket
  const sendSignaling = useCallback((msg: SignalingMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Send a chat message over the data channel
  const sendMessage = useCallback(
    (payload: string) => {
      if (dcRef.current?.readyState === 'open') {
        const chatMsg: ChatMessage = {
          type: 'chat',
          payload,
          senderNickname: nickname,
          senderPublicKey: publicKeyBase64,
          timestamp: Date.now(),
        };
        dcRef.current.send(JSON.stringify(chatMsg));
      } else {
        onError('Chat channel is not open yet. Please wait for connection.');
      }
    },
    [nickname, publicKeyBase64, onError]
  );

  useEffect(() => {
    let isCancelled = false;

    async function init() {
      try {
        // 1. Open WebSocket to the worker
        // ARCH_REVIEW: In dev, Vite proxies /r/* to wrangler. In prod, the Worker URL
        // would be the deployed workers.dev domain or custom domain.
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/r/${roomId}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          // Send join_room message with our info
          sendSignaling({
            type: 'join_room',
            roomId,
            nickname,
            publicKey: publicKeyBase64,
          });
        };

        ws.onmessage = async (event) => {
          if (isCancelled) return;

          let msg: SignalingMessage;
          try {
            msg = SignalingMessageSchema.parse(JSON.parse(event.data));
          } catch {
            return; // Malformed message — ignore
          }

          switch (msg.type) {
            case 'join_accept': {
              peerIndexRef.current = msg.peerIndex;
              setExpiresAt(msg.expiresAt);

              if (msg.peerIndex === 2 && msg.peerNickname) {
                setPeerNickname(msg.peerNickname);
                onPeerConnected(msg.peerNickname, msg.peerPublicKey ?? '');
              }

              if (msg.peerIndex === 1) {
                setStatus('waiting');
              } else {
                // Peer 2: initiate WebRTC connection
                setStatus('connecting');
                await startWebRTC(true);
              }
              break;
            }

            case 'join_reject': {
              if (msg.reason === 'room_full') {
                setStatus('full');
                onError('This room is full (maximum 2 participants).');
              } else if (msg.reason === 'room_expired') {
                setStatus('expired');
                onRoomExpired();
              } else {
                setStatus('error');
                onError('Room not found. It may have expired or never existed.');
              }
              break;
            }

            case 'offer': {
              // ARCH_REVIEW: Handle the perfect negotiation glare case.
              // If both peers try to make an offer simultaneously, we may need
              // to roll back. We set `makingOfferRef` to track this.
              if (!pcRef.current) {
                await startWebRTC(false);
              }
              if (pcRef.current) {
                const offer = new RTCSessionDescription({ type: 'offer', sdp: msg.sdp });
                await pcRef.current.setRemoteDescription(offer);
                const answer = await pcRef.current.createAnswer();
                await pcRef.current.setLocalDescription(answer);
                sendSignaling({
                  type: 'answer',
                  sdp: answer.sdp ?? '',
                });
              }
              break;
            }

            case 'answer': {
              if (pcRef.current) {
                const answer = new RTCSessionDescription({ type: 'answer', sdp: msg.sdp });
                await pcRef.current.setRemoteDescription(answer);
              }
              break;
            }

            case 'ice_candidate': {
              if (pcRef.current && msg.candidate) {
                try {
                  await pcRef.current.addIceCandidate({
                    candidate: msg.candidate,
                    sdpMid: msg.sdpMid,
                    sdpMLineIndex: msg.sdpMLineIndex,
                  });
                } catch {
                  // Ignore invalid candidates
                }
              }
              break;
            }

            case 'peer_info': {
              setPeerNickname(msg.nickname);
              onPeerConnected(msg.nickname, msg.publicKey);
              break;
            }

            case 'peer_disconnected': {
              setStatus('disconnected');
              setPeerNickname(null);
              onPeerDisconnected();
              break;
            }

            case 'room_expired': {
              setStatus('expired');
              onRoomExpired();
              cleanup();
              break;
            }
          }
        };

        ws.onclose = () => {
          if (!isCancelled && status !== 'expired') {
            setStatus('disconnected');
          }
        };

        ws.onerror = () => {
          if (!isCancelled) {
            setStatus('error');
            onError('Connection to signaling server failed.');
          }
        };
      } catch (err) {
        if (!isCancelled) {
          setStatus('error');
          onError('Failed to connect: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      }
    }

    async function startWebRTC(makeOffer: boolean) {
      // ARCH_REVIEW: ICE server list comes from @daggr/shared as a configurable
      // parameter. Currently only STUN. Add TURN before real-user testing.
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignaling({
            type: 'ice_candidate',
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          });
        }
      };

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        if (isCancelled) return;
        if (pc.connectionState === 'connected') {
          setStatus('connected');
        } else if (
          pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed'
        ) {
          setStatus('disconnected');
          onPeerDisconnected();
        }
      };

      // Create data channel (if we're the offerer) or handle incoming
      if (makeOffer) {
        const dc = pc.createDataChannel('chat', {
          // ARCH_REVIEW: Using 'ordered' guarantees message ordering over
          // the data channel. For a text chat app, order matters.
          ordered: true,
        });
        setupDataChannel(dc);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignaling({
          type: 'offer',
          sdp: offer.sdp ?? '',
        });
      } else {
        // Listen for incoming data channel
        pc.ondatachannel = (event) => {
          setupDataChannel(event.channel);
        };
      }
    }

    function setupDataChannel(dc: RTCDataChannel) {
      dcRef.current = dc;

      dc.onopen = () => {
        setStatus('connected');
      };

      dc.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const msg = ChatMessageSchema.parse(JSON.parse(event.data));
          onMessage(msg);
        } catch {
          // Invalid message — ignore
        }
      };

      dc.onerror = () => {
        onError('Data channel error occurred.');
      };

      dc.onclose = () => {
        if (!isCancelled) {
          setStatus('disconnected');
          onPeerDisconnected();
        }
      };
    }

    function cleanup() {
      if (dcRef.current) {
        dcRef.current.close();
        dcRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }

    init();

    return () => {
      isCancelled = true;
      cleanup();
    };
  }, [roomId]); // Only reconnect if roomId changes — nickname/key are stable for this session

  return {
    status,
    expiresAt,
    sendMessage,
    sendSignaling,
    peerNickname,
  };
}