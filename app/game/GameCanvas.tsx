"use client";

import { useEffect, useRef, useState } from "react";

type GameRenderer = "auto" | "canvas" | "webgl";
type GameAudioMode = "auto" | "html5" | "noaudio";

const RENDERER_STORAGE_KEY = "phaser.renderer";
const AUDIO_MODE_STORAGE_KEY = "phaser.audioMode";

function toErrorString(error: unknown): string {
  if (error instanceof Error) return error.stack || error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function looksLikeWebglStartupFailure(message: string): boolean {
  return /webgl|framebuffer|createframebuffer|createresource/i.test(message);
}

function looksLikeAudioStartupFailure(message: string): boolean {
  return /failed to start the audio device|failed to construct .*audiocontext|audiocontext was not allowed to start/i.test(message);
}

function looksLikeNonFatalLifecycleError(message: string): boolean {
  // iOS WebViews may fail AudioContext suspend/resume across background/foreground transitions.
  // Those errors are noisy but usually non-fatal for gameplay and should not trigger a fatal overlay.
  return /(?:resume|suspend)@\[[^\]]*native code[^\]]*\]|notallowederror|audiocontext/i.test(message);
}

function getRequestedRenderer(): GameRenderer | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const renderer = params.get("renderer")?.toLowerCase();
    if (renderer === "canvas" || renderer === "webgl" || renderer === "auto") return renderer;
  } catch {
    // ignore
  }
  return null;
}

