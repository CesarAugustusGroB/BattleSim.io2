import React, { useState } from 'react';
import { getStrategicAdvice } from '../services/geminiService';
import { GameStateStats } from '../types';
import { BrainCircuit, Loader2, Send } from 'lucide-react';

interface StrategyAdvisorProps {
  getStats: () => GameStateStats;
}

export const StrategyAdvisor: React.FC<StrategyAdvisorProps> = ({ getStats }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAsk = async () => {
    if (!query.trim()) return;
    
    setIsLoading(true);
    setResponse(null);
    
    const stats = getStats();
    const result = await getStrategicAdvice(stats, query);
    
    setResponse(result);
    setIsLoading(false);
  };

  return (
    <>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed top-4 right-4 z-20 bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-2"
      >
        <BrainCircuit size={24} />
        <span className="font-bold hidden md:inline">Ask AI Commander</span>
      </button>

      {/* Modal / Panel */}
      {isOpen && (
        <div className="fixed top-20 right-4 w-96 bg-neutral-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-xl shadow-2xl z-20 flex flex-col overflow-hidden animate-in slide-in-from-right-10 fade-in duration-300">
          <div className="bg-indigo-900/30 p-4 border-b border-indigo-500/20">
            <h3 className="text-indigo-200 font-bold flex items-center gap-2">
              <BrainCircuit size={18} />
              Strategic Intelligence
            </h3>
            <p className="text-xs text-indigo-300/60 mt-1">Powered by Gemini 3 Pro (Thinking Mode)</p>
          </div>

          <div className="p-4 flex-1 overflow-y-auto max-h-[60vh] min-h-[200px] text-sm text-neutral-300 space-y-4">
            {!response && !isLoading && (
              <div className="text-center text-neutral-500 italic mt-8">
                "Commander, I am analyzing the battlefield. Ask me for tactical advice."
              </div>
            )}
            
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-8 text-indigo-400 animate-pulse">
                <Loader2 size={32} className="animate-spin mb-2" />
                <span>Thinking deeply (Budget: 32k tokens)...</span>
              </div>
            )}

            {response && (
              <div className="prose prose-invert prose-sm">
                <div className="whitespace-pre-wrap">{response}</div>
              </div>
            )}
          </div>

          <div className="p-3 bg-black/20 border-t border-white/10 flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              placeholder="e.g. How do I counter mass tanks?"
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={handleAsk}
              disabled={isLoading || !query.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};