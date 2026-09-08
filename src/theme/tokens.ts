// ── UV Active design tokens ──────────────────────────────────────────
// Ported 1:1 from the web portals' index.css HSL custom
// properties, converted to hex for React Native (no CSS variables on
// native). Keep these in sync if the web product's palette changes —
// this is the same "shark"/"cerise" system already used in the Admin
// Panel and Branch Portal, so the whole product family matches.

export const colors = {
  background: "#161312",
  foreground: "#E8E6E3",
  card: "#211D1C",
  cardForeground: "#E8E6E3",

  primary: "#E74A23", // "cerise"
  primaryForeground: "#FFFFFF",
  primaryLight: "#EB6847",

  secondary: "#2B2826",
  secondaryForeground: "#B9B2AC",

  muted: "#302D2C",
  mutedForeground: "#867C79",

  destructive: "#DC2828",
  destructiveForeground: "#FFFFFF",

  border: "#2B2826",
  input: "#2B2826",
  ring: "#E74A23",

  shark: "#161312",
  sharkLight: "#272221",

  // Zone colours — shared across the whole product (Formula Engine,
  // Admin Panel session leaderboard, Branch Portal). Never redefine
  // these locally; import from here or from the formula engine's
  // ZONE_COLOURS, which are the same values.
  zone: {
    0: "#39FF14", // Standby
    1: "#669FFF", // Recovery
    2: "#4263CF", // Aerobic
    3: "#1E2C7C", // Fitness
    4: "#FF5E73", // Burn
    5: "#FF0000", // Peak
  },

  success: "#22C55E",
  warning: "#F59E0B",
  info: "#3B82F6",
};

export const fonts = {
  heading: "SpaceGrotesk_700Bold",
  headingMedium: "SpaceGrotesk_500Medium",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
};
