import { useState } from 'react';

// This interface tells TypeScript exactly what the "props" are
interface EditorModalProps {
  order: any;
  onClose: () => void; // Defines onClose as a function that returns nothing
  onSaveAndDispatch: (id: string, text: string) => Promise<void>; // Defines the save function
}

export default function EditorModal({ order, onClose, onSaveAndDispatch }: EditorModalProps) {
  const [editText, setEditText] = useState(order.extracted_text || "");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAction = async () => {
    setIsProcessing(true);
    try {
      await onSaveAndDispatch(order.id, editText);
    } catch (error) {
      console.error("Action failed", error);
    } finally {
      setIsProcessing(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="font-bold text-lg">Review Translation: {order.full_name}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-black p-2">✕</button>
        </div>

        {/* Comparison Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Original Image Reference */}
          <div className="w-1/2 p-4 border-r bg-gray-100 overflow-y-auto">
            <p className="text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Original Reference</p>
            <img src={order.image_url} alt="Original" className="w-full rounded shadow-md" />
          </div>

          {/* Right: Editable English Text */}
          <div className="w-1/2 p-4 flex flex-col bg-white">
            <p className="text-[10px] font-black text-blue-600 mb-2 uppercase tracking-widest">English Translation (Editable)</p>
            <textarea
              className="flex-1 w-full p-6 border rounded-xl font-serif text-lg leading-relaxed focus:ring-2 focus:ring-blue-500 outline-none resize-none shadow-inner bg-slate-50"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="Refine the translation here..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-3 bg-gray-50">
          <button 
            onClick={onClose} 
            className="px-6 py-2 text-sm font-bold text-gray-500 hover:text-black transition"
          >
            Cancel
          </button>
          <button 
            onClick={handleAction}
            disabled={isProcessing}
            className="px-8 py-3 bg-blue-600 text-white text-sm font-black rounded-xl hover:bg-blue-700 disabled:opacity-50 transition shadow-lg shadow-blue-200"
          >
            {isProcessing ? "DISPATCHING PDF..." : "CERTIFY & SEND"}
          </button>
        </div>
      </div>
    </div>
  );
}