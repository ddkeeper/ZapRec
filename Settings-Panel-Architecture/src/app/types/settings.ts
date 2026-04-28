export interface Settings {
  general: {
    countdownSeconds: number;
    fps: 30 | 60;
    resolution: "original" | "1080P";
    minimizeToTrayOnClose: boolean;
  };
  shortcuts: {
    toggleRecord: string;
    togglePause: string;
    toggleVisibility: string;
  };
  storage: {
    saveDirectory: string;
  };
  lastState: {
    microphoneEnabled: boolean;
    systemAudioEnabled: boolean;
    pipEnabled: boolean;
  };
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
    saveDirectory: "C:\\Users\\intangible\\Downloads",
  },
  lastState: {
    microphoneEnabled: false,
    systemAudioEnabled: false,
    pipEnabled: false,
  },
};
