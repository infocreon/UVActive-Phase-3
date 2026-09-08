/**
 * Shared safe-area-aware screen wrapper.
 *
 * App.tsx sets up SafeAreaProvider, but nothing previously consumed it —
 * the three tab screens (Home/Workout/Settings) render with headerShown
 * false, so content sat flush under the status bar / notch on phones,
 * and the stack screens that DO have a native header (SessionDetail,
 * BookSession, Notifications) still had no bottom inset, so content
 * could sit flush against the home-indicator / gesture bar. Notch and
 * gesture-bar geometry differs per device and rotates differently on
 * tablets, which read as "content cut off / running off the screen"
 * depending on the device and orientation.
 *
 * Usage: wrap each screen's root in <Screen edges={[...]}>.
 * - Tab screens (Home/Workout/Settings) only need edges={['top']} —
 *   @react-navigation/bottom-tabs already insets its own bottom bar.
 * - Screens with a native stack header (headerShown: true in
 *   RootNavigator — SessionDetail/BookSession/Notifications) only need
 *   edges={['bottom']} — the header itself already sits below the
 *   status bar / notch.
 * - Header-less, tab-less screens (Login) need edges={['top', 'bottom']}.
 */
import React from 'react';
import type { ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '../theme/tokens';

interface Props {
  children: React.ReactNode;
  edges?: Edge[];
  style?: ViewStyle;
  /** Background colour — defaults to the app's standard dark background. */
  backgroundColor?: string;
}

export function Screen({ children, edges = ['top', 'bottom'], style, backgroundColor = colors.background }: Props) {
  return (
    <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor }, style]}>
      {children}
    </SafeAreaView>
  );
}
