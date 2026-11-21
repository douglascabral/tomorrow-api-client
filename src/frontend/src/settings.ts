export const DEFAULT_REQUEST_TIMEOUT_SECONDS = 30;
export const REQUEST_TIMEOUT_OPTIONS = [10, DEFAULT_REQUEST_TIMEOUT_SECONDS, 60, 120] as const;

export const THEME_PREFERENCES = ['system', 'light', 'dark', 'high-contrast'] as const;
export type ThemePreference = typeof THEME_PREFERENCES[number];
export type AppliedTheme = Exclude<ThemePreference, 'system'>;
export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && THEME_PREFERENCES.includes(value as ThemePreference);
}
