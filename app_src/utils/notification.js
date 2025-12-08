// app/utils/notifications.js
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export async function registerForPushNotificationsAsync() {
  try {
    if (!Device.isDevice) {
      console.log('Must use physical device for push notifications');
      return null;
    }

    // Android: set channel before asking for token
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    // Permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    console.log('Existing notif permission status:', existingStatus);

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('Requested notif permission status:', status);
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
      return null;
    }

    // Get projectId if available (important for newer Expo)
    // Try multiple sources for projectId
    const projectId =
      process.env.EXPO_PUBLIC_PROJECT_ID ||
      (Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      Constants.manifest2?.extra?.eas?.projectId ??
      Constants.manifest?.extra?.eas?.projectId);

    console.log('Using projectId for token:', projectId);

    let tokenResult;
    
    // Try to get push token - attempt with projectId first if available, then without
    if (projectId) {
      try {
        tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
        console.log('Successfully got push token with projectId');
      } catch (tokenError) {
        console.log('Failed to get token with projectId, trying without projectId...', tokenError.message);
        // Try without projectId as fallback (might work in some cases)
        try {
          tokenResult = await Notifications.getExpoPushTokenAsync();
          console.log('Successfully got push token without projectId');
        } catch (fallbackError) {
          console.warn('Could not get push token:', fallbackError.message);
          // In Expo Go with SDK 53+, push notifications don't work, but we'll still try
          // Return null gracefully
          return null;
        }
      }
    } else {
      // No projectId, try without it (for older SDKs or testing)
      try {
        tokenResult = await Notifications.getExpoPushTokenAsync();
        console.log('Successfully got push token without projectId');
      } catch (fallbackError) {
        console.warn('Could not get push token without projectId:', fallbackError.message);
        console.warn('Note: Push notifications may not work in Expo Go with SDK 53+.');
        console.warn('Consider using a development build for full push notification support.');
        return null;
      }
    }

    console.log('Raw token result:', tokenResult);
    const expoPushToken = tokenResult.data ?? tokenResult; // handle both shapes
    console.log('Expo push token:', expoPushToken);

    return expoPushToken;
  } catch (err) {
    console.error('Error getting Expo push token:', err);
    return null;
  }
}
