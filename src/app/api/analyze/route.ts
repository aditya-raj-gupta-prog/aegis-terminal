import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { yieldData, healthFactor, scenario } = await req.json();

    // 1. HARD-CODED RISK OVERRIDE: Prioritize immediate danger over AI generation
    if (healthFactor !== 'SAFE' && healthFactor !== '---' && Number(healthFactor) < 1.5) {
        return NextResponse.json({ 
            advice: `CRITICAL ALERT: Health Factor ${healthFactor} is DANGEROUSLY LOW. Liquidation risk detected. IMMEDIATE ACTION: Repay debt.` 
        });
    }

    // 2. AI SIMULATION ENGINE: Handle both standard monitoring and voice scenarios
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `
      You are Aegis, a military-grade DeFi Sentinel.
      
      CURRENT DATA:
      - APY: ${yieldData}%
      - User Health Factor: ${healthFactor}
      ${scenario ? `- VOICE SIMULATION REQUEST: "${scenario}"` : ""}

      TASK:
      Provide ONE short, robotic, tactical advice line (max 20 words).
      If a simulation scenario is provided (e.g., price drop), calculate the strategic impact. 
      Style: Cyberpunk, cold, efficient terminal. Do not mention being an AI or Sepolia.
    `;

    const result = await model.generateContent(prompt);
    const advice = result.response.text();

    return NextResponse.json({ advice });
  } catch (error) {
    console.error(error);
    // Graceful fallback for API limits or network issues
    return NextResponse.json({ advice: "Neural Link Offline. Cached Strategy Active." });
  }
}