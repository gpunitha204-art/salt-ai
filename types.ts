
export interface TranscriptionEntry {
  id: string;
  speaker: 'User' | 'Gemini';
  text: string;
  type: 'speech' | 'sign';
  timestamp: number;
}

export enum AppStatus {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR'
}

export interface SignDescription {
  word: string;
  visualCues: string;
}
