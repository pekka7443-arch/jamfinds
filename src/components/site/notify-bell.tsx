"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

/**
 * "Notify me" bell (Task 15) — Web Push subscription flow.
 *
 * Toggle behavior, persisted per device in localStorage:
 *  - OFF: Notification.requestPermission() -> register /sw.js -> fetch the
 *    VAPID public key -> pushManager.subscribe -> POST /api/push/subscribe
 *  - ON:  pushManager.unsubscribe + DELETE /api/push/subscribe
 *
 * Only the endpoint is persisted locally; the server owns the subscription
 * row. The UI state survives reloads via localStorage and is re-verified
 * against the actual push subscription on mount.
 */

const LS_KEY = "jamfinds:push-endpoint";

type BellState = "unsupported" | "default" | "subscribed" | "denied";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

function readStoredEndpoint(): string | null {
  try {
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function storeEndpoint(endpoint: string | null) {
  try {
    if (endpoint) window.localStorage.setItem(LS_KEY, endpoint);
    else window.localStorage.removeItem(LS_KEY);
  } catch {
    // private mode etc. — subscription still works, persistence doesn't
  }
}

export function NotifyBell() {
  const [state, setState] = useState<BellState>("default");
  const [busy, setBusy] = useState(false);

  // Hydration-safe initial state: "default" on server, real state on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    // Trust localStorage first (fast), then reconcile with the real
    // subscription so a browser-side unsubscribe is reflected.
    const stored = readStoredEndpoint();
    if (!stored) {
      setState("default");
      return;
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (sub && sub.endpoint === stored) setState("subscribed");
        else {
          storeEndpoint(null);
          setState("default");
        }
      })
      .catch(() => setState("default"));
  }, []);

  const subscribe = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        toast({
          title: "Notifications blocked",
          description: "Your browser has blocked notifications for this site — re-enable them in site settings to get mod alerts.",
          variant: "destructive",
        });
        return;
      }
      const configRes = await fetch("/api/push/subscribe");
      const config = (await configRes.json()) as { publicKey: string | null };
      if (!config.publicKey) {
        toast({ title: "Push is not configured yet", description: "The server is missing VAPID keys — check back soon." });
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
      storeEndpoint(sub.endpoint);
      setState("subscribed");
      toast({
        title: "🔔 You'll be notified",
        description: "We'll ping you the moment new BeamNG mods drop — no refresh needed.",
      });
    } catch {
      toast({
        title: "Couldn't enable notifications",
        description: "Your browser or network blocked the push subscription. Try again later.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint ?? readStoredEndpoint();
      if (sub) await sub.unsubscribe();
      if (endpoint) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => {});
      }
      storeEndpoint(null);
      setState("default");
      toast({ title: "Notifications off", description: "You won't get mod alerts on this device anymore." });
    } catch {
      // even on failure, drop the local state so the UI stays honest
      storeEndpoint(null);
      setState("default");
    } finally {
      setBusy(false);
    }
  }, []);

  const onClick = useCallback(() => {
    if (busy) return;
    if (state === "subscribed") void unsubscribe();
    else if (state === "denied") {
      toast({
        title: "Notifications are blocked",
        description: "Click the lock icon in your address bar and allow notifications to subscribe.",
        variant: "destructive",
      });
    } else if (state === "unsupported") {
      toast({ title: "Not supported here", description: "This browser can't receive web push notifications." });
    } else void subscribe();
  }, [busy, state, subscribe, unsubscribe]);

  const subscribed = state === "subscribed";
  const label = subscribed ? "Notifications on — click to turn off" : "Notify me when new mods drop";

  return (
    <Button
      size="sm"
      variant={subscribed ? "outline" : "ghost"}
      onClick={onClick}
      disabled={busy}
      aria-pressed={subscribed}
      title={label}
      className={`relative h-11 gap-1.5 border-border sm:h-9 ${subscribed ? "border-primary/40 text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground"}`}
    >
      {subscribed ? (
        <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Bell className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{subscribed ? "On" : "Notify me"}</span>
      {subscribed && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />}
    </Button>
  );
}
