import { useLocalSearchParams } from 'expo-router';
import { Controller } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { Button, DateField, FormField, Input, OfflineBanner, ScreenState } from '@/src/components/ui';
import { useDailyEntry } from '@/src/hooks/useDailyEntry';
import { useSync } from '@/src/hooks/useSync';

export default function DailyEntryScreen() {
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const { pendingCount, refresh } = useSync();
  const {
    form,
    batch,
    isLoading,
    error,
    refetch,
    hints,
    mortalityError,
    isSaving,
    saveError,
    save,
    today,
  } = useDailyEntry(batchId);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <ScreenState loading={isLoading} error={error?.message ?? null} retry={() => void refetch()}>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text className="text-xl font-bold text-gray-900">Daily Entry</Text>
          {batch ? (
            <Text className="mt-0.5 text-sm text-gray-500">
              {batch.batchNumber} · {batch.breed}
            </Text>
          ) : null}

          <View className="mt-4">
            <DateField label="Date" value={today} />
          </View>

          <Controller
            control={form.control}
            name="birdsAtStart"
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <FormField label="Birds at start" error={error?.message}>
                <Input
                  value={String(value)}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </FormField>
            )}
          />

          <Controller
            control={form.control}
            name="mortality"
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <FormField
                label="Mortality"
                error={error?.message ?? mortalityError ?? undefined}
                hint={hints.feed !== null ? `Yesterday: ${hints.feed}` : undefined}
              >
                <Input
                  value={String(value)}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </FormField>
            )}
          />

          <Controller
            control={form.control}
            name="feedConsumedKg"
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <FormField
                label="Feed consumed (kg)"
                error={error?.message}
                hint={hints.feed !== null ? `Yesterday: ${hints.feed} kg` : undefined}
              >
                <Input
                  value={String(value)}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="decimal-pad"
                  placeholder={hints.feed ?? '0.0'}
                />
              </FormField>
            )}
          />

          <Controller
            control={form.control}
            name="averageWeightKg"
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <FormField
                label="Average weight (kg/bird)"
                error={error?.message}
                hint={hints.weight !== null ? `Yesterday: ${hints.weight} kg` : undefined}
              >
                <Input
                  value={String(value)}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="decimal-pad"
                  placeholder={hints.weight ?? '0.0'}
                />
              </FormField>
            )}
          />

          <Controller
            control={form.control}
            name="humidityPercent"
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <FormField
                label="Humidity (%)"
                error={error?.message}
                hint={hints.humidity !== null ? `Yesterday: ${hints.humidity}%` : undefined}
              >
                <Input
                  value={String(value)}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="decimal-pad"
                  placeholder={hints.humidity ?? '0'}
                />
              </FormField>
            )}
          />

          <Controller
            control={form.control}
            name="notes"
            render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
              <FormField label="Notes" error={error?.message}>
                <Input
                  value={String(value)}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder="Optional"
                  multiline
                />
              </FormField>
            )}
          />

          {saveError ? (
            <Text className="mb-2 text-xs font-medium text-red-600">{saveError}</Text>
          ) : null}

          <Button
            title={isSaving ? 'Saving…' : 'Save Entry'}
            onPress={() => void save()}
            loading={isSaving}
            disabled={mortalityError !== null}
          />
        </ScrollView>
      </ScreenState>
    </KeyboardAvoidingView>
  );
}