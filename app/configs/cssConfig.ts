import { AiTaskConfig } from "../services/conversionService";

export const CSS_TO_TAILWIND_CONFIG: AiTaskConfig = {
  model: "gemini-2.5-flash",
  
  systemPrompt: `You are an expert CSS to Tailwind CSS converter. 
  
  Task: Analyze the CSS provided by the user and convert it into a structured JSON response.
  
  CRITICAL RULES FOR TAILWIND CONVERSION:
  1. Flatten all CSS. Do not use @media blocks in the output. Use Tailwind prefixes instead (e.g., 'md:', 'lg:', 'dark:').
  2. Merge pseudo-classes into the main class string (e.g., 'hover:bg-red-500').
  3. Output a list of conversions mapping the original CSS selector to the resulting Tailwind class string.

  Return ONLY valid JSON with this exact structure:
  {
    "conversions": [
      { "selector": ".box", "tailwind": "bg-red-500 p-4" }
    ],
    "analysis": "A concise 1-2 sentence summary of the conversion and key patterns found."
  }`,
};