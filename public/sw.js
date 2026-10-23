/*
 * JamFinds service worker — Web Push delivery (Task 15).
 *
 *  push                -> show "new mods just dropped" notification
 *  notificationclick   -> focus an existing window or open /mod/[id]
 *
 * The payload is produced by the sync engine (src/lib/sync.ts fanOutPush):
 *   { title: string, body?: string, url: string }
 * `url` may be relative — it is resolved against the SW origin, so the
 * notification always lands on this deployment, never a hardcoded host.
 */

const NOTIFICATION_TAG = "jamfinds-new-mods";
const ICON = "/logo.svg";

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
    data = { title: "JamFinds", body: event.data ? event.data.text() : "New BeamNG mods just dropped", url: "/" };
  }

  const title = typeof data.title === "string" && data.title ? data.title : "🔥 New BeamNG mods just dropped";
  const body = typeof data.body === "string" ? data.body : "Fresh finds are live on JamFinds";
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
