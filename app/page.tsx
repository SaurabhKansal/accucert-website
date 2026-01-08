"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [theme, setTheme] = useState("default");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [email, setEmail] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isLightHero = theme === "default" || theme === "alt2";

  const handleUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      alert("Please enter a valid email address first so we can send you the translation.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("email", email);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percentComplete);
      }
    };

    xhr.onload = async () => {
      if (xhr.status === 200) {
        alert("Success! We have received your document. Our team will review it and email the certified translation to " + email);
        setEmail("");
        setIsUploading(false);
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText);
          alert(`Upload failed: ${errorData.error || "Unknown error"}`);
        } catch {
          alert("Upload failed. Please check your file size (Max 4.5MB).");
        }
        setIsUploading(false);
      }
    };

    xhr.onerror = () => {
      alert("An error occurred during the upload.");
      setIsUploading(false);
    };

    xhr.send(formData);
  };

  return (
    <main data-theme={theme} className="min-h-screen bg-slate-50 text-slate-800 relative">
      
      {/* THEME C: STYLISH WATERMARK */}
      {theme === "alt2" && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-[0.04]">
          <div className="absolute inset-0 flex flex-wrap justify-around items-around content-around">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} className="text-8xl font-black -rotate-12 uppercase p-20 select-none tracking-tighter">
                Accucert
              </span>
            ))}
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="application/pdf,image/*"
        className="hidden"
      />

      {/* LOADING OVERLAY */}
      {isUploading && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 border-4 border-slate-100 border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Processing...</h3>
            <p className="text-xs text-slate-500 mb-4">Securing your document for review</p>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
              <div 
                className="bg-[var(--accent)] h-2 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-[var(--accent)]">{uploadProgress}% Complete</span>
          </div>
        </div>
      )}

      {/* THEME SWITCHER */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => setTheme("default")} className="px-3 py-1 bg-slate-900 text-white text-[10px] rounded">A</button>
        <button onClick={() => setTheme("alt1")} className="px-3 py-1 bg-slate-900 text-white text-[10px] rounded">B</button>
        <button onClick={() => setTheme("alt2")} className="px-3 py-1 bg-slate-900 text-white text-[10px] rounded">C</button>
      </div>

      {/* HEADER */}
      <header className={`bg-slate-900 border-b border-slate-700 sticky top-0 z-40 transition-all ${theme === 'default' ? 'py-10' : 'py-4'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {theme !== "alt1" ? (
            <img 
              src="/logo.jpeg" 
              alt="Accucert" 
              className={`w-auto transition-all ${theme === 'default' ? 'h-16' : 'h-8'}`} 
            />
          ) : <div className="w-8" />}
          
          <nav className="hidden md:flex gap-10 text-sm font-bold text-slate-200">
            <a href="#services" className="hover:text-[var(--accent)] transition">Services</a>
            <a href="#how-it-works" className="hover:text-[var(--accent)] transition">How It Works</a>
            <a href="#contact" className="hover:text-[var(--accent)] transition">Contact</a>
          </nav>
          <button onClick={handleUploadClick} className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-6 py-3 rounded-md text-sm font-bold uppercase tracking-wider">
            Get Started
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className={`${isLightHero ? "bg-white" : "bg-slate-900"} py-24 relative z-10`}>
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            {theme === "alt1" && <img src="/logo.jpeg" alt="Accucert" className="h-12 mb-8 block" />}
            
            <span className="inline-block bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-6">
              Trusted by 10,000+ Clients Worldwide
            </span>
            <h1 className={`text-5xl font-extrabold mb-6 leading-tight ${isLightHero ? "text-slate-900" : "text-white"}`}>
              Official Document <br />
              <span className="text-[var(--accent)]">Translation</span> You Can Trust
            </h1>
            
            <div className="mb-6 max-w-sm">
              <label className={`block text-xs font-bold uppercase mb-2 ${isLightHero ? 'text-slate-400' : 'text-slate-500'}`}>Enter Email for Delivery</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[var(--accent)] outline-none text-slate-900 font-medium"
              />
            </div>

            <button onClick={handleUploadClick} className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-10 py-5 rounded-xl font-bold text-lg shadow-2xl shadow-[var(--accent)]/30">
              Upload Document
            </button>
          </div>

          <div className="bg-slate-100 rounded-[3rem] p-8 text-slate-800 shadow-inner">
            <div className="bg-white rounded-[2rem] p-16 text-center flex flex-col items-center shadow-sm">
              <div className="w-20 h-20 bg-[var(--accent)]/10 rounded-3xl flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="font-bold text-xl mb-2">Professional Certified Review</p>
              <p className="text-sm text-slate-400">Our expert team verifies every detail for 100% accuracy.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES SECTION */}
      <section id="services" className="bg-white py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="w-20 h-1 bg-[var(--accent)] mx-auto mb-6 rounded-full" />
          <h2 className="text-4xl font-black mb-4">Documents We <span className="text-[var(--accent)]">Translate</span></h2>
          <div className="grid md:grid-cols-3 gap-8 mt-16 text-left">
            {[
              { t: "Visa Documents", d: "Passports, visas, and immigration paperwork.", i: <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /> },
              { t: "Birth Certificates", d: "Birth, death, and adoption records.", i: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> },
              { t: "Court Submissions", d: "Legal transcripts and witness statements.", i: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M12 2v20M2 12h20" /></> },
              { t: "Academic Records", d: "Diplomas, transcripts, and certificates.", i: <><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></> },
              { t: "Marriage Certificates", d: "Marriage and divorce official decrees.", i: <><circle cx="8" cy="8" r="6" /><circle cx="16" cy="16" r="6" /></> },
              { t: "Business Documents", d: "Contracts, patents, and articles of association.", i: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></> }
            ].map((item) => (
              <div key={item.t} className="bg-slate-50 p-10 rounded-3xl border border-slate-100 hover:border-[var(--accent)] hover:shadow-xl transition-all group relative overflow-hidden">
                <div className="mb-6 inline-block p-4 bg-white rounded-2xl shadow-sm text-[var(--accent)] group-hover:bg-[var(--accent)] group-hover:text-white transition-all">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    {item.i}
                  </svg>
                </div>
                <h3 className="font-bold text-lg mb-2">{item.t}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-32 bg-slate-900 text-white relative z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-black mb-20 uppercase tracking-widest">Our Professional <span className="text-[var(--accent)]">Process</span></h2>
          <div className="grid md:grid-cols-3 gap-16 relative">
            <div className="hidden md:block absolute top-10 left-[20%] right-[20%] h-0.5 border-t border-dashed border-slate-700 z-0"></div>
            {[
              { step: "Upload", desc: "Submit your document securely via our encrypted portal." },
              { step: "Professional Review", desc: "Our expert linguists manually verify all extracted data for total precision." },
              { step: "Secure Delivery", desc: "Receive your certified, legally-recognized PDF directly via email." }
            ].map((item, i) => (
              <div key={item.step} className="relative z-10">
                <div className="text-8xl font-black text-white opacity-[0.05] absolute -top-12 left-1/2 -translate-x-1/2 select-none">0{i + 1}</div>
                <div className="w-16 h-16 bg-[var(--accent)] rounded-full flex items-center justify-center font-bold text-xl mx-auto mb-6 shadow-lg shadow-[var(--accent)]/20">
                  {i + 1}
                </div>
                <h3 className="font-bold text-xl mb-4">{item.step}</h3>
                <p className="text-slate-400 text-sm leading-relaxed max-w-[250px] mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-800 relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-4 gap-12 text-sm text-center md:text-left">
          <div className="col-span-2">
            <img src="/logo.jpeg" className="h-10 mb-6 mx-auto md:mx-0" />
            <p className="max-w-xs mx-auto md:mx-0 leading-relaxed opacity-60 italic font-medium">
              Official certified translations for worldwide use. High-accuracy legal processing.
            </p>
          </div>
          <div className="space-y-4">
             <h4 className="text-white font-bold uppercase tracking-widest text-xs">Navigation</h4>
             <a href="#services" className="block hover:text-white transition">Services</a>
             <a href="#how-it-works" className="block hover:text-white transition">How it Works</a>
          </div>
          <div className="space-y-4">
             <h4 className="text-white font-bold uppercase tracking-widest text-xs">Support</h4>
             <p className="block">support@accucert.com</p>
             <p className="block">Available 24/7</p>
          </div>
        </div>
        <div className="text-center text-[10px] uppercase tracking-[0.2em] text-slate-600 py-10 border-t border-slate-800/50">
          © 2026 Accucert. All rights reserved.
        </div>
      </footer>
    </main>
  );
}