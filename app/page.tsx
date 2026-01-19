"use client";

import { useState, useRef } from "react";

export default function Home() {
  const [theme, setTheme] = useState("default");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // CLIENT DATA CAPTURE
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(""); 
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState(""); 
  const [serviceLevel, setServiceLevel] = useState("standard");
  const [urgency, setUrgency] = useState("normal");

  // NEW CLIENT REQUESTED FIELDS
  const [langFrom, setLangFrom] = useState("");
  const [langTo, setLangTo] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [documentTypeOther, setDocumentTypeOther] = useState("");
  const [needsApostille, setNeedsApostille] = useState(false);
  const [needsPhysical, setNeedsPhysical] = useState(false);
  const [comments, setComments] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLightHero = theme === "default" || theme === "alt2";

  const docTypes = [
    "Birth Certificate", 
    "Marriage Certificate", 
    "Academic Record", 
    "Legal Contract", 
    "Business Document", 
    "Other"
  ];

  const handleUploadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!fullName || !email || !email.includes("@") || !phone) {
      alert("Please enter your Name, Email, and Phone Number first so we can process your order.");
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
    formData.append("fullName", fullName);
    formData.append("email", email); 
    formData.append("phone", phone);
    formData.append("address", address);
    formData.append("serviceLevel", serviceLevel);
    formData.append("urgency", urgency);
    
    // Merge New Fields into API Call
    formData.append("languageFrom", langFrom);
    formData.append("languageTo", langTo);
    formData.append("documentType", documentType === "Other" ? documentTypeOther : documentType);
    formData.append("needsApostille", String(needsApostille));
    formData.append("needsPhysical", String(needsPhysical));
    formData.append("comments", comments);

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
        const response = JSON.parse(xhr.responseText);
        if (response.stripeUrl) {
          window.location.href = response.stripeUrl;
        } else {
          alert("Order created successfully!");
          setIsUploading(false);
        }
      } else {
        alert("Upload failed. Please check your connection or file size.");
        setIsUploading(false);
      }
    };

    xhr.send(formData);
  };

  // TOOLTIP COMPONENT
  const HoverNote = ({ text }: { text: string }) => (
    <span className="group relative ml-1 cursor-help inline-flex items-center justify-center w-4 h-4 bg-slate-200 text-slate-600 rounded-full text-[10px] font-bold">
      ?
      <div className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-900 text-white text-[10px] rounded shadow-xl z-50 normal-case font-normal leading-tight">
        {text}
      </div>
    </span>
  );

  return (
    <main data-theme={theme} className="min-h-screen bg-slate-50 text-slate-800 relative">
      
      {/* THEME C: WATERMARK */}
      {theme === "alt2" && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none opacity-[0.03]">
          <div className="absolute inset-0 grid grid-cols-2 md:grid-cols-4 gap-10 p-10">
            {Array.from({ length: 40 }).map((_, i) => (
              <span key={i} className="text-7xl font-black -rotate-12 uppercase tracking-tighter whitespace-nowrap">Accucert</span>
            ))}
          </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="application/pdf,image/*" className="hidden" />

      {/* LOADING OVERLAY */}
      {isUploading && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 border-4 border-slate-100 border-t-[var(--accent)] rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Processing...</h3>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
              <div className="bg-[var(--accent)] h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
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
            <img src="/logo.jpeg" alt="Accucert" className={`w-auto transition-all ${theme === 'default' ? 'h-20' : 'h-8'}`} />
          ) : <div className="w-8" />}
          
          <nav className={`hidden md:flex gap-8 font-medium text-slate-200 ${theme === 'default' ? 'text-lg gap-12' : 'text-sm'}`}>
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
      <section className={`${isLightHero ? "bg-white" : "bg-slate-900"} py-24 border-b border-slate-100 relative z-10`}>
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div>
            {theme === "alt1" && <img src="/logo.jpeg" alt="Accucert" className="h-10 mb-6" />}
            <span className="inline-block bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-6">
              Trusted by 10,000+ Clients Worldwide
            </span>
            <h1 className={`text-5xl font-extrabold mb-6 leading-tight ${isLightHero ? "text-slate-900" : "text-white"}`}>
              Official Document <br />
              <span className="text-[var(--accent)]">Translation</span> You Can Trust
            </h1>

            {/* EXPANDED ORDER FORM */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3 max-w-md">
              <input 
                type="text" placeholder="Full Name" value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[var(--accent)] text-sm"
              />
              
              <div className="grid grid-cols-2 gap-3">
                <input 
                  type="email" placeholder="Email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="p-3 bg-white border border-slate-200 rounded-lg outline-none text-sm"
                />
                <input 
                  type="tel" placeholder="Phone" value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="p-3 bg-white border border-slate-200 rounded-lg outline-none text-sm"
                />
              </div>

              {/* NEW FIELDS: LANGUAGES */}
              <div className="grid grid-cols-2 gap-3">
                <input 
                  type="text" placeholder="Language From" value={langFrom}
                  onChange={(e) => setLangFrom(e.target.value)}
                  className="p-3 bg-white border border-slate-200 rounded-lg text-sm"
                />
                <input 
                  type="text" placeholder="Language To" value={langTo}
                  onChange={(e) => setLangTo(e.target.value)}
                  className="p-3 bg-white border border-slate-200 rounded-lg text-sm"
                />
              </div>

              {/* NEW FIELDS: DOC TYPE */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center">
                  Document Type <HoverNote text="Select document type. Supports PDF, JPG, PNG. Max 10MB." />
                </label>
                <select 
                  value={documentType} onChange={(e) => setDocumentType(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                >
                  <option value="">Select type...</option>
                  {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {documentType === "Other" && (
                  <input 
                    type="text" placeholder="Specify Type" value={documentTypeOther}
                    onChange={(e) => setDocumentTypeOther(e.target.value)}
                    className="w-full mt-1 p-3 border-2 border-[var(--accent)] rounded-lg text-sm animate-in fade-in"
                  />
                )}
              </div>

              <input 
                type="text" placeholder="Postal Address (Optional)" value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none text-sm"
              />

              {/* TRANSLATION TYPE & TIMELINE */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center">
                  Translation Type & Timeline <HoverNote text="Standard: 3-5 days. Expedited: 24h digital delivery." />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <select 
                    value={serviceLevel} onChange={(e) => setServiceLevel(e.target.value)}
                    className="p-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  >
                    <option value="standard">Standard Translation</option>
                    <option value="certified">Certified Translation</option>
                    <option value="notarized">Notarized Translation</option>
                  </select>
                  <select 
                    value={urgency} onChange={(e) => setUrgency(e.target.value)}
                    className="p-3 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  >
                    <option value="normal">Standard (3-5 Days)</option>
                    <option value="expedited">Expedited (24 Hours)</option>
                  </select>
                </div>
              </div>

              {/* NEW FIELDS: RADIO BUTTONS */}
              <div className="flex justify-between py-1 px-1 border-t border-slate-200 pt-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase flex items-center">
                    Apostille? <HoverNote text="Check this if you require legalisation for international use." />
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold">
                      <input type="radio" checked={needsApostille} onChange={() => setNeedsApostille(true)} /> Yes
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold">
                      <input type="radio" checked={!needsApostille} onChange={() => setNeedsApostille(false)} /> No
                    </label>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">Physical Copy?</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold">
                      <input type="radio" checked={needsPhysical} onChange={() => setNeedsPhysical(true)} /> Yes
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold">
                      <input type="radio" checked={!needsPhysical} onChange={() => setNeedsPhysical(false)} /> No
                    </label>
                  </div>
                </div>
              </div>

              <textarea 
                placeholder="Comments / Special Notes" value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full p-3 bg-white border border-slate-200 rounded-lg text-sm h-16 outline-none"
              />

              <button onClick={handleUploadClick} className="w-full bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white py-4 rounded-lg font-bold shadow-lg shadow-[var(--accent)]/20">
                Upload & Submit Order
              </button>
            </div>
          </div>

          {/* RESTORED: DECORATIVE REVIEW BOX */}
          <div className="bg-slate-100 rounded-3xl p-6 text-slate-800">
            <div className="bg-[var(--accent)]/10 rounded-2xl p-16 text-center flex flex-col items-center shadow-sm">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                <svg className="w-8 h-8 text-[var(--accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="font-bold">Professional Certified Review</p>
              <p className="text-xs text-slate-500 mt-2">Team-verified translations</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: SERVICES - ORIGINAL PATHS RESTORED */}
      <section id="services" className="bg-white py-24 relative z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="w-20 h-1 bg-[var(--accent)] mx-auto mb-6 rounded-full" />
          <h2 className="text-4xl font-bold mb-4">
            Documents We <span className="text-[var(--primary)]">Translate</span>
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
              <div key={item.t} className="bg-gradient-to-br from-[var(--accent)]/10 to-white rounded-xl p-8 border border-slate-200 text-left hover:border-[var(--accent)] transition-all group">
                <div className="w-10 h-10 mb-4 text-[var(--accent)]">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">{item.i}</svg>
                </div>
                <h3 className="font-bold mb-2">{item.t}</h3>
                <p className="text-sm text-slate-600">Certified translation services.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3: HOW IT WORKS */}
      <section id="how-it-works" className="py-24 bg-slate-50 relative z-10">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-16">
            How It <span className="text-[var(--primary)]">Works</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            {[
              { step: "Upload", desc: "Select your files safely." },
              { step: "Review", desc: "Manual verification of all details." },
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

      {/* FOOTER */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-700 relative z-10">
        <div className="max-w-7xl mx-auto px-6 py-16 grid md:grid-cols-4 gap-8 text-sm text-center md:text-left">
          <div className="col-span-2">
            <img src="/logo.jpeg" alt="Accucert Logo" className="h-7 mb-4 mx-auto md:mx-0" />
            <p className="max-w-sm mx-auto md:mx-0">
              Official certified translations for worldwide use using secure technology.
            </p>
          </div>
        </div>
        <div className="text-center text-xs text-slate-500 py-8 border-t border-slate-800">
          © 2026 Accucert. All rights reserved.
        </div>
      </footer>
    </main>
  );
}