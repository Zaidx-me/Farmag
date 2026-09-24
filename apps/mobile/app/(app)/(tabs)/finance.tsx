import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import type { Expense, ExpenseCategory, Sale } from '@poultry/shared-types';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  OfflineBanner,
  ScreenState,
  Select,
  type BadgeTone,
} from '@/src/components/ui';
import { useFarms } from '@/src/features/daily-entry/queries';
import {
  EXPENSE_CATEGORIES,
  totalExpenseAmount,
  totalsByCategory,
} from '@/src/features/expenses/expense';
import { useExpenses } from '@/src/features/expenses/queries';
import { useSales } from '@/src/features/sales/queries';
import { useSync } from '@/src/hooks/useSync';
import { profitWithLabel } from '@/src/utils/calculations/profit';
import { saleTotals } from '@/src/utils/calculations/sales';

type FinanceView = 'EXPENSES' | 'SALES';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
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

export default function FinanceScreen() {
  const router = useRouter();
  const { pendingCount, refresh } = useSync();
  const { data: farms, isLoading: farmsLoading, error: farmsError, refetch: refetchFarms } =
    useFarms();
  const [farmId, setFarmId] = useState<string | null>(null);
  const [view, setView] = useState<FinanceView>('EXPENSES');
  const [category, setCategory] = useState<ExpenseCategory | 'ALL'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    if (farmId === null && farms !== undefined && farms.length > 0) {
      setFarmId(farms[0].id);
    }
  }, [farmId, farms]);

  const { data: allExpenses } = useExpenses(farmId);
  const { data: allSales } = useSales(farmId);
  const { data: expenses, isLoading, error, refetch, isRefetching } = useExpenses(farmId, {
    category,
    from,
    to,
  });
  const { data: sales, isLoading: salesLoading, error: salesError, refetch: refetchSales, isRefetching: salesRefetching } =
    useSales(farmId, { from, to });

  const profit = useMemo(() => {
    const revenue = saleTotals(allSales ?? []).revenue;
    const byCategory = totalsByCategory(allExpenses ?? []);
    const feedCost = byCategory.FEED;
    const medicineCost = byCategory.MEDICINE;
    const otherCosts = totalExpenseAmount(allExpenses ?? []) - feedCost - medicineCost;
    return profitWithLabel(revenue, feedCost, medicineCost, otherCosts);
  }, [allExpenses, allSales]);

  const listLoading = view === 'EXPENSES' ? isLoading : salesLoading;
  const listError = view === 'EXPENSES' ? error?.message ?? null : salesError?.message ?? null;
  const listRefetch = view === 'EXPENSES' ? refetch : refetchSales;
  const listRefetching = view === 'EXPENSES' ? isRefetching : salesRefetching;

  return (
    <View className="flex-1 bg-gray-50">
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <View className="p-4">
        <Text className="text-xl font-bold text-gray-900">Finance</Text>
        <Select
          className="mt-3"
          options={[
            { label: 'Expenses', value: 'EXPENSES' },
            { label: 'Sales', value: 'SALES' },
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
        loading={farmsLoading || (farmId !== null && listLoading)}
        error={farmsError?.message ?? listError}
        retry={() => {
          void refetchFarms();
          void listRefetch();
        }}
        empty={!farmsLoading && farms !== undefined && farms.length === 0}
        emptyTitle="No farms yet"
        emptyMessage="Create a farm to start tracking finances."
      >
        <FlatList<Expense | Sale>
          data={view === 'EXPENSES' ? (expenses ?? []) : (sales ?? [])}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={
            <RefreshControl refreshing={listRefetching} onRefresh={() => void listRefetch()} />
          }
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <ProfitCard value={profit.value} label={profit.label} />
              <View className="flex-row gap-2">
                <Input
                  className="flex-1"
                  placeholder="From (YYYY-MM-DD)"
                  value={from}
                  onChangeText={setFrom}
                  autoCapitalize="none"
                />
                <Input
                  className="flex-1"
                  placeholder="To (YYYY-MM-DD)"
                  value={to}
                  onChangeText={setTo}
                  autoCapitalize="none"
                />
              </View>
              {view === 'EXPENSES' ? (
                <Select
                  options={[
                    { label: 'All categories', value: 'ALL' },
                    ...EXPENSE_CATEGORIES.map((value) => ({
                      label: CATEGORY_LABELS[value],
                      value,
                    })),
                  ]}
                  value={category}
                  onChange={setCategory}
                />
              ) : null}
              <View className="flex-row gap-2">
                <Button
                  title="Add Expense"
                  onPress={() =>
                    router.push({ pathname: '/expense/new', params: { farmId: farmId ?? '' } })
                  }
                  className="flex-1"
                />
                <Button
                  title="Add Sale"
                  onPress={() =>
                    router.push({ pathname: '/sale/new', params: { farmId: farmId ?? '' } })
                  }
                  variant="secondary"
                  className="flex-1"
                />
              </View>
              {view === 'EXPENSES' ? (
                <TotalsCard expenses={expenses ?? []} />
              ) : (
                <SalesSummaryCard sales={sales ?? []} />
              )}
              <Text className="text-base font-semibold text-gray-900">
                {view === 'EXPENSES' ? 'Expenses' : 'Sales'}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              title={view === 'EXPENSES' ? 'No expenses yet' : 'No sales yet'}
              message={
                view === 'EXPENSES'
                  ? 'Add an expense to start tracking costs.'
                  : 'Add a sale to start tracking revenue.'
              }
            />
          }
          renderItem={({ item }) =>
            view === 'EXPENSES' ? (
              <ExpenseCard
                expense={item as Expense}
                onPress={() =>
                  router.push({
                    pathname: '/expense/[expenseId]',
                    params: { expenseId: item.id, farmId: farmId ?? '' },
                  })
                }
              />
            ) : (
              <SaleCard
                sale={item as Sale}
                onPress={() =>
                  router.push({
                    pathname: '/sale/[saleId]',
                    params: { saleId: item.id, farmId: farmId ?? '' },
                  })
                }
              />
            )
          }
        />
      </ScreenState>
    </View>
  );
}

