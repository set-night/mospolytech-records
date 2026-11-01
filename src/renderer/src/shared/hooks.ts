import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventName, Events } from '@shared/api';
import type { RecorderStatus, ScheduleState, Settings } from '@shared/types';

export function useEvent<E extends EventName>(event: E, listener: (payload: Events[E]) => void): void {
  const ref = useRef(listener);
  useEffect(() => {
    ref.current = listener;
  });
  useEffect(() => window.api.on(event, (payload) => ref.current(payload)), [event]);
}

/** Initial value from an API call, then kept fresh by a pushed event. */
function useLive<E extends EventName>(event: E, load: () => Promise<Events[E]>): Events[E] | null {
  const [value, setValue] = useState<Events[E] | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((initial) => alive && setValue((current) => current ?? initial));
    return () => { alive = false; };
    // `load` is a stable API method.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEvent(event, setValue);
  return value;
}

export const useSettings = (): Settings | null => useLive('settings', () => window.api.getSettings());
export const useSchedule = (): ScheduleState | null => useLive('schedule', () => window.api.getSchedule());
export const useStatus = (): RecorderStatus | null => useLive('status', () => window.api.getStatus());

/** Re-renders every `ms`; returns the current time. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

/** Runs an action, exposing `busy` and a readable error for the UI. */
export function useAction<A extends unknown[]>(action: (...args: A) => Promise<unknown>): {
  run: (...args: A) => Promise<void>;
  busy: boolean;
  error: string | null;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (...args: A) => {
    setBusy(true);
    setError(null);
    try {
      await action(...args);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }, [action]);
  return { run, busy, error };
}

/** IPC wraps errors as "Error invoking remote method 'x': Error: text". */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '');
}
