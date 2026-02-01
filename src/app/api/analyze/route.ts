import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    // 1. Initialize Key INSIDE the function (Critical for Localhost stability)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("❌ CRITICAL: GEMINI_API_KEY is missing in .env.local");
      throw new Error("Missing GEMINI_API_KEY");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const { yieldData, healthFactor, scenario } = await req.json();

    // 2. Risk Logic (Immediate Safety Override)
    if (healthFactor !== 'SAFE' && healthFactor !== '---' && Number(healthFactor) < 1.5) {
        return NextResponse.json({ 
            advice: `CRITICAL ALERT: Health Factor ${healthFactor} is DANGEROUSLY LOW. Liquidation risk detected. Repay debt.` 
        });
    }

    // 3. AI Call (Restored to your preferred 2.5 Flash model)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); 
    
    const prompt = `
      You are Aegis, a military-grade DeFi Sentinel.
      Data: APY ${yieldData}%, Health ${healthFactor}.
      User Scenario: "${scenario || 'None'}".
      Output: One short, robotic, tactical advice line (max 15 words).
      Style: Cyberpunk, cold, efficient.
    `;

    const result = await model.generateContent(prompt);
    const advice = result.response.text();

    return NextResponse.json({ advice });

  } catch (error) {
    console.error("⚠️ AEGIS BACKEND ERROR:", error);
    // Graceful fallback so the UI doesn't break
    return NextResponse.json({ advice: "Neural Link Offline. Cached Strategy Active." });
  }
}