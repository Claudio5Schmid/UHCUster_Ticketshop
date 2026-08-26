export interface StoredScannerSession {
  token: string;
  gameId: string;
  deviceLabel: string;
  gameLabel: string;
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
