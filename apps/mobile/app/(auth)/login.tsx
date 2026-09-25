import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { loginSchema } from '@poultry/validation';

import { Button, Card, FormField, Input } from '@/src/components/ui';
import { useLoginAction } from '@/src/features/auth/actions';

export default function LoginScreen() {
  const { login, isSubmitting, error } = useLoginAction();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    // The server schema does not trim, so a padded pasted email would 400 on `.email()`.
    const result = loginSchema.safeParse({ email: email.trim(), password });
    if (!result.success) {
      setFormError(result.error.issues.map((issue) => issue.message).join('; '));
      return;
    }
    setFormError(null);
    await login(result.data);
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <Text className="text-base font-semibold text-gray-900">Sign In</Text>
          <View className="mt-3">
            <FormField label="Email">
              <Input
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </FormField>
            <FormField label="Password">
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
              />
            </FormField>
            {formError ?? error ? (
              <Text className="mb-2 text-xs font-medium text-red-600">
                {formError ?? error}
              </Text>
            ) : null}
            <Button
              title={isSubmitting ? 'Signing in…' : 'Sign In'}
              onPress={() => void submit()}
              loading={isSubmitting}
            />
          </View>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
