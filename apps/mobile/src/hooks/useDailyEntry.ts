import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

import { repositories } from '@/src/database/repositories';
import { useBatch, useDailyRecords } from '@/src/features/daily-entry/queries';
import {
  buildLocalDailyRecord,
  buildSyncPayload,
  resolveOperationType,
  todayISO,
  yesterdayISO,
} from '@/src/features/daily-entry/record';
import {
  dailyEntrySchema,
  normalizeDailyEntry,
  type DailyEntryInput,
} from '@/src/features/daily-entry/schema';
import { enqueueLocal, getDb } from '@/src/services/sync';
import { useAuthStore } from '@/src/store/auth-store';

export interface DailyEntryHints {
  feed: string | null;
  weight: string | null;
  humidity: string | null;
}

/**
 * Daily-entry form wiring: loads the batch + its records, pre-fills the form
 * from today's existing record (or the batch), exposes yesterday's values as
 * hints, enforces the mortality guard inline, and saves via local upsert +
 * `enqueueLocal` (CREATE/UPDATE) with optimistic navigation back.
 */
export function useDailyEntry(batchId: string) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: batch, isLoading: batchLoading, error: batchError, refetch: refetchBatch } =
    useBatch(batchId);
  const { data: records, isLoading: recordsLoading } = useDailyRecords(batchId);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const today = todayISO();
  const yesterday = yesterdayISO();

  const existingToday = useMemo(
    () => records?.find((record) => record.recordDate === today) ?? null,
    [records, today],
  );
  const latestRecord = useMemo(() => records?.[0] ?? null, [records]);

  const hints: DailyEntryHints = useMemo(
    () => ({
      feed: latestRecord?.feedConsumedKg ?? null,
      weight: latestRecord?.averageWeightKg ?? null,
      humidity: latestRecord?.humidityPercent ?? null,
    }),
    [latestRecord],
  );

  const form = useForm<DailyEntryInput>({
    resolver: zodResolver(dailyEntrySchema),
    defaultValues: {
      recordDate: today,
      birdsAtStart: 0,
      mortality: 0,
      feedConsumedKg: '',
      averageWeightKg: '',
      humidityPercent: '',
      notes: '',
    },
  });

  // Once batch + records settle, prefill from today's record (or the batch).
  useEffect(() => {
    if (batchLoading || recordsLoading) return;
    const birdsAtStart =
      existingToday?.birdsAtStart ?? latestRecord?.birdsRemaining ?? batch?.initialBirds ?? 0;
    form.reset({
      recordDate: today,
      birdsAtStart,
      mortality: existingToday?.mortality ?? 0,
      feedConsumedKg: existingToday?.feedConsumedKg ?? '',
      averageWeightKg: existingToday?.averageWeightKg ?? '',
      humidityPercent: existingToday?.humidityPercent ?? '',
      notes: existingToday?.notes ?? '',
    });
  }, [batch, batchLoading, existingToday, form, latestRecord, recordsLoading, today]);

  const mortalityValue = Number(form.watch('mortality'));
  const birdsAtStartValue = Number(form.watch('birdsAtStart'));
  const mortalityError =
    Number.isFinite(mortalityValue) &&
    Number.isFinite(birdsAtStartValue) &&
    mortalityValue > birdsAtStartValue
      ? 'Mortality cannot exceed birds at start'
      : null;

  const save = useCallback(async () => {
    const result = dailyEntrySchema.safeParse(form.getValues());
    if (!result.success) {
      void form.trigger();
      return;
    }
    if (result.data.mortality > result.data.birdsAtStart) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const values = normalizeDailyEntry(result.data);
      const db = await getDb();
      const id = existingToday?.id ?? crypto.randomUUID();
      const row = buildLocalDailyRecord({
        id,
        batchId,
        values,
        createdBy: user?.id ?? '',
      });
      await repositories.upsertRecord(db, 'daily_records', row);
      await enqueueLocal({
        entity: 'dailyRecord',
        entityId: id,
        payload: buildSyncPayload(batchId, values),
        operationType: resolveOperationType(existingToday),
      });
      router.back();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save the daily record');
    } finally {
      setIsSaving(false);
    }
  }, [batchId, existingToday, form, router, user?.id]);

  return {
    form,
    batch,
    isLoading: batchLoading || recordsLoading,
    error: batchError,
    refetch: refetchBatch,
    hints,
    mortalityError,
    isSaving,
    saveError,
    save,
    today,
    yesterday,
    existingToday,
  };
}