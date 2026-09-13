import { useCallback, useEffect, useState } from "react";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "@/lib/firebase";

const TOPIC = "aeris-alerts";

/**
 * Optional browser-push notifications via FCM.
 * Needs VITE_FIREBASE_VAPID_KEY and the service worker in /public.
 * Never throws — degrades to "unsupported" so the dashboard still runs.
 */
export interface PushState {
  supported: boolean;
  enabled: boolean;
  busy: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [vapidKey] = useState(() => import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "");
  const [state, setState] = useState<PushState>({
    supported: false,
    enabled: false,
    busy: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!app || !vapidKey) return;
      try {
        const ok = await isSupported();
        if (cancelled) return;
        setState((s) => ({ ...s, supported: ok }));
      } catch {
        setState((s) => ({ ...s, supported: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  const subscribe = useCallback(
    async (): Promise<boolean> => {
      if (!app) return false;
      try {
        const messaging = getMessaging(app);
        const sw = await navigator.serviceWorker.register(
          "/firebase-messaging-sw.js"
        );
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: sw,
        });
        const functions = getFunctions(app);
        const callable = httpsCallable<{ token: string; topic: string }, unknown>(
          functions,
          "subscribeToTopic"
        );
        await callable({ token, topic: TOPIC });
        setState({ supported: true, enabled: true, busy: false, error: null });
        return true;
      } catch (err) {
        setState((s) => ({
          ...s,
          busy: false,
          error: String((err as Error)?.message ?? err ?? "permission denied"),
        }));
        return false;
      }
    },
    [vapidKey]
  );

  const unsubscribe = useCallback(async () => {
    if (!app) return;
    try {
      const messaging = getMessaging(app);
      const token = (await getToken(messaging, {
        vapidKey,
      })) as string | null;
      if (token) {
        const functions = getFunctions(app);
        const callable = httpsCallable<
          { token: string; topic: string },
          unknown
        >(functions, "unsubscribeFromTopic");
        await callable({ token, topic: TOPIC });
      }
      setState((s) => ({ ...s, enabled: false, busy: false }));
    } catch {
      setState((s) => ({ ...s, busy: false }));
    }
  }, [vapidKey]);

  const toggle = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    if (state.enabled) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }, [state.enabled, subscribe, unsubscribe]);

  return { ...state, toggle, topic: TOPIC };
}