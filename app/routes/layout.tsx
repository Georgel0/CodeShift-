// app/routes/layout.tsx
import { useState, useEffect } from "react";
import { Outlet, Link, useLocation } from "react-router";
import { signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { collection, query, orderBy, limit, onSnapshot, getDoc, setDoc, doc, writeBatch, getDocs, deleteDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

// TYPES for History and Context
type HistoryItem = {
  id: string;
  type: "css" | "sql" | string; // Type of conversion
  input: string;       
  output: string;      
  analysis: string;
  timestamp: number;
}

export type ContextType = {
  userId: string | null;
  historyItemToLoad: HistoryItem | null; // Used to trigger data load in a child route
};

export default function AppLayout() {
  const location = useLocation();
  
  // State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting...");
  const [keepForever, setKeepForever] = useState(false);
  const [showInfoPopup, setShowInfoPopup] = useState(false);
  
  // State for communication with child routes
  const [historyItemToLoad, setHistoryItemToLoad] = useState<HistoryItem | null>(null);
  
  // HELPERS
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  
  // Logic: Clean up old data
  const cleanupOldHistory = async (uid: string, currentHistory: HistoryItem[]) => {
    if (keepForever) return; 
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
  
  // Logic: Load User Settings Only
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
  
  // Auth & Real-time History Listener
  useEffect(() => {
    setStatus("Attempting anonymous sign-in...");
    signInAnonymously(auth)
      .then(() => setStatus("Signed in. Fetching data..."))
      .catch((e) => {
        console.error("Auth failed", e);
        setStatus(`Auth Error: ${e.code}`);
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
          const historyData = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HistoryItem));
          setHistory(historyData);
          if (user.uid && historyData.length > 0) {
             // Run cleanup after initial load
             cleanupOldHistory(user.uid, historyData);
          }
        }, (err) => {
          setStatus(`Database Error: ${err.code}`);
        });
        
        return () => unsubscribeSnapshot();
      }
    });
    
    return () => unsubscribeAuth();
  }, [keepForever]);
  
  // HANDLERS
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
    await setDoc(doc(db, `users/${userId}/settings/general`), {
      keepForever: newValue
    }, { merge: true });
  };
  
  // Determine current active tool name
  const currentToolName = location.pathname.split('/').pop() || "CodeShift";
  
  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden font-sans text-white bg-slate-900">
      
{/*SIDEBAR HISTORY*/}
  <aside className={`fixed inset-y-0 left-0 z-50 w-80 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${
            historyOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:relative lg:translate-x-0 lg:w-80`} 
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/95 backdrop-blur z-10">
            <div className="flex items-center justify-between mb-4">
                <Link to="/" className="flex items-center gap-2 font-bold text-slate-200">
                    <i className="fas fa-history text-blue-500"></i> History
                </Link>
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

                        {/* Info Popup */}
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
        
        {/* History List */}
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
              // Send the item to the context when clicked
              onClick={() => { setHistoryItemToLoad(item); setHistoryOpen(false); }}
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
                    <span className="text-xs font-bold uppercase text-blue-400 mb-1">{item.type}</span>
                    <p className="text-xs font-mono text-slate-300 truncate mt-1">
                        {item.input.slice(0, 30)}{item.input.length > 30 ? '...' : ''}
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
      <main className="flex-1 flex flex-col p-4 lg:p-6 gap-4 h-full relative">
        <header className="flex justify-between items-center">
          <button onClick={() => setHistoryOpen(!historyOpen)} className="text-white hover:text-blue-400 transition lg:hidden">
              <i className="fas fa-bars text-xl"></i>
          </button>
          
          <h1 className="lg:ml-[50px] text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            {currentToolName}
          </h1>
          
          <Link to="/" className="text-sm text-slate-400 hover:text-white transition">
             <i className="fas fa-th-large mr-2"></i>Dashboard
          </Link>
        </header>

        <div className="flex-1 min-h-0">
          {/* Outlet renders the child route (e.g., /css) */}
          <Outlet context={{ userId, historyItemToLoad } satisfies ContextType} />
        </div>
      </main>
    </div>
  );
}
