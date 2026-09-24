import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { createExpenseSchema } from '@poultry/validation';

import {
  Button,
  Card,
  FormField,
  Input,
  OfflineBanner,
  ScreenState,
  Select,
} from '@/src/components/ui';
import { todayISO } from '@/src/features/daily-entry/record';
import { EXPENSE_CATEGORIES, PAYMENT_STATUSES } from '@/src/features/expenses/expense';
import { useExpenseActions } from '@/src/features/expenses/actions';
import { useSync } from '@/src/hooks/useSync';
import { sanitizeMoneyInput } from '@/src/utils/money';

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

export default function NewExpenseScreen() {
  const router = useRouter();
  const { farmId } = useLocalSearchParams<{ farmId: string }>();
  const { pendingCount, refresh } = useSync();
  const { add, isSubmitting, error } = useExpenseActions(farmId ?? '');

  const [category, setCategory] = useState('FEED');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [supplier, setSupplier] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('PAID');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const result = createExpenseSchema.safeParse({
      category,
      description,
      amount,
      expenseDate,
      ...(supplier !== '' ? { supplier } : {}),
      paymentStatus,
      ...(notes !== '' ? { notes } : {}),
    });
    if (!result.success) {
      setFormError(result.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    const ok = await add(result.data);
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
      <ScreenState loading={farmId === undefined || farmId === ''}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Card>
            <Text className="text-base font-semibold text-gray-900">New Expense</Text>
            <View className="mt-3">
              <FormField label="Category">
                <Select
                  options={EXPENSE_CATEGORIES.map((value) => ({
                    label: CATEGORY_LABELS[value],
                    value,
                  }))}
                  value={category}
                  onChange={setCategory}
                />
              </FormField>
              <FormField label="Description">
                <Input
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. Broiler starter feed"
                />
              </FormField>
              <FormField label="Amount">
                <Input
                  value={amount}
                  onChangeText={(value) => setAmount(sanitizeMoneyInput(value))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                />
              </FormField>
              <FormField label="Expense date (YYYY-MM-DD)">
                <Input
                  value={expenseDate}
                  onChangeText={setExpenseDate}
                  placeholder="2026-09-24"
                  autoCapitalize="none"
                />
              </FormField>
              <FormField label="Supplier (optional)">
                <Input value={supplier} onChangeText={setSupplier} placeholder="Optional" />
              </FormField>
              <FormField label="Payment status">
                <Select
                  options={PAYMENT_STATUSES.map((value) => ({ label: value, value }))}
                  value={paymentStatus}
                  onChange={setPaymentStatus}
                />
              </FormField>
              <FormField label="Notes (optional)">
                <Input value={notes} onChangeText={setNotes} placeholder="Optional" />
              </FormField>
              {formError ?? error ? (
                <Text className="mb-2 text-xs font-medium text-red-600">
                  {formError ?? error}
                </Text>
              ) : null}
              <Button
                title={isSubmitting ? 'Saving…' : 'Add Expense'}
                onPress={() => void submit()}
                loading={isSubmitting}
              />
            </View>
          </Card>
        </ScrollView>
      </ScreenState>
    </KeyboardAvoidingView>
  );
}