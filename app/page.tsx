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
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-100">
            <div className="w-16 h-16 border-4 border-slate-100 border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Processing Document</h3>
            <p className="text-slate-500 mb-6 text-sm">Please wait while we certify your translation.</p>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2">
              <div 
                className="bg-[var(--accent)] h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-sm font-bold text-[var(--accent)]">{uploadProgress}% Complete</span>
          </div>
        </div>
      )}

      {/* THEME SWITCHER */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => setTheme("default")} className="px-3 py-1 bg-slate-900 text-white text-xs rounded opacity-50 hover:opacity-100 transition">A</button>
        <button onClick={() => setTheme("alt1")} className="px-3 py-1 bg-slate-900 text-white text-xs rounded opacity-50 hover:opacity-100 transition">B</button>
        <button onClick={() => setTheme("alt2")} className="px-3 py-1 bg-slate-900 text-white text-xs rounded opacity-50 hover:opacity-100 transition">C</button>
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
          <button
            onClick={handleUploadClick}
            className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-5 py-2 rounded-md text-sm font-semibold"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className={`${isLightHero ? "bg-white" : "bg-slate-900"} py-24 md:py-32 border-b border-slate-100`}>
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <span className="inline-block bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-6">
              Trusted by 10,000+ Clients Worldwide
            </span>
            <h1 className={`text-5xl md:text-6xl font-extrabold mb-6 leading-tight ${isLightHero ? "text-slate-900" : "text-white"}`}>
              Official Document <br />
              <span className="text-[var(--accent)]">Translation</span> You Can Trust
            </h1>
            <p className={`mb-8 text-lg max-w-xl ${isLightHero ? "text-slate-600" : "text-slate-300"}`}>
              Certified translations for visas, birth certificates, and official documents. Accurate, secure, and legally recognised.
            </p>
            <button
              onClick={handleUploadClick}
              className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-8 py-4 rounded-md font-bold text-lg shadow-xl shadow-[var(--accent)]/20"
            >
              Upload Document
            </button>
          </div>

          <div className="bg-slate-100 rounded-3xl shadow-inner p-8 text-slate-800">
            <div className="bg-white/50 backdrop-blur rounded-2xl p-16 text-center flex flex-col items-center border border-white">
              <div className="w-20 h-20 bg-[var(--accent)]/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                <svg className="w-10 h-10 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="font-bold text-xl mb-1">Certified Document Processing</p>
              <p className="text-sm text-slate-500">Drop your files or click to begin</p>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES / DOCUMENT TYPES */}
      <section id="services" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="w-16 h-1.5 bg-[var(--accent)] mx-auto mb-6 rounded-full" />
            <h2 className="text-4xl font-bold mb-4 text-slate-900">
              Documents We <span className="text-[var(--accent)]">Translate</span>
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Specialising in official and legal documents accepted by government agencies worldwide.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              "Visa Documents",
              "Birth Certificates",
              "Court Submissions",
              "Academic Records",
              "Marriage Certificates",
              "Business Documents",
            ].map((title) => (
              <div key={title} className="bg-slate-50 hover:bg-white transition-colors duration-300 rounded-2xl p-8 border border-slate-200 hover:border-[var(--accent)] group">
                <h3 className="font-bold text-lg mb-2 group-hover:text-[var(--accent)] transition-colors">{title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Fast-track certified translation for official use.
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-16">Simple 3-Step <span className="text-[var(--accent)]">Process</span></h2>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: "Upload", desc: "Select your files safely." },
              { step: "Review", desc: "Automated OCR extraction." },
              { step: "Download", desc: "Get your certified PDF." }
            ].map((item, i) => (
              <div key={item.step} className="relative">
                <div className="text-7xl font-black text-white/5 absolute -top-8 left-1/2 -translate-x-1/2 select-none">0{i + 1}</div>
                <h3 className="font-bold text-xl mb-3 relative z-10">{item.step}</h3>
                <p className="text-slate-400 relative z-10">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="bg-white py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-3xl border border-slate-200 p-12 md:p-20 bg-slate-50 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--accent)]/5 rounded-full -mr-16 -mt-16" />
            <h2 className="text-4xl font-bold mb-6 text-slate-900">Ready to Get Started?</h2>
            <p className="mb-10 text-slate-600 text-lg max-w-xl mx-auto">
              Join thousands of clients getting accurate, certified translations in seconds.
            </p>
            <button
              onClick={handleUploadClick}
              className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-10 py-4 rounded-md font-bold text-lg"
            >
              Upload Your Document Now
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-12 text-sm">
          <div className="col-span-2">
            <img src="/logo.jpeg" className="h-8 mb-6" alt="Accucert Logo" />
            <p className="max-w-sm leading-relaxed">Providing high-accuracy, legally recognized document translation services using advanced OCR technology.</p>
          </div>
          <div>
            <h4 className="font-bold text-white mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-white">Home</a></li>
              <li><a href="#services" className="hover:text-white">Services</a></li>
              <li><a href="#how-it-works" className="hover:text-white">How It Works</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-white mb-4">Legal</h4>
            <ul className="space-y-2">
              <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="text-center text-xs text-slate-500 py-8 border-t border-slate-800">
          © 2024 Accucert. All rights reserved.
        </div>
      </footer>
    </main>
  );
}