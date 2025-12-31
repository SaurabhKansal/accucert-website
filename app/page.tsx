"use client";

import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [theme, setTheme] = useState("default");

  return (
    <main data-theme={theme} className="bg-slate-50 text-slate-800 min-h-screen">

      {/* TEMP THEME SWITCHER */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button onClick={() => setTheme("default")} className="px-3 py-1 bg-slate-900 text-white text-xs rounded">Theme A</button>
        <button onClick={() => setTheme("alt1")} className="px-3 py-1 bg-slate-900 text-white text-xs rounded">Theme B</button>
        <button onClick={() => setTheme("alt2")} className="px-3 py-1 bg-slate-900 text-white text-xs rounded">Theme C</button>
      </div>

      {/* HEADER */}
      <header className="bg-slate-900 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src="/logo.jpeg" alt="Accucert" className="h-8 w-auto" />

          <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-200">
            <a href="#services" className="hover:text-[var(--accent)] transition">Services</a>
            <a href="#how-it-works" className="hover:text-[var(--accent)] transition">How It Works</a>
            <a href="#contact" className="hover:text-[var(--accent)] transition">Contact</a>
          </nav>

          <Link
            href="/upload"
            className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-5 py-2 rounded-md text-sm"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-100">
        <div className="max-w-7xl mx-auto px-6 py-28 grid md:grid-cols-2 gap-16 items-center">

          <div>
            {/* ✅ ALWAYS VISIBLE BADGE */}
            <span className="inline-block bg-[var(--accent)]/15 text-[var(--accent)] text-xs font-medium px-3 py-1 rounded-full mb-6">
              Trusted by 10,000+ Clients Worldwide
            </span>

            <h1 className="text-5xl font-bold mb-6 text-white">
              Official Document <span className="text-[var(--accent)]">Translation</span><br />
              You Can Trust
            </h1>

            <p className="text-slate-300 mb-8 max-w-xl">
              Certified translations for visas, court submissions, birth certificates,
              and official documents. Accurate, secure, and legally recognised.
            </p>

            <div className="flex gap-4 mb-6">
              <Link
                href="/upload"
                className="bg-[var(--accent)] hover:bg-[var(--cta-hover)] transition text-white px-6 py-3 rounded-md"
              >
                Upload Document
              </Link>
              <Link
                href="/pricing"
                className="border border-slate-500 text-slate-200 px-6 py-3 rounded-md hover:border-[var(--cta-hover)] hover:text-[var(--cta-hover)] transition"
              >
                View Pricing
              </Link>
            </div>

            <div className="text-sm text-slate-400">⭐⭐⭐⭐⭐ 4.9/5 from 2,300+ reviews</div>
          </div>

          <div className="bg-slate-100 rounded-2xl shadow-lg p-6 text-slate-800">
            <div className="bg-[var(--accent)]/10 rounded-xl p-16 flex flex-col items-center text-center">
              <svg className="w-16 h-16 text-[var(--primary)] mb-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M7 2h8l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
              </svg>
              <p className="font-semibold">Professional Certified Translations</p>
            </div>
          </div>
        </div>
      </section>

      {/* DOCUMENT TYPES */}
      <section id="services" className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <div className="w-20 h-1 bg-[var(--accent)] mx-auto mb-6 rounded-full" />

          <h2 className="text-4xl font-bold mb-4">
            Documents We <span className="text-[var(--primary)]">Translate</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-8 text-left mt-16">
            {[
              "Visa Documents",
              "Birth Certificates",
              "Court Submissions",
              "Academic Records",
              "Marriage Certificates",
              "Business Documents",
            ].map(title => (
              <div
                key={title}
                className="bg-gradient-to-br from-[var(--accent)]/25 via-[var(--accent)]/10 to-white rounded-xl p-6 border border-slate-200 hover:border-[var(--cta-hover)] transition"
              >
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-slate-600">Certified translation services.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl font-bold mb-12">
            How It <span className="text-[var(--primary)]">Works</span>
          </h2>

          <div className="grid md:grid-cols-3 gap-12">
            {["Upload", "Review", "Download"].map((step, i) => (
              <div key={step}>
                <div className="text-6xl font-bold bg-gradient-to-b from-[var(--primary)] to-[var(--accent)] bg-clip-text text-transparent mb-4">
                  {`0${i + 1}`}
                </div>
                <h3 className="font-semibold mb-2">{step}</h3>
                <p className="text-slate-600">Simple and secure.</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[var(--accent)] py-24">
        <div className="max-w-3xl mx-auto px-6 text-center text-white">
          <h2 className="text-4xl font-bold mb-4">Ready to Get Started?</h2>
          <Link
            href="/upload"
            className="inline-block bg-[var(--primary)] hover:bg-[var(--cta-hover)] transition px-8 py-3 rounded-md font-medium"
          >
            Upload Your Document
          </Link>
        </div>
      </section>

      {/* ✅ RESTORED FULL FOOTER */}
      <footer className="bg-slate-900 text-slate-300 border-t border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8 text-sm">
          <div>
            <img src="/logo.jpeg" className="h-7 mb-3" />
            <p>Certified translations for official documents worldwide.</p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-2">Services</h4>
            <ul className="space-y-1">
              <li>Visa Documents</li>
              <li>Birth Certificates</li>
              <li>Court Submissions</li>
              <li>Academic Records</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-2">Company</h4>
            <ul className="space-y-1">
              <li>About</li>
              <li>Pricing</li>
              <li>Contact</li>
              <li>FAQ</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-2">Legal</h4>
            <ul className="space-y-1">
              <li>Privacy Policy</li>
              <li>Terms of Service</li>
              <li>Certification</li>
            </ul>
          </div>
        </div>

        <div className="text-center text-xs text-slate-400 pb-6">
          © 2024 Accucert. All rights reserved.
        </div>
      </footer>

    </main>
  );
}
