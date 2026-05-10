import { DISPLAY_NAME } from '../config'

export interface GeneralSettings {
  countdownSeconds: number;
  fps: 30 | 60;
  resolution: "original" | "1080P";
  minimizeToTrayOnClose: boolean;
}

export interface ShortcutSettings {
  toggleRecord: string;
  togglePause: string;
  toggleVisibility: string;
}

export interface StorageSettings {
  saveDirectory: string;
  filenamePrefix: string;
  filenameTemplate: string;
}

export interface LastStateSettings {
  microphoneEnabled: boolean;
  systemAudioEnabled: boolean;
  pipEnabled: boolean;
}

export interface Settings {
  general: GeneralSettings;
  shortcuts: ShortcutSettings;
  storage: StorageSettings;
  lastState: LastStateSettings;
}

export interface RecordingItem {
  id: string;
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  date: string;
}

export const DEFAULT_SETTINGS: Settings = {
  general: {
    countdownSeconds: 3,
    fps: 60,
    resolution: "original",
    minimizeToTrayOnClose: true,
  },
  shortcuts: {
    toggleRecord: "Alt+Shift+R",
    togglePause: "Alt+Shift+P",
    toggleVisibility: "Alt+Shift+H",
  },
  storage: {
    saveDirectory: "",
    filenamePrefix: DISPLAY_NAME,
    filenameTemplate: "{app}_{date}_{time}",
  },
  lastState: {
    microphoneEnabled: false,
    systemAudioEnabled: false,
    pipEnabled: false,
  },
};