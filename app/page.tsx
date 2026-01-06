"use client";

import Link from "next/link";
import { useState, useRef } from "react";

export default function Home() {
  const [theme, setTheme] = useState("default");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const isLightHero = theme === "default" || theme === "alt2";

  const handleUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file, file.name);

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
        const blob = new Blob([xhr.response], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `certified-${file.name}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setIsUploading(false);
      } else {
        alert("Upload failed. Please try again.");
        setIsUploading(false);
      }
    };

    xhr.onerror = () => {
      alert("An error occurred during the upload.");
      setIsUploading(false);
    };

    xhr.responseType = "blob";
    xhr.send(formData);
  };

  return (
    <main data-theme={theme} className="min-h-screen bg-slate-50 text-slate-800">
      
      {/* HIDDEN INPUT */}
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
      <header className="bg-slate-900 border-b border-slate-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src="/logo.jpeg" alt="Accucert" className="h-8 w-auto" />
          <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-200">
            <a href="#services" className="hover:text-[var(--accent)] transition">Services</a>
            <a href="#how-it-works" className="hover:text-[var(--accent)] transition">How It Works</a>
            <a href="#contact" className="hover:text-[var(--accent)] transition">Contact</a>
          </nav>
          <button onClick={handleUploadClick} className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-5 py-2 rounded-md text-sm font-semibold">
            Get Started
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className={`${isLightHero ? "bg-white" : "bg-slate-900"} py-24 border-b border-slate-100`}>
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-block bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-6">
              Trusted by 10,000+ Clients Worldwide
            </span>
            <h1 className={`text-5xl font-extrabold mb-6 leading-tight ${isLightHero ? "text-slate-900" : "text-white"}`}>
              Official Document <br />
              <span className="text-[var(--accent)]">Translation</span> You Can Trust
            </h1>
            <p className={`mb-8 text-lg max-w-xl ${isLightHero ? "text-slate-600" : "text-slate-300"}`}>
              Certified translations for visas, birth certificates, and official documents. Accurate, secure, and legally recognised.
            </p>
            <button onClick={handleUploadClick} className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-8 py-4 rounded-md font-bold text-lg shadow-xl shadow-[var(--accent)]/20">
              Upload Document
            </button>
          </div>

          <div className="bg-slate-100 rounded-3xl p-6 text-slate-800">
            <div className="bg-[var(--accent)]/10 rounded-2xl p-16 text-center flex flex-col items-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                <svg className="w-8 h-8 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <section id="services" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="w-20 h-1 bg-[var(--accent)] mx-auto mb-6 rounded-full" />
          <h2 className="text-4xl font-bold mb-4">
            Documents We <span className="text-[var(--primary)]">Translate</span>
          </h2>
          <p className="text-slate-600 max-w-2xl mx-auto mb-16">
            Specialising in official and legal documents accepted worldwide.
          </p>
          {/* THE GRID: Restored to 3 Columns */}
          <div className="grid md:grid-cols-3 gap-8 text-left">
            {[
              "Visa Documents", "Birth Certificates", "Court Submissions",
              "Academic Records", "Marriage Certificates", "Business Documents"
            ].map((title) => (
              <div key={title} className="bg-gradient-to-br from-[var(--accent)]/10 to-white rounded-xl p-8 border border-slate-200">
                <h3 className="font-bold mb-2">{title}</h3>
                <p className="text-sm text-slate-600">Certified translation services.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section id="how-it-works" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-16">
            How It <span className="text-[var(--primary)]">Works</span>
          </h2>
          {/* THE GRID: Restored to 3 Columns */}
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: "Upload", desc: "Select your files safely." },
              { step: "Review", desc: "Automated OCR extraction." },
              { step: "Download", desc: "Get your certified PDF." }
            ].map((item, i) => (
              <div key={item.step}>
                <div className="text-6xl font-black text-[var(--accent)] opacity-20 mb-4">
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
      <section className="bg-white py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="rounded-3xl border border-slate-200 p-16 bg-slate-50">
            <h2 className="text-4xl font-bold mb-4">Ready to Get Started?</h2>
            <p className="mb-8 text-slate-600">Upload your document now and receive a certified copy in seconds.</p>
            <button onClick={handleUploadClick} className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-10 py-4 rounded-md font-bold">
              Upload Your Document
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-8 text-sm">
          <div className="col-span-2">
            <img src="/logo.jpeg" className="h-7 mb-4" />
            <p className="max-w-sm">Certified translations for official documents worldwide using secure AI technology.</p>
          </div>
        </div>
        <div className="text-center text-xs text-slate-500 py-8 border-t border-slate-800">
          © 2024 Accucert. All rights reserved.
        </div>
      </footer>
    </main>
  );
}