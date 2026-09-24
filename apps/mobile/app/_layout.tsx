import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View } from 'react-native';

import { SyncIndicator } from '@/src/components/SyncIndicator';
import { useAuthStore } from '@/src/store/auth-store';

import '../global.css';

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient());
  const authStatus = useAuthStore((s) => s.status);

  return (
    <QueryClientProvider client={queryClient}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(app)" />
        </Stack>
        {authStatus === 'authenticated' ? <SyncIndicator /> : null}
      </View>
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}