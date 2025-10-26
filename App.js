import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, Alert, TouchableOpacity, FlatList, Modal } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState, useEffect } from 'react';
import { getQueue, joinQueue, leaveQueue } from './app/services/api';
import { getSocket } from './app/services/realtime';
import { useQueueRealtime } from './app/hooks/useQueueRealtime';

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [currentView, setCurrentView] = useState('scanner'); // 'scanner' or 'queue'
  const [currentCourt, setCurrentCourt] = useState(null);
  const [queue, setQueue] = useState([]);
  const [userEntry, setUserEntry] = useState(null);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [pendingCourtId, setPendingCourtId] = useState(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  console.log('App state:', { 
    permission: permission?.granted, 
    currentView, 
    scanned 
  });

  // Set up real-time updates when in queue view using the improved hook
  const handleQueueSync = (newQueue, version) => {
    console.log('Received queue sync:', { queueLength: newQueue.length, version });
    setQueue(newQueue);
    // Update user entry if it still exists
    const updatedUserEntry = newQueue.find(item => item.id === userEntry?.id);
    if (updatedUserEntry) {
      setUserEntry(updatedUserEntry);
    } else {
      // User was removed from queue
      setUserEntry(null);
    }
  };

  // Use the improved real-time hook
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
        <TouchableOpacity style={styles.buttonContainer} onPress={handleRequestPermission}>
          <Text style={styles.button}>Grant Permission</Text>
        </TouchableOpacity>
        <Text style={styles.debugText}>Permission status: {JSON.stringify(permission)}</Text>
        <TouchableOpacity 
          style={[styles.buttonContainer, { backgroundColor: '#28a745', marginTop: 10 }]} 
          onPress={() => setCurrentView('queue')}
        >
          <Text style={styles.button}>Skip Camera (Test Mode)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarcodeScanned = ({ type, data }) => {
    if (scanned) {
      console.log('QR Code already scanned, ignoring');
      return; // Prevent multiple scans
    }
    
    console.log('QR Code scanned:', { type, data });
    setScanned(true);
    
    // Use the full QR code URL as the court ID
    const courtId = data;
    console.log('Using QR code URL as court ID:', courtId);
    
    handleJoinCourt(courtId);
  };

  const handleJoinCourt = (courtId) => {
    // Create a cleaner display name for the court
    const displayCourtId = courtId.length > 50 ? 
      `${courtId.substring(0, 47)}...` : 
      courtId;
    
    console.log('Showing join dialog for court:', courtId);
    setPendingCourtId(courtId);
    setShowJoinDialog(true);
  };

  const handleCancelJoin = () => {
    console.log('User cancelled join');
    setShowJoinDialog(false);
    setPendingCourtId(null);
    setScanned(false); // Reset scanner so they can scan again
  };

  const handleConfirmJoin = () => {
    console.log('User confirmed join for court:', pendingCourtId);
    setShowJoinDialog(false);
    if (pendingCourtId) {
      handleJoinQueue(pendingCourtId);
    }
    setPendingCourtId(null);
  };

  const handleJoinQueue = async (courtId, retryCount = 0) => {
    try {
      if (retryCount === 0) {
        setIsJoining(true);
      }
      
      console.log('Starting join queue process for court:', courtId, retryCount > 0 ? `(retry ${retryCount})` : '');
      
      // Generate a proper UUID for the entry ID
      const entryId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      const displayName = `Player ${Math.floor(Math.random() * 1000)}`;
      
      console.log('Joining queue with:', { courtId, entryId, displayName });
      
      // Join the queue
      const result = await joinQueue(courtId, entryId, displayName);
      
      console.log('Join successful, result:', result);
      
      // Update state
      setCurrentCourt(courtId);
      setQueue(result.queue);
      setUserEntry(result.entry);
      setCurrentView('queue');
      setScanned(false); // Reset scanner state
      setIsJoining(false);
      
      console.log('Switched to queue view');
      
      // Don't show success alert, just switch to queue view
    } catch (error) {
      console.error('Error joining queue:', error);
      
      // Retry logic for network errors
      if (error.message.includes('Network request failed') && retryCount < 2) {
        console.log(`Network error, retrying in 1 second... (attempt ${retryCount + 1})`);
        setTimeout(() => {
          handleJoinQueue(courtId, retryCount + 1);
        }, 1000);
        return;
      }
      
      // Show error after retries or for other errors
      setIsJoining(false);
      Alert.alert('Error', `Failed to join queue: ${error.message}`);
      setScanned(false); // Reset scanner on error
    }
  };

  const loadQueue = async (courtId) => {
    try {
      const result = await getQueue(courtId);
      setQueue(result.queue);
    } catch (error) {
      console.error('Error loading queue:', error);
    }
  };

  const goBackToScanner = () => {
    setCurrentView('scanner');
    setCurrentCourt(null);
    setQueue([]);
    setUserEntry(null);
  };

  const handleLeaveQueue = () => {
    setShowLeaveDialog(true);
  };

  const handleConfirmLeave = async () => {
    try {
      console.log('Leaving queue for court:', currentCourt);
      
      if (!currentCourt || !userEntry) {
        console.log('No court or user entry to leave');
        return;
      }

      // Leave the queue
      await leaveQueue(currentCourt, userEntry.id);
      
      console.log('Successfully left queue');
      
      // Go back to scanner
      goBackToScanner();
      
    } catch (error) {
      console.error('Error leaving queue:', error);
      Alert.alert('Error', `Failed to leave queue: ${error.message}`);
    } finally {
      setShowLeaveDialog(false);
    }
  };

  const handleCancelLeave = () => {
    setShowLeaveDialog(false);
  };

  // Queue View Component
  const renderQueueView = () => (
    <View style={styles.queueContainer}>
      <View style={styles.queueHeader}>
        <Text style={styles.queueTitle}>🏀 Court Queue</Text>
        <Text style={styles.courtId}>{currentCourt && currentCourt.length > 60 ? 
          `${currentCourt.substring(0, 57)}...` : 
          currentCourt}</Text>
        <TouchableOpacity style={styles.backButton} onPress={goBackToScanner}>
          <Text style={styles.backButtonText}>← Scan QR</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.queueInfo}>
        <Text style={styles.queueCount}>{queue.length} players in queue</Text>
        {userEntry && (
          <Text style={styles.userPosition}>
            You are #{userEntry.position} in line
          </Text>
        )}
      </View>

      <FlatList
        data={queue}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <View style={[
            styles.queueItem,
            item.id === userEntry?.id && styles.userQueueItem
          ]}>
            <Text style={styles.queuePosition}>#{item.position}</Text>
            <Text style={styles.queueName}>{item.display_name}</Text>
            {item.id === userEntry?.id && (
              <Text style={styles.youLabel}>YOU</Text>
            )}
          </View>
        )}
        style={styles.queueList}
      />

      <TouchableOpacity style={styles.refreshButton} onPress={() => loadQueue(currentCourt)}>
        <Text style={styles.refreshButtonText}>🔄 Refresh Queue</Text>
      </TouchableOpacity>

      {userEntry && (
        <TouchableOpacity 
          style={[styles.refreshButton, { backgroundColor: '#dc3545' }]} 
          onPress={handleLeaveQueue}
        >
          <Text style={styles.refreshButtonText}>🚪 Leave Queue</Text>
        </TouchableOpacity>
      )}
      
      {!currentCourt && (
        <TouchableOpacity 
          style={[styles.refreshButton, { backgroundColor: '#28a745' }]} 
          onPress={() => handleJoinQueue('demo')}
        >
          <Text style={styles.refreshButtonText}>🧪 Test Join Demo Court</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Scanner View Component
  const renderScannerView = () => (
    <View style={styles.container}>
      <CameraView
        style={styles.camera}
        facing="back"
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ["qr", "pdf417"],
        }}
      >
        <View style={styles.overlay}>
          <Text style={styles.instruction}>Point your camera at a QR code</Text>
        </View>
      </CameraView>
    </View>
  );

  return (
    <View style={styles.container}>
      {currentView === 'scanner' ? renderScannerView() : renderQueueView()}
      
      {/* Custom Join Dialog Modal */}
      <Modal
        visible={showJoinDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelJoin}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Join Court</Text>
            <Text style={styles.modalMessage}>
              Do you want to join queue for:{'\n'}
              {pendingCourtId && pendingCourtId.length > 50 ? 
                `${pendingCourtId.substring(0, 47)}...` : 
                pendingCourtId}?
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={handleCancelJoin}
                disabled={isJoining}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.joinButton, isJoining && styles.disabledButton]} 
                onPress={handleConfirmJoin}
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

      {/* Leave Queue Confirmation Modal */}
      <Modal
        visible={showLeaveDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelLeave}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Leave Queue</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to leave the queue?{'\n'}
              You will lose your position in line.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={handleCancelLeave}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.leaveButton]} 
                onPress={handleConfirmLeave}
              >
                <Text style={styles.leaveButtonText}>Leave Queue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  instruction: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 5,
  },
  message: {
    textAlign: 'center',
    paddingBottom: 20,
    color: 'white',
    fontSize: 18,
  },
  buttonContainer: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 10,
    marginBottom: 20,
  },
  button: {
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  debugText: {
    color: '#ccc',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
  },
  // Queue View Styles
  queueContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  queueHeader: {
    backgroundColor: '#667eea',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  queueTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  courtId: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 5,
    fontFamily: 'monospace',
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  queueInfo: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  queueCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  userPosition: {
    fontSize: 16,
    color: '#667eea',
    textAlign: 'center',
    marginTop: 5,
    fontWeight: 'bold',
  },
  queueList: {
    flex: 1,
    padding: 10,
  },
  queueItem: {
    backgroundColor: 'white',
    padding: 15,
    marginVertical: 5,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userQueueItem: {
    backgroundColor: '#667eea',
    borderWidth: 2,
    borderColor: '#5a6fd8',
  },
  queuePosition: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#667eea',
    width: 40,
    textAlign: 'center',
  },
  queueName: {
    fontSize: 18,
    color: '#333',
    flex: 1,
    marginLeft: 15,
  },
  youLabel: {
    backgroundColor: '#5a6fd8',
    color: 'white',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    fontSize: 12,
    fontWeight: 'bold',
  },
  refreshButton: {
    backgroundColor: '#667eea',
    margin: 20,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    margin: 20,
    minWidth: 300,
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 15,
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  joinButton: {
    backgroundColor: '#667eea',
  },
  leaveButton: {
    backgroundColor: '#dc3545',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  joinButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  leaveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});