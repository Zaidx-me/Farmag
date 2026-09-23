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
    </Stack>
  );
}