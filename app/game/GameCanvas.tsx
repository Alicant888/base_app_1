"use client";

import { useEffect, useRef } from "react";

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

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

    let disposed = false;
    let detachVisibility: (() => void) | null = null;

    (async () => {
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
    })();

    return () => {
      disposed = true;
      detachVisibility?.();
      detachVisibility = null;

      container.removeEventListener("touchmove", preventTouchMove);

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
  );
}

