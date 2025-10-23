import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function Landing({ navigation }) {
  const handleStart = () => navigation.navigate('Join Queue');

  return (
    <View style={styles.outer}>
      {/* Phone Frame */}
      <View style={styles.phoneFrame}>
        <View style={styles.logoContainer}>
          <Image
            source={require('../../assets/courtsideLogo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.tagline}>Welcome to Courtside.</Text>

        <TouchableOpacity style={styles.button} onPress={handleStart} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Let’s Start</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" style={styles.icon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const { width, height } = Dimensions.get('window');
const phoneWidth = 390;  // iPhone 14/15 width
const phoneHeight = 844; // iPhone 14/15 height

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
  },
  phoneFrame: {
    width: phoneWidth,
    height: phoneHeight,
    backgroundColor: '#2C2F33',
    borderRadius: 40,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 60,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
  },
  logoContainer: {
    flex: 3,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    width: phoneWidth * 0.5,
    height: phoneHeight * 0.2,
  },
  tagline: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 80,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  button: {
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
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  icon: {
    marginLeft: 8,
  },
});
