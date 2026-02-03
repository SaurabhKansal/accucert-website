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
      if (!res.ok) throw new Error("Failed to start AI task.");
    } catch (err: any) {
      alert("AI_START_ERROR: " + err.message);
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
        alert("🚀 DISPATCHED: Email sent to client!");
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

  if (loading) return <div className="p-20 text-center font-bold">LOADING_ACCUCERT_SECURE_VAULT...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-8 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter italic uppercase">Vault_Control</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Accucert Management</p>
          </div>
          
          <div className="flex gap-4">
            <input 
              type="text" placeholder="Search..." 
              className="p-4 rounded-2xl text-xs w-80 bg-white shadow-sm outline-none"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </header>

        <div className="bg-white rounded-[3rem] shadow-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 border-b">
              <tr>
                <th className="p-8">Order & Language</th>
                <th className="p-8">AI Status</th>
                <th className="p-8">Dispatch</th>
                <th className="p-8 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition group">
                  <td className="p-8">
                    <div className="font-black text-sm">{req.full_name}</div>
                    <div className="text-[9px] text-blue-600 font-bold uppercase">{req.language_from} → {req.language_to}</div>
                  </td>
                  <td className="p-8">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${req.processing_status === 'ready' ? 'bg-green-500' : 'bg-orange-400 animate-pulse'}`} />
                      <span className="text-[10px] font-black uppercase text-slate-500">
                        {req.processing_status === 'ready' ? 'RECONSTRUCTED' : `${req.processing_percentage}% AI Progress`}
                      </span>
                    </div>
                  </td>
                  <td className="p-8">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black ${req.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                      {req.status === 'completed' ? 'DISPATCHED' : 'PENDING'}
                    </span>
                  </td>
                  <td className="p-8 text-right">
                    <button onClick={() => openReview(req)} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black">
                      REVIEW & DISPATCH
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-white w-full max-w-[98vw] h-[95vh] rounded-[4rem] shadow-2xl flex flex-col overflow-hidden">
            
            {/* MODAL HEADER */}
            <div className="px-10 py-6 border-b flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black italic uppercase">Order_Review: {selectedReq.full_name}</h2>
                <div className="flex gap-4 mt-2">
                   <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">
                     {selectedReq.language_from} → {selectedReq.language_to}
                   </span>
                </div>
              </div>
              <button onClick={() => setSelectedReq(null)} className="w-12 h-12 rounded-full border flex items-center justify-center font-bold hover:bg-red-500 hover:text-white transition-all">✕</button>
            </div>

            <div className="flex-1 overflow-hidden grid md:grid-cols-2">
              {/* LEFT SIDE: SOURCE & AI PREVIEW */}
              <div className="bg-slate-900 p-8 overflow-auto space-y-8">
                <div className="space-y-2">
                  <p className="text-white text-[10px] font-black uppercase tracking-widest opacity-40">Original Document</p>
                  <img src={selectedReq.image_url} className="w-full rounded shadow-2xl border-4 border-white/5" />
                </div>
                
                {aiResultUrl && (
                  <div className="space-y-2 animate-in fade-in duration-700">
                    <p className="text-blue-400 text-[10px] font-black uppercase tracking-widest">AI Reconstruction Result</p>
                    <img src={aiResultUrl} className="w-full rounded shadow-2xl border-4 border-blue-500/20" />
                  </div>
                )}
              </div>

              {/* RIGHT SIDE: EDITOR & PROGRESS */}
              <div className="p-10 flex flex-col bg-white">
                {/* AI PROGRESS BAR */}
                <div className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 shadow-inner">
                   <div className="flex justify-between items-center mb-3">
                      <p className="text-[10px] font-black text-slate-400 uppercase">AI Reconstruction Progress</p>
                      <span className="text-sm font-black text-slate-900">{aiPercent}%</span>
                   </div>
                   <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-700 ${aiStatus === 'ready' ? 'bg-green-500' : 'bg-blue-600 animate-pulse'}`} 
                        style={{ width: `${aiPercent}%` }}
                      />
                   </div>
                   {aiStatus === 'idle' && (
                     <button 
                       onClick={handleTriggerAI}
                       disabled={isProcessing}
                       className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-black text-[10px] tracking-widest"
                     >
                       {isProcessing ? "STARTING..." : "TRIGGER AI RECONSTRUCTION"}
                     </button>
                   )}
                </div>

                <div className="flex-1 overflow-hidden border border-slate-100 rounded-[3rem] bg-slate-50/20 shadow-inner">
                    <ReactQuill theme="snow" value={editText} onChange={setEditText} modules={modules} className="h-full" />
                </div>
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="p-10 border-t bg-slate-50 flex justify-between items-center">
                <div className="flex gap-10">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase">Payment Status</p>
                        <p className={`font-bold ${selectedReq.payment_status === 'paid' ? 'text-green-600' : 'text-red-500'}`}>{selectedReq.payment_status?.toUpperCase()}</p>
                    </div>
                </div>
                
                <div className="flex gap-4">
                  <button onClick={() => setSelectedReq(null)} className="font-black text-[10px] text-slate-400 px-6">CLOSE_VAULT</button>
                  <button 
                    onClick={handleDispatchEmail} 
                    disabled={aiStatus !== 'ready' || isDispatching} 
                    className="bg-slate-900 text-white px-20 py-5 rounded-[2rem] font-black text-xs hover:bg-blue-600 transition-all disabled:opacity-30"
                  >
                    {isDispatching ? "SENDING_CERTIFIED_EMAIL..." : "DISPATCH TO CLIENT"}
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .ql-container { border: none !important; font-family: serif; font-size: 18px; }
        .ql-toolbar { border: none !important; background: white; border-radius: 2rem 2rem 0 0; }
        .ql-editor { padding: 40px !important; }
      `}</style>
    </div>
  );
}