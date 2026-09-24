/**
 * Export state machine (T39) — a tiny observable controller for the
 * `idle | exporting | done | error` lifecycle plus a 0..1 progress value.
 * Pure and framework-free so vitest can exercise every transition without
 * React; `hooks/useExport.ts` is a thin React wrapper around it.
 */

export type ExportStatus = 'idle' | 'exporting' | 'done' | 'error';

export interface ExportState {
  status: ExportStatus;
  /** 0..1 fraction of the export completed. */
  progress: number;
  /** Human-readable failure message when status === 'error'. */
  error: string | null;
}

export interface ExportController {
  start(): void;
  reportProgress(fraction: number): void;
  succeed(): void;
  fail(message: string): void;
  reset(): void;
  getState(): ExportState;
  subscribe(listener: (state: ExportState) => void): () => void;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function createExportController(): ExportController {
  let state: ExportState = { status: 'idle', progress: 0, error: null };
  const listeners = new Set<(state: ExportState) => void>();

  const emit = (): void => {
    for (const listener of listeners) listener(state);
  };

  return {
    start(): void {
      state = { status: 'exporting', progress: 0, error: null };
      emit();
    },
    reportProgress(fraction: number): void {
      if (state.status !== 'exporting') return;
      state = { ...state, progress: clamp01(fraction) };
      emit();
    },
    succeed(): void {
      state = { status: 'done', progress: 1, error: null };
      emit();
    },
    fail(message: string): void {
      state = { status: 'error', progress: state.progress, error: message };
      emit();
    },
    reset(): void {
      state = { status: 'idle', progress: 0, error: null };
      emit();
    },
    getState(): ExportState {
      return { ...state };
    },
    subscribe(listener: (state: ExportState) => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}