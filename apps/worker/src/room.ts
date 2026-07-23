/**
 * ARCH_REVIEW: RoomDO — Durable Object for ephemeral room management.
 *
 * Key design decisions:
 *
 * 1. **WebSocket Hibernation API**: We use Durable Object WebSocket Hibernation
 *    (`state.acceptWebSocket()`) rather than the `webSocketPair` pattern. This
 *    means once a WebSocket is accepted, the DO can hibernate (zero CPU) between
 *    messages. This is essential for long-lived-but-idle rooms.
 *
 * 2. **Signaling-only**: The DO only relays WebRTC signaling messages (SDP
 *    offers/answers, ICE candidates) and peer info (nicknames, public keys).
 *    After the RTCPeerConnection is established, all chat messages go over the
 *    RTCDataChannel — the DO never sees message content.
 *
 * 3. **Exactly 2 peers**: We enforce a maximum of 2 connected peers. A third
 *    connection attempt receives a `join_reject` with `room_full`.
 *
 * 4. **30-minute alarm**: On first connection (peer 1), we set an alarm for
 *    30 minutes. When it fires, we close all WebSockets and the DO is evicted.
 *    If peer 2 connects and later disconnects, peer 1 gets a `peer_disconnected`
 *    message and can choose to leave.
 *
 * 5. **State storage**: We store only the minimum state needed: room expiry
 *    timestamp and connected peer info. No message history, no persistent state.
 */

import { ROOM_EXPIRY_MS, WS_CLOSE_NORMAL, WS_CLOSE_ROOM_EXPIRED, WS_CLOSE_ROOM_FULL, WS_CLOSE_ROOM_NOT_FOUND } from '@daggr/shared';
import type { SignalingMessage } from '@daggr/protocol';
import { SignalingMessageSchema, JoinAcceptSchema, JoinRejectSchema, PeerInfoSchema, PeerDisconnectedSchema, RoomExpiredSchema } from '@daggr/protocol';

/**
 * Stored per room in DO storage
 */
interface RoomState {
  /** Unix ms timestamp when this room expires */
  expiresAt: number;
}

interface Peer {
  id: number; // 1 or 2
  nickname: string;
  publicKey: string;
}

export class RoomDO implements DurableObject {
  private peers: Map<number, WebSocket> = new Map(); // peer 1 and peer 2
  private peerInfo: Map<number, Peer> = new Map();
  private state: DurableObjectState;

