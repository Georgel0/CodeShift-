import { useEffect, useState, useRef } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/main"; // Note: Type reflects filename
import hljs from "highlight.js/lib/core";
import css from "highlight.js/lib/languages/css";
import { db, auth } from "../firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  writeBatch,
  getDocs,
  setDoc,
  getDoc
} from "firebase/firestore";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { runConversionTask, ConversionResult } from "../services/conversionService";
import { CSS_TO_TAILWIND_CONFIG } from "../configs/cssConfig";
import { SpeedInsights } from '@vercel/speed-insights/react';

// Register highlight.js language
hljs.registerLanguage("css", css);

// TYPES
type HistoryItem = {
  id: string;
  css: string;
  tailwindData: string;
  analysis: string;
  timestamp: number;
}

// SERVER SIDE ACTION
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const cssCode = formData.get("cssCode");
  
  if (!cssCode || typeof cssCode !== "string") {
    return { error: "No input provided" };
  }
  
  try {
    // Modular call using the Service + Config
    const result = await runConversionTask(cssCode, CSS_TO_TAILWIND_CONFIG);
    return result;
  } catch (error: any) {
    return { error: error.message };
  }
}

// CLIENT SIDE COMPONENT
export default function Main() {
  const fetcher = useFetcher();
  
  // App State
  const [cssInput, setCssInput] = useState("");
  const [conversions, setConversions] = useState < ConversionResult["conversions"] > ([]);
  const [analysis, setAnalysis] = useState("");
  const [status, setStatus] = useState("Connecting...");
  const [userId, setUserId] = useState < string | null > (null);
  
  // History UI State
  const [history, setHistory] = useState < HistoryItem[] > ([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  
  // User Preferences (Monetization removed: Feature available to all)
  const [keepForever, setKeepForever] = useState(false);
  
  const codeBlockRef = useRef < HTMLElement > (null);
  
  // HELPERS
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  
  // 1. Logic: Clean up old data
  const cleanupOldHistory = async (uid: string, currentHistory: HistoryItem[], forceKeep: boolean) => {
    if (forceKeep) return; // User wants to keep everything
    
    const now = Date.now();
    const cutoff = now - THIRTY_DAYS_MS;
    const batch = writeBatch(db);
    let hasDeletions = false;
    
    currentHistory.forEach(item => {
      if (item.timestamp < cutoff) {
        const docRef = doc(db, `users/${uid}/conversions`, item.id);
        batch.delete(docRef);
        hasDeletions = true;
      }
    });
    
    if (hasDeletions) {
      await batch.commit();
      console.log("Auto-deleted expired history items.");
    }
  };
  
  // 2. Logic: Load User Settings Only
  useEffect(() => {
    if (!userId) return;
    
    const loadSettings = async () => {
      const docRef = doc(db, `users/${userId}/settings/general`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setKeepForever(docSnap.data().keepForever || false);
      }
    };
    loadSettings();
  }, [userId]);
  
  // 3. Auth & Real-time History Listener
  useEffect(() => {
    setStatus("Attempting anonymous sign-in...");
    
    signInAnonymously(auth)
      .then(() => setStatus("Signed in. Fetching data..."))
      .catch((e) => {
        console.error("Auth failed", e);
        setStatus(`Auth Error: ${e.code} - ${e.message}`);
      });
    
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        setStatus("");
        
        const q = query(
          collection(db, `users/${user.uid}/conversions`),
          orderBy("timestamp", "desc"),
          limit(50)
        );
        
        const unsubscribeSnapshot = onSnapshot(q, (snap) => {
          const historyData = snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
          })) as HistoryItem[];
          
          setHistory(historyData);
          
        }, (err) => {
          setStatus(`Database Error: ${err.code} - ${err.message}`);
        });
        
        return () => unsubscribeSnapshot();
      }
    });
    
    return () => unsubscribeAuth();
  }, []);
  
  // 4. Trigger Cleanup
  useEffect(() => {
    if (userId && !keepForever && history.length > 0) {
      cleanupOldHistory(userId, history, false);
    }
  }, [keepForever, userId, history.length]);
  
  
  // HANDLERS
  
  // Handle Action Response
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
            css: cssInput,
            tailwindData: JSON.stringify(data.conversions),
            analysis: data.analysis,
            timestamp: Date.now(),
          }).catch(e => console.error("Save failed", e));
        }
      }
    }
  }, [fetcher.data]);
  
  // Highlight Code
  useEffect(() => {
    if (codeBlockRef.current) {
      delete codeBlockRef.current.dataset.highlighted;
      hljs.highlightElement(codeBlockRef.current);
    }
  }, [cssInput]);
  
  const copyAllClasses = () => {
    const all = conversions.map(c => c.tailwind).join(' ');
    navigator.clipboard.writeText(all);
  };
  
  const loadHistoryItem = (item: HistoryItem) => {
    setCssInput(item.css);
    try {
      const parsed = JSON.parse(item.tailwindData);
      setConversions(parsed);
      setAnalysis(item.analysis);
    } catch (e) {
      setConversions([{ selector: "Error", tailwind: "Could not parse legacy data" }]);
    }
  };
  
  const deleteHistoryItem = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    if (!userId) return;
    if (confirm("Delete this item?")) {
      await deleteDoc(doc(db, `users/${userId}/conversions`, itemId));
    }
  };
  
  const clearAllHistory = async () => {
    if (!userId) return;
    if (confirm("Are you sure? This will delete ALL history items permanently.")) {
      const batch = writeBatch(db);
      const q = query(collection(db, `users/${userId}/conversions`));
      const snap = await getDocs(q);
      snap.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
  };
  
  const toggleKeepHistory = async () => {
    if (!userId) return;
    const newValue = !keepForever;
    setKeepForever(newValue);
    
    // Save preference to Firestore
    await setDoc(doc(db, `users/${userId}/settings/general`), {
      keepForever: newValue
    }, { merge: true });
  };
  
  const isLoading = fetcher.state === "submitting";
  
  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden font-sans text-white bg-slate-900">
      
{/* --- SIDEBAR HISTORY --- */}
  <aside className={`fixed inset-y-0 left-0 z-50 w-80 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${
            historyOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:relative lg:translate-x-0 lg:w-80`} 
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur z-10">
            <div className="flex items-center justify-between mb-4">
                <span className="flex items-center gap-2 font-bold text-slate-200">
                    <i className="fas fa-history text-blue-500"></i> History
                </span>
                <button
                    onClick={() => setHistoryOpen(false)}
                    className="text-slate-400 hover:text-white lg:hidden"
                >
                    <i className="fas fa-times text-xl"></i>
                </button>
            </div>

            {/* Controls: Keep Forever & Clear */}
            <div className="flex flex-col gap-3 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                
                {/* Checkbox Row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 relative">
                        <input 
                            type="checkbox" 
                            id="keepHistory"
                            checked={keepForever}
                            onChange={toggleKeepHistory}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 cursor-pointer"
                        />
                        <label htmlFor="keepHistory" className="text-xs text-slate-300 cursor-pointer select-none">
                            Keep History Forever
                        </label>
                        
                        {/* Info Button */}
                        <button 
                            onMouseEnter={() => setShowInfoPopup(true)}
                            onMouseLeave={() => setShowInfoPopup(false)}
                            className="text-slate-500 hover:text-blue-400 transition"
                        >
                            <i className="fas fa-info-circle text-xs"></i>
                        </button>

                        {/* Info Popup (Simplified) */}
                        {showInfoPopup && (
                            <div className="absolute top-6 left-0 w-64 bg-slate-800 text-slate-200 text-xs p-3 rounded-lg shadow-xl border border-slate-700 z-50">
                                <p className="mb-2"><strong>Data Policy:</strong></p>
                                <p>History older than 30 days is auto-deleted.</p>
                                <p className="mt-2 text-blue-300">Check the box to prevent deletion.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Clear All Button */}
                <button 
                    onClick={clearAllHistory}
                    className="flex items-center justify-center gap-2 w-full bg-red-900/20 hover:bg-red-900/40 text-red-400 text-xs py-2 rounded transition border border-red-900/30"
                >
                    <i className="fas fa-trash-alt"></i> Clear All History
                </button>
            </div>
        </div>
        
        {/* History List (Cards) */}
        <div className="overflow-y-auto flex-1 p-3 space-y-3">
          {status && <p className="text-xs text-slate-500 text-center mt-4">{status}</p>}
          
          {history.length === 0 && !status && (
              <div className="text-center mt-10 opacity-50">
                  <i className="fas fa-ghost text-4xl mb-2"></i>
                  <p className="text-xs">No history yet.</p>
              </div>
          )}

          {history.map((item) => (
            <div
              key={item.id}
              onClick={() => loadHistoryItem(item)}
              className="group relative bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-blue-500/50 p-3 rounded-lg cursor-pointer transition-all shadow-sm hover:shadow-md"
            >
                {/* Delete Individual Item Button */}
                <button 
                    onClick={(e) => deleteHistoryItem(e, item.id)}
                    className="absolute top-2 right-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    title="Delete this item"
                >
                    <i className="fas fa-times"></i>
                </button>

                {/* Card Content */}
                <div className="pr-6">
                    <p className="text-xs font-mono text-slate-300 truncate mb-1">
                        {item.css.slice(0, 30)}{item.css.length > 30 ? '...' : ''}
                    </p>
                    <div className="flex justify-between items-center mt-2">
                        <span className="text-[10px] text-slate-500">
                            {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                    </div>
                </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Backdrop */}
      {historyOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setHistoryOpen(false)}></div>
      )}

      {/* MAIN CONTENT*/}
      <main className="flex-1 flex flex-col p-4 lg:p-6 lg:ml-80 gap-4 h-full relative">
        <header className="flex justify-between items-center">
          <button onClick={() => setHistoryOpen(!historyOpen)} className="text-white hover:text-blue-400 transition lg:hidden">
              <i className="fas fa-bars text-xl"></i>
          </button>
          
          <h1 className="lg:ml-[50px] text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            CSS to Tailwind
          </h1>
          
          <fetcher.Form method="post" className="flex gap-2">
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

        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
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
                      <span className="text-orange-300 font-mono text-sm font-bold truncate">{item.selector}</span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(item.tailwind)}
                        className="text-xs text-slate-400 hover:text-white bg-slate-700 px-3 py-1 rounded transition"
                      >
                        Copy
                      </button>
                    </div>
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
      <SpeedInsights />
    </div>
  );
}