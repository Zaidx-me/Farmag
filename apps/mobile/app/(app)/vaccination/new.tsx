import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';

import { createVaccinationSchema } from '@poultry/validation';

import {
  Button,
  Card,
  FormField,
  Input,
  OfflineBanner,
  ScreenState,
} from '@/src/components/ui';
import { todayISO } from '@/src/features/daily-entry/record';
import { useVaccinationActions } from '@/src/features/vaccinations/actions';
import { useSync } from '@/src/hooks/useSync';

export default function NewVaccinationScreen() {
  const router = useRouter();
  const { batchId } = useLocalSearchParams<{ batchId: string }>();
  const { pendingCount, refresh } = useSync();
  const { add, isSubmitting, error } = useVaccinationActions(batchId ?? '');

  const [vaccineName, setVaccineName] = useState('');
  const [scheduledDate, setScheduledDate] = useState(todayISO());
  const [dose, setDose] = useState('');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async () => {
    const result = createVaccinationSchema.safeParse({
      vaccineName,
      scheduledDate,
      ...(dose !== '' ? { dose } : {}),
      ...(supplier !== '' ? { supplier } : {}),
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
      <ScreenState loading={batchId === undefined || batchId === ''}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Card>
            <Text className="text-base font-semibold text-gray-900">New Vaccination</Text>
            <View className="mt-3">
              <FormField label="Vaccine name">
                <Input
                  value={vaccineName}
                  onChangeText={setVaccineName}
                  placeholder="e.g. Newcastle"
                />
              </FormField>
              <FormField label="Scheduled date (YYYY-MM-DD)">
                <Input
                  value={scheduledDate}
                  onChangeText={setScheduledDate}
                  placeholder="2026-09-24"
                  autoCapitalize="none"
                />
              </FormField>
              <FormField label="Dose (optional)">
                <Input value={dose} onChangeText={setDose} placeholder="e.g. 0.5 ml" />
              </FormField>
              <FormField label="Supplier (optional)">
                <Input value={supplier} onChangeText={setSupplier} placeholder="Optional" />
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
                title={isSubmitting ? 'Saving…' : 'Add Vaccination'}
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