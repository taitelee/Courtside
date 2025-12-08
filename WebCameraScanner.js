import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import jsQR from 'jsqr';

export default function WebCameraScannerWithOverlay({ onBarcodeScanned, onBack }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const scanningRef = useRef(true);

  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
      }
    };

    startCamera();

    const scanLoop = () => {
      if (!scanningRef.current) return;
      if (!videoRef.current || !canvasRef.current) {
        requestAnimationFrame(scanLoop);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code && onBarcodeScanned) {
        scanningRef.current = false; // stop scanning after first scan
        onBarcodeScanned({ data: code.data });
      } else {
        requestAnimationFrame(scanLoop);
      }
    };

    requestAnimationFrame(scanLoop);

    return () => {
      scanningRef.current = false;
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [onBarcodeScanned]);

  return (
    <View style={styles.container}>
      <video ref={videoRef} style={styles.video} />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.scannerBox}>
          <Text style={styles.scannerText}>Point camera at QR code</Text>
        </View>

        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none', // allow clicks to pass through except buttons
  },
  scannerBox: {
    borderWidth: 2,
    borderColor: '#00FF00',
    padding: 20,
    borderRadius: 8,
    pointerEvents: 'none',
  },
  scannerText: {
    color: '#00FF00',
    textAlign: 'center',
    marginTop: 10,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: '#111',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    pointerEvents: 'auto', // allow button to be clickable
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
});
