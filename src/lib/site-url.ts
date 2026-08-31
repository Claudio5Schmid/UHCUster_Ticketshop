/**
 * The shop's own absolute base URL, for the handful of places that cannot use a
 * relative path: the order link in the confirmation email, and the one the admin
 * copies into an invoice mail. Everything else in the app links relatively.
 *
 * NEXT_PUBLIC_SITE_URL wins when set. Otherwise Vercel's *production* URL - never
 * VERCEL_URL, which is the per-deployment preview hostname and would bake a link
 * into an email that dies with the next deploy.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  return "http://localhost:3000";
}
