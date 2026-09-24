import { TextInput, type TextInputProps } from 'react-native';

export interface InputProps extends TextInputProps {
  className?: string;
}

/** Styled TextInput — numeric keyboards are passed through via `keyboardType`. */
export function Input({ className = '', ...props }: InputProps) {
  return (
    <TextInput
      placeholderTextColor="#9ca3af"
      className={`rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 ${className}`}
      {...props}
    />
  );
}