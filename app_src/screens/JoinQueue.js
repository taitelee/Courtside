import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Alert, Modal } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { getQueue, joinQueue } from '../services/api';
import { useQueueRealtime } from '../hooks/useQueueRealtime';

export default function JoinQueue({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [currentCourt, setCurrentCourt] = useState(null);
  const [queue, setQueue] = useState([]);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [pendingCourtId, setPendingCourtId] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  // Real-time updates for queue data
  const handleQueueSync = (newQueue, version) => {
    setQueue(newQueue);
  };

  useQueueRealtime(currentCourt, handleQueueSync);

  const handleRequestPermission = async () => {
    console.log('Requesting camera permission...');
    try {
      const result = await requestPermission();
      console.log('Permission result:', result);
    } catch (error) {
      console.error('Permission request error:', error);
    }
  };

  const handleBarcodeScanned = ({ data }) => {
    if (scanned) return;
    
    console.log('QR Code scanned:', { data, type: 'qr' });
    setScanned(true);
    
    // Use the QR code URL as court ID
    const courtId = data;
    console.log('Using QR code URL as court ID:', courtId);
    setCurrentCourt(courtId);
    setPendingCourtId(courtId);
    setShowJoinDialog(true);
  };

  const handleJoinQueue = async () => {
    if (!pendingCourtId) return;
    
    setIsJoining(true);
    try {
      console.log('Starting join queue process for court:', pendingCourtId);
      
      const displayName = `Player ${Math.floor(Math.random() * 1000)}`;
      const entryId = `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('Joining queue with:', { courtId: pendingCourtId, displayName, entryId });
      
      const result = await joinQueue(pendingCourtId, entryId, displayName);
      console.log('Join successful, result:', result);
      
      setShowJoinDialog(false);
      setScanned(false);
      setCurrentCourt(pendingCourtId);
      
      // Navigate to queue view
      navigation.navigate('Waiting Queue', { courtId: pendingCourtId });
      
    } catch (error) {
      console.error('Error joining queue:', error);
      Alert.alert('Error', 'Failed to join queue. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleCancel = () => {
    setShowJoinDialog(false);
    setScanned(false);
    setPendingCourtId(null);
  };

  // Load queue data when court is set
  useEffect(() => {
    if (currentCourt) {
      const loadQueue = async () => {
        try {
          const data = await getQueue(currentCourt);
          setQueue(data.queue);
        } catch (error) {
          console.error('Error loading queue:', error);
        }
      };
      loadQueue();
    }
  }, [currentCourt]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Loading camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={handleRequestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const teamsWaiting = queue.length;
  const estimatedWait = teamsWaiting > 0 ? `${teamsWaiting * 15} min` : 'No wait';

  return (
    <View style={styles.outer}>
      <View style={styles.phoneFrame}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.subtext}>Scan QR code to join queue</Text>
          <Text style={styles.title}>Join Queue</Text>
        </View>

        {/* Camera View */}
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={handleBarcodeScanned}
          />
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

        {/* Join Queue Dialog */}
        <Modal
          visible={showJoinDialog}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Join Queue?</Text>
              <Text style={styles.modalText}>
                Do you want to join the queue for this court?
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={handleCancel}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.joinButton]}
                  onPress={handleJoinQueue}
                  disabled={isJoining}
                >
                  <Text style={styles.joinButtonText}>
                    {isJoining ? 'Joining...' : 'Join Queue'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    marginBottom: 20,
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
  cameraContainer: {
    width: '100%',
    height: 200,
    marginBottom: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
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
    marginBottom: 20,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#2C2F33',
    borderRadius: 20,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalText: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  joinButton: {
    backgroundColor: '#FBAE17',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  joinButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  message: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#FBAE17',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
