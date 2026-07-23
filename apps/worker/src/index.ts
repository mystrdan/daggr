/**
 * ARCH_REVIEW: Worker routing layer.
 *
 * This Worker's ONLY job is to accept HTTP/WebSocket requests, extract the
 * room ID from the URL path, and route to the correct RoomDO instance.
 * It does NOT handle any message logic, state, or expiry — that's RoomDO's job.
 *
 * URL scheme: /r/{roomId} — WebSocket upgrade or HTTP info
 * Everything else: 404
 */

import { isValidRoomId } from '@daggr/shared';
import { RoomDO } from './room';

export { RoomDO };

export interface Env {
  ROOM_DO: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Route: /r/{roomId}
    const match = path.match(/^\/r\/([a-zA-Z0-9-]+)$/);
    if (!match) {
      return new Response('Not Found', { status: 404 });
    }

    const roomId = match[1];

    if (!isValidRoomId(roomId)) {
      return new Response('Invalid room ID format', { status: 400 });
    }

    // Get the Durable Object stub for this room
    const doId = env.ROOM_DO.idFromName(roomId);
    const stub = env.ROOM_DO.get(doId);

    // Forward the entire request to the DO — it handles WebSocket upgrade
    // or returns room info for HTTP requests
    return stub.fetch(request);
  },
};