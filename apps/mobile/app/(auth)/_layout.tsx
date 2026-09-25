import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useAuthStore } from '@/src/store/auth-store';

export default function AuthLayout() {
  const status = useAuthStore((s) => s.status);

  // Mirrors the `(app)` guard: an authenticated visitor who lands on /login (a
  // stale tab, a bookmark, a manual URL) belongs in the app, not on the form.
  if (status === 'restoring') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (status === 'authenticated') {
    return <Redirect href="/" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
  );
}
