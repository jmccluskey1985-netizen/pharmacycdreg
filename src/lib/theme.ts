/** Dashboard colour modes. Same set as PharmacyConsultation.ie, plus the mint Default of the home page. */
export type Theme = 'default' | 'light' | 'dark' | 'hse-dark';
export const THEME_KEY = 'cdreg-theme';
export const THEME_CLASSES = ['theme-default', 'theme-white', 'dark', 'hse-dark'] as const;
export const themeClass = (t: Theme) => (t === 'default' ? 'theme-default' : t === 'light' ? 'theme-white' : t);
export const isTheme = (t: unknown): t is Theme => t === 'default' || t === 'light' || t === 'dark' || t === 'hse-dark';
export const THEMES: { value: Theme; label: string; text: string; swatch: [string, string] }[] = [
  { value: 'default', label: 'Default', text: 'Mint green, as on the home page', swatch: ['#f0f7f0', '#184b21'] },
  { value: 'light', label: 'Light', text: 'Bright white, for well-lit rooms', swatch: ['#ffffff', '#184b21'] },
  { value: 'dark', label: 'True Black', text: 'Dark, easy on the eyes in the dispensary', swatch: ['#000000', '#54bd50'] },
  { value: 'hse-dark', label: 'HSE Dark', text: 'Dark with HSE green accents', swatch: ['#0a1f1c', '#00897b'] },
];
/** Runs before the dashboard paints, so the saved mode shows with no flash. */
export const THEME_BOOT = `try{var t=localStorage.getItem('${THEME_KEY}');var c={light:'theme-white',dark:'dark','hse-dark':'hse-dark'}[t]||'theme-default';document.documentElement.classList.add(c);}catch(e){document.documentElement.classList.add('theme-default');}`;
