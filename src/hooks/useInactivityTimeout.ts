import { useEffect, useRef, useCallback } from "react";

interface UseInactivityTimeoutOptions {
  timeoutMs: number;
  warningMs?: number;
  onWarning?: () => void;
  onTimeout: () => void;
  enabled?: boolean;
}

export function useInactivityTimeout({
  timeoutMs,
  warningMs = 60000,
  onWarning,
  onTimeout,
  enabled = true,
}: UseInactivityTimeoutOptions) {
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningFiredRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
  }, []);

  const startTimers = useCallback(() => {
    clearTimers();
    warningFiredRef.current = false;

    const warningDelay = Math.max(timeoutMs - warningMs, 0);
    if (warningDelay > 0 && onWarning) {
      warningTimerRef.current = setTimeout(() => {
        warningFiredRef.current = true;
        onWarning();
      }, warningDelay);
    }

    timeoutTimerRef.current = setTimeout(() => {
      onTimeout();
    }, timeoutMs);
  }, [timeoutMs, warningMs, onWarning, onTimeout, clearTimers]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;

    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < 30000) return; // throttle 30s
      lastActivityRef.current = now;
      startTimers();
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, handleActivity, { passive: true }));

    // Start initial timers
    startTimers();

    return () => {
      events.forEach((e) => window.removeEventListener(e, handleActivity));
      clearTimers();
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [enabled, timeoutMs, startTimers, clearTimers]);
}
