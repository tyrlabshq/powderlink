// TrailGuard typography scale — SF Pro / system font hierarchy
import { Platform } from 'react-native';

export const typography = {
  // ── Font sizes ────────────────────────────────────────────────────────
  xs: 12,   // captions, chips, badges
  sm: 14,   // secondary text, meta info
  md: 16,   // body text, list items
  lg: 18,   // subheadings, prominent labels
  xl: 22,   // section titles
  xxl: 28,  // screen titles, hero text
  hero: 36, // onboarding / splash

  // ── Font weights ─────────────────────────────────────────────────────
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  heavy: '800' as const,

  // ── Line heights ──────────────────────────────────────────────────────
  lineHeightTight: 1.2,    // headings
  lineHeightBody: 1.5,     // body text
  lineHeightRelaxed: 1.7,  // long-form text

  // ── Font family ───────────────────────────────────────────────────────
  // SF Pro on iOS, Roboto on Android — system defaults
  fontFamily: Platform.select({ ios: 'System', android: 'Roboto', default: 'System' }),
};
