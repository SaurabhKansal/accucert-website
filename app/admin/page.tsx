"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Safe initialization
const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
};

export default function AdminDashboard() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabase();

  useEffect(() => {
    if (supabase) fetchRequests();
  }, []);

  async function fetchRequests() {
    const { data } = await supabase!
      .from("translations")
      .select("*")
      .order("created_at", { ascending: false });
    setRequests(data || []);
    setLoading(false);
  }

  async function handleApprove(id: string, email: string) {
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: id, email }),
    });

    if (res.ok) {
      alert("Success: Translation sent to client!");
      fetchRequests(); // Refresh the list
    } else {
      alert("Error approving translation.");
    }
  }

  if (loading) return <div className="p-10 text-center">Loading dashboard...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Admin Portal</h1>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="p-4 text-xs uppercase font-bold text-slate-500">Date</th>
                <th className="p-4 text-xs uppercase font-bold text-slate-500">Email</th>
                <th className="p-4 text-xs uppercase font-bold text-slate-500">File</th>
                <th className="p-4 text-xs uppercase font-bold text-slate-500">Status</th>
                <th className="p-4 text-xs uppercase font-bold text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b hover:bg-slate-50">
                  <td className="p-4 text-sm">{new Date(req.created_at).toLocaleDateString()}</td>
                  <td className="p-4 text-sm font-semibold">{req.user_email}</td>
                  <td className="p-4 text-sm">{req.filename}</td>
                  <td className="p-4 text-sm uppercase font-bold">
                    <span className={req.status === 'approved' ? 'text-green-600' : 'text-orange-500'}>
                      {req.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <button 
                      onClick={() => handleApprove(req.id, req.user_email)}
                      disabled={req.status === 'approved'}
                      className="bg-slate-900 text-white px-4 py-2 rounded text-xs font-bold disabled:opacity-30"
                    >
                      {req.status === 'approved' ? 'Emailed' : 'Approve & Send'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}