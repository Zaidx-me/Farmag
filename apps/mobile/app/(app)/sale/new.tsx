import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { createSaleSchema } from '@poultry/validation';

import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  OfflineBanner,
  ScreenState,
  Select,
  type BadgeTone,
} from '@/src/components/ui';
import { useBatches } from '@/src/features/daily-entry/queries';
import { todayISO } from '@/src/features/daily-entry/record';
import { useSaleActions } from '@/src/features/sales/actions';
import { computeSaleTotals, paymentExceedsTotal } from '@/src/features/sales/sale';
import { useSync } from '@/src/hooks/useSync';
import { sanitizeMoneyInput } from '@/src/utils/money';

const PAYMENT_TONE: Record<string, BadgeTone> = {
  PAID: 'green',
  PARTIALLY_PAID: 'amber',
  PENDING: 'red',
};

export default function NewSaleScreen() {
  const router = useRouter();
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const { pendingCount, refresh } = useSync();
  const { add, isSubmitting, error } = useSaleActions(farmId ?? '');
  const { data: batches, isLoading: batchesLoading } = useBatches(farmId ?? null);

  const [batchId, setBatchId] = useState('');
  const [buyer, setBuyer] = useState('');
  const [saleDate, setSaleDate] = useState(todayISO());
  const [birdsSold, setBirdsSold] = useState('');
  const [totalWeightKg, setTotalWeightKg] = useState('');
  const [ratePerKg, setRatePerKg] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const selectedBatch = batches?.find((batch) => batch.id === batchId);
  const currentBirds = selectedBatch?.initialBirds ?? 0;
  const birdsExceed = birdsSold !== '' && Number(birdsSold) > currentBirds;

  const preview = useMemo(() => {
    if (totalWeightKg === '' || ratePerKg === '') return null;
    return computeSaleTotals(totalWeightKg, ratePerKg, amountReceived === '' ? '0' : amountReceived);
  }, [totalWeightKg, ratePerKg, amountReceived]);

  const exceedsTotal = preview !== null && paymentExceedsTotal(amountReceived, preview.totalAmount);

  const submit = async () => {
    const result = createSaleSchema.safeParse({
      batchId,
      buyer,
      saleDate,
      birdsSold,
      totalWeightKg,
      ratePerKg,
      amountReceived: amountReceived === '' ? '0' : amountReceived,
      ...(notes !== '' ? { notes } : {}),
    });
    if (!result.success) {
      setFormError(result.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    const ok = await add({
      ...result.data,
      birdsSold: String(result.data.birdsSold),
    });
    if (ok) {
      router.back();
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <ScreenState loading={farmId === undefined || farmId === '' || batchesLoading}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Card>
            <Text className="text-base font-semibold text-gray-900">New Sale</Text>
            <View className="mt-3">
              {batches !== undefined && batches.length > 0 ? (
                <FormField label="Batch">
                  <Select
                    options={batches.map((batch) => ({
                      label: `${batch.batchNumber} (${batch.breed})`,
                      value: batch.id,
                    }))}
                    value={batchId}
                    onChange={setBatchId}
                  />
                </FormField>
              ) : null}
              {selectedBatch ? (
                <Text className="mb-4 text-xs text-gray-500">
                  Current birds: {currentBirds}
                </Text>
              ) : null}
              <FormField label="Buyer">
                <Input value={buyer} onChangeText={setBuyer} placeholder="e.g. Karachi Market" />
              </FormField>
              <FormField label="Sale date (YYYY-MM-DD)">
                <Input
                  value={saleDate}
                  onChangeText={setSaleDate}
                  placeholder="2026-09-24"
                  autoCapitalize="none"
                />
              </FormField>
              <FormField label="Birds sold" error={birdsExceed ? 'Exceeds current batch birds' : undefined}>
                <Input
                  value={birdsSold}
                  onChangeText={setBirdsSold}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </FormField>
              <FormField label="Total weight (kg)">
                <Input
                  value={totalWeightKg}
                  onChangeText={setTotalWeightKg}
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                />
              </FormField>
              <FormField label="Rate per kg">
                <Input
                  value={ratePerKg}
                  onChangeText={(value) => setRatePerKg(sanitizeMoneyInput(value))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Amount received">
                <Input
                  value={amountReceived}
                  onChangeText={(value) => setAmountReceived(sanitizeMoneyInput(value))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </FormField>
              {preview ? (
                <View className="mb-4 rounded-xl bg-gray-50 p-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm text-gray-500">Total</Text>
                    <Text className="text-sm font-semibold text-gray-900">
                      {preview.totalAmount}
                    </Text>
                  </View>
                  <View className="mt-1 flex-row items-center justify-between">
                    <Text className="text-sm text-gray-500">Outstanding</Text>
                    <Text className="text-sm font-semibold text-gray-900">
                      {preview.outstandingAmount}
                    </Text>
                  </View>
                  <View className="mt-2">
                    <Badge label={preview.paymentStatus} tone={PAYMENT_TONE[preview.paymentStatus] ?? 'gray'} />
                  </View>
                </View>
              ) : null}
              {exceedsTotal ? (
                <Text className="mb-2 text-xs font-medium text-red-600">
                  Amount received exceeds the sale total.
                </Text>
              ) : null}
              <FormField label="Notes (optional)">
                <Input value={notes} onChangeText={setNotes} placeholder="Optional" />
              </FormField>
              {formError ?? error ? (
                <Text className="mb-2 text-xs font-medium text-red-600">
                  {formError ?? error}
                </Text>
              ) : null}
              <Button
                title={isSubmitting ? 'Saving…' : 'Add Sale'}
                onPress={() => void submit()}
                loading={isSubmitting}
                disabled={birdsExceed || exceedsTotal}
              />
            </View>
          </Card>
        </ScrollView>
      </ScreenState>
    </KeyboardAvoidingView>
  );
}