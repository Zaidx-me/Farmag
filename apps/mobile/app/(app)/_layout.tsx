import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '@/src/store/auth-store';

export default function AppLayout() {
  const status = useAuthStore((s) => s.status);

  // Hydration from SecureStore is async — hold the gate open until it settles
  // so we never flash-redirect an authenticated user to /login.
  if (status === 'restoring') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status !== 'authenticated') {
    return <Redirect href="/login" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="batch/[batchId]" options={{ headerShown: true, title: 'Batch' }} />
      <Stack.Screen
        name="daily-entry/[batchId]"
        options={{ headerShown: true, title: 'Daily Entry' }}
      />
      <Stack.Screen
        name="feed/[feedItemId]"
        options={{ headerShown: true, title: 'Feed Item' }}
      />
      <Stack.Screen
        name="vaccination/new"
        options={{ headerShown: true, title: 'New Vaccination' }}
      />
      <Stack.Screen
        name="expense/new"
        options={{ headerShown: true, title: 'New Expense' }}
      />
      <Stack.Screen
        name="expense/[expenseId]"
        options={{ headerShown: true, title: 'Expense' }}
      />
      <Stack.Screen
        name="sale/new"
        options={{ headerShown: true, title: 'New Sale' }}
      />
      <Stack.Screen
        name="sale/[saleId]"
        options={{ headerShown: true, title: 'Sale' }}
      />
    </Stack>
  );
}