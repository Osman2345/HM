import { StyleSheet, View, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';

interface SkeletonProps {
  style?: StyleProp<ViewStyle>;
}

export default function Skeleton({ style }: SkeletonProps) {
  const colorScheme = useColorScheme();

  return (
    <View
      accessible={false}
      style={[
        styles.base,
        { backgroundColor: colorScheme === 'dark' ? '#374151' : '#E5E7EB' },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 6,
  },
});
