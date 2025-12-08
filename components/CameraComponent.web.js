console.log("WEB CAMERA COMPONENT LOADED");

navigator.mediaDevices.getUserMedia({ video: true })
  .then(() => console.log("CAMERA ACCESS OK"))
  .catch(e => console.error("CAMERA ACCESS ERROR:", e));

import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import QrScanner from 'qr-scanner';

export default function CameraComponent({
  scanned,
  scanComplete,
  isJoining,
  onBarcodeScanned,
  resetToWelcome,
}) {
  const videoRef = useRef(null);
  const qrScannerRef = useRef(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const qrScanner = new QrScanner(
      videoRef.current,
      (result) => {
        if (scanned || scanComplete || isJoining) return;
        onBarcodeScanned({ type: 'qr', data: result.data });
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
      }
    );

    qrScanner.start();
    qrScannerRef.current = qrScanner;

    return () => {
      qrScanner.stop();
      qrScanner.destroy();
    };
  }, [scanned, scanComplete, isJoining]);

  return (
    <View style={styles.wrapper}>
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />

      <View style={styles.overlay}>
        <View style={styles.scannerBox}>
          <Text style={styles.scannerText}>Point camera at QR code</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.backButton} onPress={resetToWelcome}>
        <Text style={styles.backButtonText}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  scannerBox: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: '#FBAE17',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scannerText: {
    color: '#FBAE17',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    position: 'absolute',
    top: 20,
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
});
