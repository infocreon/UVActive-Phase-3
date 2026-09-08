import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Home, Dumbbell, CalendarPlus, Settings as SettingsIcon } from 'lucide-react-native';
import { colors, fonts } from '../theme/tokens';
import { HomeScreen } from '../screens/HomeScreen';
import { WorkoutScreen } from '../screens/WorkoutScreen';
import { BookSessionScreen } from '../screens/BookSessionScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type MainTabsParamList = {
  Home: undefined;
  Workout: undefined;
  Book: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tab.Screen name="Workout" component={WorkoutScreen} options={{ tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size} /> }} />
      <Tab.Screen
        name="Book"
        component={BookSessionScreen}
        options={{
          // Same screen the Home/Notifications CTAs push onto the root
          // stack (with a native header) — giving this tab its own
          // native header too keeps the two entry points visually
          // identical, and lets BookSessionScreen use one consistent
          // <Screen edges={['bottom']}> regardless of which nav it's
          // reached from.
          headerShown: true,
          headerTitle: 'Book a Session',
          headerTintColor: colors.foreground,
          headerStyle: { backgroundColor: colors.card },
          tabBarLabel: 'Book',
          tabBarIcon: ({ color, size }) => <CalendarPlus color={color} size={size} />,
        }}
      />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ color, size }) => <SettingsIcon color={color} size={size} /> }} />
    </Tab.Navigator>
  );
}
