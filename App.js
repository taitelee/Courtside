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
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { joinQueue, leaveQueue, getQueue } from './app/services/api';
import { useQueueRealtime } from './app/hooks/useQueueRealtime';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [currentView, setCurrentView] = useState('welcome'); // welcome, scanner, nameInput, queue
  const [scanned, setScanned] = useState(false);
  const [scanComplete, setScanComplete] = useState(false); // New state to track if scan is complete
  const [courtId, setCourtId] = useState(null);
  const [queue, setQueue] = useState([]);
  const [isJoining, setIsJoining] = useState(false);
  const [userEntry, setUserEntry] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [deviceId, setDeviceId] = useState(null);

  // Load or generate persistent device ID
  useEffect(() => {
    const loadOrGenerateDeviceId = async () => {
      try {
        // Try to load existing device ID from storage
        const storedDeviceId = await AsyncStorage.getItem('deviceId');
        
        if (storedDeviceId) {
          console.log('Loaded existing device ID:', storedDeviceId);
          setDeviceId(storedDeviceId);
        } else {
          // Generate new device ID if none exists
          const timestamp = Date.now().toString(36);
          const random1 = Math.random().toString(36).substr(2, 9);
          const random2 = Math.random().toString(36).substr(2, 9);
          const random3 = Math.random().toString(36).substr(2, 9);
          const random4 = Math.random().toString(36).substr(2, 9);
          
          const uniqueId = `${timestamp}_${random1}_${random2}_${random3}_${random4}`;
          const newDeviceId = `device_${uniqueId}`;
          
          console.log('Generated new device ID:', newDeviceId);
          
          // Store the new device ID
          await AsyncStorage.setItem('deviceId', newDeviceId);
          setDeviceId(newDeviceId);
        }
      } catch (error) {
        console.error('Error loading/generating device ID:', error);
        // Fallback to generating a new one
        const timestamp = Date.now().toString(36);
        const random1 = Math.random().toString(36).substr(2, 9);
        const random2 = Math.random().toString(36).substr(2, 9);
        const random3 = Math.random().toString(36).substr(2, 9);
        const random4 = Math.random().toString(36).substr(2, 9);
        
        const uniqueId = `${timestamp}_${random1}_${random2}_${random3}_${random4}`;
        const fallbackDeviceId = `device_${uniqueId}`;
        
        console.log('Using fallback device ID:', fallbackDeviceId);
        setDeviceId(fallbackDeviceId);
      }
    };

    loadOrGenerateDeviceId();
  }, []);

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

    // Ensure device ID is loaded before proceeding
    if (!deviceId) {
      console.log('Device ID not loaded yet, waiting...');
      return;
    }
    
    console.log('QR Code scanned:', { data, type, dataType: typeof data, dataStringified: JSON.stringify(data) });
    setScanned(true);
    setScanComplete(true); // Mark scan as complete - no more scanning allowed
    
    // Ensure data is a string - handle both string and object cases
    let courtIdString;
    if (typeof data === 'string') {
      courtIdString = data;
    } else if (typeof data === 'object' && data !== null) {
      // If data is an object, try to extract the URL from it
      courtIdString = data.data || data.url || data.courtId || JSON.stringify(data);
    } else {
      courtIdString = String(data);
    }
    
    setCourtId(courtIdString);
    console.log('Set courtId to:', courtIdString, 'Type:', typeof courtIdString, 'Is string:', typeof courtIdString === 'string');
    
    // Check if this device is already in the queue for this court
    try {
      console.log('Checking if device is already in queue for court:', courtIdString);
      const currentQueue = await getQueue(courtIdString);
      console.log('Current queue:', currentQueue);
      
      // Look for existing entry with this specific device ID
      // Use a longer portion of the device ID for better uniqueness
      const deviceIdSuffix = deviceId.substring(deviceId.length - 12); // Use last 12 characters
      console.log('Looking for device ID suffix:', deviceIdSuffix, 'in queue entries');
      console.log('Full device ID:', deviceId);
      
      const existingEntry = currentQueue.queue.find(entry => {
        const hasDeviceId = entry.display_name && entry.display_name.endsWith(`(${deviceIdSuffix})`);
        console.log('Checking entry:', entry.display_name, 'has device ID suffix:', hasDeviceId);
        return hasDeviceId;
      });

      if (existingEntry) {
        // Device is already in the queue, go directly to queue screen
        console.log('Device already in queue, showing queue screen with existing position:', existingEntry.position);
        setUserEntry(existingEntry);
        setQueue(currentQueue.queue);
        setCurrentView('queue');
        return;
      }

      // Device not in queue, go to name input screen
      console.log('Device not in queue, going to name input screen');
      setCurrentView('nameInput');
    } catch (error) {
      console.error('Error checking queue status:', error);
      // If there's an error, go to name input screen
      setCurrentView('nameInput');
    }
  }, [scanned, scanComplete, isJoining, deviceId]);

  const handleJoinQueue = async (courtIdParam = null) => {
    // Ensure device ID is loaded before proceeding
    if (!deviceId) {
      console.log('Device ID not loaded yet, cannot join queue');
      Alert.alert('Error', 'Device not ready. Please try again.');
      return;
    }

    // Handle case where courtIdParam might be an event object
    let targetCourtId;
    if (courtIdParam === null || courtIdParam === undefined) {
      targetCourtId = courtId;
    } else if (typeof courtIdParam === 'string') {
      targetCourtId = courtIdParam;
    } else {
      // If it's an event object or other non-string, use the state courtId
      targetCourtId = courtId;
    }
    
    console.log('handleJoinQueue called with:', { 
      courtIdParamType: typeof courtIdParam,
      courtId, 
      targetCourtId, 
      targetCourtIdType: typeof targetCourtId,
      deviceId
    });
    
    if (!targetCourtId) {
      Alert.alert('Error', 'No court ID available');
      return;
    }

    if (isJoining) {
      console.log('Already joining queue, ignoring duplicate request');
      return;
    }

    if (!playerName.trim()) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }

    try {
      setIsJoining(true);
      
      // Ensure targetCourtId is a string and log the conversion
      let courtIdString;
      if (typeof targetCourtId === 'string') {
        courtIdString = targetCourtId;
      } else if (typeof targetCourtId === 'object' && targetCourtId !== null) {
        // If it's an object, try to extract the URL
        courtIdString = targetCourtId.data || targetCourtId.url || targetCourtId.courtId || JSON.stringify(targetCourtId);
      } else {
        courtIdString = String(targetCourtId);
      }
      
      console.log('Court ID conversion:', {
        original: targetCourtId,
        converted: courtIdString,
        originalType: typeof targetCourtId,
        convertedType: typeof courtIdString,
        isString: typeof courtIdString === 'string'
      });
      
      // Generate a proper UUID v4 format for entry ID
      let entryId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(entryId)) {
        console.error('Invalid UUID generated:', entryId);
        // Fallback to a simple timestamp-based ID
        entryId = Date.now().toString(36) + Math.random().toString(36).substr(2);
        console.log('Using fallback ID:', entryId);
      }
      
      console.log('Generated entryId:', entryId, 'Length:', entryId.length, 'Valid UUID:', uuidRegex.test(entryId));
      
      // Use the player's name with a device identifier as display_name
      // Format: "PlayerName (deviceIdSuffix)" where deviceIdSuffix is the last 12 characters
      const deviceIdSuffix = deviceId.substring(deviceId.length - 12); // Use last 12 characters
      const displayName = `${playerName.trim()} (${deviceIdSuffix})`;
      console.log('Creating entry with device ID suffix:', deviceIdSuffix, 'full deviceId:', deviceId);
      
      console.log('Joining queue with:', { 
        courtId: courtIdString, 
        courtIdType: typeof courtIdString,
        displayName, 
        entryId 
      });

      const result = await joinQueue(courtIdString, entryId, displayName);
      console.log('Join successful, result:', result);

      setUserEntry(result.entry);
      setQueue(result.queue);
      setCurrentView('queue');
    } catch (error) {
      console.error('Error joining queue:', error);
      Alert.alert('Error', 'Failed to join queue. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveQueue = async () => {
    if (!userEntry) return;

    console.log('Leaving queue with:', {
      courtId,
      courtIdType: typeof courtId,
      userEntryId: userEntry.id,
      courtIdStringified: JSON.stringify(courtId)
    });

    try {
      // Ensure courtId is a string with robust conversion
      let courtIdString;
      if (typeof courtId === 'string') {
        courtIdString = courtId;
      } else if (typeof courtId === 'object' && courtId !== null) {
        // If it's an object, try to extract the URL
        courtIdString = courtId.data || courtId.url || courtId.courtId || JSON.stringify(courtId);
      } else {
        courtIdString = String(courtId);
      }
      
      console.log('Leave queue court ID conversion:', {
        original: courtId,
        converted: courtIdString,
        originalType: typeof courtId,
        convertedType: typeof courtIdString
      });
      
      await leaveQueue(courtIdString, userEntry.id);
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
    setPlayerName(''); // Reset player name
  };

  // Function to clean display name by removing device ID
  const cleanDisplayName = (displayName) => {
    if (!displayName) return displayName;
    // Remove the device ID part: "PlayerName (deviceId)" -> "PlayerName"
    return displayName.replace(/\s*\([^)]+\)$/, '');
  };

  // Welcome Screen
  if (currentView === 'welcome') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#111" />
        <View style={styles.welcomeContent}>
          <View style={styles.logoContainer}>
            <Image
              source={require('./assets/courtsideLogo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.welcomeTitle}>Welcome to Courtside</Text>
          <Text style={styles.welcomeSubtitle}>Scan a court QR code to join its queue</Text>
          <TouchableOpacity 
            style={styles.scanButton}
            onPress={() => setCurrentView('scanner')}
          >
            <Text style={styles.scanButtonText}>Let's Start</Text>
            <Ionicons name="arrow-forward" size={20} color="#000" style={styles.icon} />
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

  // Name Input Screen
  if (currentView === 'nameInput') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#111" />
        <View style={styles.nameInputContent}>
          <View style={styles.nameInputHeader}>
            <Ionicons name="person" size={48} color="#FBAE17" style={styles.nameInputIcon} />
            <Text style={styles.nameInputTitle}>Enter Your Name</Text>
            <Text style={styles.nameInputSubtitle}>What should we call you in the queue?</Text>
          </View>
          
          <View style={styles.nameInputForm}>
            <TextInput
              style={styles.nameInputField}
              placeholder="Enter your name"
              placeholderTextColor="#666"
              value={playerName}
              onChangeText={setPlayerName}
              autoFocus={true}
              maxLength={50}
            />
            
            <View style={styles.nameInputButtons}>
              <TouchableOpacity 
                style={styles.cancelNameButton}
                onPress={resetToWelcome}
              >
                <Text style={styles.cancelNameButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.joinNameButton, (!playerName.trim() || isJoining) && styles.joinNameButtonDisabled]}
                onPress={() => handleJoinQueue()}
                disabled={!playerName.trim() || isJoining}
              >
                <Text style={styles.joinNameButtonText}>
                  {isJoining ? 'Joining...' : 'Join Queue'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Queue Screen
  if (currentView === 'queue') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#111" />
        <View style={styles.queueHeader}>
          <Text style={styles.queueTitle}>
            {courtId ? courtId.split('court=')[1] || 'Court' : 'Queue'}
          </Text>
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
                <Text style={styles.queueName}>{cleanDisplayName(entry.display_name)}</Text>
                {index === 0 && (
                  <Text style={styles.nextUpLabel}>NEXT UP</Text>
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
    paddingBottom: 80,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FBAE17',
    textAlign: 'center',
    marginBottom: 12,
  },
  welcomeSubtitle: {
    fontSize: 18,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBAE17',
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  scanButtonText: {
    color: '#000000',
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
    top: 90,
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
    paddingTop: 80, // Extra padding to account for status bar
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
  
  // Name Input Screen
  nameInputContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  nameInputHeader: {
    marginBottom: 40,
    alignItems: 'center',
  },
  nameInputIcon: {
    marginBottom: 20,
  },
  nameInputTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FBAE17',
    textAlign: 'center',
    marginBottom: 12,
  },
  nameInputSubtitle: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
  },
  nameInputForm: {
    width: '100%',
    maxWidth: 400,
  },
  nameInputField: {
    backgroundColor: '#333',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    color: 'white',
    marginBottom: 30,
    borderWidth: 2,
    borderColor: '#555',
    textAlign: 'center',
  },
  nameInputButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  cancelNameButton: {
    flex: 1,
    backgroundColor: '#666',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelNameButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  joinNameButton: {
    flex: 1,
    backgroundColor: '#FBAE17',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  joinNameButtonDisabled: {
    backgroundColor: '#555',
    opacity: 0.6,
  },
  joinNameButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
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