// Dark or light theme, kept in this browser. The choice is applied before the first paint by a script in
// the page head, so the page never flashes the wrong colours. Dark until someone chooses light.
export type Theme = 'dark' | 'light';
export const THEME_KEY = 'finn.theme';
export const THEME_CHANGED_EVENT = 'finn:theme-changed';

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'){t='dark';}var c=document.documentElement.classList;c.remove('dark','light');c.add(t);}catch(e){}})();`;

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

export function setTheme(theme: Theme): void {
  const classes = document.documentElement.classList;
  classes.remove('dark', 'light');
  classes.add(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private windows can refuse storage; the theme still applies until the page closes.
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#ffffff' : '#0a0d14');
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
}
