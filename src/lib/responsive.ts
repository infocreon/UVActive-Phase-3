/**
 * UV Active Trainer App — responsive layout utilities.
 *
 * Single source of truth for how the app adapts across phone/tablet and
 * portrait/landscape. Everything below is computed from useWindowDimensions()
 * so it reacts live to rotation, split-screen and multi-window resizing —
 * never from Dimensions.get() at module load (which goes stale on rotation).
 *
 * Breakpoints (dp, from the old app's tile grid + React Native ecosystem):
 *    < 600            phone portrait
 *    600 – 899        phone landscape / small tablet
 *    900 – 1199       tablet portrait / small tablet landscape
 *    >= 1200          large tablet landscape
 */
import { useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  TABLET: 600,
  WIDE: 900,
  XL: 1200,
} as const;

export type DeviceTier = 'phone' | 'tablet';
export type Orientation = 'portrait' | 'landscape';

export interface ResponsiveLayout {
  width: number;
  height: number;
  tier: DeviceTier;
  isTablet: boolean;
  orientation: Orientation;
  isLandscape: boolean;
  /** Suggested number of columns for card grids (members, sessions, sensors). */
  columns: number;
  /** Live-session tile columns — more aggressive than normal grids. */
  tileColumns: number;
  /** Max content width so tablet layouts don't stretch absurdly wide. */
  contentMaxWidth: number;
}

export function useResponsiveLayout(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= BREAKPOINTS.TABLET;
  const isLandscape = width > height;
  const orientation: Orientation = isLandscape ? 'landscape' : 'portrait';

  // Generic card grids.
  let columns = 1;
  if (width >= BREAKPOINTS.XL) columns = 4;
  else if (width >= BREAKPOINTS.WIDE) columns = 3;
  else if (width >= BREAKPOINTS.TABLET) columns = 2;

  // Live-session tiles pack tighter than normal cards — a trainer needs to
  // see as many athletes as possible at once, so tiles are smaller.
  let tileColumns = 2;
  if (width >= 1200) tileColumns = 6;
  else if (width >= 900) tileColumns = 5;
  else if (width >= 600) tileColumns = 4;
  else if (width >= 360) tileColumns = 3;

  // Cap content width on very wide screens so rows of cards stay readable.
  const contentMaxWidth = Math.min(width, isTablet ? 1100 : width);

  return { width, height, tier: isTablet ? 'tablet' : 'phone', isTablet, orientation, isLandscape, columns, tileColumns, contentMaxWidth };
}

/** True when the current window is tablet-sized (>= 600dp). */
export function isTabletWindow(width: number): boolean {
  return width >= BREAKPOINTS.TABLET;
}