function getRequestedAudioMode(): GameAudioMode | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("audio")?.toLowerCase();
    if (mode === "auto" || mode === "html5" || mode === "noaudio") return mode;
  } catch {
    // ignore
  }
  return null;
}

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "running" | "error">("loading");
  const [attemptText, setAttemptText] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setStatus("loading");
    setAttemptText(null);

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
    let retryTimer: number | null = null;
    let startupDeadline = 0;
    let runId = 0;
    let attempt = 0;
    let currentRenderer: GameRenderer = "auto";
    let currentAudioMode: GameAudioMode = "auto";
    let internalStatus: "loading" | "running" | "error" = "loading";
    let lastFatalError = "";
    let loggedNonFatalResumeIssue = false;

    const destroyGame = () => {
      detachVisibility?.();
      detachVisibility = null;

      if (gameRef.current) {
        try {
          gameRef.current.destroy(true);
        } catch {
          // ignore
        }
        gameRef.current = null;
      }
    };

    const scheduleStart = (nextRenderer: GameRenderer, nextAudioMode: GameAudioMode, delayMs: number) => {
      if (disposed) return;
      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void start(nextRenderer, nextAudioMode);
      }, delayMs);
    };

    const reportError = (error: unknown) => {
      destroyGame();

      const message = toErrorString(error);
      const duringStartup = performance.now() < startupDeadline;
      const canRetry = duringStartup && attempt < 3;

      if (canRetry) {
        const webglish = looksLikeWebglStartupFailure(message);
        const audioStartupFailure = looksLikeAudioStartupFailure(message);

        // If WebGL init is flaky on iOS WebViews, fall back to Canvas after one failed auto attempt.
        if (webglish && currentRenderer !== "canvas") {
          try {
            sessionStorage.setItem(RENDERER_STORAGE_KEY, "canvas");
          } catch {
            // ignore
          }
          setAttemptText(`Retrying with Canvas (attempt ${attempt + 1}/3)...`);
          internalStatus = "loading";
          setStatus("loading");
          scheduleStart("canvas", currentAudioMode, 350);
          return;
        }

        if (audioStartupFailure && currentAudioMode !== "noaudio") {
          const nextAudioMode: GameAudioMode = currentAudioMode === "auto" ? "html5" : "noaudio";
          const retryLabel = nextAudioMode === "html5" ? "HTML5 audio" : "audio disabled";
          try {
            sessionStorage.setItem(AUDIO_MODE_STORAGE_KEY, nextAudioMode);
          } catch {
            // ignore
          }
          setAttemptText(`Retrying with ${retryLabel} (attempt ${attempt + 1}/3)...`);
          internalStatus = "loading";
          setStatus("loading");
          scheduleStart(currentRenderer, nextAudioMode, 350);
          return;
        }

        setAttemptText(`Retrying (attempt ${attempt + 1}/3)...`);
        internalStatus = "loading";
        setStatus("loading");
        scheduleStart(currentRenderer, currentAudioMode, 350);
        return;
      }

      lastFatalError = message;
      setAttemptText(null);
      internalStatus = "error";
      setStatus("error");
    };

    const recordVisible = () => {
      // If the game crashed while backgrounded, try to restart automatically on restore.
      if (!disposed && !gameRef.current && internalStatus === "error") {
        scheduleStart(currentRenderer, currentAudioMode, 0);
      }
    };

    const onVisibilityForRecovery = () => {
      if (!document.hidden) recordVisible();
    };

    document.addEventListener("visibilitychange", onVisibilityForRecovery, { passive: true });
    window.addEventListener("focus", recordVisible, { passive: true });
    window.addEventListener("pageshow", recordVisible, { passive: true });

    const shouldIgnoreLifecycleError = (error: unknown): boolean => {
      const message = toErrorString(error);
      return looksLikeNonFatalLifecycleError(message);
    };

    const onWindowError = (event: ErrorEvent) => {
      const error = event.error ?? event.message;
      if (shouldIgnoreLifecycleError(error)) {
        try {
          event.preventDefault();
        } catch {
          // ignore
        }
        if (!loggedNonFatalResumeIssue && process.env.NODE_ENV !== "production") {
          loggedNonFatalResumeIssue = true;
          console.warn("Ignored non-fatal lifecycle error:", error);
        }
        return;
      }
      reportError(error);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (shouldIgnoreLifecycleError(event.reason)) {
        try {
          event.preventDefault();
        } catch {
          // ignore
        }
        if (!loggedNonFatalResumeIssue && process.env.NODE_ENV !== "production") {
          loggedNonFatalResumeIssue = true;
          console.warn("Ignored non-fatal lifecycle rejection:", event.reason);
        }
        return;
      }
      reportError(event.reason);
    };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    const waitForVisible = async (timeoutMs: number) => {
      if (!document.hidden) return;

      await new Promise<void>((resolve) => {
        let timer: number | null = null;

        const cleanup = () => {
          if (timer) window.clearTimeout(timer);
          document.removeEventListener("visibilitychange", onChange);
        };

        const onChange = () => {
          if (document.hidden) return;
          cleanup();
          resolve();
        };

        document.addEventListener("visibilitychange", onChange, { passive: true });
        timer = window.setTimeout(() => {
          cleanup();
          resolve();
        }, timeoutMs);
      });
    };

    const waitForNonZeroSize = async (timeoutMs: number) => {
      const deadline = performance.now() + timeoutMs;
      while (!disposed && performance.now() < deadline) {
        const rect = container.getBoundingClientRect();
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        if (width > 0 && height > 0) {
          // Give layout 1 extra frame to settle in WKWebView.
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          return;
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    };

    const requestResume = () => {
      if (disposed) return;
      const nextAudioMode: GameAudioMode = looksLikeAudioStartupFailure(lastFatalError)
        ? "noaudio"
        : currentAudioMode;
      if (nextAudioMode !== currentAudioMode) {
        try {
          sessionStorage.setItem(AUDIO_MODE_STORAGE_KEY, nextAudioMode);
        } catch {
          // ignore
        }
      }
      setAttemptText("Resuming...");
      internalStatus = "loading";
      setStatus("loading");
      scheduleStart(currentRenderer, nextAudioMode, 0);
    };

    const start = async (renderer: GameRenderer, audioMode: GameAudioMode) => {
      const myRunId = (runId += 1);
      attempt += 1;
      currentRenderer = renderer;
      currentAudioMode = audioMode;
      startupDeadline = performance.now() + 2500;
      lastFatalError = "";

      setAttemptText(`Starting (${renderer}, ${audioMode}, attempt ${attempt}/3)...`);
      internalStatus = "loading";
      setStatus("loading");

      destroyGame();

      try {
        await waitForVisible(1500);
        await waitForNonZeroSize(1500);

        // IMPORTANT: Phaser must never be imported during SSR.
        // Next.js can evaluate client components on the server, but `useEffect` runs only on the client.
        const [{ createGame }, { attachVisibilityHandlers }] = await Promise.all([
          import("@/src/game/Game"),
          import("@/src/platform"),
        ]);

        if (disposed || myRunId !== runId) return;
        if (gameRef.current) return;

        const game = createGame(container, { renderer, audioMode });

        if (disposed || myRunId !== runId) {
          try {
            game.destroy(true);
          } catch {
            // ignore
          }
          return;
        }

        gameRef.current = game;
        detachVisibility = attachVisibilityHandlers(game);
        setAttemptText(null);
        lastFatalError = "";
        internalStatus = "running";
        setStatus("running");
      } catch (error) {
        if (disposed || myRunId !== runId) return;
        reportError(error);
      }
    };

    resumeRef.current = requestResume;

    const requestedRenderer = getRequestedRenderer();
    if (requestedRenderer) {
      try {
        if (requestedRenderer === "auto") sessionStorage.removeItem(RENDERER_STORAGE_KEY);
        else sessionStorage.setItem(RENDERER_STORAGE_KEY, requestedRenderer);
      } catch {
        // ignore
      }
    }

    const requestedAudioMode = getRequestedAudioMode();
    if (requestedAudioMode) {
      try {
        if (requestedAudioMode === "auto") sessionStorage.removeItem(AUDIO_MODE_STORAGE_KEY);
        else sessionStorage.setItem(AUDIO_MODE_STORAGE_KEY, requestedAudioMode);
      } catch {
        // ignore
      }
    }

    let initialRenderer: GameRenderer = "auto";
    let initialAudioMode: GameAudioMode = "auto";
    try {
      const stored = sessionStorage.getItem(RENDERER_STORAGE_KEY);
      if (stored === "canvas" || stored === "webgl") initialRenderer = stored;

      const storedAudio = sessionStorage.getItem(AUDIO_MODE_STORAGE_KEY);
      if (storedAudio === "html5" || storedAudio === "noaudio") initialAudioMode = storedAudio;
    } catch {
      // ignore
    }
    if (requestedRenderer) initialRenderer = requestedRenderer;
    if (requestedAudioMode) initialAudioMode = requestedAudioMode;

    void start(initialRenderer, initialAudioMode);

    return () => {
      disposed = true;
      resumeRef.current = null;

      if (retryTimer) window.clearTimeout(retryTimer);
      retryTimer = null;

      destroyGame();

      container.removeEventListener("touchmove", preventTouchMove);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      document.removeEventListener("visibilitychange", onVisibilityForRecovery);
      window.removeEventListener("focus", recordVisible);
      window.removeEventListener("pageshow", recordVisible);

      root.style.overflow = prevHtmlOverflow;
      root.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.touchAction = prevBodyTouchAction;
    };
  }, []);

  const onResume = () => {
    resumeRef.current?.();
  };

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
          onClick={status === "error" ? onResume : undefined}
          onTouchEnd={status === "error" ? onResume : undefined}
          role={status === "error" ? "button" : undefined}
          tabIndex={status === "error" ? 0 : undefined}
          onKeyDown={
            status === "error"
              ? (event) => {
                  if (event.key === "Enter" || event.key === " ") onResume();
                }
              : undefined
          }
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#000",
            color: "#fff",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            zIndex: 1000,
            userSelect: "none",
          }}
        >
          <div style={{ textAlign: "center", padding: "16px" }}>
            {attemptText ? (
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>{attemptText}</div>
            ) : null}
            {status === "loading" ? (
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.08em" }}>LOADING...</div>
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "0.12em", color: "#00e8ff" }}>
                  TAP TO RESUME
                </div>
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75, letterSpacing: "0.14em" }}>RESUME</div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

