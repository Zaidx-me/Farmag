import { Text, View } from 'react-native';

export type BadgeTone = 'green' | 'amber' | 'red' | 'gray' | 'blue';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  green: 'bg-green-100 text-green-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-800',
};

export function Badge({ label, tone = 'gray' }: BadgeProps) {
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${TONE_CLASSES[tone]}`}>
      <Text className="text-xs font-semibold">{label}</Text>
    </View>
  );
}