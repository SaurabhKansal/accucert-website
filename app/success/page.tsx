"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function SuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-900">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200 text-center border border-slate-100">
        
        {/* SUCCESS ICON */}
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce">
          <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-3xl font-black mb-4">Payment Successful!</h1>
        <p className="text-slate-500 mb-8 leading-relaxed">
          Thank you for choosing <span className="font-bold text-[#18222b]">Accucert</span>. 
          Your document has been securely sent to our professional review team.
        </p>

        {/* ORDER INFO CARD */}
        <div className="bg-slate-50 rounded-2xl p-6 mb-8 text-left border border-slate-100">
          <h3 className="text-xs font-black uppercase text-slate-400 mb-4 tracking-widest">What happens next?</h3>
          <ul className="space-y-4">
            <li className="flex gap-3 text-sm">
              <span className="bg-[#18222b] text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0">1</span>
              <span>Our linguists verify your translation for 100% accuracy.</span>
            </li>
            <li className="flex gap-3 text-sm">
              <span className="bg-[#18222b] text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0">2</span>
              <span>We apply the official certification stamps and seals.</span>
            </li>
            <li className="flex gap-3 text-sm">
              <span className="bg-[#18222b] text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0">3</span>
              <span>The final PDF is delivered directly to your email.</span>
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <Link 
            href="/"
            className="block w-full bg-[#18222b] text-white py-4 rounded-xl font-bold hover:opacity-90 transition shadow-lg shadow-[#18222b]/20"
          >
            Return to Homepage
          </Link>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
            Order ID: {sessionId?.slice(-8) || "Processing..."}
          </p>
        </div>
      </div>
    </main>
  );
}