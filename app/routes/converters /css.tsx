// app/routes/converters/css.tsx
import { useEffect, useState, useRef } from "react";
import { useFetcher, useOutletContext } from "react-router";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../../firebase";
import { runConversionTask, ConversionResult } from "../../services/conversionService";
import { CSS_TO_TAILWIND_CONFIG } from "../../configs/cssConfig";
import hljs from "highlight.js/lib/core";
import css from "highlight.js/lib/languages/css";
import { type ContextType } from "../layout";

// Register highlight.js language (Moved from old main.tsx)
hljs.registerLanguage("css", css);

//SERVER ACTION
export async function action({ request }: { request: Request }) {
 const formData = await request.formData();
 const inputCode = formData.get("inputCode") as string;
 
 if (!inputCode) return { error: "No input provided" };
 
 try {
  const result = await runConversionTask(inputCode, CSS_TO_TAILWIND_CONFIG);
  return result;
 } catch (error: any) {
  return { error: error.message };
 }
}

//CLIENT SIDE COMPONENT
export default function CssConverter() {
 const fetcher = useFetcher();
 // Access data passed from the layout
 const { userId, historyItemToLoad } = useOutletContext < ContextType > ();
 
 // App State
 const [cssInput, setCssInput] = useState("");
 const [conversions, setConversions] = useState < ConversionResult["conversions"] > ([]);
 const [analysis, setAnalysis] = useState("");
 
 const codeBlockRef = useRef < HTMLElement > (null);
 const isLoading = fetcher.state === "submitting";
 
 // 1. Listen for History Clicks from the Layout
 useEffect(() => {
  if (historyItemToLoad && historyItemToLoad.type === "css") {
   setCssInput(historyItemToLoad.input);
   setAnalysis(historyItemToLoad.analysis);
   try {
    // Note: History stores output as a JSON string
    setConversions(JSON.parse(historyItemToLoad.output));
   } catch (e) {
    console.error("Failed to parse history data.", e);
    setConversions([{ error: "Could not parse history item." }]);
   }
  }
 }, [historyItemToLoad]);
 
 // 2. Handle Action Response & Saving to DB
 useEffect(() => {
  if (fetcher.data) {
   const data = fetcher.data as any;
   if (data.error) {
    setAnalysis(`Error: ${data.error}`);
    setConversions([]);
   } else if (data.conversions) {
    setAnalysis(data.analysis);
    setConversions(data.conversions);
    
    if (userId) {
     addDoc(collection(db, `users/${userId}/conversions`), {
      type: "css", // CRITICAL: Identify the conversion type
      input: cssInput,
      output: JSON.stringify(data.conversions),
      analysis: data.analysis,
      timestamp: Date.now(),
     }).catch(e => console.error("Save failed", e));
    }
   }
  }
 }, [fetcher.data, userId, cssInput]); // Depend on cssInput to save the correct value
 
 // 3. Highlight Code
 useEffect(() => {
  if (codeBlockRef.current) {
   delete codeBlockRef.current.dataset.highlighted;
   hljs.highlightElement(codeBlockRef.current);
  }
 }, [cssInput]);
 
 const copyAllClasses = () => {
  // Look for the 'tailwind' key in the generic conversion array
  const all = conversions.map(c => c.tailwind).filter(Boolean).join(' ');
  navigator.clipboard.writeText(all);
 };
 
 return (
  <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 h-full">
      <div className="flex-1 flex flex-col">
        <label className="text-xs text-slate-400 mb-2">CSS Input</label>
        
        <fetcher.Form method="post" className="flex-1 flex flex-col">
           {/* Use a hidden input to pass data to the action */}
           <input type="hidden" name="inputCode" value={cssInput} /> 
           <textarea
              value={cssInput}
              onChange={(e) => setCssInput(e.target.value)}
              className="flex-1 bg-slate-800 rounded-lg border border-slate-700 p-4 font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder=".box { color: red; }"
           />
           <button
              type="submit"
              disabled={isLoading || !cssInput}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg transition flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
            >
              <span>{isLoading ? 'Converting...' : 'Convert to Tailwind'}</span>
              {isLoading && <div className="loader"></div>}
            </button>
        </fetcher.Form>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <label className="text-xs text-slate-400 mb-2 flex justify-between">
          <span>Tailwind Output</span>
          {conversions.length > 0 && (
            <button onClick={copyAllClasses} className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded transition">
              Copy All
            </button>
          )}
        </label>
        
        {analysis && (
            <div className={`text-xs p-3 mb-3 rounded-lg code-font whitespace-pre-wrap ${
                analysis.startsWith("Error:") 
                    ? 'bg-red-900/50 text-red-300 border border-red-700'
                    : 'bg-purple-900/50 text-purple-300 border border-purple-700'
            }`}>
                {analysis}
            </div>
        )}
        
        <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 relative overflow-y-auto p-3 space-y-3">
          {conversions.length === 0 ? (
            <div className="text-slate-500 text-center mt-10 text-sm">Results appear here.</div>
          ) : (
            conversions.map((item, idx) => (
              <div key={idx} className="bg-slate-900/50 p-3 rounded border border-slate-700/50 flex flex-col gap-2 group hover:shadow-lg transition">
                <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-1">
                  {/* The selector key remains in the output */}
                  <span className="text-orange-300 font-mono text-sm font-bold truncate">{item.selector}</span>
                  <button 
                    onClick={() => navigator.clipboard.writeText(item.tailwind)}
                    className="text-xs text-slate-400 hover:text-white bg-slate-700 px-3 py-1 rounded transition"
                  >
                    Copy
                  </button>
                </div>
                {/* The tailwind key remains in the output */}
                <code className="text-green-300 text-sm font-mono break-words leading-relaxed">
                  {item.tailwind}
                </code>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
 );
}