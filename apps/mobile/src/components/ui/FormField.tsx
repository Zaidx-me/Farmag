import { Text, View } from 'react-native';

export interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

/** Label + optional hint + React Hook Form error text around a field control. */
export function FormField({ label, error, hint, children }: FormFieldProps) {
  return (
    <View className="mb-4">
      <Text className="mb-1 text-sm font-medium text-gray-700">{label}</Text>
      {children}
      {hint ? <Text className="mt-1 text-xs text-gray-500">{hint}</Text> : null}
      {error ? <Text className="mt-1 text-xs font-medium text-red-600">{error}</Text> : null}
    </View>
  );
}