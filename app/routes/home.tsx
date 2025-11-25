import { useEffect, useState, useRef } from "react";
import { Form, useFetcher } from "react-router";
import type { Route } from "./+types/home";
import hljs from "highlight.js/lib/core";
import css from "highlight.js/lib/languages/css";
import { db, auth } from "../firebase";
import { collection, query, orderBy, limit, onSnapshot, addDoc } from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";

// Register highlight.js language
hljs.registerLanguage("css", css);

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
  Task: Return a JSON object with:
  1. "output": The Tailwind classes.
  2. "analysis": A 1 or 2-sentence explanation (based on the request) in which you explain the why and how of each conversion.
  Rules:
  - Output JSON only. No markdown.
  - Handle media queries and pseudo-classes using Tailwind prefixes.
  - Handle complex css code like calc(), okhsl(), var(), basically anything.
  - Assign each property for its corresponding class selector.
  - Double check before sending back the response for any bugs.`;
  
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
    
    // Clean Gemini response
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
  const [output, setOutput] = useState("Result will appear here");
  const [analysis, setAnalysis] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [status, setStatus] = useState("Connecting securely...");
  const [userId, setUserId] = useState<string | null>(null);
  const codeBlockRef = useRef<HTMLElement>(null);
  
  // 1. Auth & History Listener
  useEffect(() => {
    // Sign in anonymously
    signInAnonymously(auth).catch((e) => console.error("Auth failed", e));
    
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setStatus(""); // Connected
        
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
          setStatus(`History Error: ${err.message}`);
        });
        
        return () => unsubscribeSnapshot();
      }
    });
    
    return () => unsubscribeAuth();
  }, []);
  
  // 2. Handle Action Response (Save to DB)
  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as any;
      
      if (data.error) {
        setAnalysis(`Error: ${data.error}`);
      } else if (data.output) {
        setOutput(data.output);
        setAnalysis(data.analysis);
        
        // Save to Firestore if logged in
        if (userId) {
          addDoc(collection(db, `users/${userId}/conversions`), {
            css: cssInput,
            tailwind: data.output,
            analysis: data.analysis,
            timestamp: Date.now(),
          }).catch(e => console.error("Save failed", e));
        }
      }
    }
  }, [fetcher.data]);
  
  // 3. Highlight code on output change
  useEffect(() => {
    if (codeBlockRef.current) {
      delete codeBlockRef.current.dataset.highlighted; // Reset
      hljs.highlightElement(codeBlockRef.current);
    }
  }, [output]);
  
  const copyToClipboard = () => {
    navigator.clipboard.writeText(output).then(() => {
      const oldAnalysis = analysis;
      setAnalysis("Copied to clipboard!");
      setTimeout(() => setAnalysis(oldAnalysis), 2000);
    });
  };
  
  const loadFromHistory = (item: any) => {
    setCssInput(item.css);
    setOutput(item.tailwind);
    setAnalysis(item.analysis);
  };
  
  const isLoading = fetcher.state === "submitting";
  
  return (
    // MAIN CONTAINER
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden font-sans text-white bg-slate-900">
      
      {/* Sidebar History */}
      <aside className="w-full lg:w-72 bg-slate-900 border-r border-slate-800 flex flex-col h-[30vh] lg:h-auto order-last lg:order-first">
        <div className="p-4 border-b border-slate-800 font-bold flex items-center gap-2">
          <i className="fas fa-history text-blue-500"></i> Conversion History
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

      {/* Main Content */}
      <main className="flex-1 flex flex-col p-4 lg:p-6 gap-4 h-[70vh] lg:h-auto relative order-first lg:order-last">
        <header className="flex justify-between items-center">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            CSS to Tailwind AI Converter
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

        {/* INPUT/OUTPUT CONTAINER*/}
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

          {/* Output */}
          <div className="flex-1 flex flex-col min-h-0">
            <label className="text-xs text-slate-400 mb-2 flex justify-between">
              <span>Tailwind Output</span>
            </label>
            
            {/* DEDICATED ANALYSIS/ERROR BOX */}
            {analysis && (
                <div className={`text-xs p-2 mb-2 rounded-lg code-font whitespace-pre-wrap ${
                    analysis.startsWith("Error:") 
                        ? 'bg-red-900/50 text-red-300 border border-red-700'
                        : 'bg-purple-900/50 text-purple-300 border border-purple-700'
                }`}>
                    {analysis}
                </div>
            )}
            
            <div className="flex-1 bg-slate-800 rounded-lg border border-slate-700 relative overflow-hidden group">
              <pre className="h-full p-4 overflow-auto">
                <code 
                  ref={codeBlockRef} 
                  className="language-css text-sm bg-transparent"
                >
                  {output}
                </code>
              </pre>
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 bg-slate-700 hover:bg-slate-600 text-xs px-3 py-1 rounded opacity-0 group-hover:opacity-100 transition"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
