import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { updateSalePaymentSchema } from '@poultry/validation';

import {
  Badge,
  Button,
  Card,
  FormField,
  Input,
  OfflineBanner,
  ScreenState,
  type BadgeTone,
} from '@/src/components/ui';
import { useSalePaymentActions } from '@/src/features/sales/actions';
import { useSale } from '@/src/features/sales/queries';
import { paymentExceedsTotal } from '@/src/features/sales/sale';
import { useSync } from '@/src/hooks/useSync';
import { sanitizeMoneyInput } from '@/src/utils/money';

const PAYMENT_TONE: Record<string, BadgeTone> = {
  PAID: 'green',
  PARTIALLY_PAID: 'amber',
  PENDING: 'red',
};

export default function SaleDetailScreen() {
  const { saleId } = useLocalSearchParams<{ saleId: string }>();
  const { pendingCount, refresh } = useSync();
  const { data: sale, isLoading, error, refetch } = useSale(saleId);
  const { updatePayment, isSubmitting, error: paymentError } = useSalePaymentActions(sale);

  const [amountReceived, setAmountReceived] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const exceedsTotal =
    sale !== undefined && amountReceived !== '' && paymentExceedsTotal(amountReceived, sale.totalAmount);

  const submitPayment = async () => {
    const result = updateSalePaymentSchema.safeParse({ amountReceived });
    if (!result.success) {
      setFormError(result.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    const ok = await updatePayment(result.data.amountReceived);
    if (ok) {
      setAmountReceived('');
      setFormError(null);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <ScreenState loading={isLoading} error={error?.message ?? null} retry={() => void refetch()}>
        {sale ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Card>
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900">{sale.buyer}</Text>
                  <Text className="mt-0.5 text-sm text-gray-500">
                    {sale.birdsSold} birds · {sale.saleDate}
                  </Text>
                </View>
                <Badge label={sale.paymentStatus} tone={PAYMENT_TONE[sale.paymentStatus] ?? 'gray'} />
              </View>
              <Text className="mt-3 text-2xl font-bold text-gray-900">
                {Number(sale.totalAmount).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </Card>
            <Card>
              <Text className="text-sm font-semibold text-gray-900">Details</Text>
              <View className="mt-2 gap-1">
                <DetailRow label="Batch" value={sale.batchId} />
                <DetailRow label="Birds sold" value={String(sale.birdsSold)} />
                <DetailRow label="Total weight" value={`${sale.totalWeightKg} kg`} />
                <DetailRow label="Rate per kg" value={sale.ratePerKg} />
                <DetailRow label="Amount received" value={sale.amountReceived} />
                <DetailRow label="Outstanding" value={sale.outstandingAmount} />
                {sale.notes ? <DetailRow label="Notes" value={sale.notes} /> : null}
              </View>
            </Card>
            {sale.paymentStatus !== 'PAID' ? (
              <Card>
                <Text className="text-sm font-semibold text-gray-900">Record payment</Text>
                <View className="mt-3">
                  <FormField label="Amount received (total so far)">
                    <Input
                      value={amountReceived}
                      onChangeText={(value) => setAmountReceived(sanitizeMoneyInput(value))}
                      keyboardType="decimal-pad"
                      placeholder={sale.amountReceived}
                    />
                  </FormField>
                  {exceedsTotal ? (
                    <Text className="mb-2 text-xs font-medium text-red-600">
                      Amount received exceeds the sale total.
                    </Text>
                  ) : null}
                  {formError ?? paymentError ? (
                    <Text className="mb-2 text-xs font-medium text-red-600">
                      {formError ?? paymentError}
                    </Text>
                  ) : null}
                  <Button
                    title={isSubmitting ? 'Saving…' : 'Update Payment'}
                    onPress={() => void submitPayment()}
                    loading={isSubmitting}
                    disabled={exceedsTotal}
                  />
                </View>
              </Card>
            ) : null}
          </ScrollView>
        ) : null}
      </ScreenState>
    </KeyboardAvoidingView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-semibold text-gray-900">{value}</Text>
    </View>
  );
}