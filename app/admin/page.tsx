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
  const [isDispatching, setIsDispatching] = useState(false);

  // Status-driven states for the modal
  const [aiStatus, setAiStatus] = useState("idle");
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

  // Main table list subscription
  useEffect(() => {
    fetchRequests();
    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'translations' }, () => {
        fetchRequests();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Modal-specific real-time subscription (Crucial for auto-fetching preview)
  useEffect(() => {
    if (!selectedReq) return;
    
    const sub = supabase
      .channel(`realtime-order-${selectedReq.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'translations', 
        filter: `id=eq.${selectedReq.id}` 
      }, (payload) => {
        console.log("📡 Real-time Engine Update:", payload.new.processing_status);
        
        // This is where the magic happens: state updates automatically
        setAiStatus(payload.new.processing_status);
        if (payload.new.translated_url) {
          setAiResultUrl(payload.new.translated_url);
        }
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
    setAiResultUrl(req.translated_url || "");
    setShowLivePreview(false);
  };

  /**
   * TRIGGER AI RECONSTRUCTION
   * Updates local state immediately to avoid 'idle' lag
   */
  async function handleTriggerAI() {
    if (!selectedReq) return;
    
    // UI Feedback: Immediately start the orange pulse
    setIsProcessing(true);
    setAiStatus("processing"); 

    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: selectedReq.id }),
      });

      if (!res.ok && aiStatus === 'idle') {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Network error");
      }
    } catch (err: any) {
      if (aiStatus === 'idle') {
        setAiStatus("idle");
        alert("CRITICAL_START_ERROR: " + err.message);
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
        alert("🚀 DISPATCHED: Official Translation sent to client.");
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

  const getStatusLabel = (status: string) => {
    switch(status) {
      case 'ready': return 'Reconstructed';
      case 'processing': return 'In Progress';
      case 'created': return 'Task Queued';
      case 'failed': return 'Failed';
      default: return 'Idle';
    }
  };

  if (loading) return <div className="p-20 text-center font-bold">VAULT_ACCESS_IN_PROGRESS...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-8 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter italic uppercase">Vault_Control</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Accucert Global Management</p>
          </div>
          <input 
            type="text" placeholder="Search records..." 
            className="p-4 rounded-2xl text-xs w-80 bg-white shadow-sm outline-none"
            onChange={(e) => setSearch(e.target.value)}
          />
        </header>

        <div className="bg-white rounded-[3rem] shadow-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
              <tr>
                <th className="p-8">Order & Language</th>
                <th className="p-8">Engine Status</th>
                <th className="p-8">Delivery</th>
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
                      <div className={`w-2 h-2 rounded-full ${req.processing_status === 'ready' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : req.processing_status === 'idle' ? 'bg-slate-300' : 'bg-orange-400 animate-pulse'}`} />
                      <span className="text-[10px] font-black uppercase text-slate-500">
                        {getStatusLabel(req.processing_status)}
                      </span>
                    </div>
                  </td>
                  <td className="p-8">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black ${req.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                      {req.status === 'completed' ? 'DELIVERED' : 'PENDING'}
                    </span>
                  </td>
                  <td className="p-8 text-right">
                    <button onClick={() => openReview(req)} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black tracking-widest hover:bg-blue-600 transition-all">
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
                <h2 className="text-2xl font-black italic uppercase tracking-tight">Certification_Control</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Order_Ref: {selectedReq.id}</p>
              </div>
              <button onClick={() => setSelectedReq(null)} className="w-12 h-12 rounded-full border bg-white flex items-center justify-center font-bold hover:bg-red-500 hover:text-white transition-all transform hover:rotate-90">✕</button>
            </div>

            <div className="flex-1 overflow-hidden grid md:grid-cols-2">
              {/* LEFT SIDE: AUTO-FETCH PREVIEW */}
              <div className="bg-slate-900 p-8 overflow-auto space-y-10 custom-scrollbar">
                <div className="space-y-3">
                  <p className="text-white text-[9px] font-black uppercase tracking-[0.3em] opacity-30">Source_Input</p>
                  <img src={selectedReq.image_url} className="w-full rounded shadow-2xl border-4 border-white/5" />
                </div>
                
                {aiResultUrl ? (
                  <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.3em]">AI_Reconstruction_Result</p>
                    <img 
                      src={aiResultUrl} 
                      className="w-full rounded shadow-2xl border-4 border-blue-500/20" 
                      alt="Preview Ready"
                    />
                  </div>
                ) : (
                  <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[3rem]">
                     <div className={`w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full ${aiStatus === 'processing' ? 'animate-spin' : ''} mb-4`} />
                     <p className="text-white/20 text-[10px] font-black uppercase tracking-widest text-center">
                        {aiStatus === 'processing' ? 'AI is Re-drawing pixels...' : 'Awaiting Engine Trigger...'}
                     </p>
                  </div>
                )}
              </div>

              <div className="p-10 flex flex-col bg-white overflow-hidden">
                <div className="mb-8 p-10 bg-slate-900 rounded-[3rem] shadow-2xl flex flex-col items-center justify-center text-center">
                   <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.4em] mb-4">Engine Engine Status</p>
                   
                   <div className="flex items-center gap-4 mb-6">
                      <div className={`w-4 h-4 rounded-full ${aiStatus === 'ready' ? 'bg-green-500 shadow-[0_0_20px_rgba(34,197,94,0.8)]' : aiStatus === 'idle' ? 'bg-white/20' : 'bg-orange-500 animate-ping'}`} />
                      <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                        {getStatusLabel(aiStatus)}
                      </h3>
                   </div>

                   {aiStatus === 'idle' || aiStatus === 'failed' ? (
                     <button 
                       onClick={handleTriggerAI}
                       disabled={isProcessing}
                       className="bg-blue-600 text-white px-12 py-4 rounded-2xl font-black text-[11px] tracking-widest hover:bg-blue-500 transition-all shadow-xl shadow-blue-900/20"
                     >
                       {isProcessing ? "INITIALIZING..." : "START_RECONSTRUCTION"}
                     </button>
                   ) : aiStatus === 'ready' ? (
                      <p className="text-green-400 text-[10px] font-black uppercase tracking-widest">System_Ready: Verification Required</p>
                   ) : (
                      <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em]">The AI is currently working in the background...</p>
                   )}
                </div>

                <div className="flex-1 overflow-hidden border border-slate-100 rounded-[3rem] bg-slate-50/30 shadow-inner">
                    <ReactQuill theme="snow" value={editText} onChange={setEditText} modules={modules} className="h-full" />
                </div>
              </div>
            </div>

            <div className="p-10 border-t bg-slate-50 flex justify-between items-center">
                <div className="flex gap-12 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    <div>
                        <p>Payment_Auth</p>
                        <p className={`text-sm mt-1 ${selectedReq.payment_status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>{selectedReq.payment_status === 'paid' ? 'VERIFIED' : 'UNPAID'}</p>
                    </div>
                </div>
                
                <div className="flex gap-6">
                  <button onClick={() => setSelectedReq(null)} className="font-black text-[11px] text-slate-400 tracking-widest">CLOSE_VAULT</button>
                  <button 
                    onClick={handleDispatchEmail} 
                    disabled={aiStatus !== 'ready' || isDispatching} 
                    className="bg-slate-900 text-white px-24 py-6 rounded-[2rem] font-black text-xs hover:bg-blue-600 transition-all disabled:opacity-30"
                  >
                    {isDispatching ? "DISPATCHING..." : "SIGN & DISPATCH"}
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .ql-container { border: none !important; font-family: 'Times New Roman', serif !important; font-size: 18px; }
        .ql-toolbar { border: none !important; background: white; border-radius: 2rem 2rem 0 0; padding: 20px !important; }
        .ql-editor { padding: 50px !important; line-height: 1.8; color: #1e293b; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}