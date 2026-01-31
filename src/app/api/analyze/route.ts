import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: Request) {
  try {
    const { yieldData, healthFactor } = await req.json();

    // RISK LOGIC: Immediate Override if user is in danger
    // If Health Factor is numeric (not "SAFE") and low (< 1.5)
    if (healthFactor !== 'SAFE' && healthFactor !== '---' && Number(healthFactor) < 1.5) {
        return NextResponse.json({ 
            advice: `CRITICAL ALERT: Health Factor ${healthFactor} is DANGEROUSLY LOW. Liquidation risk detected. IMMEDIATE ACTION: Repay debt or supply collateral.` 
        });
    }

    // STANDARD LOGIC: Market Analysis
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `
      You are Aegis, an AI DeFi Sentinel monitoring Aave V3 on Sepolia.
      
      Current Market Data:
      - APY: ${yieldData}%
      - User Health Factor: ${healthFactor} (Note: > 2.0 is Safe, < 1.1 is Critical)

      Output a single, robotic, tactical line of advice (max 15 words).
      If APY is high (>5%), recommend accumulation.
      If APY is low, recommend monitoring.
      Style: Cyberpunk, military-grade financial terminal.
      Do not mention "I am an AI".
    `;

    const result = await model.generateContent(prompt);
    const advice = result.response.text();

    return NextResponse.json({ advice });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ advice: "Neural Link Offline. Cached Strategy Active." });
  }
}