// Gemini AI Service - DISABLED (no API key configured)
import { GameStateStats } from '../types';

export const getStrategicAdvice = async (
  stats: GameStateStats,
  userQuery: string
): Promise<string> => {
  // AI functionality is disabled - return a placeholder message
  return `🚫 AI Commander is currently offline.

To enable AI strategic advice, you need to:
1. Get a Gemini API key from Google AI Studio
2. Configure the API_KEY in your environment

Current battlefield status:
• Red Team: ${stats.redCount} units
• Blue Team: ${stats.blueCount} units

Your query: "${userQuery}"`;
};