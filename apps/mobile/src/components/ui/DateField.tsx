import { Text, View } from 'react-native';

export interface DateFieldProps {
  label: string;
  value: string;
  error?: string;
}

/**
 * Read-only date display (YYYY-MM-DD). The daily entry is always recorded for
 * today, so no native date-picker dependency is required for this screen.
 */
export function DateField({ label, value, error }: DateFieldProps) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-medium text-gray-700">{label}</Text>
      <View className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <Text className="text-base text-gray-900">{value}</Text>
      </View>
      {error ? <Text className="mt-1 text-xs font-medium text-red-600">{error}</Text> : null}
    </View>
  );
}