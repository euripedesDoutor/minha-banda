export interface AudioState {
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  isLoaded: boolean;
  fileName: string | null;
}

export interface AudioSettings {
  detune: number; // Pitch (cents)
  vocalRemoval: boolean; // Toggle karaoke mode
  volume: number;
  eqLow: number; // dB -12 to 12
  eqMid: number; // dB -12 to 12
  eqHigh: number; // dB -12 to 12
  speed: number; // Playback rate (0.5 to 2.0)
}