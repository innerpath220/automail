import React, { useState, useRef } from 'react';
import { Lead } from '../types';
import { Upload, X } from 'lucide-react';
import Papa from 'papaparse';

interface LeadInputProps {
  onLeadsSubmit: (leads: Lead[]) => void;
}

export const LeadInput: React.FC<LeadInputProps> = ({ onLeadsSubmit }) => {
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) {
        throw new Error('Input must be an array of lead objects');
      }
      if (parsed.length === 0) {
        throw new Error('Lead array cannot be empty');
      }
      onLeadsSubmit(parsed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  const handleFileUpload = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    try {
      if (extension === 'json') {
        const text = await file.text();
        setJsonInput(text);
        setError(null);
      } else if (extension === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const leads: Lead[] = (results.data as any[]).map((row, idx) => ({
              lead_id: row.lead_id || `CSV-${idx}`,
              email: row.email,
              phone_number: row.phone_number || row.phone,
              company_name: row.company_name || row.company,
              website: row.website,
              notes: row.notes,
              business_category: row.business_category || row.category
            })).filter((lead) =>
              Object.values(lead).some((value) => typeof value === 'string' && value.trim().length > 0)
            );
            setJsonInput(JSON.stringify(leads, null, 2));
            setError(null);
          },
          error: (err) => setError(`CSV Parsing Error: ${err.message}`)
        });
      } else if (extension === 'txt') {
        const text = await file.text();
        // Try to see if it's JSON in a txt file
        try {
          JSON.parse(text);
          setJsonInput(text);
          setError(null);
        } catch {
          // Otherwise, treat lines as potential leads or just raw notes
          const leads: Lead[] = [{
            lead_id: 'TXT-1',
            notes: text
          }];
          setJsonInput(JSON.stringify(leads, null, 2));
          setError(null);
        }
      } else if (extension === 'pdf') {
        const pdfjs = await import('pdfjs-dist');
        const pdfWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker.default;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          fullText += strings.join(' ') + '\n';
        }
        const leads: Lead[] = [{
          lead_id: 'PDF-1',
          notes: fullText
        }];
        setJsonInput(JSON.stringify(leads, null, 2));
        setError(null);
      } else {
        setError('Unsupported file type. Please use JSON, CSV, PDF, or TXT.');
      }
    } catch (err) {
      setError(`Error processing file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const loadExample = () => {
    const example: Lead[] = [
      {
        lead_id: "L1",
        email: "alice@techstart.io",
        company_name: "TechStart",
        website: "https://techstart.io",
        notes: "Recent Series A, looking for sales tools."
      },
      {
        lead_id: "L2",
        email: "bob@localbakery.com",
        company_name: "Bob's Bakery",
        notes: "Local business, wants more foot traffic."
      }
    ];
    setJsonInput(JSON.stringify(example, null, 2));
  };

  return (
    <div className="space-y-4 flex-1 flex flex-col min-h-0">
      <div className="flex justify-between items-center shrink-0">
        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Audience Input</label>
        <button
          onClick={loadExample}
          className="text-xs text-blue-500 hover:underline font-semibold"
        >
          Load Example
        </button>
      </div>

      <div 
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative group cursor-pointer border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center gap-3 bg-white/5 shadow-inner shrink-0 ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 hover:border-white/20'}`}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
          className="hidden" 
          accept=".json,.csv,.txt,.pdf"
        />
        <div className={`p-3 rounded-full transition-colors ${isDragging ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 group-hover:text-white/60'}`}>
          <Upload size={24} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold tracking-tight text-white/90">Drop your files here</p>
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium mt-1">Supports JSON, CSV, PDF, TXT</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 relative">
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          className="flex-1 w-full px-4 py-3 bg-brand-elevated border border-brand-border rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-600 outline-none transition-all text-white/80 placeholder:text-white/10 resize-none overflow-y-auto"
          placeholder='[{"lead_id": "1", "email": "hello@example.com", ...}]'
        />
        {jsonInput && (
          <button 
            onClick={() => setJsonInput('')}
            className="absolute top-2 right-2 p-1.5 hover:bg-white/10 rounded-lg text-white/40 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400 p-3 bg-red-500/10 border border-red-500/20 rounded-lg shrink-0">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!jsonInput.trim()}
        className="w-full bg-blue-600 text-white px-6 py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20 disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest text-[10px] shrink-0"
      >
        Process & Enrich Leads
      </button>
    </div>
  );
};
