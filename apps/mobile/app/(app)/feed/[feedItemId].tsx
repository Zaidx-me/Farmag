import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';

import type { FeedTransaction } from '@poultry/shared-types';
import { feedConsumeSchema, feedPurchaseSchema } from '@poultry/validation';

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
import { useFeedActions } from '@/src/features/feed/actions';
import { useFeedItems, useFeedTransactions } from '@/src/features/feed/queries';
import { applyStockMove, isLowStock, stockBadgeTone } from '@/src/features/feed/stock';
import { useSync } from '@/src/hooks/useSync';

const TYPE_TONE: Record<string, BadgeTone> = {
  STARTER: 'blue',
  GROWER: 'green',
  FINISHER: 'amber',
  OTHER: 'gray',
};

const TX_TONE: Record<string, BadgeTone> = {
  PURCHASE: 'green',
  CONSUMPTION: 'blue',
  ADJUSTMENT: 'gray',
};

export default function FeedDetailScreen() {
  const { feedItemId, farmId } = useLocalSearchParams<{ feedItemId: string; farmId: string }>();
  const { pendingCount, refresh } = useSync();
  const { data: items, isLoading, error, refetch, isRefetching } = useFeedItems(farmId ?? null);
  const feedItem = items?.find((item) => item.id === feedItemId);
  const { data: transactions, isLoading: txsLoading } = useFeedTransactions(feedItemId);
  const { recordMove, isSubmitting, error: moveError } = useFeedActions(feedItem);
  const { data: batches } = useBatches(feedItem?.farmId ?? null);

  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseUnitCost, setPurchaseUnitCost] = useState('');
  const [purchaseTotalCost, setPurchaseTotalCost] = useState('');
  const [purchaseNotes, setPurchaseNotes] = useState('');
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const [consumeQty, setConsumeQty] = useState('');
  const [consumeBatchId, setConsumeBatchId] = useState('');
  const [consumeNotes, setConsumeNotes] = useState('');
  const [consumeError, setConsumeError] = useState<string | null>(null);

  const submitPurchase = async () => {
    const result = feedPurchaseSchema.safeParse({
      quantity: purchaseQty,
      ...(purchaseUnitCost !== '' ? { unitCost: purchaseUnitCost } : {}),
      ...(purchaseTotalCost !== '' ? { totalCost: purchaseTotalCost } : {}),
      ...(purchaseNotes !== '' ? { notes: purchaseNotes } : {}),
    });
    if (!result.success) {
      setPurchaseError(result.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    const ok = await recordMove('PURCHASE', result.data);
    if (ok) {
      setPurchaseQty('');
      setPurchaseUnitCost('');
      setPurchaseTotalCost('');
      setPurchaseNotes('');
      setPurchaseError(null);
    }
  };

  const submitConsume = async () => {
    const result = feedConsumeSchema.safeParse({
      quantity: consumeQty,
      ...(consumeBatchId !== '' ? { batchId: consumeBatchId } : {}),
      ...(consumeNotes !== '' ? { notes: consumeNotes } : {}),
    });
    if (!result.success) {
      setConsumeError(result.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    const ok = await recordMove('CONSUMPTION', result.data);
    if (ok) {
      setConsumeQty('');
      setConsumeBatchId('');
      setConsumeNotes('');
      setConsumeError(null);
    }
  };

  const projectedStock =
    feedItem !== undefined && consumeQty !== '' && Number.isFinite(Number(consumeQty))
      ? applyStockMove(feedItem.currentStock, consumeQty, 'CONSUMPTION')
      : null;
  const willCrossThreshold =
    feedItem !== undefined &&
    projectedStock !== null &&
    isLowStock(projectedStock, feedItem.lowStockThreshold);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OfflineBanner pendingCount={pendingCount} onSync={() => void refresh()} />
      <ScreenState loading={isLoading} error={error?.message ?? null} retry={() => void refetch()}>
        {feedItem ? (
          <FlatList
            data={transactions ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
            }
            ListHeaderComponent={
              <View style={{ gap: 12 }}>
                <FeedInfoCard item={feedItem} />
                <PurchaseForm
                  quantity={purchaseQty}
                  unitCost={purchaseUnitCost}
                  totalCost={purchaseTotalCost}
                  notes={purchaseNotes}
                  error={purchaseError ?? moveError}
                  submitting={isSubmitting}
                  onQuantityChange={setPurchaseQty}
                  onUnitCostChange={setPurchaseUnitCost}
                  onTotalCostChange={setPurchaseTotalCost}
                  onNotesChange={setPurchaseNotes}
                  onSubmit={() => void submitPurchase()}
                />
                <ConsumeForm
                  quantity={consumeQty}
                  batchId={consumeBatchId}
                  notes={consumeNotes}
                  error={consumeError ?? moveError}
                  submitting={isSubmitting}
                  batches={batches ?? []}
                  willCrossThreshold={willCrossThreshold}
                  onQuantityChange={setConsumeQty}
                  onBatchChange={setConsumeBatchId}
                  onNotesChange={setConsumeNotes}
                  onSubmit={() => void submitConsume()}
                />
                <Text className="text-base font-semibold text-gray-900">Transactions</Text>
              </View>
            }
            ListEmptyComponent={
              <EmptyState
                title="No transactions yet"
                message="Record a purchase or consumption to get started."
              />
            }
            renderItem={({ item }) => <TransactionRow transaction={item} />}
          />
        ) : null}
      </ScreenState>
    </KeyboardAvoidingView>
  );
}

function FeedInfoCard({ item }: { item: { name: string; type: string; currentStock: string; unit: string; lowStockThreshold: string } }) {
  const tone = stockBadgeTone(item.currentStock, item.lowStockThreshold);
  return (
    <Card>
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-lg font-bold text-gray-900">{item.name}</Text>
          <Text className="mt-0.5 text-sm text-gray-500">{item.type}</Text>
        </View>
        <Badge label={item.type} tone={TYPE_TONE[item.type] ?? 'gray'} />
      </View>
      <View className="mt-3 flex-row items-center justify-between">
        <Text className="text-sm text-gray-500">
          Stock:{' '}
          <Text className="font-semibold text-gray-900">
            {item.currentStock} {item.unit}
          </Text>
        </Text>
        <Badge label={tone === 'red' ? 'LOW' : 'OK'} tone={tone} />
      </View>
      <Text className="mt-1 text-xs text-gray-500">
        Low-stock threshold: {item.lowStockThreshold} {item.unit}
      </Text>
    </Card>
  );
}

function PurchaseForm({
  quantity,
  unitCost,
  totalCost,
  notes,
  error,
  submitting,
  onQuantityChange,
  onUnitCostChange,
  onTotalCostChange,
  onNotesChange,
  onSubmit,
}: {
  quantity: string;
  unitCost: string;
  totalCost: string;
  notes: string;
  error: string | null;
  submitting: boolean;
  onQuantityChange: (value: string) => void;
  onUnitCostChange: (value: string) => void;
  onTotalCostChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <Text className="text-sm font-semibold text-gray-900">Purchase</Text>
      <View className="mt-3">
        <FormField label="Quantity">
          <Input
            value={quantity}
            onChangeText={onQuantityChange}
            keyboardType="decimal-pad"
            placeholder="0.0"
          />
        </FormField>
        <FormField label="Unit cost (optional)">
          <Input
            value={unitCost}
            onChangeText={onUnitCostChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Total cost (optional)">
          <Input
            value={totalCost}
            onChangeText={onTotalCostChange}
            keyboardType="decimal-pad"
            placeholder="0.00"
          />
        </FormField>
        <FormField label="Notes (optional)">
          <Input value={notes} onChangeText={onNotesChange} placeholder="Optional" />
        </FormField>
        {error ? <Text className="mb-2 text-xs font-medium text-red-600">{error}</Text> : null}
        <Button
          title={submitting ? 'Saving…' : 'Record Purchase'}
          onPress={onSubmit}
          loading={submitting}
        />
      </View>
    </Card>
  );
}

function ConsumeForm({
  quantity,
  batchId,
  notes,
  error,
  submitting,
  batches,
  willCrossThreshold,
  onQuantityChange,
  onBatchChange,
  onNotesChange,
  onSubmit,
}: {
  quantity: string;
  batchId: string;
  notes: string;
  error: string | null;
  submitting: boolean;
  batches: { id: string; batchNumber: string }[];
  willCrossThreshold: boolean;
  onQuantityChange: (value: string) => void;
  onBatchChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      <Text className="text-sm font-semibold text-gray-900">Consume</Text>
      <View className="mt-3">
        <FormField label="Quantity">
          <Input
            value={quantity}
            onChangeText={onQuantityChange}
            keyboardType="decimal-pad"
            placeholder="0.0"
          />
        </FormField>
        {batches.length > 0 ? (
          <FormField label="Batch (optional)">
            <Select
              options={[
                { label: 'No batch', value: '' },
                ...batches.map((batch) => ({ label: batch.batchNumber, value: batch.id })),
              ]}
              value={batchId}
              onChange={onBatchChange}
            />
          </FormField>
        ) : null}
        <FormField label="Notes (optional)">
          <Input value={notes} onChangeText={onNotesChange} placeholder="Optional" />
        </FormField>
        {willCrossThreshold ? (
          <Text className="mb-2 text-xs font-medium text-amber-700">
            This consumption will drop stock at or below the low-stock threshold.
          </Text>
        ) : null}
        {error ? <Text className="mb-2 text-xs font-medium text-red-600">{error}</Text> : null}
        <Button
          title={submitting ? 'Saving…' : 'Record Consumption'}
          onPress={onSubmit}
          loading={submitting}
          variant="secondary"
        />
      </View>
    </Card>
  );
}

function TransactionRow({ transaction }: { transaction: FeedTransaction }) {
  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Badge label={transaction.type} tone={TX_TONE[transaction.type] ?? 'gray'} />
        <Text className="text-xs text-gray-500">{transaction.transactionDate}</Text>
      </View>
      <View className="mt-2 flex-row gap-4">
        <Text className="text-sm font-semibold text-gray-900">
          {transaction.quantity}
        </Text>
        {transaction.unitCost !== null && transaction.unitCost !== undefined ? (
          <Text className="text-xs text-gray-500">Unit cost: {transaction.unitCost}</Text>
        ) : null}
        {transaction.totalCost !== null && transaction.totalCost !== undefined ? (
          <Text className="text-xs text-gray-500">Total: {transaction.totalCost}</Text>
        ) : null}
      </View>
      {transaction.notes ? (
        <Text className="mt-1 text-xs text-gray-500">{transaction.notes}</Text>
      ) : null}
    </Card>
  );
}