  constructor(ctx: DurableObjectState) {
    this.state = ctx;

    // Handle alarm (room expiry)
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<RoomState>('room');
      if (stored) {
        // If the alarm somehow didn't fire but the room is expired, clean up
        if (stored.expiresAt <= Date.now()) {
          // Room already expired — will be cleaned up on next request
        }
      }
    });
  }

  /**
   * Handle incoming requests. Supports:
   * - WebSocket upgrade: the main entry point for clients
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Only WebSocket upgrades are supported
    if (request.headers.get('Upgrade') !== 'websocket') {
      // Return room info (used by clients to check if room exists)
      const stored = await this.state.storage.get<RoomState>('room');
      if (!stored) {
        return new Response(JSON.stringify({ exists: false }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (stored.expiresAt <= Date.now()) {
        return new Response(JSON.stringify({ exists: false, expired: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ exists: true, expiresAt: stored.expiresAt }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if room exists and hasn't expired
    const stored = await this.state.storage.get<RoomState>('room');

    // ARCH_REVIEW: For failures (expired/full), we need to accept the WebSocket,
    // send a descriptive join_reject message, then close. If we reject the upgrade
    // with HTTP 403, the client gets a generic onerror/onclose with no context.
    if (stored && stored.expiresAt <= Date.now()) {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      try {
        pair[1].send(JSON.stringify({
          type: 'join_reject',
          reason: 'room_expired',
        } satisfies SignalingMessage));
      } catch {}
      pair[1].close(WS_CLOSE_ROOM_EXPIRED, 'Room expired');
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // Check peer count
    if (this.peers.size >= 2) {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      try {
        pair[1].send(JSON.stringify({
          type: 'join_reject',
          reason: 'room_full',
        } satisfies SignalingMessage));
      } catch {}
      pair[1].close(WS_CLOSE_ROOM_FULL, 'Room full');
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // ARCH_REVIEW: We use the Hibernation API's `state.acceptWebSocket()` approach.
    // The WebSocket pair is created by the client-side `new WebSocket()` call.
    // We get the WebSocket from the request's `webSocket` property (the server-side
    // of the client-initiated upgrade). We accept it via `state.acceptWebSocket()`.
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Accept the WebSocket for hibernation
    this.state.acceptWebSocket(server);

    // Determine peer ID
    const peerId = this.peers.size === 0 ? 1 : 2;
    this.peers.set(peerId, server);

    // If this is the first peer, initialize the room and set alarm
    if (peerId === 1) {
      const expiresAt = Date.now() + ROOM_EXPIRY_MS;
      await this.state.storage.put<RoomState>('room', { expiresAt });
      // Set alarm for 30 minutes
      await this.state.storage.setAlarm(expiresAt);
    }

    // Tag the WebSocket with the peer ID for message routing
    // The tag is used in webSocketMessage() to determine which peer sent the message
    server.serializeAttachment({ peerId });

    // Send join_accept to the new peer
    const joinAccept: SignalingMessage = {
      type: 'join_accept',
      peerIndex: peerId,
      expiresAt: (await this.state.storage.get<RoomState>('room'))!.expiresAt,
    };

    // If this is peer 2, send peer 1's info
    if (peerId === 2) {
      const p1 = this.peerInfo.get(1);
      if (p1) {
        joinAccept.peerNickname = p1.nickname;
        joinAccept.peerPublicKey = p1.publicKey;
      }
    }

    server.send(JSON.stringify(joinAccept));

    // If peer 2 just joined, notify peer 1 that someone connected
    if (peerId === 2) {
      // ARCH_REVIEW: Since we use hibernation, the `peers` map is in-memory.
      // We send the peer 2 info to peer 1 as a peer_info message.
      // The peer info is stored when peer 1 sends their `join_room` message.
      const p2Info = this.peerInfo.get(2);
      if (p2Info && this.peers.has(1)) {
        const p1Ws = this.peers.get(1)!;
        try {
          p1Ws.send(JSON.stringify({
            type: 'peer_info',
            nickname: p2Info.nickname,
            publicKey: p2Info.publicKey,
          } satisfies SignalingMessage));
        } catch {
          // Peer 1 may have disconnected — clean up
          this.peers.delete(1);
          if (this.peers.size === 0) {
            // Room is empty — clear alarm? No, let it expire naturally.
          }
        }
      }
    }

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Handle WebSocket messages from connected clients.
   * All messages are JSON-encoded SignalingMessage types.
   *
   * ARCH_REVIEW: We use the Hibernation API's webSocketMessage() handler.
   * The `ws` parameter tells us which peer sent the message via its attachment.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') {
      // Binary messages not supported in signaling
      return;
    }

    let parsed: SignalingMessage;
    try {
      parsed = SignalingMessageSchema.parse(JSON.parse(message));
    } catch {
      // Malformed message — ignore
      return;
    }

    const attachment = ws.deserializeAttachment() as { peerId: number } | null;
    const senderPeerId = attachment?.peerId;

    if (!senderPeerId) {
      return;
    }

    switch (parsed.type) {
      case 'join_room': {
        // Store peer info
        this.peerInfo.set(senderPeerId, {
          id: senderPeerId,
          nickname: parsed.nickname,
          publicKey: parsed.publicKey,
        });

        // Relay peer info to the other peer (if they exist)
        const otherPeerId = senderPeerId === 1 ? 2 : 1;
        const otherWs = this.peers.get(otherPeerId);
        if (otherWs) {
          try {
            const peerInfoMsg: SignalingMessage = {
              type: 'peer_info',
              nickname: parsed.nickname,
              publicKey: parsed.publicKey,
            };
            otherWs.send(JSON.stringify(peerInfoMsg));
          } catch {
            this.peers.delete(otherPeerId);
          }
        }
        break;
      }

      case 'offer': {
        // Relay SDP offer to the other peer
        const targetPeerId = senderPeerId === 1 ? 2 : 1;
        const targetWs = this.peers.get(targetPeerId);
        if (targetWs) {
          try {
            const offerMsg: SignalingMessage = {
              type: 'offer',
              sdp: parsed.sdp,
            };
            targetWs.send(JSON.stringify(offerMsg));
          } catch {
            this.peers.delete(targetPeerId);
          }
        }
        break;
      }

      case 'answer': {
        // Relay SDP answer to the other peer
        const targetPeerId = senderPeerId === 1 ? 2 : 1;
        const targetWs = this.peers.get(targetPeerId);
        if (targetWs) {
          try {
            const answerMsg: SignalingMessage = {
              type: 'answer',
              sdp: parsed.sdp,
            };
            targetWs.send(JSON.stringify(answerMsg));
          } catch {
            this.peers.delete(targetPeerId);
          }
        }
        break;
      }

      case 'ice_candidate': {
        // Relay ICE candidate to the other peer
        const targetPeerId = senderPeerId === 1 ? 2 : 1;
        const targetWs = this.peers.get(targetPeerId);
        if (targetWs) {
          try {
            const iceMsg: SignalingMessage = {
              type: 'ice_candidate',
              candidate: parsed.candidate,
              sdpMid: parsed.sdpMid,
              sdpMLineIndex: parsed.sdpMLineIndex,
            };
            targetWs.send(JSON.stringify(iceMsg));
          } catch {
            this.peers.delete(targetPeerId);
          }
        }
        break;
      }

      case 'peer_info':
      case 'peer_disconnected':
      case 'room_expired':
        // Client should not send these — ignore
        break;
    }
  }

  /**
   * Handle WebSocket close events.
   * Notify the remaining peer that the other peer disconnected.
   */
  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    const attachment = ws.deserializeAttachment() as { peerId: number } | null;
    const disconnectedPeerId = attachment?.peerId;

    if (disconnectedPeerId) {
      this.peers.delete(disconnectedPeerId);
      this.peerInfo.delete(disconnectedPeerId);

      // Notify the remaining peer
      const remainingPeerId = disconnectedPeerId === 1 ? 2 : 1;
      const remainingWs = this.peers.get(remainingPeerId);
      if (remainingWs) {
        try {
          const msg: SignalingMessage = {
            type: 'peer_disconnected',
          };
          remainingWs.send(JSON.stringify(msg));
        } catch {
          this.peers.delete(remainingPeerId);
        }
      }
    }

    // If no peers left, the DO will be evicted after the alarm fires
    // We could cancel the alarm, but keeping it ensures cleanup
  }

  /**
   * Handle the expiry alarm.
   * Close all WebSocket connections with a close code indicating room expiry.
   */
  async alarm(): Promise<void> {
    // Close all active WebSocket connections
    for (const [peerId, ws] of this.peers) {
      try {
        // First send the room_expired message
        const msg: SignalingMessage = {
          type: 'room_expired',
        };
        ws.send(JSON.stringify(msg));
      } catch {
        // Peer may already be disconnected
      }
    }

    // Clear all peers
    this.peers.clear();
    this.peerInfo.clear();

    // Delete the room state
    await this.state.storage.deleteAll();
  }
}