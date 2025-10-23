import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Landing from './app/screens/Landing';
import JoinQueue from './app/screens/JoinQueue';
import NextUp from './app/screens/NextUp';
import WaitingQueue from './app/screens/WaitingQueue';
import QueueScreen from './app/screens/QueueScreen';
import { Ionicons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        initialRouteName="Landing"
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;

            switch (route.name) {
              case 'Landing':
                iconName = 'home';
                break;
              case 'Join Queue':
                iconName = 'qr-code';
                break;
              case 'Next Up':
                iconName = 'time';
                break;
              case 'Queue':
                iconName = 'list';
                break;
              default:
                iconName = 'ellipse';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#667eea',
          tabBarInactiveTintColor: 'gray',
          headerShown: false,
        })}
      >
        <Tab.Screen name="Landing" component={Landing} />
        <Tab.Screen name="Join Queue" component={JoinQueue} />
        <Tab.Screen name="Next Up" component={NextUp} />
        <Tab.Screen name="Waiting Queue" component={WaitingQueue} />
        <Tab.Screen name="Queue" component={QueueScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
