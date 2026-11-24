"use client";
import { useEffect, useState } from "react";
import { removePush, savePush } from "@/app/(panel)/actions";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type PushState = "yok" | "kapali" | "acik" | "engelli";

function b64ToUint8(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function Pwa({ push = false }: { push?: boolean }) {
  const [ev, setEv] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [state, setState] = useState<PushState>("yok");

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);

    const onPrompt = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent); };
    const onInstalled = () => setEv(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (push && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
      if (Notification.permission === "denied") setState("engelli");
      else {
        navigator.serviceWorker.ready
          .then((r) => r.pushManager.getSubscription())
          .then((sub) => setState(sub ? "acik" : "kapali"))
          .catch(() => {});
      }
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [push]);

  async function enable() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) { alert("Bildirim anahtarı (VAPID) tanımlı değil."); return; }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { setState(perm === "denied" ? "engelli" : "kapali"); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(key) });
    await savePush(JSON.parse(JSON.stringify(sub)));
    setState("acik");
  }

  async function disable() {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await removePush(sub.endpoint); await sub.unsubscribe(); }
    setState("kapali");
  }

  const btn = "rounded border border-gray-300 px-2 py-1 text-xs";
  return (
    <>
      {ev && <button type="button" className={btn} onClick={async () => { await ev.prompt(); setEv(null); }}>Uygulamayı yükle</button>}
      {!ev && ios && <span className="text-xs text-gray-500">Yüklemek için: Paylaş → Ana Ekrana Ekle</span>}
      {state === "kapali" && <button type="button" className={btn} onClick={enable}>Bildirimleri aç</button>}
      {state === "acik" && <button type="button" className={btn} onClick={disable}>Bildirimleri kapat</button>}
      {state === "engelli" && <span className="text-xs text-red-600">Bildirimler tarayıcıdan engellenmiş</span>}
    </>
  );
}
