/**
 * ARCH_REVIEW: localStorage persistence strategy.
 *
 * We persist only two values:
 * - `lastRoom`: the last room ID the user was in (for quick re-join)
 * - `nickname`: the user's ephemeral nickname (regenerated on page load if missing)
 *
 * No message history, no keys, no tokens. This is intentionally minimal.
 */

const KEYS = {
  LAST_ROOM: 'daggr_last_room',
  NICKNAME: 'daggr_nickname',
} as const;

export function getLastRoom(): string | null {
  try {
    return localStorage.getItem(KEYS.LAST_ROOM);
  } catch {
    return null;
  }
}

export function setLastRoom(roomId: string): void {
  try {
    localStorage.setItem(KEYS.LAST_ROOM, roomId);
  } catch {
    // localStorage may be unavailable (private browsing, etc.)
  }
}

export function clearLastRoom(): void {
  try {
    localStorage.removeItem(KEYS.LAST_ROOM);
  } catch {
    // ignore
  }
}

export function getStoredNickname(): string | null {
  try {
    return localStorage.getItem(KEYS.NICKNAME);
  } catch {
    return null;
  }
}

export function setStoredNickname(nickname: string): void {
  try {
    localStorage.setItem(KEYS.NICKNAME, nickname);
  } catch {
    // ignore
  }
}