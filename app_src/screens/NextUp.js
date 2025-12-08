import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function NextUp({ navigation }) {
  const [timeLeft, setTimeLeft] = useState(58); // placeholder seconds

  // Simple countdown
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.outer}>
      <View style={styles.phoneFrame}>
        {/* Header */}
        <Text style={styles.title}>IM Court #2</Text>
        <Text style={styles.subtitle}>You are next!</Text>

        {/* Countdown Box */}
        <View style={styles.timerBox}>
          <Text style={styles.timerLabel}>Please be on the courts in</Text>
          <Text style={styles.timer}>{formatTime(timeLeft)}</Text>
        </View>

        {/* Confirm Button */}
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => navigation.navigate('Waiting Queue')}>
          <Text style={styles.confirmText}>I am here</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const phoneWidth = 390;
const phoneHeight = 844;

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  phoneFrame: {
    width: phoneWidth,
    height: phoneHeight,
    backgroundColor: '#2C2F33',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 18,
    color: '#FBAE17',
    marginBottom: 30,
  },
  timerBox: {
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginBottom: 40,
  },
  timerLabel: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 8,
  },
  timer: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#FBAE17',
    paddingVertical: 15,
    borderRadius: 10,
    width: '70%',
    alignItems: 'center',
  },
  confirmText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
