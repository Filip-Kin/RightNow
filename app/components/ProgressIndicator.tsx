import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ProgressIndicatorProps {
  current: number;
  total: number;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({ current, total }) => {
  const showGaps = total <= 12;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{current}/{total}</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  text: {
    marginRight: 10,
    fontWeight: 'bold',
  },
  progressBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007bff',
  },
  gapsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flex: 1,
    gap: 4,
    backgroundColor: '#fff',
  },
  gapSegment: {
    flex: 1,
    marginHorizontal: 1,
    backgroundColor: '#e0e0e0',
  },
  filledSegment: {
    backgroundColor: '#007bff',
  },
});

export default ProgressIndicator;