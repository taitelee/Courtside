import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';

export default function JoinQueue({ navigation }) {
  // Placeholder values until backend logic connects
  const courtName = 'IM Court #2';
  const teamsWaiting = 2;
  const estimatedWait = '30 min';

  return (
    <View style={styles.outer}>
      <View style={styles.phoneFrame}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.subtext}>You are trying to queue for</Text>
          <Text style={styles.title}>{courtName}</Text>
        </View>

        {/* Stats Box */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Teams waiting</Text>
            <Text style={styles.statValue}>{teamsWaiting}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Estimated wait</Text>
            <Text style={styles.statValue}>{estimatedWait}</Text>
          </View>
        </View>

        {/* Buttons */}
        <TouchableOpacity
          style={[styles.button, styles.joinButton]}
          onPress={() => console.log('Join Queue pressed')}>
          <Text style={styles.buttonText}>Join Queue</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.backButton]}
          onPress={() => navigation.goBack()}>
          <Text style={[styles.buttonText, styles.backButtonText]}>Go Back</Text>
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
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  subtext: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 6,
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#888',
    borderRadius: 10,
    width: '80%',
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginBottom: 60,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 8,
  },
  statValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  button: {
    width: '80%',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  joinButton: {
    backgroundColor: '#FBAE17',
  },
  backButton: {
    backgroundColor: '#999',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backButtonText: {
    color: '#fff',
  },
});