function ProfitCard({ value, label }: { value: number; label: 'profit' | 'loss' }) {
  return (
    <Card>
      <Text className="text-sm font-medium text-gray-500">Net {label}</Text>
      <Text className={`mt-1 text-2xl font-bold ${label === 'profit' ? 'text-green-700' : 'text-red-700'}`}>
        {value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Text>
    </Card>
  );
}

function TotalsCard({ expenses }: { expenses: Expense[] }) {
  const totals = totalsByCategory(expenses);
  const entries = EXPENSE_CATEGORIES.filter((category) => totals[category] > 0);
  if (entries.length === 0) return null;
  return (
    <Card>
      <Text className="text-sm font-semibold text-gray-900">By category</Text>
      <View className="mt-2 gap-1">
        {entries.map((category) => (
          <View key={category} className="flex-row items-center justify-between">
            <Text className="text-sm text-gray-500">{CATEGORY_LABELS[category]}</Text>
            <Text className="text-sm font-semibold text-gray-900">
              {totals[category].toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function SalesSummaryCard({ sales }: { sales: Sale[] }) {
  const totals = saleTotals(sales);
  return (
    <Card>
      <Text className="text-sm font-semibold text-gray-900">Summary</Text>
      <View className="mt-2 gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-gray-500">Sales</Text>
          <Text className="text-sm font-semibold text-gray-900">{totals.count}</Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-gray-500">Revenue</Text>
          <Text className="text-sm font-semibold text-gray-900">
            {totals.revenue.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-gray-500">Avg price/kg</Text>
          <Text className="text-sm font-semibold text-gray-900">
            {totals.averagePrice.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function ExpenseCard({ expense, onPress }: { expense: Expense; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{expense.description}</Text>
          <Text className="mt-0.5 text-sm text-gray-500">
            {CATEGORY_LABELS[expense.category]} · {expense.expenseDate}
          </Text>
        </View>
        <Badge label={expense.paymentStatus} tone={PAYMENT_TONE[expense.paymentStatus] ?? 'gray'} />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-sm text-gray-500">
          {expense.supplier ?? '—'}
        </Text>
        <Text className="text-base font-bold text-gray-900">
          {Number(expense.amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
      </View>
    </Card>
  );
}

function SaleCard({ sale, onPress }: { sale: Sale; onPress: () => void }) {
  return (
    <Card onPress={onPress}>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{sale.buyer}</Text>
          <Text className="mt-0.5 text-sm text-gray-500">
            {sale.birdsSold} birds · {sale.saleDate}
          </Text>
        </View>
        <Badge label={sale.paymentStatus} tone={PAYMENT_TONE[sale.paymentStatus] ?? 'gray'} />
      </View>
      <View className="mt-2 flex-row items-center justify-between">
        <Text className="text-sm text-gray-500">
          {sale.totalWeightKg} kg @ {sale.ratePerKg}/kg
        </Text>
        <Text className="text-base font-bold text-gray-900">
          {Number(sale.totalAmount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Text>
      </View>
      {sale.outstandingAmount !== '0' ? (
        <Text className="mt-1 text-xs text-amber-700">
          Outstanding: {sale.outstandingAmount}
        </Text>
      ) : null}
    </Card>
  );
}