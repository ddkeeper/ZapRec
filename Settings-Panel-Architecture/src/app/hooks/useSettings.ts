import { useState, useEffect } from "react";
import { Settings, DEFAULT_SETTINGS } from "../types/settings";

const STORAGE_KEY = "zaprec_config";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // In a real app, this would be where you'd write to config.json
    console.log("Config persisted:", settings);
  }, [settings]);

  const updateSettings = <K extends keyof Settings>(
    section: K,
    updates: Partial<Settings[K]>
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        ...updates,
      },
    }));
  };

  return { settings, updateSettings };
}
