import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../theme/tokens';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabs } from './MainTabs';
import { SessionDetailScreen } from '../screens/SessionDetailScreen';
import { BookSessionScreen } from '../screens/BookSessionScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  SessionDetail: { sessionId: string };
  BookSession: undefined;
  Notifications: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.card,
    text: colors.foreground,
    border: colors.border,
    primary: colors.primary,
  },
};

export function RootNavigator() {
  const { member, loading } = useAuth();

  if (loading) return null; // splash screen covers this gap, see App.tsx

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!member ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="SessionDetail"
              component={SessionDetailScreen}
              options={{ headerShown: true, headerTitle: 'Session', headerTintColor: colors.foreground, headerStyle: { backgroundColor: colors.card } }}
            />
            <Stack.Screen
              name="BookSession"
              component={BookSessionScreen}
              options={{ headerShown: true, headerTitle: 'Book a Session', headerTintColor: colors.foreground, headerStyle: { backgroundColor: colors.card } }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ headerShown: true, headerTitle: 'Notifications', headerTintColor: colors.foreground, headerStyle: { backgroundColor: colors.card } }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
