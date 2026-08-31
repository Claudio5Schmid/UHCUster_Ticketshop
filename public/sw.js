// Minimal app-shell cache for the scanner PWA only - the actual ticket
// validation never depends on the network once the initial ticket set is
// downloaded (see src/lib/scanner/), this just keeps the page itself loadable
// on a second launch with poor or no connectivity at the venue.
// v2: the icon set was renamed to /icons/uhc-uster-*, so already-installed
// scanners must drop the old shell cache instead of serving 404s from it.
const CACHE_NAME = "uhc-scanner-shell-v2";
const SHELL_URLS = [
  "/scanner",
  "/scanner/scan",
  "/manifest.json",
  "/icons/uhc-uster-192.png",
  "/icons/uhc-uster-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (!url.pathname.startsWith("/scanner") && !SHELL_URLS.includes(url.pathname)) {
    return; // only the scanner app shell is handled here - everything else passes through
  }
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
