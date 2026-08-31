export interface StoredScannerSession {
  token: string;
  gameId: string;
  deviceLabel: string;
  /** Date and time of the game, for the scanner's status bar. */
  gameLabel: string;
  /**
   * The visiting club, so the scan screen can show the fixture as crests like
   * the rest of the app. Optional: a session saved before this existed is still
   * a valid login, and the scan screen falls back to the label alone.
   */
  opponent?: string;
}

const KEY = "uhc-scanner-session";

export function saveScannerSession(session: StoredScannerSession) {
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function loadScannerSession(): StoredScannerSession | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredScannerSession;
  } catch {
    return null;
  }
}

export function clearScannerSession() {
  sessionStorage.removeItem(KEY);
}
