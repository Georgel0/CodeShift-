// app/services/conversionService.ts
const DEFAULT_MODEL = "gemini-2.5-flash";
const API_KEY = process.env.GEMINI_API_KEY;

export interface AiTaskConfig {
 systemPrompt: string;
 model ? : string;
}

/**
 * Interface is generic to handle any conversion task output.
 */
export interface ConversionResult {
 // Allows for keys like { selector: string; tailwind: string; } 
 // or { sql: string; mongo: string; }
 conversions: {
  [key: string]: string; } [];
 analysis: string;
}

/**
 * Generic function to call the Gemini API with a specific prompt and input.
 */
export async function runConversionTask(
 inputCode: string,
 config: AiTaskConfig
): Promise < ConversionResult > {
 
 if (!API_KEY) throw new Error("Server API Key missing.");
 
 const { systemPrompt, model = DEFAULT_MODEL } = config;
 
 try {
  const response = await fetch(
   `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`,
   {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
     contents: [{ parts: [{ text: inputCode }] }],
     systemInstruction: { parts: [{ text: systemPrompt }] },
     generationConfig: { responseMimeType: "application/json" },
    }),
   }
  );
  
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || data.error?.status || "API Error");
  
  // Clean and Parse the JSON response
  let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  text = text.replace(/```json/g, "").replace(/```/g, "").trim();
  
  return JSON.parse(text) as ConversionResult;
  
 } catch (error: any) {
  throw new Error(`AI Service Failed: ${error.message}`);
 }
}