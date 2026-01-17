"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import 'react-quill-new/dist/quill.snow.css';

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

  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['table'], 
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

  /**
   * Refined Visual Preview logic
   * Fixed: Added word-wrap and pre-wrap to match real document behavior.
   */
  const getPreviewHtml = (content: string) => {
    return `
      <html>
        <head>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap');
            body { 
              font-family: 'Noto Sans', sans-serif; 
              margin: 0; 
              padding: 20px; 
              background: #f1f5f9; 
              display: flex; 
              justify-content: center; 
            }
            .document-sheet { 
              background: white; 
              width: 210mm; 
              min-height: 297mm; 
              padding: 25mm; 
              box-shadow: 0 10px 40px rgba(0,0,0,0.1); 
              border: 1px solid #e2e8f0; 
              box-sizing: border-box; 
              color: #1e293b;
              word-wrap: break-word;
              overflow-wrap: break-word;
            }
            .content-area { 
              font-size: 12pt; 
              line-height: 1.6; 
              white-space: pre-wrap; 
            }
            strong, b { font-weight: bold; }
            p { margin-bottom: 1em; }
            table { width: 100%; border-collapse: collapse; margin: 15px 0; border: 1.5pt solid black; }
            th, td { border: 1pt solid black; padding: 10px; text-align: left; vertical-align: top; }
            h1, h2, h3 { text-align: center; text-transform: uppercase; }
          </style>
        </head>
        <body>
          <div class="document-sheet"><div class="content-area">${content}</div></div>
        </body>
      </html>
    `;
  };

  const openReview = (req: any) => {
    setSelectedReq(req);
    setShowLivePreview(false); 
    setEditText(req.extracted_text || "");
  };

  /**
   * AUTOMATED DISPATCH WORKFLOW
   * 1. Syncs current editor text to Database.
   * 2. Calls /api/approve to generate the official PDF and Email it.
   */
  async function handleFinalApprove() {
    if (!selectedReq) return;
    
    if (selectedReq.payment_status !== 'paid') {
        alert("⚠️ UNPAID: Payment required before dispatch.");
        return;
    }
    
    if(!confirm("Finalize, Generate PDF, and Email to Client?")) return;
    
    setIsProcessing(true);
    try {
      // Step 1: Sync editor text to DB
      const { error: dbError } = await supabase
        .from("translations")
        .update({ extracted_text: editText })
        .eq("id", selectedReq.id);
        
      if (dbError) throw new Error("Database Save Failed: " + dbError.message);

      // Step 2: Call API to generate PDF and Email
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedReq.id }),
      });

      const result = await res.json();

      if (res.ok) {
        alert("✅ Success: PDF Generated and Emailed!");
        setSelectedReq(null);
        fetchRequests();
      } else {
        alert("❌ Dispatch Failed: " + (result.error || "Unknown Error"));
      }
    } catch (err: any) {
      console.error("Critical Error:", err);
      alert("⚠️ Error: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  if (loading) return <div className="p-20 text-center font-bold">LOADING_BACKOFFICE...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-black italic tracking-tighter uppercase">ACCUCERT_ADMIN</h1>
          
          <div className="flex gap-3 w-full md:w-auto">
            <input 
              type="text" placeholder="Search orders..." 
              className="p-3 border rounded-xl text-sm w-full md:w-64 bg-white outline-none focus:ring-2 ring-black"
              onChange={(e) => setSearch(e.target.value)}
            />
            <select 
              className="p-3 border rounded-xl text-sm bg-white" 
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Orders</option>
              <option value="pending">Pending</option>
              <option value="approved">Completed</option>
            </select>
          </div>
        </header>

        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
              <tr>
                <th className="p-6">Client</th>
                <th className="p-6">Status</th>
                <th className="p-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition">
                  <td className="p-6">
                    <div className="font-bold">{req.full_name}</div>
                    <div className="text-[10px] text-slate-400">{req.user_email}</div>
                  </td>
                  <td className="p-6">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black ${req.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-500'}`}>
                        {req.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                    </span>
                  </td>
                  <td className="p-6 text-right">
                    <button onClick={() => openReview(req)} className="bg-black text-white px-6 py-2 rounded-xl text-[10px] font-black tracking-widest hover:bg-slate-800 transition">
                      REVIEW
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[98vw] h-[95vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden">
            <div className="px-8 py-6 border-b flex justify-between items-center">
              <h2 className="text-xl font-black uppercase italic tracking-tighter">MIRROR_REVIEW: {selectedReq.filename}</h2>
              <button onClick={() => setSelectedReq(null)} className="text-xl">✕</button>
            </div>

            <div className="flex-1 overflow-hidden grid md:grid-cols-2">
              <div className="bg-slate-900 p-8 overflow-auto flex flex-col items-center">
                <img src={selectedReq.image_url} alt="Source" className="max-w-full shadow-2xl border-[12px] border-white/5" />
              </div>

              <div className="p-8 flex flex-col bg-white overflow-hidden">
                <div className="flex gap-2 mb-4">
                    <button onClick={() => setShowLivePreview(false)} className={`px-4 py-2 rounded-lg text-[10px] font-black ${!showLivePreview ? 'bg-black text-white' : 'bg-slate-100 text-slate-400'}`}>EDITOR</button>
                    <button onClick={() => setShowLivePreview(true)} className={`px-4 py-2 rounded-lg text-[10px] font-black ${showLivePreview ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-slate-100 text-slate-400'}`}>VISUAL PREVIEW</button>
                </div>

                <div className="flex-1 overflow-hidden border-2 border-slate-50 rounded-[2.5rem] bg-slate-50 shadow-inner relative">
                  {showLivePreview ? (
                    <iframe srcDoc={getPreviewHtml(editText)} className="w-full h-full border-none rounded-[2.5rem]" />
                  ) : (
                    <ReactQuill theme="snow" value={editText} onChange={setEditText} modules={modules} className="h-full" />
                  )}
                </div>
              </div>
            </div>

            <div className="p-8 border-t bg-slate-50 flex justify-end gap-4">
                <button onClick={() => setSelectedReq(null)} className="font-black text-[11px] text-slate-400 px-4">CANCEL</button>
                <button 
                  onClick={handleFinalApprove} 
                  disabled={isProcessing || selectedReq.payment_status !== 'paid'} 
                  className="bg-black text-white px-12 py-4 rounded-2xl font-black text-[11px] hover:shadow-2xl transition disabled:opacity-20"
                >
                  {isProcessing ? "DISPATCHING..." : "CERTIFY & DISPATCH"}
                </button>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .ql-container { border: none !important; font-family: inherit; height: calc(100% - 42px); }
        .ql-toolbar { border: none !important; border-bottom: 1px solid #f1f5f9 !important; padding: 12px !important; }
      `}</style>
    </div>
  );
}