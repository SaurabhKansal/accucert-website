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
      
      {/* THEME C WATERMARK */}
      {theme === "alt2" && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden flex flex-wrap justify-center items-center opacity-[0.03]">
          {Array.from({ length: 20 }).map((_, i) => (
            <span key={i} className="text-9xl font-black -rotate-12 uppercase m-20 select-none tracking-tighter">Accucert</span>
          ))}
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
            <div className="w-16 h-16 border-4 border-slate-100 border-t-[#18222b] rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Processing...</h3>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
              <div 
                className="bg-[#18222b] h-2 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-[#18222b]">{uploadProgress}% Complete</span>
          </div>
        </div>
      )}

      {/* THEME SWITCHER */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => setTheme("default")} className="px-3 py-1 bg-slate-900 text-white text-[10px] rounded">A</button>
        <button onClick={() => setTheme("alt1")} className="px-3 py-1 bg-slate-900 text-white text-[10px] rounded">B</button>
        <button onClick={() => setTheme("alt2")} className="px-3 py-1 bg-slate-900 text-white text-[10px] rounded">C</button>
      </div>

      {/* HEADER: Updated for Theme A requested breadth */}
      <header className={`bg-slate-900 border-b border-slate-700 sticky top-0 z-40 transition-all ${theme === 'default' ? 'py-10' : 'py-4'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          {theme !== "alt1" ? (
            <img src="/logo.jpeg" alt="Accucert" className={`w-auto transition-all ${theme === 'default' ? 'h-20' : 'h-8'}`} />
          ) : <div className="w-8" />}
          
          <nav className={`hidden md:flex gap-8 font-medium text-slate-200 ${theme === 'default' ? 'text-lg gap-12' : 'text-sm'}`}>
            <a href="#services" className="hover:text-[#18222b] transition">Services</a>
            <a href="#how-it-works" className="hover:text-[#18222b] transition">How It Works</a>
            <a href="#contact" className="hover:text-[#18222b] transition">Contact</a>
          </nav>
          <button onClick={handleUploadClick} className="bg-[#18222b] hover:opacity-80 transition text-white px-5 py-2 rounded-md text-sm font-semibold">
            Get Started
          </button>
        </div>
      </header>

      {/* HERO SECTION: Updated for Theme B logo placement */}
      <section className={`${isLightHero ? "bg-white" : "bg-slate-900"} py-24 border-b border-slate-100 relative z-10`}>
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            {theme === "alt1" && <img src="/logo.jpeg" alt="Accucert" className="h-12 mb-6" />}
            <span className="inline-block bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-6">
              Trusted by 10,000+ Clients Worldwide
            </span>
            <h1 className={`text-5xl font-extrabold mb-6 leading-tight ${isLightHero ? "text-slate-900" : "text-white"}`}>
              Official Document <br />
              <span className="text-[#18222b]">Translation</span> You Can Trust
            </h1>

            {/* EMAIL INPUT BOX */}
            <div className="mb-6 max-w-sm">
              <label className={`block text-xs font-bold uppercase mb-2 ${isLightHero ? 'text-slate-400' : 'text-slate-500'}`}>Enter Email for Delivery</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#18222b] outline-none text-slate-900"
              />
            </div>

            <button onClick={handleUploadClick} className="bg-[#18222b] hover:opacity-90 transition text-white px-8 py-4 rounded-md font-bold text-lg shadow-xl shadow-[#18222b]/20">
              Upload Document
            </button>
          </div>

          <div className="bg-slate-100 rounded-3xl p-6 text-slate-800">
            <div className="bg-[#18222b]/10 rounded-2xl p-16 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                <svg className="w-8 h-8 text-[#18222b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="font-bold">Professional Certified Translations</p>
              <p className="text-xs text-slate-500 mt-2">Upload any document to begin</p>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES SECTION */}
      <section id="services" className="bg-white py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="w-20 h-1 bg-[#18222b] mx-auto mb-6 rounded-full" />
          <h2 className="text-4xl font-bold mb-4">
            Documents We <span className="text-[#18222b]">Translate</span>
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto mb-16">
            Specialising in official and legal documents accepted worldwide.
          </p>
          <div className="grid md:grid-cols-3 gap-8 text-left">
            {[
              { t: "Visa Documents", i: <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /> }, 
              { t: "Birth Certificates", i: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> }, 
              { t: "Court Submissions", i: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="18" r="3" /><path d="M12 2v20M2 12h20" /></> },
              { t: "Academic Records", i: <><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></> }, 
              { t: "Marriage Certificates", i: <><circle cx="8" cy="8" r="6" /><circle cx="16" cy="16" r="6" /></> }, 
              { t: "Business Documents", i: <><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></> }
            ].map((item) => (
              <div key={item.t} className="bg-gradient-to-br from-[#18222b]/10 to-white rounded-xl p-8 border border-slate-200 text-left hover:border-[#18222b] transition-all group">
                <div className="w-10 h-10 mb-4 text-[#18222b]">
                   <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">{item.i}</svg>
                </div>
                <h3 className="font-bold mb-2">{item.t}</h3>
                <p className="text-sm text-slate-600">Certified translation services.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-24 bg-slate-50 relative z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-16">
            How It <span className="text-[#18222b]">Works</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: "Upload", desc: "Select your files safely." },
              { step: "Professional Review", desc: "Manual verification of all details." },
              { step: "Secure Delivery", desc: "Certified PDF via email." }
            ].map((item, i) => (
              <div key={item.step}>
                <div className="text-6xl font-black text-[#18222b] opacity-20 mb-4">
                  0{i + 1}
                </div>
                <h3 className="font-bold text-xl mb-2">{item.step}</h3>
                <p className="text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="bg-white py-24 relative z-10">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="rounded-3xl border border-slate-200 p-16 bg-slate-50">
            <h2 className="text-4xl font-bold mb-4 text-slate-900">Ready to Get Started?</h2>
            <p className="mb-8 text-slate-600">Upload your document now and receive a certified copy in seconds.</p>
            <button onClick={handleUploadClick} className="bg-[#18222b] hover:opacity-80 transition text-white px-10 py-4 rounded-md font-bold">
              Upload Your Document
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-700 relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2">
            <img src="/logo.jpeg" className="h-7 mb-4" />
            <p className="max-w-sm">Certified translations for official documents worldwide using secure technology.</p>
          </div>
        </div>
        <div className="text-center text-xs text-slate-500 py-8 border-t border-slate-800">
          © 2026 Accucert. All rights reserved.
        </div>
      </footer>
    </main>
  );
}