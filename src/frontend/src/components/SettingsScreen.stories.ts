import type { Meta, StoryObj } from '@storybook/svelte';
import SettingsScreen from './SettingsScreen.svelte';

const meta = {
  title: 'Screens/Settings',
  component: SettingsScreen,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Device language and request timeout preferences, system proxy information, and encrypted workspace security actions.',
      },
    },
  },
  args: {
    locale: 'en',
    timeoutSeconds: 30,
    themePreference: 'dark',
    onLocaleChange: () => {},
    onTimeoutChange: () => {},
    onThemeChange: () => {},
    onChangePassword: () => {},
  },
} satisfies Meta<typeof SettingsScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = {};
export const BrazilianPortuguese: Story = { args: { locale: 'pt-BR' } };
export const LightTheme: Story = { args: { themePreference: 'light' } };
export const HighContrastTheme: Story = { args: { themePreference: 'high-contrast' } };
