import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemedStyles, type Colors } from '@/lib/theme';

interface ProgressIndicatorProps {
  current: number;
  total: number;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ current, total }) => {
  const styles = useThemedStyles(makeStyles);
  const showGaps = total <= 12;

  return (
    <View style={styles.container}>
      <View style={styles.progressBarContainer}>
        {showGaps ? (
          <View style={styles.gapsContainer}>
            {Array.from({ length: total }).map((_, index) => (
              <View
                key={index}
                style={[
                  styles.gapSegment,
                  index < current && styles.filledSegment,
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={[styles.progressBar, { width: `${(current / total) * 100}%` }]} />
        )}
      </View>
      <Text style={styles.text}>{current}/{total}</Text>
    </View>
  );
};

const makeStyles = (c: Colors) => StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
  },
  text: {
    fontWeight: 'bold',
    color: c.textMuted,
    fontSize: 12,
  },
  progressBarContainer: {
    alignSelf: 'stretch',
    height: 8,
    backgroundColor: c.track,
  },
  progressBar: {
    height: '100%',
    backgroundColor: c.primary,
  },
  gapsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    gap: 4,
    backgroundColor: c.bg,
  },
  gapSegment: {
    flex: 1,
    marginHorizontal: 1,
    backgroundColor: c.track,
  },
  filledSegment: {
    backgroundColor: c.primary,
  },
});

export default ProgressIndicator;