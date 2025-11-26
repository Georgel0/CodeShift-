import { useEffect, useState, useRef } from "react";
import { Form, useFetcher } from "react-router";
import type { Route } from "./+types/home";
import hljs from "highlight.js/lib/core";
import css from "highlight.js/lib/languages/css";
import { db, auth } from "../firebase"; 
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";

// Register highlight.js language
hljs.registerLanguage("css", css);

// Define the new structured data type for the conversion result
type ConversionItem = {
    selector: string;
    tailwind: string;
}

// SERVER SIDE ACTION 
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const cssCode = formData.get("cssCode");
  
  if (!cssCode || typeof cssCode !== "string") {
    return { error: "No CSS provided" };
  }
  
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return { error: "Server API Key missing" };
  
  const SYSTEM_PROMPT = `You are an expert CSS to Tailwind CSS converter. 
  
  Task: Analyze the CSS provided by the user and convert it into a structured JSON response.
  
  CRITICAL RULES FOR TAILWIND CONVERSION:
  1. Flatten all CSS. Do not use @media blocks in the output. Use Tailwind prefixes instead (e.g., 'md:', 'lg:', 'dark:').
  2. Merge pseudo-classes into the main class string (e.g., 'hover:bg-red-500').
  3. Output a list of conversions mapping the original CSS selector to the resulting Tailwind class string.

  Return ONLY valid JSON with this exact structure:
  {
    "conversions": [
      { "selector": ".box", "tailwind": "bg-red-500 p-4 md:p-8" },
      { "selector": ".nav-link:hover", "tailwind": "hover:text-blue-500" }
    ],
    "analysis": "A concise 1-2 sentence summary of the conversion and key patterns found."
  }`;
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: cssCode }] }],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "API Error");
    
    // Clean and Parse the JSON response
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    return JSON.parse(text); 

  } catch (error: any) {
    return { error: error.message };
  }
}

