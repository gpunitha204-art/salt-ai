
import React from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptionListProps {
  entries: TranscriptionEntry[];
}

export const TranscriptionList: React.FC<TranscriptionListProps> = ({ entries }) => {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50 rounded-xl scrollbar-hide border border-slate-800"
    >
      {entries.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
          <svg className="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          <p className="text-sm italic">Waiting for sign or speech input...</p>
        </div>
      )}
      {entries.map((entry) => (
        <div 
          key={entry.id} 
          className={`flex flex-col ${entry.speaker === 'User' ? 'items-end' : 'items-start'}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {entry.speaker}
            </span>
            <span className="text-[10px] text-slate-500">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <div 
            className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-lg border ${
              entry.speaker === 'User' 
                ? 'bg-blue-600 text-white border-blue-500 rounded-tr-none' 
                : 'bg-slate-800 text-slate-100 border-slate-700 rounded-tl-none'
            }`}
          >
            {parseContent(entry.text)}
          </div>
        </div>
      ))}
    </div>
  );
};

function parseContent(text: string) {
    // Basic parser for [SIGN: "Hello" -> ...] format
    const parts = text.split(/(\[SIGN:.*?\])/g);
    return parts.map((part, i) => {
        if (part.startsWith('[SIGN:')) {
            const match = part.match(/\[SIGN:\s*"(.*?)"\s*->\s*(.*?)\]/);
            if (match) {
                return (
                    <div key={i} className="my-2 bg-indigo-900/40 p-3 rounded-lg border border-indigo-400/30 flex items-start gap-3">
                        <div className="bg-indigo-500 p-2 rounded-md shadow-inner">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 013 0m-6 8V12a3 3 0 00-6 0v4.5" />
                            </svg>
                        </div>
                        <div>
                            <span className="block font-bold text-indigo-300 text-xs mb-1 uppercase tracking-tight">Visual Sign Guide</span>
                            <span className="block font-semibold text-white mb-1">"{match[1]}"</span>
                            <p className="text-xs text-slate-300 leading-relaxed italic">{match[2]}</p>
                        </div>
                    </div>
                );
            }
        }
        return <span key={i}>{part}</span>;
    });
}
