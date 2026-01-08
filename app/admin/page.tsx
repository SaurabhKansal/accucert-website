"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [editText, setEditText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchRequests();
  }, []);

  async function fetchRequests() {
    const { data } = await supabase
      .from("translations")
      .select("*")
      .order("created_at", { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }

  const openReview = (req: any) => {
    setSelectedReq(req);
    setEditText(req.extracted_text);
  };

  async function handleFinalApprove() {
    setIsProcessing(true);
    
    // 1. Update the text in Supabase first (in case we edited it)
    await supabase
      .from("translations")
      .update({ extracted_text: editText })
      .eq("id", selectedReq.id);

    // 2. Trigger the Approval & Email API
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        requestId: selectedReq.id, 
        email: selectedReq.user_email 
      }),
    });

    if (res.ok) {
      alert("Success: Edited translation sent to client!");
      setSelectedReq(null);
      fetchRequests();
    } else {
      alert("Error approving document.");
    }
    setIsProcessing(false);
  }

  if (loading) return <div className="p-20 text-center font-bold">Loading secure requests...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-8 text-slate-900">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-black mb-8 flex items-center gap-3">
          <span className="bg-slate-900 text-white p-2 rounded-lg text-xl">🛡️</span> 
          Admin Review Portal
        </h1>

        {/* MAIN TABLE */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-5 text-xs uppercase font-bold text-slate-400">Client / Date</th>
                <th className="p-5 text-xs uppercase font-bold text-slate-400">Document Name</th>
                <th className="p-5 text-xs uppercase font-bold text-slate-400">Status</th>
                <th className="p-5 text-xs uppercase font-bold text-slate-400">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b last:border-0 hover:bg-slate-50 transition">
                  <td className="p-5">
                    <div className="font-bold text-sm">{req.user_email}</div>
                    <div className="text-xs text-slate-400">{new Date(req.created_at).toLocaleString()}</div>
                  </td>
                  <td className="p-5 text-sm font-medium text-slate-600">{req.filename}</td>
                  <td className="p-5">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                      req.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="p-5">
                    <button 
                      onClick={() => openReview(req)}
                      className="bg-slate-900 text-white px-5 py-2 rounded-lg text-xs font-bold hover:bg-[var(--accent)] transition-all"
                    >
                      {req.status === 'approved' ? 'View Details' : 'Review & Approve'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* REVIEW MODAL */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-bold">Reviewing: {selectedReq.filename}</h2>
                <p className="text-sm text-slate-500">Client: {selectedReq.user_email}</p>
              </div>
              <button onClick={() => setSelectedReq(null)} className="text-slate-400 hover:text-slate-900 text-2xl">✕</button>
            </div>

            <div className="flex-1 overflow-hidden grid md:grid-cols-2">
              {/* LEFT: Original Image */}
              <div className="p-6 bg-slate-200 overflow-auto flex items-center justify-center border-r">
                {selectedReq.image_url ? (
                  <img src={selectedReq.image_url} alt="Original" className="max-w-full shadow-lg rounded" />
                ) : (
                  <div className="text-slate-400 italic">No original image stored. Ensure Storage is set up.</div>
                )}
              </div>

              {/* RIGHT: Editable Translation */}
              <div className="p-6 flex flex-col">
                <label className="text-xs font-bold uppercase text-slate-400 mb-2">English Translation (Editable)</label>
                <textarea 
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="flex-1 w-full p-4 border rounded-xl font-mono text-sm focus:ring-2 focus:ring-[var(--accent)] outline-none resize-none bg-slate-50"
                  placeholder="The extracted text will appear here..."
                />
              </div>
            </div>

            <div className="p-6 border-t bg-white flex justify-end gap-4">
              <button 
                onClick={() => setSelectedReq(null)}
                className="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-900"
              >
                Cancel
              </button>
              {selectedReq.status !== 'approved' && (
                <button 
                  onClick={handleFinalApprove}
                  disabled={isProcessing}
                  className="bg-[var(--accent)] text-white px-10 py-3 rounded-xl font-bold hover:opacity-90 transition disabled:opacity-50"
                >
                  {isProcessing ? "Processing..." : "Approve & Send Email"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}