import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, Text, View } from 'react-native';

import type { Batch, Medicine, Vaccination } from '@poultry/shared-types';
import { medicinePurchaseSchema, medicineUseSchema } from '@poultry/validation';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  OfflineBanner,
  ScreenState,
  Select,
  type BadgeTone,
} from '@/src/components/ui';
import { useBatches, useFarms } from '@/src/features/daily-entry/queries';
import { useMedicineActions } from '@/src/features/health/actions';
import { useMedicines } from '@/src/features/health/queries';
import {
  expiryBadgeTone,
  expiryLabel,
  stockBadgeTone,
} from '@/src/features/health/stock';
import { useVaccinationActions } from '@/src/features/vaccinations/actions';
import { useVaccinations } from '@/src/features/vaccinations/queries';
import { useSync } from '@/src/hooks/useSync';

type HealthView = 'MEDICINES' | 'VACCINATIONS';

const VACCINATION_TONE: Record<string, BadgeTone> = {
  UPCOMING: 'amber',
  COMPLETED: 'green',
  MISSED: 'red',
};

export default function HealthScreen() {
  const { pendingCount, refresh } = useSync();
  const [view, setView] = useState<HealthView>('MEDICINES');
  const { data: farms, isLoading: farmsLoading, error: farmsError, refetch: refetchFarms } =
    useFarms();
  const [farmId, setFarmId] = useState<string | null>(null);

  useEffect(() => {
    if (farmId === null && farms !== undefined && farms.length > 0) {
      setFarmId(farms[0].id);
    }
  }, [farmId, farms]);

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">Health</Text>
        <Select
          className="mt-3"
          options={[
            { label: 'Medicines', value: 'MEDICINES' },
            { label: 'Vaccinations', value: 'VACCINATIONS' },
          ]}
          value={view}
          onChange={setView}
        />
        {farms !== undefined && farms.length > 1 ? (
          <Select
            className="mt-3"
            options={farms.map((farm) => ({ label: farm.name, value: farm.id }))}
            value={farmId ?? ''}
            onChange={(value) => setFarmId(value)}
          />
        ) : null}
      </View>
      <ScreenState
        loading={farmsLoading}
        error={farmsError?.message ?? null}
        retry={() => void refetchFarms()}
        empty={!farmsLoading && farms !== undefined && farms.length === 0}
        emptyTitle="No farms yet"
        emptyMessage="Create a farm to start tracking health."
      >
        {view === 'MEDICINES' ? (
          <MedicinesView farmId={farmId} />
        ) : (
          <VaccinationsView farmId={farmId} />
        )}
      </ScreenState>
    </View>
  );
}