// CLIENT SIDE COMPONENT
export default function Home() {
  const fetcher = useFetcher();
  const [cssInput, setCssInput] = useState("");

  const [conversions, setConversions] = useState<ConversionItem[]>([]); 
  const [analysis, setAnalysis] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [status, setStatus] = useState("Connecting securely...");
  const [userId, setUserId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const codeBlockRef = useRef<HTMLElement>(null); 
  
  // 1. Auth & History Listener
  useEffect(() => {
    // Sign in anonymously
    signInAnonymously(auth).catch((e) => console.error("Auth failed", e));
    
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setStatus("Connected."); // Connected
        
        // Listen to Firestore
        const q = query(
          collection(db, `users/${user.uid}/conversions`),
          orderBy("timestamp", "desc"),
          limit(10)
        );
        
        const unsubscribeSnapshot = onSnapshot(q, (snap) => {
          const historyData = snap.docs.map((doc) => doc.data());
          setHistory(historyData);
          if (snap.empty) setStatus("No conversion history yet.");
        }, (err) => {
          setStatus(`History Error: ${err.message}. Please check Firestore rules.`);
        });
        
        return () => unsubscribeSnapshot();
      }
    });
    
    return () => unsubscribeAuth();
  }, []);
  
  // 2. Handle Action Response
  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as any;
      
      if (data.error) {
        setAnalysis(`Error: ${data.error}`);
        setConversions([]); // Clear conversions on error
      } else if (data.conversions) {
        setAnalysis(data.analysis);
        setConversions(data.conversions); 
        
        // Save to Firestore if logged in
        if (userId) {
          addDoc(collection(db, `users/${userId}/conversions`), {
            css: cssInput,
            tailwindData: JSON.stringify(data.conversions), 
            analysis: data.analysis,
            timestamp: Date.now(),
          }).catch(e => console.error("Save failed", e));
        }
      }
    }
  }, [fetcher.data, userId, cssInput]);
  
  // 3. Highlight code on output change
  useEffect(() => {
    if (codeBlockRef.current) {
      delete codeBlockRef.current.dataset.highlighted; // Reset
      hljs.highlightElement(codeBlockRef.current);
    }
  }, [cssInput]); // Only highlighting the input now
  
  const copyAllClassesToClipboard = () => {
    const allClasses = conversions.map(c => c.tailwind).join(' ');
    navigator.clipboard.writeText(allClasses).then(() => {
      const oldAnalysis = analysis;
      setAnalysis("All Tailwind classes copied to clipboard!");
      setTimeout(() => setAnalysis(oldAnalysis), 3000);
    });
  };
  
  const loadFromHistory = (item: any) => {
    setCssInput(item.css);
    try {
        const parsed = JSON.parse(item.tailwindData);
        setConversions(parsed);
        setAnalysis(item.analysis);
    } catch (e) {
        setConversions([{ selector: "Legacy CSS Block", tailwind: item.tailwind || "Error loading legacy data" }]);
        setAnalysis(item.analysis + " (Note: Loaded from legacy format.)");
    }
    setHistoryOpen(false); 
  };
  
  const isLoading = fetcher.state === "submitting";
  
  return (
    // MAIN CONTAINER
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden font-sans text-white bg-slate-900">
      
      {/* Sidebar History Drawer */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${
            historyOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:relative lg:translate-x-0 lg:w-72`} 
      >
        <div className="p-4 border-b border-slate-800 font-bold flex items-center justify-between gap-2">
          <span className="flex items-center gap-2"><i className="fas fa-history text-blue-500"></i> Conversion History</span>
          
          {/* Close button for mobile */}
          <button
              onClick={() => setHistoryOpen(false)}
              className="text-white hover:text-red-400 lg:hidden text-2xl font-light"
          >
              &times;
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1 p-2 space-y-2">
          {status && <p className="text-xs text-slate-500 text-center mt-4">{status}</p>}
          {history.map((item, index) => (
            <div
              key={index}
              onClick={() => loadFromHistory(item)}
              className="bg-slate-800 p-3 rounded cursor-pointer hover:bg-slate-700 transition border-l-2 border-transparent hover:border-blue-500"
            >
              <p className="text-xs font-mono truncate opacity-80">{item.css}</p>
            </div>
          ))}
        </div>
      </aside>

      {/* Backdrop for mobile when drawer is open */}
      {historyOpen && (
          <div 
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
              onClick={() => setHistoryOpen(false)}
          ></div>
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 lg:p-6 lg:ml-72 gap-4 h-full relative">
        <header className="flex justify-between items-center">
          
          {/* Toggle History Button */}
          <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="text-white hover:text-blue-400 transition lg:hidden" 
          >
              <i className="fas fa-bars text-xl"></i>
          </button>
          
          <h1 className="ml-[50px] text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            CSS to Tailwind Converter
          </h1>
          
          {/* Action Form */}
          <fetcher.Form method="post" className="flex gap-2">
            {/* Hidden input to pass state to action */}
            <input type="hidden" name="cssCode" value={cssInput} />
            
            <button
              type="submit"
              disabled={isLoading || !cssInput}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium shadow-lg transition flex items-center gap-2 disabled:opacity-50"
            >
              <span>Convert</span>
              {isLoading && <div className="loader"></div>}
            </button>
          </fetcher.Form>
        </header>

        {/* INPUT/OUTPUT CONTAINER */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          {/* Input */}
          <div className="flex-1 flex flex-col">
            <label className="text-xs text-slate-400 mb-2">CSS Input</label>

            <textarea
              value={cssInput}
              onChange={(e) => setCssInput(e.target.value)}
              className="flex-1 bg-slate-800 rounded-lg border border-slate-700 p-4 font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder=".box { color: red; }"
            />
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <label className="text-xs text-slate-400 mb-2 flex justify-between">
              <span>Tailwind Output (Structured)</span>
              {conversions.length > 0 && (
                <button
                  onClick={copyAllClassesToClipboard}
                  className="bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded transition"
                >
                  Copy All Classes
                </button>
              )}
            </label>
            
            {/* DEDICATED ANALYSIS/ERROR BOX */}
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
                <div className="text-slate-500 text-center mt-10 text-sm">
                  The clean, structured Tailwind results will appear here after conversion.
                </div>
              ) : (
                // ITERATE OVER THE CLEAN ARRAY
                conversions.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="bg-slate-900/50 p-3 rounded border border-slate-700/50 flex flex-col gap-2 group hover:shadow-lg transition"
                  >
                    
                    {/* Top Row: Selector & Copy Button */}
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2 mb-1">
                      <span className="text-orange-300 font-mono text-sm font-bold truncate">{item.selector}</span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(item.tailwind)}
                        className="text-xs text-slate-400 hover:text-white bg-slate-700 px-3 py-1 rounded transition"
                      >
                        Copy Classes
                      </button>
                    </div>

                    {/* Bottom Row: Resulting Classes */}
                    <code className="text-green-300 text-sm font-mono break-words leading-relaxed">
                      {item.tailwind}
                    </code>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
