import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';

export default function WebQRScanner({ onScan, onBack, onManualEntry }) {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const qrCodeInstanceRef = useRef(null);
  const containerRef = useRef(null);
  const onScanRef = useRef(onScan);
  
  // Keep callback ref updated
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    let isMounted = true;
    let scannerInstance = null;

    const startScanner = async () => {
      try {
        // Request camera permission first
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        
        // Stop the stream - we'll let html5-qrcode handle it
        stream.getTracks().forEach(track => track.stop());

        // Dynamically import html5-qrcode
        const { Html5Qrcode } = await import('html5-qrcode');
        
        if (!isMounted) return;

        const elementId = 'web-qr-reader';
        scannerInstance = new Html5Qrcode(elementId);
        qrCodeInstanceRef.current = scannerInstance;
        setIsScanning(true);
        setError(null);

        await scannerInstance.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: false,
            showZoomSliderIfSupported: false,
            defaultZoomValueIfSupported: 1,
            disableFlip: false,
            videoConstraints: {
              facingMode: 'environment'
            }
          },
          (decodedText) => {
            if (isMounted && onScanRef.current) {
              onScanRef.current({ data: decodedText });
              // Stop scanner after successful scan
              if (scannerInstance) {
                scannerInstance.stop().catch(() => {});
                scannerInstance = null;
                qrCodeInstanceRef.current = null;
              }
              setIsScanning(false);
            }
          },
          (errorMessage) => {
            // Ignore scanning errors (they're frequent during scanning)
          }
        );
      } catch (err) {
        console.error('Web QR scanner error:', err);
        if (isMounted) {
          setError(err.message || 'Failed to start camera');
          setIsScanning(false);
          qrCodeInstanceRef.current = null;
        }
      }
    };

    // Start scanner when component mounts
    startScanner();

    // Cleanup
    return () => {
      isMounted = false;
      if (qrCodeInstanceRef.current) {
        qrCodeInstanceRef.current.stop().catch(() => {});
        qrCodeInstanceRef.current = null;
      }
    };
  }, []); // Empty deps - only run once on mount

  const handleBack = () => {
    if (qrCodeInstanceRef.current) {
      qrCodeInstanceRef.current.stop().catch(() => {});
      qrCodeInstanceRef.current = null;
    }
    setIsScanning(false);
    if (onBack) onBack();
  };

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={styles.container} ref={containerRef}>
      <View 
        nativeID="web-qr-reader" 
        style={styles.scannerContainer}
      />
      <View style={styles.overlay}>
        {/* Just show border overlay - html5-qrcode will show its own scanning box */}
        <View style={styles.scannerBox} />
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.backButton} onPress={handleBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        {onManualEntry && (
          <TouchableOpacity 
            style={[styles.backButton, styles.manualButton]} 
            onPress={onManualEntry}
          >
            <Text style={styles.backButtonText}>Manual Entry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerContainer: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'box-none', // Allow clicks to pass through to scanner, but keep buttons clickable
  },
  scannerBox: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#FBAE17',
    borderRadius: 10,
    backgroundColor: 'transparent', // Transparent - html5-qrcode will show its own scanning box
  },
  errorContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -125 }, { translateY: -25 }],
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 20,
    borderRadius: 10,
    width: 250,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 5,
    pointerEvents: 'auto', // Make buttons clickable
  },
  manualButton: {
    top: 100,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});

