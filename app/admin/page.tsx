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
  const [isDispatching, setIsDispatching] = useState(false);

  // Real-time progress states
  const [aiStatus, setAiStatus] = useState("idle");
  const [aiPercent, setAiPercent] = useState(0);
  const [aiResultUrl, setAiResultUrl] = useState("");

  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      ['clean']
    ],
  }), []);

  useEffect(() => {
    fetchRequests();
    
    // Subscribe to ALL changes for real-time list updates
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'translations' }, () => {
        fetchRequests();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Subscribe to specific selected request updates
  useEffect(() => {
    if (!selectedReq) return;
    
    const sub = supabase
      .channel(`req-${selectedReq.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'translations', 
        filter: `id=eq.${selectedReq.id}` 
      }, (payload) => {
        // Sync local state with Database updates
        setAiStatus(payload.new.processing_status);
        setAiPercent(payload.new.processing_percentage);
        setAiResultUrl(payload.new.translated_url);
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [selectedReq]);

  async function fetchRequests() {
    const { data } = await supabase.from("translations").select("*").order("created_at", { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }

  const openReview = (req: any) => {
    setSelectedReq(req);
    setEditText(req.extracted_text || "");
    setAiStatus(req.processing_status || "idle");
    setAiPercent(req.processing_percentage || 0);
    setAiResultUrl(req.translated_url || "");
    setShowLivePreview(false);
  };

  /**
   * TRIGGER AI RECONSTRUCTION
   * FIXED: Handles the 'Ghost Error' by checking DB state
   */
  async function handleTriggerAI() {
    if (!selectedReq) return;
    setIsProcessing(true);
    
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedReq.id }),
      });

      // If the response isn't 200, only throw error if the DB hasn't already moved to 'processing'
      if (!res.ok && aiStatus !== 'processing') {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Connection timeout");
      }
      
      console.log("🚀 AI Reconstruction initialized.");
    } catch (err: any) {
      // Only show alert if the background process failed to start entirely
      if (aiStatus !== 'processing') {
        alert("AI_START_ERROR: " + err.message);
      }
    } finally {
      setIsProcessing(false);
    }
  }

  /**
   * DISPATCH FINAL EMAIL
   */
  async function handleDispatchEmail() {
    if (!selectedReq || !aiResultUrl) return;
    setIsDispatching(true);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedReq.id }),
      });
      if (res.ok) {
        alert("🚀 DISPATCHED: Official Translation sent to client email.");
        setSelectedReq(null);
        fetchRequests();
      }
    } catch (err: any) {
      alert("DISPATCH_ERROR: " + err.message);
    } finally {
      setIsDispatching(false);
    }
  }

  const filteredRequests = requests.filter(req => {
    const matchesSearch = (req.full_name?.toLowerCase() || "").includes(search.toLowerCase()) || 
                          (req.user_email?.toLowerCase() || "").includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) return <div className="p-20 text-center font-bold animate-pulse">VAULT_ACCESS_PENDING...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-8 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter italic uppercase">Vault_Control</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Accucert Global Management</p>
          </div>
          
          <div className="flex gap-4">
            <input 
              type="text" placeholder="Search order records..." 
              className="p-4 rounded-2xl text-xs w-80 bg-white shadow-sm outline-none focus:ring-2 ring-blue-500 transition-all"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </header>

        <div className="bg-white rounded-[3rem] shadow-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b tracking-widest">
              <tr>
                <th className="p-8">Order & Language</th>
                <th className="p-8">AI Progress</th>
                <th className="p-8">Email Dispatch</th>
                <th className="p-8 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition group">
                  <td className="p-8">
                    <div className="font-black text-sm">{req.full_name}</div>
                    <div className="text-[9px] text-blue-600 font-bold uppercase mt-1">{req.language_from} → {req.language_to}</div>
                  </td>
                  <td className="p-8">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${req.processing_status === 'ready' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-orange-400 animate-pulse'}`} />
                      <span className="text-[10px] font-black uppercase text-slate-500">
                        {req.processing_status === 'ready' ? 'RECONSTRUCTED' : `${req.processing_percentage || 0}%`}
                      </span>
                    </div>
                  </td>
                  <td className="p-8">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black ${req.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                      {req.status === 'completed' ? 'DELIVERED' : 'PENDING'}
                    </span>
                  </td>
                  <td className="p-8 text-right">
                    <button onClick={() => openReview(req)} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black tracking-widest hover:bg-blue-600 transition-all shadow-lg">
                      OPEN_VAULT
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-[98vw] h-[95vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden border border-white/20">
            
            <div className="px-10 py-6 border-b flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black italic uppercase tracking-tight">Certification_Control_Panel</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Order_Ref: {selectedReq.id}</p>
              </div>
              <button onClick={() => setSelectedReq(null)} className="w-12 h-12 rounded-full border bg-white shadow-sm flex items-center justify-center font-bold hover:bg-red-500 hover:text-white transition-all transform hover:rotate-90">✕</button>
            </div>

            <div className="flex-1 overflow-hidden grid md:grid-cols-2">
              {/* LEFT SIDE: VISUAL COMPARISON */}
              <div className="bg-slate-900 p-8 overflow-auto space-y-10 custom-scrollbar">
                <div className="space-y-3">
                  <p className="text-white text-[9px] font-black uppercase tracking-[0.3em] opacity-30">Source_Input</p>
                  <img src={selectedReq.image_url} className="w-full rounded shadow-2xl border-4 border-white/5" />
                </div>
                
                {aiResultUrl && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.3em]">AI_Reconstruction_Result</p>
                    <img src={aiResultUrl} className="w-full rounded shadow-2xl border-4 border-blue-500/20" />
                  </div>
                )}
              </div>

              {/* RIGHT SIDE: EDITOR & PROGRESS */}
              <div className="p-10 flex flex-col bg-white overflow-hidden">
                <div className="mb-8 p-8 bg-slate-900 rounded-[2.5rem] shadow-2xl">
                   <div className="flex justify-between items-center mb-4">
                      <p className="text-[9px] font-black text-white/40 uppercase tracking-widest">AI_Processing_Engine</p>
                      <span className="text-lg font-black text-white">{aiPercent}%</span>
                   </div>
                   <div className="w-full h-4 bg-white/10 rounded-full overflow-hidden mb-6">
                      <div 
                        className={`h-full transition-all duration-700 ease-out ${aiStatus === 'ready' ? 'bg-green-500' : 'bg-blue-500 animate-pulse'}`} 
                        style={{ width: `${aiPercent}%` }}
                      />
                   </div>
                   {aiStatus === 'idle' || aiStatus === 'failed' ? (
                     <button 
                       onClick={handleTriggerAI}
                       disabled={isProcessing}
                       className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[11px] tracking-widest hover:bg-blue-500 transition-all"
                     >
                       {isProcessing ? "INITIALIZING_SYSTEM..." : "START_AI_RECONSTRUCTION"}
                     </button>
                   ) : (
                     <p className="text-[10px] font-bold text-center text-white/60 tracking-widest animate-pulse">
                       {aiStatus === 'ready' ? 'SYSTEM_STABLE: RECONSTRUCTION_COMPLETE' : 'AI_CURRENTLY_RE_DRAWING_PIXELS...'}
                     </p>
                   )}
                </div>

                <div className="flex-1 overflow-hidden border border-slate-100 rounded-[3rem] bg-slate-50/30 shadow-inner">
                    <ReactQuill theme="snow" value={editText} onChange={setEditText} modules={modules} className="h-full" />
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="p-10 border-t bg-slate-50 flex justify-between items-center">
                <div className="flex gap-12">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Service_Level</p>
                        <p className="font-bold text-sm text-slate-900">{selectedReq.service_level?.toUpperCase()}</p>
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment_Auth</p>
                        <p className={`font-bold text-sm ${selectedReq.payment_status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>
                          {selectedReq.payment_status === 'paid' ? 'VERIFIED_PAID' : 'UNAUTHORIZED'}
                        </p>
                    </div>
                </div>
                
                <div className="flex gap-6">
                  <button onClick={() => setSelectedReq(null)} className="font-black text-[11px] text-slate-400 px-6 tracking-widest hover:text-slate-900">CLOSE_VAULT</button>
                  <button 
                    onClick={handleDispatchEmail} 
                    disabled={aiStatus !== 'ready' || isDispatching} 
                    className="bg-slate-900 text-white px-24 py-6 rounded-[2rem] font-black text-xs hover:bg-blue-600 hover:shadow-2xl hover:shadow-blue-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isDispatching ? "DISPATCHING_ENCRYPTED_EMAIL..." : "SIGN & DISPATCH"}
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .ql-container { border: none !important; font-family: 'Times New Roman', serif !important; font-size: 18px; }
        .ql-toolbar { border: none !important; background: white; border-radius: 2rem 2rem 0 0; border-bottom: 1px solid #f1f5f9 !important; padding: 20px !important; }
        .ql-editor { padding: 50px !important; line-height: 1.8; color: #1e293b; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}