import { GoogleGenAI } from "@google/genai";
import { GameStateStats } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getStrategicAdvice = async (
  stats: GameStateStats, 
  userQuery: string
): Promise<string> => {
  
  const systemInstruction = `
    You are an expert military strategist AI for a 2D battle simulator game "BattleSim.io".
    
    Unit Stats:
    - Soldiers: Cheap, fast, moderate damage, melee. Good in swarms.
    - Tanks: High health, slow, high damage, melee/short range. Good tanks.
    - Archers: Low health, fast, ranged attacks. Good for DPS from behind lines.
    - Cavalry: Very fast, charge bonus, melee. Good for flanking and breaking lines.
    - HQ: Stationary base, high health, defensive fire. Losing this usually means defeat.
    
    Terrain Mechanics:
    - High Ground (Elevation): The map contains elevated terrain zones. Units on high ground deal 50% more damage and inflict more knockback against units on low ground. Controlling these zones provides a significant advantage.
    
    Current Battle Context:
    - Red Team: ${stats.redCount} units (Soldiers: ${stats.redComposition.SOLDIER}, Tanks: ${stats.redComposition.TANK}, Archers: ${stats.redComposition.ARCHER}, Cavalry: ${stats.redComposition.CAVALRY}, HQ: ${stats.redComposition.HQ})
    - Blue Team: ${stats.blueCount} units (Soldiers: ${stats.blueComposition.SOLDIER}, Tanks: ${stats.blueComposition.TANK}, Archers: ${stats.blueComposition.ARCHER}, Cavalry: ${stats.blueComposition.CAVALRY}, HQ: ${stats.blueComposition.HQ})
    
    Your goal is to provide specific, actionable strategic advice based on the unit composition match-up and the user's question.
    Analyze the strengths and weaknesses of the current armies. 
    Explain 'Why' before telling 'How'.
    Keep the tone like a hardened battlefield commander.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: userQuery,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: {
            thinkingBudget: 32768, 
        }
      }
    });

    return response.text || "Communication disrupted. I cannot provide strategy at this time.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The coms link is broken, Commander. We're on our own for now. (Check API Key)";
  }
};