import { createContext, useContext, useEffect, useState, useCallback } from "react";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SettingsContext = createContext({ settings: null, reload: () => {} });

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  const reload = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/settings`);
      setSettings(res.data || {});
    } catch {
      setSettings({});
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <SettingsContext.Provider value={{ settings: settings || {}, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

/** Pick a setting value with optional fallback. */
export function useSetting(key, fallback = "") {
  const { settings } = useSettings();
  const v = settings ? settings[key] : undefined;
  if (v === undefined || v === null || v === "") return fallback;
  return v;
}
