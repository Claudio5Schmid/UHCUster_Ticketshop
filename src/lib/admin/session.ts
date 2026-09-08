/**
 * How long an admin session survives without any interaction.
 *
 * The same number has to be set in three places, and they are not
 * interchangeable:
 *
 *  1. here - the in-browser countdown, which signs the admin out of an open tab
 *     and revokes the session server-side through the existing logout action;
 *  2. `supabase/config.toml` `[auth.sessions] inactivity_timeout`, which only
 *     governs a locally-run Supabase stack;
 *  3. the hosted project's Authentication → Sessions setting, which is the only
 *     one that still applies once the browser has been closed and no countdown
 *     is running. See docs/OPERATIONS.md.
 *
 * (1) is what an admin actually experiences; (3) is what closes the hole (1)
 * cannot reach. Neither replaces the other.
 */
export const ADMIN_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

/** How far ahead of the timeout the "still there?" warning appears. */
export const ADMIN_INACTIVITY_WARNING_MS = 5 * 60 * 1000;
