import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert,
  TextInput,
  Modal,
  Dimensions,
  StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { joinQueue, leaveQueue, getQueue } from './app/services/api';
import { useQueueRealtime } from './app/hooks/useQueueRealtime';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [currentView, setCurrentView] = useState('welcome'); // welcome, scanner, queue
  const [scanned, setScanned] = useState(false);
  const [scanComplete, setScanComplete] = useState(false); // New state to track if scan is complete
  const [courtId, setCourtId] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isJoining, setIsJoining] = useState(false);
  const [userEntry, setUserEntry] = useState(null);
  const [deviceId] = useState(() => {
    // Generate a more stable device ID that persists across app restarts
    // Use a combination of device characteristics for better uniqueness
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 8);
    const sessionId = `${timestamp}_${random}`;
    
    // Store in AsyncStorage for persistence across app restarts
    try {
      // For now, just use the session ID, but this could be enhanced with AsyncStorage
      return `device_${sessionId}`;
    } catch (error) {
      console.log('Error generating device ID:', error);
      return `device_${sessionId}`;
    }
  });

  const [permission, requestPermission] = useCameraPermissions();

  // Integrate real-time updates using the hook
  useQueueRealtime(courtId, (newQueue, version) => {
    console.log('Received queue sync:', { queueLength: newQueue.length, version });
    setQueue(newQueue);
    const updatedUserEntry = newQueue.find(item => item.id === userEntry?.id);
    if (updatedUserEntry) {
      setUserEntry(updatedUserEntry);
    } else {
      setUserEntry(null);
    }
  });

  const handleBarCodeScanned = useCallback(async ({ type, data }) => {
    // Only allow one scan per session
    if (scanned || scanComplete || isJoining) {
      console.log('Scan blocked - already scanned or processing:', { scanned, scanComplete, isJoining });
      return;
    }
    
    console.log('QR Code scanned:', { data, type });
    setScanned(true);
    setScanComplete(true); // Mark scan as complete - no more scanning allowed
    setCourtId(data);
    setIsJoining(true);
    
    // Check if this device is already in the queue
    try {
      const currentQueue = await getQueue(data);
      const existingEntry = currentQueue.queue.find(entry => 
        entry.display_name.includes(deviceId)
      );

      if (existingEntry) {
        // Device is already in the queue, go directly to queue screen
        console.log('Device already in queue, showing queue screen');
        setUserEntry(existingEntry);
        setQueue(currentQueue.queue);
        setCurrentView('queue');
        setIsJoining(false);
        return;
      }

      // Device not in queue, join automatically
      console.log('Device not in queue, joining automatically');
      await handleJoinQueue(data);
    } catch (error) {
      console.error('Error checking queue status:', error);
      // If there's an error, still try to join
      await handleJoinQueue(data);
    }
  }, [scanned, scanComplete, isJoining, deviceId]);

  const handleJoinQueue = async (courtIdParam = null) => {
    const targetCourtId = courtIdParam || courtId;
    if (!targetCourtId) {
      Alert.alert('Error', 'No court ID available');
      return;
    }

    if (isJoining) {
      console.log('Already joining queue, ignoring duplicate request');
      return;
    }

    // Only allow one join attempt per scan
    if (scanComplete && isJoining) {
      console.log('Join already attempted for this scan');
      return;
    }

    try {
      // Generate a proper UUID format
      const entryId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      
      // Generate a random player number
      const playerNumber = Math.floor(Math.random() * 999) + 1;
      // Use shorter device ID to avoid constraint issues
      const shortDeviceId = deviceId.split('_').pop(); // Get last part after underscore
      const displayName = `Player ${playerNumber} (${shortDeviceId})`;
      
      console.log('Joining queue with:', { courtId: targetCourtId, displayName, entryId });

      const result = await joinQueue(targetCourtId, entryId, displayName);
      console.log('Join successful, result:', result);

      setUserEntry(result.entry);
      setQueue(result.queue);
      setCurrentView('queue');
    } catch (error) {
      console.error('Error joining queue:', error);
      Alert.alert('Error', 'Failed to join queue. Please try again.');
      // Reset states to allow retry
      setScanned(false);
      setScanComplete(false);
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveQueue = async () => {
    if (!userEntry) return;

    try {
      await leaveQueue(courtId, userEntry.id);
      console.log('Successfully left queue');

      setUserEntry(null);
      setQueue([]);
      setCourtId(null);
      setScanned(false);
      setScanComplete(false); // Reset scan complete state
      setIsJoining(false); // Reset joining state
      setCurrentView('scanner');
    } catch (error) {
      console.error('Error leaving queue:', error);
      Alert.alert('Error', 'Failed to leave queue');
    }
  };

  const resetToWelcome = () => {
    setCurrentView('welcome');
    setScanned(false);
    setScanComplete(false); // Reset scan complete state
    setCourtId(null);
    setUserEntry(null);
    setQueue([]);
    setIsJoining(false); // Reset joining state
  };

  // Welcome Screen
  if (currentView === 'welcome') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#111" />
        <View style={styles.welcomeContent}>
          <Text style={styles.welcomeTitle}>Welcome to Courtside</Text>
          <Text style={styles.welcomeSubtitle}>Scan a court QR code to join the queue</Text>
          <TouchableOpacity 
            style={styles.scanButton}
            onPress={() => setCurrentView('scanner')}
          >
            <Text style={styles.scanButtonText}>Scan Court QR Code</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // QR Scanner Screen
  if (currentView === 'scanner') {
    if (!permission) {
      return (
        <View style={styles.container}>
          <Text style={styles.text}>Requesting camera permission...</Text>
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={styles.container}>
          <Text style={styles.text}>No access to camera</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={resetToWelcome}>
            <Text style={styles.buttonText}>Back to Welcome</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#111" />
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanned || scanComplete || isJoining ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ["qr"],
          }}
        >
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerBox}>
              <Text style={styles.scannerText}>Point camera at QR code</Text>
            </View>
            <TouchableOpacity style={styles.backButton} onPress={resetToWelcome}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
      </SafeAreaView>
    );
  }

  // Queue Screen
  if (currentView === 'queue') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#111" />
        <View style={styles.queueHeader}>
          <Text style={styles.queueTitle}>Queue</Text>
          <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveQueue}>
            <Text style={styles.leaveButtonText}>Leave Queue</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.queueContent}>
          {queue.length === 0 ? (
            <Text style={styles.emptyQueue}>No one in queue</Text>
          ) : (
            queue.map((entry, index) => (
              <View 
                key={entry.id} 
                style={[
                  styles.queueItem,
                  entry.id === userEntry?.id && styles.currentUserItem,
                  index === 0 && styles.nextUpItem
                ]}
              >
                <Text style={styles.queuePosition}>{index + 1}</Text>
                <Text style={styles.queueName}>{entry.display_name}</Text>
                {index === 0 && (
                  <Text style={styles.nextUpLabel}>NEXT UP!</Text>
                )}
                {entry.id === userEntry?.id && (
                  <Text style={styles.youLabel}>You</Text>
                )}
              </View>
            ))
          )}
        </View>
      </SafeAreaView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  text: {
    fontSize: 24,
    color: '#FBAE17',
    fontWeight: 'bold',
  },
  
  // Welcome Screen
  welcomeContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FBAE17',
    textAlign: 'center',
    marginBottom: 16,
  },
  welcomeSubtitle: {
    fontSize: 18,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 40,
  },
  scanButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  scanButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  
  // Scanner Screen
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#FBAE17',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scannerText: {
    color: '#FBAE17',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#222',
    borderRadius: 16,
    padding: 24,
    width: width * 0.8,
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FBAE17',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 24,
  },
  nameInput: {
    backgroundColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: 'white',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#555',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: '#666',
  },
  joinButton: {
    backgroundColor: '#667eea',
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  joinButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  
  // Queue Screen
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 50, // Extra padding to account for status bar
    backgroundColor: '#222',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  queueTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FBAE17',
  },
  leaveButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  leaveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  queueContent: {
    flex: 1,
    padding: 20,
  },
  emptyQueue: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 40,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  currentUserItem: {
    backgroundColor: '#1a3a5c',
    borderColor: '#667eea',
  },
  nextUpItem: {
    backgroundColor: '#2d5016',
    borderColor: '#4CAF50',
    borderWidth: 2,
  },
  queuePosition: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FBAE17',
    width: 30,
    textAlign: 'center',
  },
  queueName: {
    flex: 1,
    fontSize: 16,
    color: 'white',
    marginLeft: 12,
  },
  youLabel: {
    fontSize: 12,
    color: '#667eea',
    fontWeight: 'bold',
    backgroundColor: '#667eea',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  nextUpLabel: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: 'bold',
    backgroundColor: '#4CAF50',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  
  // General
  button: {
    backgroundColor: '#667eea',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});