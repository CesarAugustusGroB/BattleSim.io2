import { GoogleGenAI } from "@google/genai";
import { GameStateStats } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getStrategicAdvice = async (
  stats: GameStateStats, 
  userQuery: string
): Promise<string> => {
  
  const systemPrompt = `
    You are an expert military strategist AI for a 2D battle simulator game "BattleSim.io".
    
    Unit Stats:
    - Soldiers: Cheap, fast, moderate damage, melee. Good in swarms.
    - Tanks: High health, slow, high damage, melee/short range. Good tanks.
    - Archers: Low health, fast, ranged attacks. Good for DPS from behind lines.
    
    Current Battle Context:
    - Red Team: ${stats.redCount} units (Soldiers: ${stats.redComposition.SOLDIER}, Tanks: ${stats.redComposition.TANK}, Archers: ${stats.redComposition.ARCHER})
    - Blue Team: ${stats.blueCount} units (Soldiers: ${stats.blueComposition.SOLDIER}, Tanks: ${stats.blueComposition.TANK}, Archers: ${stats.blueComposition.ARCHER})
    
    Your goal is to provide specific, actionable strategic advice based on the unit composition match-up and the user's question.
    Analyze the strengths and weaknesses of the current armies. 
    Explain 'Why' before telling 'How'.
    Keep the tone like a hardened battlefield commander.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        { role: 'user', parts: [{ text: `System Context: ${systemPrompt}` }] },
        { role: 'user', parts: [{ text: `User Question: ${userQuery}` }] }
      ],
      config: {
        thinkingConfig: {
            thinkingBudget: 32768, // Max thinking budget for deep strategic reasoning
        }
      }
    });

    return response.text || "Communication disrupted. I cannot provide strategy at this time.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The coms link is broken, Commander. We're on our own for now. (Check API Key)";
  }
};