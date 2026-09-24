import { Pressable, View, type ViewProps } from 'react-native';

export interface CardProps extends ViewProps {
  onPress?: () => void;
}

/** White rounded container; `onPress` makes it tappable (list rows, etc.). */
export function Card({ onPress, className = '', children, ...props }: CardProps) {
  const content = (
    <View className={`rounded-xl border border-gray-200 bg-white p-4 ${className}`} {...props}>
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-80">
        {content}
      </Pressable>
    );
  }
  return content;
}