import { GoogleGenAI } from "@google/genai";

const baseUrl = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"];
const apiKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"];

if (!baseUrl || !apiKey) {
  // Don't throw on module load — grading just won't run until env is set.
}

let cached: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!baseUrl || !apiKey) {
    throw new Error("Gemini integration is not configured (missing env vars).");
  }
  if (!cached) {
    cached = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } });
  }
  return cached;
}

export const GRADER_MODEL = "gemini-2.5-flash";
