import { ActivityIndicator, Pressable, Text } from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-green-600 active:bg-green-700',
  secondary: 'bg-gray-100 active:bg-gray-200',
  destructive: 'bg-red-600 active:bg-red-700',
  ghost: 'bg-transparent',
};

const TEXT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'text-white',
  secondary: 'text-gray-900',
  destructive: 'text-white',
  ghost: 'text-green-700',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`items-center justify-center rounded-xl px-4 py-3 ${VARIANT_CLASSES[variant]} ${
        isDisabled ? 'opacity-50' : ''
      } ${className}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'destructive' ? '#ffffff' : '#111827'} />
      ) : (
        <Text className={`text-sm font-semibold ${TEXT_CLASSES[variant]}`}>{title}</Text>
      )}
    </Pressable>
  );
}