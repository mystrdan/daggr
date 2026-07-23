import { z } from 'zod';

// ──────────────────────────────────────────────
// Signaling messages (relayed through Worker/DO)
// ──────────────────────────────────────────────

/**
 * Client → Worker/DO: Join a room
 * Sent when a client opens a WebSocket to /r/{roomId}
 */
export const JoinRoomSchema = z.object({
  type: z.literal('join_room'),
  roomId: z.string().min(4).max(20),
  nickname: z.string().min(1).max(32),
  publicKey: z.string(), // base64-encoded raw SPKI
});

export type JoinRoom = z.infer<typeof JoinRoomSchema>;

/**
 * DO → Client: Room join accepted (you're peer #1 or #2)
 */
export const JoinAcceptSchema = z.object({
  type: z.literal('join_accept'),
  peerIndex: z.union([z.literal(1), z.literal(2)]),
  // If you're peer 2, the other peer's info is included
  peerNickname: z.string().optional(),
  peerPublicKey: z.string().optional(),
  // 30-min expiry as Unix ms timestamp
  expiresAt: z.number(),
});

export type JoinAccept = z.infer<typeof JoinAcceptSchema>;

/**
 * DO → Client: Room join rejected (room full / expired / not found)
 */
export const JoinRejectSchema = z.object({
  type: z.literal('join_reject'),
  reason: z.enum(['room_full', 'room_expired', 'room_not_found']),
});

export type JoinReject = z.infer<typeof JoinRejectSchema>;

/**
 * Client → DO → Other client: WebRTC SDP offer
 */
export const OfferSchema = z.object({
  type: z.literal('offer'),
  sdp: z.string(),
});

export type Offer = z.infer<typeof OfferSchema>;

/**
 * Client → DO → Other client: WebRTC SDP answer
 */
export const AnswerSchema = z.object({
  type: z.literal('answer'),
  sdp: z.string(),
});

export type Answer = z.infer<typeof AnswerSchema>;

/**
 * Client → DO → Other client: ICE candidate
 */
export const IceCandidateSchema = z.object({
  type: z.literal('ice_candidate'),
  candidate: z.string(),
  sdpMid: z.string().nullable(),
  sdpMLineIndex: z.number().nullable(),
});

export type IceCandidate = z.infer<typeof IceCandidateSchema>;

/**
 * Client → DO: Notify the other peer of our nickname & public key
 * (Relayed to the other client so they can display who they're chatting with)
 */
export const PeerInfoSchema = z.object({
  type: z.literal('peer_info'),
  nickname: z.string(),
  publicKey: z.string(),
});

export type PeerInfo = z.infer<typeof PeerInfoSchema>;

/**
 * DO → Client: Peer has disconnected
 */
export const PeerDisconnectedSchema = z.object({
  type: z.literal('peer_disconnected'),
});

export type PeerDisconnected = z.infer<typeof PeerDisconnectedSchema>;

/**
 * DO → Client: Room expired (alarm fired)
 */
export const RoomExpiredSchema = z.object({
  type: z.literal('room_expired'),
});

export type RoomExpired = z.infer<typeof RoomExpiredSchema>;

// ──────────────────────────────────────────────
// Union type for all signaling messages
// ──────────────────────────────────────────────

export const SignalingMessageSchema = z.discriminatedUnion('type', [
  JoinRoomSchema,
  JoinAcceptSchema,
  JoinRejectSchema,
  OfferSchema,
  AnswerSchema,
  IceCandidateSchema,
  PeerInfoSchema,
  PeerDisconnectedSchema,
  RoomExpiredSchema,
]);

export type SignalingMessage = z.infer<typeof SignalingMessageSchema>;

// ──────────────────────────────────────────────
// Chat message (sent over RTCDataChannel only)
// ──────────────────────────────────────────────

/**
 * ARCH_REVIEW: Chat messages use a simple JSON format over RTCDataChannel.
 * In Phase 2 with E2E encryption, the payload field would become the
 * ciphertext and we'd add an encrypted_content wrapper here.
 */
export const ChatMessageSchema = z.object({
  type: z.literal('chat'),
  payload: z.string().max(4096),
  senderNickname: z.string(),
  senderPublicKey: z.string(),
  timestamp: z.number(), // Unix ms
  // ARCH_REVIEW: Adding a nonce + signature field here would enable
  // message-level authentication without changing the protocol shape.
  // Skipping for Phase 1 since we authenticate at the signaling layer.
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

/**
 * Client → Other client over RTCDataChannel
 */
export const DataChannelMessageSchema = z.discriminatedUnion('type', [
  ChatMessageSchema,
]);

export type DataChannelMessage = z.infer<typeof DataChannelMessageSchema>;