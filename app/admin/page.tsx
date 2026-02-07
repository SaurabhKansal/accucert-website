"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);

  const [aiStatus, setAiStatus] = useState("idle");
  const [aiResultUrl, setAiResultUrl] = useState("");

  const fetchRequests = useCallback(async () => {
    const { data } = await supabase.from("translations").select("*").order("created_at", { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRequests();
    const channel = supabase.channel('db-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'translations' }, () => { fetchRequests(); }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRequests]);

  useEffect(() => {
    if (!selectedReq) return;
    const sub = supabase.channel(`order-${selectedReq.id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'translations', filter: `id=eq.${selectedReq.id}` }, (payload) => {
        setAiStatus(payload.new.processing_status);
        if (payload.new.translated_url) setAiResultUrl(payload.new.translated_url);
        if (payload.new.processing_status === 'ready') fetchRequests();
    }).subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [selectedReq, fetchRequests]);

  const openReview = (req: any) => {
    setSelectedReq(req);
    setAiStatus(req.processing_status || "idle");
    setAiResultUrl(req.translated_url || "");
  };

  async function handleTriggerAI() {
    if (!selectedReq) return;
    setIsProcessing(true);
    setAiStatus("processing"); 
    try {
      const res = await fetch("/api/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: selectedReq.id }) });
      if (!res.ok) throw new Error("Init failed");
    } catch (err: any) {
      setAiStatus("idle");
      alert("ENGINE_ERROR: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDispatchEmail() {
    if (!selectedReq || !aiResultUrl) return;
    setIsDispatching(true);
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          orderId: selectedReq.id,
          translatedUrls: aiResultUrl,
          fullName: selectedReq.full_name,
          userEmail: selectedReq.user_email
        }),
      });
      if (res.ok) {
        alert("🚀 DISPATCHED: Official Certificate & Translation sent.");
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
    return (req.full_name?.toLowerCase() || "").includes(search.toLowerCase()) || 
           (req.user_email?.toLowerCase() || "").includes(search.toLowerCase());
  });

  if (loading) return <div className="p-20 text-center font-black uppercase tracking-widest opacity-20">Accessing_Vault...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-8 text-slate-900 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tighter italic uppercase">Vault_Control</h1>
            <p className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase">Accucert Global Management</p>
          </div>
          <input type="text" placeholder="Search records..." className="p-4 rounded-2xl text-xs w-80 bg-white shadow-sm outline-none" onChange={(e) => setSearch(e.target.value)} />
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
                <tr key={req.id} className="hover:bg-slate-50 transition">
                  <td className="p-8">
                    <div className="font-black text-sm">{req.full_name}</div>
                    <div className="text-[9px] text-blue-600 font-bold uppercase mt-1">{req.language_from} → {req.language_to}</div>
                  </td>
                  <td className="p-8">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${req.processing_status === 'ready' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : req.processing_status === 'idle' ? 'bg-slate-300' : 'bg-orange-400 animate-pulse'}`} />
                        <span className="text-[10px] font-black uppercase text-slate-500">{req.processing_status === 'ready' ? 'Reconstructed' : req.processing_status === 'processing' ? 'In Progress' : 'Idle'}</span>
                    </div>
                  </td>
                  <td className="p-8">
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black ${req.status === 'completed' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{req.status === 'completed' ? 'DELIVERED' : 'PENDING'}</span>
                  </td>
                  <td className="p-8 text-right">
                    <button onClick={() => openReview(req)} className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black tracking-widest hover:bg-blue-600 transition">OPEN_VAULT</button>
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
                <h2 className="text-2xl font-black italic uppercase tracking-tight">Visual_Verification</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ref: {selectedReq.id}</p>
              </div>
              <button onClick={() => setSelectedReq(null)} className="w-12 h-12 rounded-full border bg-white flex items-center justify-center font-bold hover:bg-red-500 hover:text-white transition transform hover:rotate-90">✕</button>
            </div>

            <div className="flex-1 overflow-hidden grid md:grid-cols-2">
              {/* LEFT: SOURCE */}
              <div className="bg-slate-900 p-8 overflow-auto space-y-10 custom-scrollbar border-r border-white/5">
                <div className="space-y-3">
                  <p className="text-white text-[9px] font-black uppercase tracking-[0.3em] opacity-30">Original_Input</p>
                  <img src={selectedReq.preview_url || selectedReq.image_url} className="w-full rounded shadow-2xl border-4 border-white/5" />
                </div>
              </div>

              {/* RIGHT: RECONSTRUCTION */}
              <div className="bg-slate-950 p-8 overflow-auto space-y-10 custom-scrollbar">
                {aiResultUrl ? (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.3em]">AI_Reconstruction</p>
                    {aiResultUrl.split(',').map((url, idx) => (
                      <div key={idx} className="space-y-2">
                         <span className="text-[8px] text-white/20 font-black tracking-widest uppercase">Page_{idx + 1}</span>
                         <img src={url} className="w-full rounded shadow-2xl border-4 border-blue-500/20" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[3rem]">
                     <div className={`w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full ${aiStatus === 'processing' ? 'animate-spin' : ''} mb-4`} />
                     <p className="text-white/20 text-[10px] font-black uppercase tracking-widest text-center px-10">
                        {aiStatus === 'processing' ? 'Generating visual reconstruction...' : 'Awaiting Engine Trigger...'}
                     </p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-10 border-t bg-slate-50 flex justify-between items-center">
                <div className="flex gap-12 items-center">
                   <div className="flex items-center gap-4 bg-slate-900 p-6 rounded-[2rem] shadow-lg">
                      <div className={`w-3 h-3 rounded-full ${aiStatus === 'ready' ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.8)]' : aiStatus === 'idle' ? 'bg-white/20' : 'bg-orange-500 animate-ping'}`} />
                      <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">
                        {aiStatus === 'ready' ? 'READY' : aiStatus === 'processing' ? 'IN PROGRESS' : 'IDLE'}
                      </h3>
                   </div>
                   {aiStatus !== 'ready' && (
                     <button onClick={handleTriggerAI} disabled={isProcessing} className="bg-blue-600 text-white px-10 py-4 rounded-2xl font-black text-[10px] tracking-widest hover:bg-blue-500 transition shadow-xl shadow-blue-500/20">
                       {isProcessing ? "INITIALIZING..." : "START_ENGINE"}
                     </button>
                   )}
                </div>
                
                <div className="flex gap-6">
                  <button onClick={() => setSelectedReq(null)} className="font-black text-[11px] text-slate-400 tracking-widest uppercase">Discard</button>
                  <button 
                    onClick={handleDispatchEmail} 
                    disabled={aiStatus !== 'ready' || isDispatching} 
                    className="bg-slate-900 text-white px-24 py-6 rounded-[2rem] font-black text-xs hover:bg-blue-600 transition disabled:opacity-30"
                  >
                    {isDispatching ? "DISPATCHING..." : "CERTIFY & DISPATCH"}
                  </button>
                </div>
            </div>
          </div>
        </div>
      )}
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
    </div>
  );
}