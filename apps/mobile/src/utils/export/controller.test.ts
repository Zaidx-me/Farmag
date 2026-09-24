/**
 * Export controller tests (T39) — the `idle | exporting | done | error`
 * lifecycle, progress clamping, and listener notifications.
 */

import { describe, expect, it, vi } from 'vitest';

import { createExportController } from './controller';

describe('createExportController', () => {
  it('starts idle with zero progress and no error', () => {
    const controller = createExportController();
    expect(controller.getState()).toEqual({ status: 'idle', progress: 0, error: null });
  });

  it('start() transitions to exporting with progress reset to 0', () => {
    const controller = createExportController();
    controller.start();
    expect(controller.getState()).toEqual({ status: 'exporting', progress: 0, error: null });
  });

  it('reportProgress updates progress and clamps to 0..1', () => {
    const controller = createExportController();
    controller.start();
    controller.reportProgress(0.4);
    expect(controller.getState().progress).toBe(0.4);
    controller.reportProgress(-1);
    expect(controller.getState().progress).toBe(0);
    controller.reportProgress(2);
    expect(controller.getState().progress).toBe(1);
  });

  it('reportProgress is ignored outside the exporting state', () => {
    const controller = createExportController();
    controller.reportProgress(0.5);
    expect(controller.getState().progress).toBe(0);
    controller.succeed();
    controller.reportProgress(0.5);
    expect(controller.getState().progress).toBe(1);
  });

  it('succeed() transitions to done with progress 1', () => {
    const controller = createExportController();
    controller.start();
    controller.reportProgress(0.7);
    controller.succeed();
    expect(controller.getState()).toEqual({ status: 'done', progress: 1, error: null });
  });

  it('fail() transitions to error, keeping progress and recording the message', () => {
    const controller = createExportController();
    controller.start();
    controller.reportProgress(0.5);
    controller.fail('disk full');
    expect(controller.getState()).toEqual({ status: 'error', progress: 0.5, error: 'disk full' });
  });

  it('reset() returns to idle', () => {
    const controller = createExportController();
    controller.start();
    controller.fail('boom');
    controller.reset();
    expect(controller.getState()).toEqual({ status: 'idle', progress: 0, error: null });
  });

  it('notifies subscribers on every transition and unsubscribes cleanly', () => {
    const controller = createExportController();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.start();
    controller.reportProgress(0.5);
    controller.succeed();
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener.mock.calls[2][0]).toEqual({ status: 'done', progress: 1, error: null });

    unsubscribe();
    controller.reset();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('getState returns a snapshot, not a live reference', () => {
    const controller = createExportController();
    const snapshot = controller.getState();
    controller.start();
    expect(snapshot.status).toBe('idle');
    expect(controller.getState().status).toBe('exporting');
  });
});