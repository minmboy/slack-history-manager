/**
 * The app was called slack-message-manager until it also exported the member
 * directory, and its localStorage keys carried that name. A browser that used
 * the old build would otherwise lose its language choice and its scan and
 * deletion history on the first visit after the rename.
 */
const PREFIX = 'slack-history-manager:'
const LEGACY_PREFIX = 'slack-message-manager:'

/** Moves the old key's value to `key` once, unless `key` already has one. */
export function adoptLegacyKey(key: string): void {
  if (!key.startsWith(PREFIX)) return
  const legacy = LEGACY_PREFIX + key.slice(PREFIX.length)
  try {
    const value = localStorage.getItem(legacy)
    if (value === null) return
    if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    localStorage.removeItem(legacy)
  } catch {
    // Blocked storage: there is nothing to carry over either.
  }
}
