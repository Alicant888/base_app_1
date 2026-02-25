"use client";

import { useEffect, useRef, useState } from "react";

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const [status, setStatus] = useState<"loading" | "running" | "error">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setStatus("loading");
    setErrorText(null);

    const root = document.documentElement;
    const body = document.body;

    const prevHtmlOverflow = root.style.overflow;
    const prevHtmlOverscroll = root.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyTouchAction = body.style.touchAction;

    // Prevent the WebView/page from scrolling or overscrolling during gameplay.
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.touchAction = "none";

    const preventTouchMove = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    container.addEventListener("touchmove", preventTouchMove, { passive: false });

    const reportError = (error: unknown) => {
      const message =
        error instanceof Error
          ? error.stack || error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error);
      setErrorText(message);
      setStatus("error");
    };

    const onWindowError = (event: ErrorEvent) => reportError(event.error ?? event.message);
    const onUnhandledRejection = (event: PromiseRejectionEvent) => reportError(event.reason);
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    let disposed = false;
    let detachVisibility: (() => void) | null = null;

    (async () => {
      try {
        // IMPORTANT: Phaser must never be imported during SSR.
        // Next.js can evaluate client components on the server, but `useEffect` runs only on the client.
        const [{ createGame }, { attachVisibilityHandlers }] = await Promise.all([
          import("@/src/game/Game"),
          import("@/src/platform"),
        ]);

        if (disposed) return;
        if (gameRef.current) return;

        const game = createGame(container);
        gameRef.current = game;
        detachVisibility = attachVisibilityHandlers(game);
        setStatus("running");
      } catch (error) {
        if (disposed) return;
        reportError(error);
      }
    })();

    return () => {
      disposed = true;
      detachVisibility?.();
      detachVisibility = null;

      container.removeEventListener("touchmove", preventTouchMove);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);

      root.style.overflow = prevHtmlOverflow;
      root.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevBodyTouchAction;

      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          inset: 0,
          width: "100dvw",
          height: "100dvh",
          paddingTop: "env(safe-area-inset-top)",
          boxSizing: "border-box",
          overflow: "hidden",
          background: "#000",
          touchAction: "none",
        }}
      />

      {status !== "running" ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            padding: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.92)",
            color: "#fff",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            zIndex: 1000,
          }}
        >
          <div style={{ maxWidth: 520, width: "100%" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              {status === "loading" ? "Loading game…" : "Game failed to start"}
            </div>
            {errorText ? (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 12,
                  opacity: 0.9,
                  marginBottom: 12,
                }}
              >
                {errorText}
              </pre>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 12 }}>
                If this screen persists, try reloading.
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                }}
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem("space_shooter_save");
                    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
                      const key = localStorage.key(i);
                      if (key && key.startsWith("wagmi.")) localStorage.removeItem(key);
                    }
                  } catch {
                    // ignore
                  }
                  window.location.reload();
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                }}
              >
                Reset & Reload
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

