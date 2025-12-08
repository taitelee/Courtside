import React, { useEffect } from 'react';
import { Linking } from 'react-native';

export function QRCodeHandler({ onJoinCourt }) {
  useEffect(() => {
    const handleDeepLink = (url) => {
      console.log('Deep link received:', url);
      
      // Parse the URL to extract court information
      if (url.startsWith('courtside://join')) {
        const urlObj = new URL(url);
        const courtId = urlObj.searchParams.get('court') || 'demo';
        
        // Show confirmation dialog
        onJoinCourt(courtId);
      }
    };

    // Handle deep links when app is already running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    // Handle deep links when app is opened from a link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      }
    });

    return () => {
      subscription?.remove();
    };
  }, [onJoinCourt]);

  return null; // This component doesn't render anything
}
