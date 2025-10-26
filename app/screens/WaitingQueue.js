import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions } from 'react-native';

export default function WaitingQueue({ navigation }) {
  // Placeholder values until backend is connected
  const courtName = 'IM Court #2';
  const position = 2;
  const waitTime = '30 min';
  const currentTeam = 'Jermeni Lin';
  const queue = [
    { id: 1, name: "Shack O'Nelly", played: '10' },
    { id: 2, name: 'Lebroff James', played: '10', you: true },
    { id: 3, name: 'Dwane Fade', played: '10' },
    { id: 4, name: 'Elliot Soloway', played: '10' },
    { id: 5, name: 'Russell Eastbrook', played: '10' },
  ];

  return (
    <View style={styles.outer}>
      <View style={styles.phoneFrame}>
        {/* Court Header */}
        <Text style={styles.title}>{courtName}</Text>
        <Text style={styles.subtitle}>
          You are now in the queue! You will get notified when it is your turn.
        </Text>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Place in line</Text>
            <Text style={styles.statValue}>{position}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Estimated Wait Time</Text>
            <Text style={styles.statValue}>{waitTime}</Text>
          </View>
        </View>

        {/* Current Court */}
        <View style={styles.currentBox}>
          <Text style={styles.currentLabel}>Currently on</Text>
          <Text style={styles.currentTeam}>{currentTeam}</Text>
          <View style={styles.badges}>
            <Text style={styles.badge}>★ 10</Text>
            <Text style={styles.badge}>Played 8m</Text>
          </View>
        </View>

        {/* Queue List */}
        <View style={styles.queueContainer}>
          <Text style={styles.queueHeader}>Queue</Text>
          <FlatList
            data={queue}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <View style={[styles.queueItem, item.you && styles.youItem]}>
                <Text style={[styles.queuePosition, item.you && styles.youText]}>
                  {item.id}
                </Text>
                <Text style={[styles.queueName, item.you && styles.youText]}>
                  {item.name}
                </Text>
                <View style={styles.itemRight}>
                  {item.you && <Text style={styles.youBadge}>You</Text>}
                  <Text style={styles.playedBadge}>★ {item.played}</Text>
                </View>
              </View>
            )}
          />
        </View>

        {/* Leave Button */}
        <TouchableOpacity
          style={styles.leaveButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.leaveButtonText}>Leave</Text>
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
    paddingTop: 80,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subtitle: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statBox: {
    backgroundColor: '#3A3E44',
    borderWidth: 1,
    borderColor: '#FBAE17',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  statLabel: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  currentBox: {
    backgroundColor: '#A36C2D',
    borderWidth: 1,
    borderColor: '#FBAE17',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  currentLabel: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 6,
  },
  currentTeam: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  badges: {
    flexDirection: 'row',
    marginTop: 8,
  },
  badge: {
    color: '#fff',
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  queueContainer: {
    flex: 1,
    backgroundColor: '#30343A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
  },
  queueHeader: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  queueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#3A3E44',
    borderRadius: 10,
    padding: 14,
    marginVertical: 5,
    alignItems: 'center',
  },
  queuePosition: {
    color: '#fff',
    fontWeight: 'bold',
    width: 20,
  },
  queueName: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
  },
  youItem: {
    backgroundColor: '#4A5D3F',
  },
  youText: {
    color: '#C9F3C9',
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playedBadge: {
    color: '#ccc',
    fontSize: 12,
    backgroundColor: '#444',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    marginLeft: 6,
  },
  youBadge: {
    color: '#fff',
    fontSize: 12,
    backgroundColor: '#3EB489',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginRight: 6,
  },
  leaveButton: {
    backgroundColor: '#999',
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 16,
  },
  leaveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
