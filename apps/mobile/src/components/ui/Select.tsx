import { Pressable, Text, View } from 'react-native';

export interface SelectOption<T extends string> {
  label: string;
  value: T;
}

export interface SelectProps<T extends string> {
  options: readonly SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** Segmented control for enum filters (status, farm, …). */
export function Select<T extends string>({ options, value, onChange, className = '' }: SelectProps<T>) {
  return (
    <View className={`flex-row rounded-xl bg-gray-100 p-1 ${className}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            className={`flex-1 items-center rounded-lg px-3 py-2 ${selected ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-medium ${selected ? 'text-gray-900' : 'text-gray-500'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}