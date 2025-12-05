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
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    console.log('Using projectId for token:', projectId);

    let tokenResult;
    if (projectId) {
      tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    } else {
      tokenResult = await Notifications.getExpoPushTokenAsync();
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
