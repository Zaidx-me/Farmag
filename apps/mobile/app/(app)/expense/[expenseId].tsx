import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';

import { Badge, Card, OfflineBanner, ScreenState, type BadgeTone } from '@/src/components/ui';
import { useExpense } from '@/src/features/expenses/queries';
import { useSync } from '@/src/hooks/useSync';

const CATEGORY_LABELS: Record<string, string> = {
  CHICKS: 'Chicks',
  FEED: 'Feed',
  MEDICINE: 'Medicine',
  VACCINATION: 'Vaccination',
  LABOUR: 'Labour',
  ELECTRICITY: 'Electricity',
  GAS: 'Gas',
  TRANSPORT: 'Transport',
  MAINTENANCE: 'Maintenance',
  EQUIPMENT: 'Equipment',
  OTHER: 'Other',
};

const PAYMENT_TONE: Record<string, BadgeTone> = {
  PAID: 'green',
  PARTIALLY_PAID: 'amber',
  PENDING: 'red',
};

export default function ExpenseDetailScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId: string }>();
  const { pendingCount, refresh } = useSync();
  const { data: expense, isLoading, error, refetch } = useExpense(expenseId);

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <ScreenState loading={isLoading} error={error?.message ?? null} retry={() => void refetch()}>
        {expense ? (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <Card>
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-lg font-bold text-gray-900">{expense.description}</Text>
                  <Text className="mt-0.5 text-sm text-gray-500">
                    {CATEGORY_LABELS[expense.category] ?? expense.category} · {expense.expenseDate}
                  </Text>
                </View>
                <Badge
                  label={expense.paymentStatus}
                  tone={PAYMENT_TONE[expense.paymentStatus] ?? 'gray'}
                />
              </View>
              <Text className="mt-3 text-2xl font-bold text-gray-900">
                {Number(expense.amount).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Text>
            </Card>
            <Card>
              <Text className="text-sm font-semibold text-gray-900">Details</Text>
              <View className="mt-2 gap-1">
                <DetailRow label="Category" value={CATEGORY_LABELS[expense.category] ?? expense.category} />
                <DetailRow label="Date" value={expense.expenseDate} />
                <DetailRow label="Payment status" value={expense.paymentStatus} />
                {expense.supplier ? <DetailRow label="Supplier" value={expense.supplier} /> : null}
                {expense.batchId ? <DetailRow label="Batch" value={expense.batchId} /> : null}
                {expense.notes ? <DetailRow label="Notes" value={expense.notes} /> : null}
              </View>
            </Card>
          </ScrollView>
        ) : null}
      </ScreenState>
    </View>
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