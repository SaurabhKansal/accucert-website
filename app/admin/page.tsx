"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import 'react-quill-new/dist/quill.snow.css';

// Dynamically import Quill to prevent SSR issues in Next.js
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [editText, setEditText] = useState("");
  const [showLivePreview, setShowLivePreview] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Quill Toolbar Configuration
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['clean']
    ],
  }), []);

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    const { data } = await supabase.from("translations").select("*").order("created_at", { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }

  const filteredRequests = requests.filter(req => {
    const matchesSearch = (req.full_name?.toLowerCase() || "").includes(search.toLowerCase()) || 
                          (req.user_email?.toLowerCase() || "").includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Replicates the "Gold Border" design shell for the Admin Preview
  const getPreviewHtml = (content: string) => {
    return `
      <html>
        <head>
          <style>
            body { font-family: 'Times New Roman', serif; margin: 0; padding: 20px; background: #e2e8f0; display: flex; justify-content: center; }
            .cert-body { 
              background: #fdfaf5; width: 210mm; height: 297mm; padding: 30px; 
              box-shadow: 0 10px 40px rgba(0,0,0,0.2); box-sizing: border-box;
              display: flex; justify-content: center; align-items: center;
            }
            .gold-border {
              width: 100%; height: 100%; border: 12px double #8b6b32; outline: 2px solid #8b6b32; outline-offset: -20px;
              padding: 40px; box-sizing: border-box; text-align: center; color: #4a3721; position: relative;
            }
            .content-area { margin-top: 20px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
            .header-text { font-size: 24px; font-weight: bold; text-transform: uppercase; color: #8b6b32; }
          </style>
        </head>
        <body>
          <div class="cert-body">
            <div class="gold-border">
              <div style="font-size: 16px; letter-spacing: 2px;">ACCUCERT GLOBAL</div>
              <div class="header-text">${(selectedReq?.document_type || 'Translation').toUpperCase()}</div>
              <hr style="border: 0.5px solid #d4c4a8; margin: 20px 0;"/>
              <div class="content-area">${content.replace(/<[^>]*>/g, ' ')}</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const openReview = (req: any) => {
    setSelectedReq(req);
    setShowLivePreview(false); 
    setEditText(req.extracted_text || "");
  };

  async function handleFinalApprove() {
    if (!selectedReq) return;
    if (selectedReq.payment_status !== 'paid') {
        alert("⚠️ UNPAID: Please verify payment before certifying.");
        return;
    }
    
    setIsProcessing(true);
    try {
      // 1. Save the Human-Edited text back to Supabase
      const { error: dbError } = await supabase
        .from("translations")
        .update({ extracted_text: editText })
        .eq("id", selectedReq.id);
        
      if (dbError) throw new Error("Save Failed: " + dbError.message);

      // 2. Trigger the PDF Generation & Email API
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedReq.id }),
      });

      if (res.ok) {
        alert("✅ SUCCESS: Translation Certified & PDF Emailed!");
        setSelectedReq(null);
        fetchRequests();
      } else {
        const result = await res.json();
        alert("❌ DISPATCH ERROR: " + (result.error || "Check Vercel Logs"));
      }
    } catch (err: any) {
      alert("⚠️ CRITICAL ERROR: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  if (loading) return <div className="p-20 text-center font-bold animate-pulse">LOADING_ACCUCERT_SECURE_VAULT...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-8 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter italic uppercase text-slate-900">Vault_Control</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Accucert Global Management System</p>
          </div>
          
          <div className="flex gap-4 w-full md:w-auto">
            <input 
              type="text" placeholder="Search by name or email..." 
              className="p-4 border-none shadow-sm rounded-2xl text-xs w-full md:w-80 bg-white focus:ring-2 ring-blue-500 transition-all outline-none"
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="p-4 border-none shadow-sm rounded-2xl text-xs bg-white font-bold" onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Status: All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </header>

        <div className="bg-white rounded-[3rem] shadow-xl shadow-slate-200/50 border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b tracking-widest">
              <tr>
                <th className="p-8">Order & Language</th>
                <th className="p-8">Type</th>
                <th className="p-8">Service Status</th>
                <th className="p-8 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition group">
                  <td className="p-8">
                    <div className="font-black text-sm">{req.full_name}</div>
                    <div className="text-[10px] text-blue-600 font-bold uppercase mt-1">
                      {req.language_from} <span className="text-slate-300 mx-1">→</span> {req.language_to}
                    </div>
                  </td>
                  <td className="p-8 text-xs font-bold text-slate-500">{req.document_type}</td>
                  <td className="p-8">
                    <div className="flex gap-2">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black ${req.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {req.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                        </span>
                        {req.status === 'completed' && <span className="bg-blue-100 text-blue-700 text-[9px] font-black px-3 py-1 rounded-full">SENT</span>}
                    </div>
                  </td>
                  <td className="p-8 text-right">
                    <button onClick={() => openReview(req)} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black tracking-widest hover:bg-blue-600 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-slate-200">
                      EDIT & DISPATCH
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/*  */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-[96vw] h-[92vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden border border-white/20">
            
            <div className="px-10 py-6 border-b flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black italic uppercase tracking-tight">Certification_Review</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Order ID: {selectedReq.id}</p>
              </div>
              <button onClick={() => setSelectedReq(null)} className="bg-white w-12 h-12 rounded-full shadow-lg flex items-center justify-center hover:bg-red-500 hover:text-white transition-all transform hover:rotate-90">✕</button>
            </div>

            <div className="flex-1 overflow-hidden grid md:grid-cols-2">
              <div className="bg-slate-900 p-10 overflow-auto flex justify-center items-start">
                <img src={selectedReq.image_url} alt="Source" className="max-w-full shadow-2xl rounded-sm border-8 border-white/10" />
              </div>

              <div className="p-10 flex flex-col bg-white overflow-hidden">
                <div className="flex gap-4 mb-6">
                    <button onClick={() => setShowLivePreview(false)} className={`flex-1 py-4 rounded-2xl text-[11px] font-black transition-all ${!showLivePreview ? 'bg-slate-900 text-white shadow-xl shadow-slate-200' : 'bg-slate-100 text-slate-400'}`}>TEXT_EDITOR</button>
                    <button onClick={() => setShowLivePreview(true)} className={`flex-1 py-4 rounded-2xl text-[11px] font-black transition-all ${showLivePreview ? 'bg-blue-600 text-white shadow-xl shadow-blue-200' : 'bg-slate-100 text-slate-400'}`}>LIVE_DESIGN_PREVIEW</button>
                </div>

                <div className="flex-1 overflow-hidden border border-slate-100 rounded-[3rem] bg-slate-50/50 shadow-inner p-2">
                  {showLivePreview ? (
                    <iframe srcDoc={getPreviewHtml(editText)} className="w-full h-full border-none rounded-[2.5rem]" />
                  ) : (
                    <ReactQuill theme="snow" value={editText} onChange={setEditText} modules={modules} className="h-full rounded-[2.5rem]" />
                  )}
                </div>
              </div>
            </div>

            <div className="p-10 border-t bg-slate-50 flex justify-between items-center">
                <div className="flex gap-10">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Client</p>
                        <p className="text-sm font-bold">{selectedReq.full_name}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment</p>
                        <p className={`text-sm font-bold ${selectedReq.payment_status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>
                          {selectedReq.payment_status?.toUpperCase()}
                        </p>
                    </div>
                </div>
                
                <div className="flex gap-4">
                  <button onClick={() => setSelectedReq(null)} className="font-black text-[11px] text-slate-400 px-6">CANCEL_ORDER</button>
                  <button 
                    onClick={handleFinalApprove} 
                    disabled={isProcessing || selectedReq.payment_status !== 'paid'} 
                    className="bg-slate-900 text-white px-16 py-5 rounded-[2rem] font-black text-xs hover:bg-blue-600 hover:shadow-2xl hover:shadow-blue-200 transition-all disabled:opacity-20 flex items-center gap-3"
                  >
                    {isProcessing ? "GENERATING_SECURE_PDF..." : "CERTIFY & DISPATCH"}
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .ql-container { border: none !important; font-family: 'Times New Roman', serif !important; font-size: 16px; height: calc(100% - 60px); }
        .ql-toolbar { border: none !important; background: white; border-radius: 2rem 2rem 0 0; padding: 15px !important; }
        .ql-editor { padding: 40px !important; line-height: 1.8; }
      `}</style>
    </div>
  );
}