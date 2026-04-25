import { createContext, useContext, useEffect, useState } from 'react';

/**
 * Theme context — accent, density, radius. Persists to localStorage.
 * Drives body classNames read by tokens.css.
 *
 * Usage:
 *   <ThemeProvider><App /></ThemeProvider>
 *   const { accent, setAccent } = useTheme();
 */

const LS_KEY = 'ai2fi.theme.v1';

const DEFAULTS = {
  accent: 'emerald',   // emerald | blue | violet | amber | rose
  density: 'comfortable', // comfortable | compact
  radius: 'standard',  // square | standard | pillowy (pillowy = token default, no class)
};

const ThemeCtx = createContext(null);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    return { ...DEFAULTS, ...(saved || {}) };
  } catch { return { ...DEFAULTS }; }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(load);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(theme));
    const body = document.body;
    // Strip prior classes we own
    body.className = body.className
      .split(/\s+/)
      .filter(c => !c.startsWith('accent-') && !c.startsWith('density-') && !c.startsWith('radius-'))
      .join(' ')
      .trim();
    if (theme.accent !== 'emerald') body.classList.add(`accent-${theme.accent}`);
    if (theme.density !== 'comfortable') body.classList.add(`density-${theme.density}`);
    if (theme.radius !== 'pillowy') body.classList.add(`radius-${theme.radius}`);
  }, [theme]);

  const api = {
    ...theme,
    setAccent:  (v) => setTheme(t => ({ ...t, accent: v })),
    setDensity: (v) => setTheme(t => ({ ...t, density: v })),
    setRadius:  (v) => setTheme(t => ({ ...t, radius: v })),
  };

  return <ThemeCtx.Provider value={api}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}
