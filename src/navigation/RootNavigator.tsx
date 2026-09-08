import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../hooks/useAuth';
import { colors } from '../theme/tokens';
import { LoginScreen } from '../screens/LoginScreen';
import { MainTabs } from './MainTabs';
import { LiveSessionScreen } from '../screens/LiveSessionScreen';
import { SessionSetupScreen } from '../screens/SessionSetupScreen';
import { AthleteDetailScreen } from '../screens/AthleteDetailScreen';
import { SessionAthleteDetailScreen } from '../screens/SessionAthleteDetailScreen';
import { SessionSummaryScreen } from '../screens/SessionSummaryScreen';
import { SessionDetailsScreen } from '../screens/SessionDetailsScreen';
import { withScreenBoundary } from '../components/withScreenBoundary';

const BoundedSessionSetup = withScreenBoundary(SessionSetupScreen, 'Session Setup');
const BoundedAthleteDetail = withScreenBoundary(AthleteDetailScreen, 'Member Detail');
const BoundedSessionAthleteDetail = withScreenBoundary(SessionAthleteDetailScreen, 'Member Session Stats');
const BoundedSessionSummary = withScreenBoundary(SessionSummaryScreen, 'Session Summary');
const BoundedSessionDetails = withScreenBoundary(SessionDetailsScreen, 'Session Details');
const BoundedLiveSession = withScreenBoundary(LiveSessionScreen, 'Live Session');

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  /**
   * SessionSetup doubles as the config screen for both paths:
   *   mode 'schedule'          → name/date/time + members (no capacity field — the roster is the size), saved to the cloud as a scheduled session
   *   mode 'start' (default)   → pick members + assign sensors, then go live immediately
   *   mode 'start-scheduled'   → preloaded with a saved session's members, assign sensors, go live
   */
  SessionSetup:
    | { mode?: 'schedule'; }
    | { mode?: 'start'; }
    | { mode?: 'start-scheduled'; sessionId: string; sessionName?: string }
    | undefined;
  LiveSession: { sessionId: string };
  SessionSummary: { sessionId: string };
  SessionDetails: { sessionId: string };
  /** memberId + optional sessionId → when sessionId is given the screen shows THAT member's stats within THAT session (drill-down from leaderboard/summary). */
  AthleteDetail: { memberId: string; sessionId?: string };
  /** History → session → leaderboard → tap a member — the full detailed post-workout stat screen (Rank, UV/Sweat/Recovery Points, Calories, EPOC, Avg/Peak BPM, Max %HR, zone-colored + scrollable BPM curve). */
  SessionAthleteDetail: { sessionId: string; memberId: string };
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
  const { staff, loading } = useAuth();

  if (loading) return null; // splash screen handles the loading gap (see App.tsx)

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!staff ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="SessionSetup" component={BoundedSessionSetup} options={{ presentation: 'modal' }} />
            <Stack.Screen name="SessionDetails" component={BoundedSessionDetails} />
            <Stack.Screen name="LiveSession" component={BoundedLiveSession} options={{ gestureEnabled: false }} />
            <Stack.Screen name="SessionSummary" component={BoundedSessionSummary} />
            <Stack.Screen name="AthleteDetail" component={BoundedAthleteDetail} />
            <Stack.Screen name="SessionAthleteDetail" component={BoundedSessionAthleteDetail} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