function MedicinesView({ farmId }: { farmId: string | null }) {
  const { data: medicines, isLoading, error, refetch, isRefetching } = useMedicines(farmId);
  const { data: batches } = useBatches(farmId);

  return (
    <ScreenState
      loading={farmId !== null && isLoading}
      error={error?.message ?? null}
      retry={() => void refetch()}
    >
      <FlatList
        data={medicines ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
        ListEmptyComponent={
          <EmptyState title="No medicines yet" message="Add a medicine to get started." />
        }
        renderItem={({ item }) => <MedicineCard medicine={item} batches={batches ?? []} />}
      />
    </ScreenState>
  );
}

function MedicineCard({
  medicine,
  batches,
}: {
  medicine: Medicine;
  batches: Batch[];
}) {
  const { recordMove, isSubmitting, error: moveError } = useMedicineActions(medicine);
  const [mode, setMode] = useState<'PURCHASE' | 'USAGE' | null>(null);
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [batchId, setBatchId] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const stockTone = stockBadgeTone(medicine.currentStock, medicine.lowStockThreshold);
  const expiryTone = expiryBadgeTone(medicine.expiryDate);

  const submit = async () => {
    if (mode === 'PURCHASE') {
      const result = medicinePurchaseSchema.safeParse({
        quantity,
        ...(expiryDate !== '' ? { expiryDate } : {}),
        ...(notes !== '' ? { notes } : {}),
      });
      if (!result.success) {
        setFormError(result.error.issues.map((issue) => issue.message).join('; '));
        return;
      }
      const ok = await recordMove('PURCHASE', result.data);
      if (ok) {
        setQuantity('');
        setExpiryDate('');
        setNotes('');
        setMode(null);
        setFormError(null);
      }
    } else {
      const result = medicineUseSchema.safeParse({
        quantity,
        ...(batchId !== '' ? { batchId } : {}),
        ...(notes !== '' ? { notes } : {}),
      });
      if (!result.success) {
        setFormError(result.error.issues.map((issue) => issue.message).join('; '));
        return;
      }
      const ok = await recordMove('USAGE', result.data);
      if (ok) {
        setQuantity('');
        setBatchId('');
        setNotes('');
        setMode(null);
        setFormError(null);
      }
    }
  };

  return (
    <Card>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{medicine.name}</Text>
          <Text className="mt-0.5 text-sm text-gray-500">{medicine.supplier ?? '—'}</Text>
        </View>
        <Badge label={expiryLabel(medicine.expiryDate)} tone={expiryTone} />
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-sm text-gray-500">
          Stock:{' '}
          <Text className="font-semibold text-gray-900">
            {medicine.currentStock} {medicine.unit}
          </Text>
        </Text>
        <Badge label={stockTone === 'red' ? 'LOW' : 'OK'} tone={stockTone} />
      </View>
      <View className="mt-3 flex-row gap-2">
        <Button
          title="Purchase"
          onPress={() => setMode(mode === 'PURCHASE' ? null : 'PURCHASE')}
          variant={mode === 'PURCHASE' ? 'primary' : 'secondary'}
          className="flex-1"
        />
        <Button
          title="Use"
          onPress={() => setMode(mode === 'USAGE' ? null : 'USAGE')}
          variant={mode === 'USAGE' ? 'primary' : 'secondary'}
          className="flex-1"
        />
      </View>
      {mode !== null ? (
        <View className="mt-3">
          <FormField label="Quantity">
            <Input
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              placeholder="0.0"
            />
          </FormField>
          {mode === 'PURCHASE' ? (
            <FormField label="Expiry date (optional, YYYY-MM-DD)">
              <Input
                value={expiryDate}
                onChangeText={setExpiryDate}
                placeholder="2026-12-31"
                autoCapitalize="none"
              />
            </FormField>
          ) : batches.length > 0 ? (
            <FormField label="Batch (optional)">
              <Select
                options={[
                  { label: 'No batch', value: '' },
                  ...batches.map((batch) => ({ label: batch.batchNumber, value: batch.id })),
                ]}
                value={batchId}
                onChange={setBatchId}
              />
            </FormField>
          ) : null}
          <FormField label="Notes (optional)">
            <Input value={notes} onChangeText={setNotes} placeholder="Optional" />
          </FormField>
          {formError ?? moveError ? (
            <Text className="mb-2 text-xs font-medium text-red-600">
              {formError ?? moveError}
            </Text>
          ) : null}
          <Button
            title={isSubmitting ? 'Saving…' : mode === 'PURCHASE' ? 'Record Purchase' : 'Record Use'}
            onPress={() => void submit()}
            loading={isSubmitting}
          />
        </View>
      ) : null}
    </Card>
  );
}

function VaccinationsView({ farmId }: { farmId: string | null }) {
  const router = useRouter();
  const { data: batches, isLoading: batchesLoading } = useBatches(farmId);
  const [batchId, setBatchId] = useState<string | null>(null);

  useEffect(() => {
    if (batchId === null && batches !== undefined && batches.length > 0) {
      setBatchId(batches[0].id);
    }
  }, [batchId, batches]);

  const { data: vaccinations, isLoading, error, refetch, isRefetching } = useVaccinations(
    batchId,
  );
  const { markComplete, isSubmitting } = useVaccinationActions(batchId ?? '');

  return (
    <ScreenState
      loading={batchesLoading || (batchId !== null && isLoading)}
      error={error?.message ?? null}
      retry={() => void refetch()}
      empty={!batchesLoading && batches !== undefined && batches.length === 0}
      emptyTitle="No batches yet"
      emptyMessage="Create a batch to schedule vaccinations."
    >
      {batches !== undefined && batches.length > 0 ? (
        <FlatList
          data={vaccinations ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <Select
                options={batches.map((batch) => ({
                  label: batch.batchNumber,
                  value: batch.id,
                }))}
                value={batchId ?? ''}
                onChange={(value) => setBatchId(value)}
              />
              <Button
                title="Add Vaccination"
                onPress={() =>
                  router.push({
                    pathname: '/vaccination/new',
                    params: { batchId: batchId ?? '' },
                  })
                }
              />
              <Text className="text-base font-semibold text-gray-900">Vaccinations</Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title="No vaccinations yet"
              message="Add a vaccination to get started."
            />
          }
          renderItem={({ item }) => (
            <VaccinationCard
              vaccination={item}
              submitting={isSubmitting}
              onComplete={() => void markComplete(item)}
            />
          )}
        />
      ) : null}
    </ScreenState>
  );
}

function VaccinationCard({
  vaccination,
  submitting,
  onComplete,
}: {
  vaccination: Vaccination;
  submitting: boolean;
  onComplete: () => void;
}) {
  return (
    <Card>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{vaccination.vaccineName}</Text>
          <Text className="mt-0.5 text-sm text-gray-500">
            Scheduled: {vaccination.scheduledDate}
          </Text>
        </View>
        <Badge label={vaccination.status} tone={VACCINATION_TONE[vaccination.status] ?? 'gray'} />
      </View>
      {vaccination.dose !== null && vaccination.dose !== undefined ? (
        <Text className="mt-1 text-xs text-gray-500">Dose: {vaccination.dose}</Text>
      ) : null}
      {vaccination.completedDate ? (
        <Text className="mt-1 text-xs text-gray-500">
          Completed: {vaccination.completedDate}
        </Text>
      ) : null}
      {vaccination.status === 'UPCOMING' ? (
        <View className="mt-3">
          <Button
            title={submitting ? 'Saving…' : 'Mark Complete'}
            onPress={onComplete}
            loading={submitting}
            variant="secondary"
          />
        </View>
      ) : null}
    </Card>
  );
}