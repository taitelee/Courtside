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
import { joinQueue, leaveQueue, getQueue, getCourtInfo, getPlayingTeams, removePlayingTeam, extendPlayTime, joinSlot, registerPushNotificationToken } from './app/services/api';
import { useQueueRealtime } from './app/hooks/useQueueRealtime';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from './app/utils/notification';
import * as Notifications from 'expo-notifications';

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
  const [courtName, setCourtName] = useState('');
  const [playingTeams, setPlayingTeams] = useState([]);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [slots, setSlots] = useState([null, null]); // [slot0, slot1]
  const [timerPrompts, setTimerPrompts] = useState({}); // { entryId: { show: boolean, time: number } }
  const [timerTick, setTimerTick] = useState(0); // Force re-render for timer updates
  const [nextUpTimerStart, setNextUpTimerStart] = useState(null); // Timestamp when user became "up next"
  const lastSlotUpdateRef = useRef(null); // Track when slots were last updated to prevent overwrites
  const slotsRef = useRef([null, null]); // Ref to track current slots state for real-time updates
  const userEntryRef = useRef(null); // Ref to track current userEntry for real-time updates

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  // Listen for push notifications to start timer
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      const data = notification.request.content.data;
      if (data && data.courtId === courtId && data.entryId === userEntry?.id) {
        console.log('User is up next! Starting 2-minute timer');
        setNextUpTimerStart(Date.now());
      }
    });

    return () => subscription.remove();
  }, [courtId, userEntry]);

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

  useEffect(() => {
    if (!deviceId) return;
    console.log('Setting notification token using ', deviceId);
    (async () => {
      const expoToken = await registerForPushNotificationsAsync();
      console.log('Obtained Expo push token:', expoToken);
      if (!expoToken) return;

      // Retry registration with exponential backoff
      let retries = 0;
      const maxRetries = 5;
      const retryDelay = (attempt) => Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
      let lastError = null;

      const registerWithRetry = async () => {
        while (retries < maxRetries) {
          try {
            console.log(`Registering push token (attempt ${retries + 1}/${maxRetries})...`);
            const res = await registerPushNotificationToken(deviceId, expoToken);
            
            if (!res) {
              retries++;
              if (retries < maxRetries) {
                const delay = retryDelay(retries - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              } else {
                lastError = new Error("Registration returned null");
                break;
              }
            }

            if (!res.ok) {
              const text = await res.text().catch(() => '');
              lastError = new Error(`HTTP ${res.status}: ${text}`);
              retries++;
              if (retries < maxRetries) {
                const delay = retryDelay(retries - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              } else {
                break;
              }
            } else {
              console.log("✅ Successfully registered push token for device:", deviceId);
              return; // Success!
            }
          } catch (error) {
            lastError = error;
            retries++;
            if (retries < maxRetries) {
              const delay = retryDelay(retries - 1);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
        
        // Only log error if all retries failed
        if (lastError) {
          console.error("❌ Failed to register push token after all retries:", lastError.message);
        }
      };

      await registerWithRetry();
    })();
  }, [deviceId]);

  const [permission, requestPermission] = useCameraPermissions();

  // Update userEntryRef whenever userEntry changes
  useEffect(() => {
    userEntryRef.current = userEntry;
  }, [userEntry]);

  // Integrate real-time updates using the hook
  useQueueRealtime(courtId, (newQueue, version) => {
    console.log('Received queue sync:', { queueLength: newQueue.length, version, userEntryId: userEntryRef.current?.id });
    setQueue(newQueue);
    
    // Only update userEntry if we have a current userEntry to check
    // Don't clear it if user is in a slot (they might be filtered from queue display but still in queue)
    // Use ref to get the most current userEntry value, not the stale closure value
    if (userEntryRef.current) {
      const updatedUserEntry = newQueue.find(item => item.id === userEntryRef.current.id);
      if (updatedUserEntry) {
        console.log('Found userEntry in queue, updating:', updatedUserEntry.id);
        setUserEntry(updatedUserEntry);
      } else {
        // Check if user is in a slot - use ref to get current slots state
        // We need to check the actual current slots, not the stale closure value
        const userInSlot = slotsRef.current.some(slot => slot && slot.entryId === userEntryRef.current.id);
        console.log('User not in queue, checking if in slot:', { userInSlot, slots: slotsRef.current, userId: userEntryRef.current.id });
        
        // Also check if slots were recently updated (user might have just joined)
        const recentlyUpdated = lastSlotUpdateRef.current && (Date.now() - lastSlotUpdateRef.current < 10000);
        
        if (!userInSlot && !recentlyUpdated) {
          // Only clear userEntry if they're not in a slot, not in queue, AND slots haven't been recently updated
          // This prevents clearing userEntry right after joining a slot due to race conditions
          console.log('User not found in queue and not in slot (and slots not recently updated), clearing userEntry');
          setUserEntry(null);
          // Clear "up next" timer if user was removed
          setNextUpTimerStart(null);
          // If user was kicked, show alert and navigate back
          if (currentView === 'queue') {
            Alert.alert(
              'Removed from Queue',
              'You were removed from the queue for not joining a slot in time.',
              [{ text: 'OK', onPress: () => {
                setCurrentView('scanner');
                setCourtId(null);
                setQueue([]);
              }}]
            );
          }
        } else if (userInSlot) {
          console.log('User in slot, keeping userEntry even though not in queue display');
        } else {
          console.log('User not in queue but slots recently updated - keeping userEntry to prevent race condition');
        }
      }
    }
    
    // Reload playing teams when queue updates (but don't overwrite if we just joined a slot)
    if (courtId && currentView === 'queue') {
      loadPlayingTeams(true); // Skip if slots were recently updated
    }
  });

  // Load playing teams (slot-based)
  const loadPlayingTeams = async (skipIfRecent = false) => {
    if (!courtId) return;
    
    // Skip reload if slots were just updated (within last 5 seconds)
    // This prevents overwriting slots immediately after joining
    if (skipIfRecent && lastSlotUpdateRef.current) {
      const timeSinceUpdate = Date.now() - lastSlotUpdateRef.current;
      if (timeSinceUpdate < 5000) {
        console.log('Skipping loadPlayingTeams - slots updated recently (', timeSinceUpdate, 'ms ago)');
        return;
      }
    }
    
    try {
      const result = await getPlayingTeams(courtId);
      const newSlots = result.slots || [null, null];
      
      // Safety check: if user is currently in a slot, don't clear it even if backend says it's empty
      // This prevents race conditions where backend hasn't updated yet
      if (userEntryRef.current) {
        const userInCurrentSlots = slotsRef.current.some(slot => slot && slot.entryId === userEntryRef.current.id);
        const userInNewSlots = newSlots.some(slot => slot && slot.entryId === userEntryRef.current.id);
        
        if (userInCurrentSlots && !userInNewSlots) {
          console.log('User was in slot but not in new slots - preserving current slot to prevent race condition');
          // Don't update slots if user was in a slot but backend doesn't show them yet
          // This is likely a race condition - backend will catch up
          return;
        }
      }
      
      setSlots(newSlots);
      slotsRef.current = newSlots; // Update ref
      setGameStartTime(result.gameStartTime || null);
      // Also set playingTeams for backward compatibility with queue filtering
      const teams = newSlots.filter(slot => slot !== null);
      setPlayingTeams(teams);
    } catch (error) {
      console.error('Error loading playing teams:', error);
      // Don't clear slots on error if user is in a slot - might be temporary network issue
      if (userEntryRef.current) {
        const userInCurrentSlots = slotsRef.current.some(slot => slot && slot.entryId === userEntryRef.current.id);
        if (userInCurrentSlots) {
          console.log('Error loading playing teams but user is in slot - preserving current state');
          return;
        }
      }
      const emptySlots = [null, null];
      setSlots(emptySlots);
      slotsRef.current = emptySlots; // Update ref
      setGameStartTime(null);
      setPlayingTeams([]);
    }
  };

  // Load playing teams when on queue screen
  useEffect(() => {
    if (currentView === 'queue' && courtId) {
      loadPlayingTeams();
      // Refresh playing teams every 5 seconds (but skip if slots were recently updated)
      const interval = setInterval(() => {
        loadPlayingTeams(true); // Pass skipIfRecent flag
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [currentView, courtId]);

  // Check if user is "up next" and start timer
  useEffect(() => {
    if (currentView === 'queue' && userEntry && queue.length > 0) {
      const slotTeamIds = new Set(slots.filter(s => s !== null).map(s => s.entryId));
      const waitingQueue = queue.filter(entry => !slotTeamIds.has(entry.id));
      const occupiedSlots = slots.filter(slot => slot !== null).length;
      
      // User is "up next" if:
      // 1. They're first in waiting queue
      // 2. At least one slot is empty
      // 3. They're not in a slot
      const isUpNext = waitingQueue.length > 0 && 
                       waitingQueue[0].id === userEntry.id &&
                       occupiedSlots < 2 &&
                       !slotTeamIds.has(userEntry.id);
      
      if (isUpNext && !nextUpTimerStart) {
        // User just became up next, start timer
        console.log('User is up next! Starting 2-minute timer');
        setNextUpTimerStart(Date.now());
      } else if (!isUpNext && nextUpTimerStart) {
        // User is no longer up next, clear timer
        console.log('User is no longer up next, clearing timer');
        setNextUpTimerStart(null);
      }
    } else if (currentView !== 'queue') {
      // Clear timer if not on queue screen
      setNextUpTimerStart(null);
    }
  }, [currentView, userEntry, queue, slots, nextUpTimerStart]);

  // Update timer display every second - single timer when game is active
  useEffect(() => {
    if (currentView === 'queue' && gameStartTime && slots[0] !== null && slots[1] !== null) {
      const updateTimer = () => {
        const startTime = new Date(gameStartTime);
        const elapsed = Date.now() - startTime.getTime();
        const minutes = Math.floor(elapsed / 60000);
        
        // Show prompt at 15 minutes (and keep showing until handled)
        const newPrompts = {};
        if (minutes >= 15) {
          // Show prompt for both teams
          slots.forEach(slot => {
            if (slot) {
              newPrompts[slot.entryId] = { show: true, time: minutes };
            }
          });
        }
        setTimerPrompts(newPrompts);
        // Force re-render to update timer display
        setTimerTick(prev => prev + 1);
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 1000); // Update every second
      return () => clearInterval(interval);
    } else {
      // Clear timers if game not active
      setTimerTick(prev => prev + 1);
    }
  }, [currentView, gameStartTime, slots]); // Depend on gameStartTime and slots

  // Update "up next" timer display every second
  useEffect(() => {
    if (currentView === 'queue' && nextUpTimerStart) {
      const updateTimer = () => {
        setTimerTick(prev => prev + 1);
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }
  }, [currentView, nextUpTimerStart]);

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
    
    // Load court information
    await loadCourtInfo(courtIdString);
    
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

      const result = await joinQueue(courtIdString, entryId, displayName, deviceId);
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
      setCourtName(''); // Reset court name
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
    setCourtName(''); // Reset court name
  };

  // Function to clean display name by removing device ID
  const cleanDisplayName = (displayName) => {
    if (!displayName) return displayName;
    // Remove the device ID part: "PlayerName (deviceId)" -> "PlayerName"
    return displayName.replace(/\s*\([^)]+\)$/, '');
  };

  // Function to load court information
  const loadCourtInfo = async (courtIdString) => {
    try {
      console.log('Loading court info for:', courtIdString);
      const courtInfo = await getCourtInfo(courtIdString);
      console.log('Court info loaded:', courtInfo);
      setCourtName(courtInfo.name || courtIdString.split('court=')[1] || 'Court');
    } catch (error) {
      console.error('Error loading court info:', error);
      // Fallback to extracting from URL
      setCourtName(courtIdString.split('court=')[1] || 'Court');
    }
  };

  // Calculate elapsed time for a playing team
  const getElapsedTime = (startTime) => {
    const start = new Date(startTime);
    const elapsed = Date.now() - start.getTime();
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return { minutes, seconds, totalSeconds: Math.floor(elapsed / 1000) };
  };

  // Format time as MM:SS
  const formatTime = (minutes, seconds) => {
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Check if user can remove teams (next 1-3 teams in queue)
  // Check if user can remove teams: must be first in waiting queue
  const canRemoveTeams = () => {
    if (!userEntry || !courtId) return false;
    // Filter out playing teams to get waiting queue
    const playingTeamIds = new Set(playingTeams.map(t => t.entryId));
    const waitingQueue = queue.filter(entry => !playingTeamIds.has(entry.id));
    
    // User must be first in the waiting queue
    if (waitingQueue.length === 0) return false;
    return waitingQueue[0].id === userEntry.id;
  };

  // Handle joining a slot
  const handleJoinSlot = async (slotIndex) => {
    console.log('Joining slot:', { slotIndex, courtId, userEntry: userEntry?.id });
    if (!courtId || !userEntry) {
      Alert.alert('Error', 'You must be in the queue to join a slot.');
      return;
    }
    
    try {
      let courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
      console.log('Calling joinSlot API:', { courtId: courtIdString, slotIndex, entryId: userEntry.id, display_name: userEntry.display_name });
      const result = await joinSlot(courtIdString, slotIndex, userEntry.id, userEntry.display_name);
      console.log('Join slot result:', result);
      
      // Update slots and gameStartTime from response
      if (result.slots) {
        setSlots(result.slots);
        slotsRef.current = result.slots; // Update ref for real-time handler
        lastSlotUpdateRef.current = Date.now(); // Mark slots as just updated
        const teams = result.slots.filter(slot => slot !== null);
        setPlayingTeams(teams);
        // Clear "up next" timer since user joined a slot
        setNextUpTimerStart(null);
      }
      if (result.gameStartTime !== undefined) {
        setGameStartTime(result.gameStartTime);
      }
      
      // Update queue from response
      if (result.queue) {
        setQueue(result.queue);
        const updatedUserEntry = result.queue.find(item => item.id === userEntry?.id);
        if (updatedUserEntry) {
          console.log('Found userEntry in joinSlot queue response, updating:', updatedUserEntry.id);
          setUserEntry(updatedUserEntry);
          userEntryRef.current = updatedUserEntry; // Update ref immediately
        } else {
          // User might be in a slot but still in queue (just filtered from display)
          // Since they just joined a slot, they should still be in the queue
          // Keep the existing userEntry - don't clear it
          console.log('User in slot, keeping existing userEntry (not found in queue response but in slot)');
          // Don't clear userEntry - they're in a slot which means they're still valid
          // Keep the ref as is - userEntryRef.current should already be set
        }
      } else {
        // Fallback: reload queue if not in response
        const updatedQueue = await getQueue(courtIdString);
        setQueue(updatedQueue.queue);
        const updatedUserEntry = updatedQueue.queue.find(item => item.id === userEntry?.id);
        if (updatedUserEntry) {
          console.log('Found userEntry in reloaded queue, updating:', updatedUserEntry.id);
          setUserEntry(updatedUserEntry);
          userEntryRef.current = updatedUserEntry; // Update ref immediately
        } else {
          // User is in a slot, keep existing userEntry
          console.log('User in slot, keeping existing userEntry (not found in reloaded queue but in slot)');
          // Keep the ref as is - userEntryRef.current should already be set
        }
      }

      lastSlotUpdateRef.current = Date.now(); // Mark slots as recently updated
      console.log('Slot join complete, slots:', result.slots, 'userEntry:', userEntryRef.current?.id);
    } catch (error) {
      console.error('Error joining slot:', error);
      Alert.alert('Error', error.message || 'Failed to join slot. Please try again.');
    }
  };

  // Handle removing a playing team
  const handleRemoveTeam = (team) => {
    if (!gameStartTime) {
      Alert.alert('Error', 'Game has not started yet.');
      return;
    }
    
    const elapsed = getElapsedTime(gameStartTime);
    Alert.alert(
      'Remove Team?',
      `Remove ${cleanDisplayName(team.display_name)} from the court?\n\nGame has been running for ${elapsed.minutes} minutes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!courtId) return;
              let courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
              await removePlayingTeam(courtIdString, team.entryId);
              await loadPlayingTeams();
              // Reload queue
              const updatedQueue = await getQueue(courtIdString);
              setQueue(updatedQueue.queue);
              const updatedUserEntry = updatedQueue.queue.find(item => item.id === userEntry?.id);
              if (updatedUserEntry) {
                setUserEntry(updatedUserEntry);
              }
            } catch (error) {
              console.error('Error removing team:', error);
              Alert.alert('Error', 'Failed to remove team. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Handle extending play time
  const handleExtendTime = (team) => {
    Alert.alert(
      'Extend Play Time?',
      `Extend play time for ${cleanDisplayName(team.display_name)}?\n\nThis will reset their timer and add 5 more minutes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Extend',
          onPress: async () => {
            try {
              if (!courtId) return;
              let courtIdString = typeof courtId === 'string' ? courtId : String(courtId);
              await extendPlayTime(courtIdString, team.entryId);
              await loadPlayingTeams();
            } catch (error) {
              console.error('Error extending time:', error);
              Alert.alert('Error', 'Failed to extend time. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Handle timer prompt (15 minutes)
  const handleTimerPrompt = (team) => {
    const elapsed = getElapsedTime(team.startTime);
    Alert.alert(
      'Still Playing?',
      `${cleanDisplayName(team.display_name)} has been playing for ${elapsed.minutes} minutes. Are they still playing?`,
      [
        {
          text: 'Yes, Still Playing',
          onPress: async () => {
            await handleExtendTime(team);
          }
        },
        {
          text: 'No, Remove Them',
          style: 'destructive',
          onPress: async () => {
            await handleRemoveTeam(team);
          }
        }
      ],
      { cancelable: false }
    );
    // Clear the prompt
    setTimerPrompts(prev => {
      const newPrompts = { ...prev };
      delete newPrompts[team.entryId];
      return newPrompts;
    });
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
    const userCanRemove = canRemoveTeams();
    const userPosition = userEntry?.position || 0;
    
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#111" />
        <View style={styles.queueHeader}>
          <Text style={styles.queueTitle}>
            {courtName || 'Queue'}
          </Text>
          <TouchableOpacity style={styles.leaveButton} onPress={handleLeaveQueue}>
            <Text style={styles.leaveButtonText}>Leave Queue</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.queueContent}>
          {/* Playing Slots Section - Always show 2 slots */}
          <View style={styles.playingSection}>
            <Text style={styles.playingSectionTitle}>Court Slots</Text>
            {/* Single timer when game is active */}
            {gameStartTime && slots[0] !== null && slots[1] !== null && (
              <View style={styles.gameTimerContainer}>
                <Ionicons name="time-outline" size={20} color="#FBAE17" />
                <Text style={styles.gameTimerText}>
                  {(() => {
                    const elapsed = getElapsedTime(gameStartTime);
                    return formatTime(elapsed.minutes, elapsed.seconds);
                  })()}
                </Text>
              </View>
            )}
            
            {/* Two slots side by side */}
            <View style={styles.slotsContainer}>
              {[0, 1].map((slotIndex) => {
                const slot = slots[slotIndex];
                const isOccupied = slot !== null;
                const isUser = slot && slot.entryId === userEntry?.id;
                const canJoin = !isOccupied && userEntry && queue.some(e => e.id === userEntry.id);
                const showRemoveButton = canRemoveTeams() && gameStartTime && (() => {
                  if (!gameStartTime) return false;
                  const elapsed = getElapsedTime(gameStartTime);
                  return elapsed.minutes >= 12;
                })();
                
                return (
                  <TouchableOpacity
                    key={slotIndex}
                    style={[
                      styles.slotCard,
                      isOccupied && styles.slotCardOccupied,
                      !isOccupied && canJoin && styles.slotCardClickable,
                      isUser && styles.slotCardUser
                    ]}
                    onPress={() => {
                      console.log('Slot clicked:', { slotIndex, isOccupied, canJoin, userEntry: userEntry?.id, queueLength: queue.length });
                      if (!isOccupied && canJoin) {
                        handleJoinSlot(slotIndex);
                      } else {
                        console.log('Slot click ignored:', { isOccupied, canJoin, userEntry: !!userEntry });
                      }
                    }}
                    disabled={!canJoin || isOccupied}
                  >
                    {isOccupied ? (
                      <>
                        <Text style={styles.slotTeamName}>
                          {cleanDisplayName(slot.display_name)}
                        </Text>
                        {isUser && (
                          <Text style={styles.slotYouLabel}>You</Text>
                        )}
                        {showRemoveButton && (
                          <TouchableOpacity
                            style={styles.slotRemoveButton}
                            onPress={() => handleRemoveTeam(slot)}
                          >
                            <Text style={styles.slotRemoveButtonText}>Remove</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={32} color="#666" />
                        <Text style={styles.slotEmptyText}>Empty Slot</Text>
                        {canJoin && (
                          <Text style={styles.slotClickToJoin}>Tap to join</Text>
                        )}
                      </>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* "Up Next" Timer Banner - Show when user is up next */}
          {(() => {
            const slotTeamIds = new Set(slots.filter(s => s !== null).map(s => s.entryId));
            const waitingQueue = queue.filter(entry => !slotTeamIds.has(entry.id));
            const occupiedSlots = slots.filter(slot => slot !== null).length;
            const isUpNext = nextUpTimerStart && 
                            waitingQueue.length > 0 && 
                            waitingQueue[0].id === userEntry?.id &&
                            occupiedSlots < 2;
            
            if (isUpNext) {
              const elapsed = Date.now() - nextUpTimerStart;
              const remaining = Math.max(0, 120000 - elapsed); // 2 minutes = 120000ms
              const minutes = Math.floor(remaining / 60000);
              const seconds = Math.floor((remaining % 60000) / 1000);
              const isWarning = remaining < 30000; // Less than 30 seconds
              
              return (
                <View style={[styles.nextUpTimerBanner, isWarning && styles.nextUpTimerBannerWarning]}>
                  <View style={styles.nextUpTimerContent}>
                    <Ionicons name="time" size={24} color="#fff" />
                    <View style={styles.nextUpTimerText}>
                      <Text style={styles.nextUpTimerTitle}>You're Up Next!</Text>
                      <Text style={styles.nextUpTimerSubtitle}>
                        Join a slot within {minutes}:{seconds.toString().padStart(2, '0')}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }
            return null;
          })()}

          {/* Queue Section */}
          <View style={styles.queueSection}>
            <Text style={styles.queueSectionTitle}>
              {(slots[0] !== null || slots[1] !== null) ? 'Waiting in Queue' : 'Queue'}
            </Text>
            {(() => {
              // Filter out teams that are in slots
              const slotTeamIds = new Set(slots.filter(s => s !== null).map(s => s.entryId));
              const waitingQueue = queue.filter(entry => !slotTeamIds.has(entry.id));
              
              if (waitingQueue.length === 0) {
                return <Text style={styles.emptyQueue}>No one waiting in queue</Text>;
              }
              
              return waitingQueue.map((entry, index) => {
                const isUser = entry.id === userEntry?.id;
                const occupiedSlots = slots.filter(slot => slot !== null).length;
                const isNextUp = index === 0 && occupiedSlots < 2;
                
                return (
                  <View 
                    key={entry.id} 
                    style={[
                      styles.queueItem,
                      isUser && styles.currentUserItem,
                      isNextUp && styles.nextUpItem
                    ]}
                  >
                    <Text style={styles.queuePosition}>{index + 1}</Text>
                    <Text style={styles.queueName}>{cleanDisplayName(entry.display_name)}</Text>
                    {isNextUp && (
                      <Text style={styles.nextUpLabel}>NEXT UP</Text>
                    )}
                    {isUser && (
                      <Text style={styles.youLabel}>You</Text>
                    )}
                    {isUser && userCanRemove && (
                      <Text style={styles.canRemoveLabel}>Can Remove Teams</Text>
                    )}
                  </View>
                );
              });
            })()}
          </View>
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
    paddingTop: 60, // Reduced padding to make header slightly higher
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
  playingSection: {
    marginBottom: 24,
  },
  playingSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FBAE17',
    marginBottom: 12,
  },
  playingTeamCard: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#333',
  },
  playingTeamInfo: {
    marginBottom: 12,
  },
  playingTeamName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  playingTeamTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  playingTeamTime: {
    fontSize: 16,
    color: '#FBAE17',
    marginLeft: 6,
    fontWeight: '600',
  },
  playingTeamTimeWarning: {
    color: '#ff6b6b',
  },
  playingTeamExtensions: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  waitingForOpponent: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptySlotCard: {
    backgroundColor: '#1a1a1a',
    borderColor: '#444',
    borderStyle: 'dashed',
    opacity: 0.6,
  },
  emptySlotText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  emptySlotSubtext: {
    fontSize: 14,
    color: '#555',
    fontStyle: 'italic',
  },
  gameTimerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  gameTimerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FBAE17',
    marginLeft: 8,
  },
  slotsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  slotCard: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 2,
    borderColor: '#444',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  slotCardClickable: {
    borderColor: '#FBAE17',
    borderStyle: 'solid',
    backgroundColor: '#222',
  },
  slotCardOccupied: {
    backgroundColor: '#222',
    borderColor: '#333',
    borderStyle: 'solid',
  },
  slotCardUser: {
    borderColor: '#FBAE17',
    borderWidth: 3,
  },
  slotTeamName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  slotYouLabel: {
    fontSize: 12,
    color: '#FBAE17',
    fontWeight: '600',
    marginBottom: 8,
  },
  slotEmptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  slotClickToJoin: {
    fontSize: 12,
    color: '#FBAE17',
    marginTop: 4,
    textAlign: 'center',
  },
  slotRemoveButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  slotRemoveButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  removeTeamButton: {
    backgroundColor: '#dc3545',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  removeTeamButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  timerPromptBanner: {
    backgroundColor: '#ff6b6b',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerPromptText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  timerPromptButton: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 12,
  },
  timerPromptButtonText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: 'bold',
  },
  queueSection: {
    flex: 1,
  },
  queueSectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FBAE17',
    marginBottom: 12,
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
    marginLeft: 8,
  },
  canRemoveLabel: {
    fontSize: 10,
    color: '#FBAE17',
    fontWeight: 'bold',
    backgroundColor: '#FBAE17',
    color: '#000',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 8,
  },
  nextUpTimerBanner: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#66BB6A',
  },
  nextUpTimerBannerWarning: {
    backgroundColor: '#ff6b6b',
    borderColor: '#ff8787',
  },
  nextUpTimerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nextUpTimerText: {
    marginLeft: 12,
    flex: 1,
  },
  nextUpTimerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  nextUpTimerSubtitle: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
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