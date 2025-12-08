import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function Logo({ style }) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.logoText}>Courtside</Text>
      <Text style={styles.tagline}>Basketball Queue</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FBAE17',
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 4,
    letterSpacing: 1,
  },
});
