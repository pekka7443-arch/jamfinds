/*
 * JamFinds service worker — Web Push delivery (Task 15, i18n Task 16).
 *
 *  push                -> show "new mods just dropped" notification
 *  notificationclick   -> focus an existing window or open /mod/[id]
 *
 * The payload is produced by the sync engine (src/lib/sync.ts fanOutPush).
 * Since Task 16 the payload carries every supported language and the SW
 * picks the best match for this browser:
 *   { title: {en,fi,de,fr,es,ru}, body: {en,fi,de,fr,es,ru}, url: string }
 * Plain-string title/body (pre-i18n payloads) still work. `url` may be
 * relative — it is resolved against the SW origin, so the notification
 * always lands on this deployment, never a hardcoded host.
 */

const NOTIFICATION_TAG = "jamfinds-new-mods";
const ICON = "/logo.svg";

/* Localized fallbacks for missing/corrupt payloads — mirrors the strings
 * in src/lib/sync.ts (SW files cannot import TS modules). */
const FALLBACK_TEXT = {
  en: { title: "🔥 New BeamNG mods just dropped", body: "Fresh finds are live on JamFinds" },
  fi: { title: "🔥 Uusia BeamNG-modeja saatavilla", body: "Tuoreimmat löydöt ovat nyt JamFindsissa" },
  de: { title: "🔥 Neue BeamNG-Mods sind da", body: "Frische Funde sind jetzt auf JamFinds" },
  fr: { title: "🔥 De nouveaux mods BeamNG sont arrivés", body: "Les dernières trouvailles sont en ligne sur JamFinds" },
  es: { title: "🔥 Hay mods nuevos de BeamNG", body: "Los hallazgos más recientes ya están en JamFinds" },
  ru: { title: "🔥 Новые моды для BeamNG уже здесь", body: "Свежие находки уже на JamFinds" },
};

/** Best language match for this browser from a localized map or string. */
function pickText(map, fallback) {
  if (typeof map === "string" && map) return map;
  if (map && typeof map === "object") {
    const langs = (self.navigator && self.navigator.languages) || [];
    for (const lang of langs) {
      const base = String(lang).toLowerCase().split("-")[0];
      if (map[base]) return map[base];
    }
    return map.en || Object.values(map)[0] || fallback;
  }
  return fallback;
}

function fallbackText() {
  const langs = (self.navigator && self.navigator.languages) || [];
  for (const lang of langs) {
    const base = String(lang).toLowerCase().split("-")[0];
    if (FALLBACK_TEXT[base]) return FALLBACK_TEXT[base];
  }
  return FALLBACK_TEXT.en;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const fb = fallbackText();
  const title = pickText(data.title, fb.title);
  const body = pickText(data.body, fb.body);
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: ICON,
      badge: ICON,
      tag: NOTIFICATION_TAG, // collapse bursts into one notification
      renotify: false,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const targetPath = new URL(target, self.location.origin).pathname;

      // Focus an already-open JamFinds tab on the target path first.
      for (const client of clientList) {
        if (new URL(client.url).pathname === targetPath && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise focus any open tab and navigate it.
      for (const client of clientList) {
        if ("focus" in client && "navigate" in client) {
          await client.focus();
          return client.navigate(target);
        }
      }
      // Last resort: open a new window.
      return self.clients.openWindow(target);
    })(),
  );
});
