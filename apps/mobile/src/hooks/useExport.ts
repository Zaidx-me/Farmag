/**
 * useExport (T39) — React wrapper around the pure export state machine
 * (`utils/export/controller.ts`). Exposes `idle | exporting | done | error`
 * status plus a 0..1 progress value. The `run` routine is injected so the
 * hook stays thin and the state machine stays fully unit-tested.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createExportController,
  type ExportState,
  type ExportStatus,
} from '../utils/export/controller';

export type { ExportStatus } from '../utils/export/controller';

export interface UseExportOptions {
  /** Async export routine; receives an onProgress callback (0..1). */
  run: (onProgress: (fraction: number) => void) => Promise<void>;
}

export interface UseExportResult extends ExportState {
  /** Kick off the export; resolves when it finishes (done or error). */
  start: () => Promise<void>;
  /** Return to idle (clears done/error state). */
  reset: () => void;
}

export function useExport({ run }: UseExportOptions): UseExportResult {
  const controllerRef = useRef<ReturnType<typeof createExportController> | null>(null);
  if (controllerRef.current === null) controllerRef.current = createExportController();
  const controller = controllerRef.current;

  const [state, setState] = useState<ExportState>(controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);

  const start = useCallback(async () => {
    controller.start();
    try {
      await run(controller.reportProgress);
      controller.succeed();
    } catch (error) {
      controller.fail(error instanceof Error ? error.message : 'Export failed');
    }
  }, [controller, run]);

  const reset = useCallback(() => controller.reset(), [controller]);

  return { ...state, start, reset };
}