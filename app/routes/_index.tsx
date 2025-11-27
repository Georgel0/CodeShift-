// app/routes/_index.tsx
import { Link } from "react-router";

export default function Dashboard() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <h2 className="text-4xl font-extrabold text-white mb-8">Choose Your Conversion Tool</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        <Link 
          to="/css" 
          className="p-8 bg-slate-800 hover:bg-blue-900/50 border-2 border-slate-700 hover:border-blue-500 rounded-xl transition group shadow-lg"
        >
          <i className="fab fa-css3-alt text-5xl text-blue-500 mb-4 group-hover:scale-110 transition-transform block"></i>
          <h3 className="text-2xl font-bold text-white mb-2">CSS to Tailwind</h3>
          <p className="text-slate-400">Convert standard CSS selectors and properties into utility-first Tailwind classes.</p>
        </Link>
        
        {/* Placeholder for future feature */}
        <div className="p-8 bg-slate-800/30 border-2 border-slate-800 rounded-xl opacity-60 cursor-not-allowed shadow-inner">
          <i className="fas fa-code text-5xl text-slate-600 mb-4"></i>
          <h3 className="text-2xl font-bold text-slate-400">New Feature Coming</h3>
          <p className="text-slate-500">Check back soon for more conversion options!</p>
        </div>
      </div>
    </div>
  );
}
