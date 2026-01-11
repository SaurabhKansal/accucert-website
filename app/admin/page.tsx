"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import 'react-quill-new/dist/quill.snow.css';

// Prevent SSR issues with the editor
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Back Office States
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal States
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [editText, setEditText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Advanced modules to support tables, colors, and layouts for "Mirror" documents
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

  const openReview = (req: any) => {
    setSelectedReq(req);
    const content = req.extracted_text?.includes('<') 
      ? req.extracted_text 
      : `<div>${(req.extracted_text || "").replace(/\n/g, '<br/>')}</div>`;
    setEditText(content);
  };

  // --- PREVIEW HANDLER ---
  async function handlePreview() {
    setIsPreviewing(true);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          requestId: selectedReq.id, 
          editText: editText 
        }),
      });

      if (!res.ok) throw new Error("Preview generation failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PREVIEW_${selectedReq.filename}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSaveDraft() {
    const newHistory = [...(selectedReq.version_history || []), {
      text: editText,
      timestamp: new Date().toISOString()
    }];

    const { error } = await supabase.from("translations").update({ 
      extracted_text: editText,
      version_history: newHistory 
    }).eq("id", selectedReq.id);
    
    if (!error) {
      alert("Draft saved to version history.");
      fetchRequests();
    }
  }

  async function handleFinalApprove() {
    if (selectedReq.payment_status !== 'paid') {
        alert("⚠️ UNPAID: Cannot dispatch until payment is confirmed.");
        return;
    }
    const confirmDispatch = confirm("Are you sure? This will generate the final PDF and email it to the client.");
    if (!confirmDispatch) return;

    setIsProcessing(true);
    try {
      await supabase.from("translations").update({ extracted_text: editText }).eq("id", selectedReq.id);
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: selectedReq.id, email: selectedReq.user_email }),
      });
      if (res.ok) {
        alert("Success: Certified Package Dispatched!");
        setSelectedReq(null);
        fetchRequests();
      }
    } finally {
      setIsProcessing(false);
    }
  }

  if (loading) return <div className="p-20 text-center font-bold">Initializing Back-Office...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row justify-between items-center gap-4">
          <h1 className="text-3xl font-black italic tracking-tighter">ACCUCERT_ADMIN</h1>
          <div className="flex gap-3 w-full md:w-auto">
            <input 
              type="text" placeholder="Search orders..." 
              className="p-3 border rounded-xl text-sm w-full md:w-64 bg-white"
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="p-3 border rounded-xl text-sm bg-white" onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Status</option>
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
                <th className="p-6">Service</th>
                <th className="p-6 text-center">Status & Payment</th>
                <th className="p-6">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50 transition">
                  <td className="p-6">
                    <div className="font-bold">{req.full_name}</div>
                    <div className="text-xs text-slate-500">{req.user_email}</div>
                  </td>
                  <td className="p-6">
                    <div className="text-xs font-bold uppercase">{req.service_level}</div>
                    <div className={`text-[10px] font-bold ${req.urgency === 'expedited' ? 'text-red-500' : 'text-slate-400'}`}>
                      {req.urgency === 'expedited' ? '⚡ EXPEDITED' : 'Standard'}
                    </div>
                  </td>
                  <td className="p-6 text-center">
                    <div className="flex flex-col items-center gap-1">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black ${req.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                            {req.payment_status === 'paid' ? 'PAID' : 'UNPAID'}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">{req.status}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <button onClick={() => openReview(req)} className="bg-slate-900 text-white px-6 py-2 rounded-xl text-xs font-bold hover:bg-slate-700 transition">
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* REVIEW MODAL - Side-by-Side "Mirror" Layout */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-[98vw] h-[95vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center bg-white">
              <h2 className="text-2xl font-black italic uppercase tracking-tighter">Mirror_Review: {selectedReq.filename}</h2>
              <button onClick={() => setSelectedReq(null)} className="text-2xl hover:text-red-500 transition">✕</button>
            </div>

            <div className="flex-1 overflow-hidden grid md:grid-cols-2">
              {/* LEFT: SOURCE DOCUMENT */}
              <div className="bg-slate-800 p-8 overflow-auto flex flex-col items-center border-r border-slate-700">
                <p className="text-[10px] font-black uppercase text-slate-500 mb-4 self-start tracking-widest">Original Reference</p>
                <img 
                  src={selectedReq.image_url} 
                  alt="Reference" 
                  className="max-w-full shadow-2xl rounded-sm border-[8px] border-white" 
                />
              </div>

              {/* RIGHT: MIRROR TRANSLATION EDITOR */}
              <div className="p-8 flex flex-col bg-white overflow-hidden">
                {selectedReq.version_history?.length > 0 && (
                    <div className="mb-4 p-3 bg-slate-50 border rounded-2xl">
                        <p className="text-[9px] font-black text-slate-400 mb-2 uppercase">Restore Draft</p>
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {selectedReq.version_history.map((v: any, i: number) => (
                                <button key={i} onClick={() => setEditText(v.text)} className="whitespace-nowrap px-3 py-1 bg-white border rounded-lg text-[10px] font-bold hover:border-black transition">
                                    v{i+1} - {new Date(v.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-auto border-2 border-slate-100 rounded-[2rem] bg-slate-50 shadow-inner">
                  <ReactQuill theme="snow" value={editText} onChange={setEditText} modules={modules} className="h-full" />
                </div>
              </div>
            </div>

            <div className="p-8 border-t bg-slate-50 flex justify-between items-center">
               <div className="flex gap-6 items-center">
                  <button onClick={handleSaveDraft} className="text-xs font-bold text-slate-400 hover:text-slate-900 transition">
                    💾 Save Progress Snapshot
                  </button>
                  <button 
                    onClick={handlePreview} 
                    disabled={isPreviewing}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 transition flex items-center gap-2"
                  >
                    {isPreviewing ? "Building PDF..." : "👁️ Download Preview PDF"}
                  </button>
               </div>
               <div className="flex gap-4">
                  <button onClick={() => setSelectedReq(null)} className="font-bold text-slate-400 px-4">Cancel</button>
                  <button 
                    onClick={handleFinalApprove} 
                    disabled={isProcessing || selectedReq.payment_status !== 'paid'} 
                    className="bg-[#18222b] text-white px-12 py-4 rounded-2xl font-black text-xs hover:shadow-2xl transition disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? "DISPATCHING..." : "CERTIFY & DISPATCH"}
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}