
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { CameraFeed } from './components/CameraFeed';
import { TranscriptionList } from './components/TranscriptionList';
import { TranscriptionEntry, AppStatus } from './types';
import { SYSTEM_INSTRUCTION, MODEL_NAME, FRAME_RATE } from './constants';
import { decode, decodeAudioData, createBlob } from './services/audioUtils';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [entries, setEntries] = useState<TranscriptionEntry[]>([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const addTranscription = useCallback((text: string, speaker: 'User' | 'Gemini', type: 'speech' | 'sign') => {
    if (!text.trim()) return;
    setEntries(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      text,
      speaker,
      type,
      timestamp: Date.now()
    }]);
  }, []);

  const connectToLiveAPI = async () => {
    if (status === AppStatus.ACTIVE) return;
    
    setStatus(AppStatus.CONNECTING);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Initialize Audio Contexts
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const sessionPromise = ai.live.connect({
        model: MODEL_NAME,
        callbacks: {
          onopen: () => {
            console.log('Connected to Gemini Live');
            setStatus(AppStatus.ACTIVE);
            
            // Microphone Streaming logic
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              if (!isMicOn) return;
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Audio Data
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            // Handle Transcriptions
            if (message.serverContent?.outputTranscription) {
                currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
                currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              if (currentInputTranscription.current) {
                addTranscription(currentInputTranscription.current, 'User', 'speech');
                currentInputTranscription.current = '';
              }
              if (currentOutputTranscription.current) {
                addTranscription(currentOutputTranscription.current, 'Gemini', 'speech');
                currentOutputTranscription.current = '';
              }
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => s.stop());
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
            }
          },
          onerror: (e) => {
            console.error('Gemini Error:', e);
            setStatus(AppStatus.ERROR);
          },
          onclose: () => {
            console.log('Gemini Connection Closed');
            setStatus(AppStatus.IDLE);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {}
        }
      });
      
      sessionPromiseRef.current = sessionPromise;
    } catch (err) {
      console.error('Connection failed:', err);
      setStatus(AppStatus.ERROR);
    }
  };

  const handleFrame = useCallback((base64: string) => {
    if (status !== AppStatus.ACTIVE || !isCamOn) return;
    sessionPromiseRef.current?.then(session => {
      session.sendRealtimeInput({
        media: { data: base64, mimeType: 'image/jpeg' }
      });
    });
  }, [status, isCamOn]);

  const toggleSession = () => {
    if (status === AppStatus.ACTIVE) {
        // Simple refresh to reset for demo purposes
        window.location.reload();
    } else {
        connectToLiveAPI();
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-slate-100 p-4 md:p-6 lg:p-8 font-sans">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
                SALT AI <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-medium">V1.0</span>
            </h1>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">Universal Accessibility Bridge</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={toggleSession}
            className={`px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all shadow-lg ${
              status === AppStatus.ACTIVE 
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/20' 
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'
            }`}
          >
            {status === AppStatus.ACTIVE ? (
              <>
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                END SESSION
              </>
            ) : status === AppStatus.CONNECTING ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                CONNECTING...
              </>
            ) : (
              'START COMMUNICATION'
            )}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Left Side: Input (Camera/Mic) */}
        <section className="flex flex-col gap-4 min-h-0">
          <div className="flex-1 min-h-[300px]">
            <CameraFeed 
              isActive={status === AppStatus.ACTIVE && isCamOn} 
              onFrame={handleFrame} 
              frameRate={FRAME_RATE}
            />
          </div>
          
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex gap-4">
              <button 
                onClick={() => setIsCamOn(!isCamOn)}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isCamOn ? 'bg-slate-800 text-indigo-400' : 'bg-red-900/30 text-red-500'}`}
              >
                {isCamOn ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                )}
              </button>
              <button 
                onClick={() => setIsMicOn(!isMicOn)}
                className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isMicOn ? 'bg-slate-800 text-emerald-400' : 'bg-red-900/30 text-red-500'}`}
              >
                {isMicOn ? (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                ) : (
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                )}
              </button>
            </div>
            
            <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Audio Input Level</span>
                <div className="flex gap-1 h-3 items-end">
                    {[1,2,3,4,5,6,7,8].map(i => (
                        <div 
                            key={i} 
                            className={`w-1 rounded-full bg-indigo-500 transition-all duration-75`}
                            style={{ 
                                height: status === AppStatus.ACTIVE && isMicOn ? `${Math.random() * 100}%` : '20%',
                                opacity: status === AppStatus.ACTIVE && isMicOn ? 1 : 0.3
                            }}
                        />
                    ))}
                </div>
            </div>
          </div>
        </section>

        {/* Right Side: Output (Transcriptions & Visual Signs) */}
        <section className="flex flex-col gap-4 min-h-0">
          <div className="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
              <h2 className="text-sm font-bold flex items-center gap-2">
                <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                COMMUNICATION STREAM
              </h2>
              <div className="flex gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20" />
                <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-lg shadow-indigo-500/20" />
              </div>
            </div>
            <TranscriptionList entries={entries} />
          </div>

          <div className="p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-2xl flex items-center gap-4">
            <div className="p-2 bg-indigo-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <div>
                <p className="text-xs font-bold text-indigo-300 uppercase tracking-wide">Accessibility Hint</p>
                <p className="text-sm text-slate-300">Salt AI translates signs from the video and speech from the mic in real-time. Look for <span className="text-indigo-400 font-semibold italic">Visual Sign Guides</span> for spoken words.</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer / Status Bar */}
      <footer className="mt-6 flex items-center justify-between text-slate-500 text-[10px] font-bold tracking-widest uppercase">
        <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${status === AppStatus.ACTIVE ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                SERVICE: {status}
            </span>
            <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isMicOn ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                MIC: {isMicOn ? 'ON' : 'OFF'}
            </span>
            <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isCamOn ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                CAM: {isCamOn ? 'ON' : 'OFF'}
            </span>
        </div>
        <div>POWERED BY GEMINI LIVE AI</div>
      </footer>
    </div>
  );
};

export default App;
