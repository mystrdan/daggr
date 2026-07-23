/**
 * ARCH_REVIEW: Session identity storage using sessionStorage.
 *
 * We store the ephemeral identity (nickname, public key) in sessionStorage
 * so it persists across the create-flow navigation but is cleared when the
 * tab closes. localStorage is only used for the last room ID.
 *
 * This avoids URL-based state passing (which would leak the public key)
 * and keeps the identity scoped to the current browser tab.
 */

const KEYS = {
  NICKNAME: 'daggr_session_nickname',
  PUBLIC_KEY: 'daggr_session_public_key',
} as const;

export function setSessionIdentity(nickname: string, publicKeyBase64: string): void {
  try {
    sessionStorage.setItem(KEYS.NICKNAME, nickname);
    sessionStorage.setItem(KEYS.PUBLIC_KEY, publicKeyBase64);
  } catch {
    // sessionStorage may be unavailable
  }
}

export function getSessionNickname(): string | null {
  try {
    return sessionStorage.getItem(KEYS.NICKNAME);
  } catch {
    return null;
  }
}

export function getSessionPublicKey(): string | null {
  try {
    return sessionStorage.getItem(KEYS.PUBLIC_KEY);
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEYS.NICKNAME);
    sessionStorage.removeItem(KEYS.PUBLIC_KEY);
  } catch {
    // ignore
  }
}