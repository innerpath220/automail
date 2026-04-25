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
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'missing_email' | 'with_email'>('all');
  const [importedLeads, setImportedLeads] = useState<Lead[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function normalizeKey(value: unknown) {
    return typeof value === 'string'
      ? value.toLowerCase().replace(/[^a-z0-9]+/g, '')
      : '';
  }

  function pickField(row: Record<string, unknown>, aliases: string[]) {
    const normalizedEntries = Object.entries(row).map(([key, value]) => [normalizeKey(key), value] as const);
    for (const alias of aliases) {
      const match = normalizedEntries.find(([key]) => key === alias);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  }

  function cleanString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function parseLeadsFromJsonInput() {
    try {
      const parsed = JSON.parse(jsonInput);
      return Array.isArray(parsed) ? (parsed as Lead[]) : null;
    } catch {
      return null;
    }
  }

  function getImportStats(leads: Lead[]) {
    const total = leads.length;
    const withEmail = leads.filter((lead) => cleanString(lead.email)).length;
    const missingEmail = total - withEmail;
    return { total, withEmail, missingEmail };
  }

  function applyFilter(mode: 'all' | 'missing_email' | 'with_email') {
    const leads = importedLeads || parseLeadsFromJsonInput();
    if (!leads) {
      setError('Paste or import an array of lead objects first.');
      return;
    }

    const filtered = mode === 'missing_email'
      ? leads.filter((lead) => !cleanString(lead.email))
      : mode === 'with_email'
        ? leads.filter((lead) => cleanString(lead.email))
        : leads;

    setFilterMode(mode);
    setJsonInput(JSON.stringify(filtered, null, 2));
    setError(null);
  }

  function looksLikeDelimitedText(text: string) {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      return false;
    }

    const sample = lines.slice(0, 4).join('\n');
    return /,|;|\t/.test(sample);
  }

  function normalizeParsedRows(rows: any[]): Lead[] {
    return rows.map((rawRow, idx) => {
      const row = (rawRow && typeof rawRow === 'object') ? rawRow as Record<string, unknown> : {};
      const leadId = cleanString(
        pickField(row, ['leadid', 'id', 'recordid', 'contactid', 'companyid']) ||
        row.lead_id ||
        row.leadId ||
        row.id
      ) || `CSV-${idx + 1}`;

      const email = cleanString(
        pickField(row, [
          'email',
          'emailaddress',
          'contactemail',
          'primaryemail',
          'workemail',
          'businessemail',
        ]) || row.email || row.email_address
      );

      const phone = cleanString(
        pickField(row, [
          'phone',
          'phonenumber',
          'telephone',
          'mobile',
          'cell',
          'contactnumber',
          'telefono',
          'telefono1',
        ]) || row.phone_number || row.phone
      );

      const companyName = cleanString(
        pickField(row, [
          'company',
          'companyname',
          'business',
          'businessname',
          'name',
          'organization',
          'organisation',
          'nome',
        ]) || row.company_name || row.company
      );

      const website = cleanString(
        pickField(row, ['website', 'url', 'domain', 'site', 'web', 'sitoweb']) || row.website
      );

      const notes = cleanString(
        pickField(row, ['notes', 'note', 'comments', 'description', 'details', 'about', 'summary', 'testorecensione', 'autorecensione']) || row.notes
      );

      const category = cleanString(
        pickField(row, ['businesscategory', 'category', 'industry', 'sector', 'type', 'categoria']) || row.business_category || row.category
      );

      const address = cleanString(
        pickField(row, ['address', 'street', 'location', 'indirizzo']) || row.address
      );

      const rating = cleanString(
        pickField(row, ['rating', 'score', 'valutazione']) || row.rating
      );

      const reviewsCount = cleanString(
        pickField(row, ['reviewscount', 'reviews', 'numberofreviews', 'nreviews', 'nrecensioni']) || row.reviews_count
      );

      const mapsUrl = cleanString(
        pickField(row, ['mapsurl', 'googlemapsurl', 'mapurl', 'maps', 'googlemaps']) || row.maps_url
      );

      const reviewAuthor = cleanString(
        pickField(row, ['reviewauthor', 'author', 'autorecensione']) || row.review_author
      );

      const reviewText = cleanString(
        pickField(row, ['reviewtext', 'review', 'text', 'textreview', 'testorecensione']) || row.review_text
      );

      return {
        lead_id: leadId,
        email: email || undefined,
        phone_number: phone || undefined,
        company_name: companyName || undefined,
        address: address || undefined,
        website: website || undefined,
        rating: rating || undefined,
        reviews_count: reviewsCount || undefined,
        maps_url: mapsUrl || undefined,
        review_author: reviewAuthor || undefined,
        review_text: reviewText || undefined,
        notes: notes || undefined,
        business_category: category || undefined,
      };
    }).filter((lead) => Object.values(lead).some((value) => typeof value === 'string' && value.trim().length > 0));
  }

  async function parseCsvFile(file: File) {
    const text = await file.text();
    return new Promise<Lead[]>((resolve, reject) => {
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''),
        complete: (results) => {
          const rows = Array.isArray(results.data) ? results.data : [];
          const normalized = normalizeParsedRows(rows as any[]);
          if (!normalized.length && looksLikeDelimitedText(text)) {
            const fallback = Papa.parse(text, {
              header: false,
              skipEmptyLines: 'greedy',
            });
            if (Array.isArray(fallback.data) && fallback.data.length > 0) {
              const fallbackNotes = fallback.data.map((row) => Array.isArray(row) ? row.join(' | ') : String(row)).join('\n');
              resolve([{
                lead_id: `${file.name}-TXT`,
                notes: fallbackNotes,
                company_name: file.name.replace(/\.[^.]+$/, ''),
              }]);
              return;
            }
          }

          if (!normalized.length) {
            resolve([{
              lead_id: `${file.name}-RAW`,
              notes: text,
              company_name: file.name.replace(/\.[^.]+$/, ''),
            }]);
            return;
          }

          resolve(normalized);
        },
        error: (err) => reject(err),
      });
    });
  }

  async function parseJsonFile(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed as Lead[];
    }

    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { leads?: unknown[] }).leads)) {
      return (parsed as { leads: Lead[] }).leads;
    }

    throw new Error('JSON must be an array of lead objects or an object with a leads array.');
  }

  async function parseTxtFile(file: File) {
    const text = await file.text();

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed as Lead[];
      }
    } catch {
      // fall through
    }

    if (looksLikeDelimitedText(text)) {
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
        transformHeader: (header) => header.trim().replace(/^\uFEFF/, ''),
      });
      const normalized = normalizeParsedRows(parsed.data as any[]);
      if (normalized.length) {
        return normalized;
      }
    }

    return [{
      lead_id: `${file.name}-TXT`,
      notes: text,
      company_name: file.name.replace(/\.[^.]+$/, ''),
    }];
  }

  async function parsePdfFile(file: File) {
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

    return [{
      lead_id: `${file.name}-PDF`,
      notes: fullText.trim(),
      company_name: file.name.replace(/\.[^.]+$/, ''),
    }];
  }

  async function parseFile(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'json') {
      return parseJsonFile(file);
    }

    if (extension === 'csv' || extension === 'tsv') {
      return parseCsvFile(file);
    }

    if (extension === 'txt') {
      return parseTxtFile(file);
    }

    if (extension === 'pdf') {
      return parsePdfFile(file);
    }

    throw new Error(`Unsupported file type: ${file.name}`);
  }

  async function handleFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) {
      return;
    }

    setError(null);
    setSelectedFileNames(fileArray.map((file) => file.name));
    setImportWarning(null);

    try {
      const allLeads: Lead[] = [];
      const parsedFilesWithNoEmail: string[] = [];

      for (const file of fileArray) {
        const parsed = await parseFile(file);
        allLeads.push(...parsed);

        const likelyNoEmail = parsed.length > 0 && parsed.every((lead) => !('email' in lead) || !lead.email);
        if (likelyNoEmail) {
          parsedFilesWithNoEmail.push(file.name);
        }
      }

      if (allLeads.length === 0) {
        throw new Error('No leads could be extracted from the selected files.');
      }

      setImportedLeads(allLeads);
      setJsonInput(JSON.stringify(allLeads, null, 2));
      if (parsedFilesWithNoEmail.length > 0) {
        setImportWarning(
          `Imported ${parsedFilesWithNoEmail.length} file${parsedFilesWithNoEmail.length === 1 ? '' : 's'} with no email addresses. Those leads can be reviewed, but they cannot be sent until emails are added.`
        );
      }
      setError(null);
    } catch (err) {
      setError(`Error processing file(s): ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

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
    await handleFiles([file]);
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
    if (e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files);
    }
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
    setImportedLeads(example);
    setJsonInput(JSON.stringify(example, null, 2));
    setFilterMode('all');
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
          onChange={(e) => e.target.files?.length && void handleFiles(e.target.files)}
          multiple
          className="hidden" 
          accept=".json,.csv,.txt,.pdf"
        />
        <div className={`p-3 rounded-full transition-colors ${isDragging ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 group-hover:text-white/60'}`}>
          <Upload size={24} />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold tracking-tight text-white/90">Drop your files here</p>
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium mt-1">Supports JSON, CSV, PDF, TXT</p>
          <p className="text-[10px] text-white/30 uppercase tracking-widest font-medium mt-1">You can drop or select multiple files at once</p>
      {selectedFileNames.length > 0 && (
            <p className="mt-2 text-[10px] text-blue-400 uppercase tracking-widest font-medium">
              {selectedFileNames.length} file{selectedFileNames.length === 1 ? '' : 's'} loaded
            </p>
          )}
        </div>
      </div>

      {(() => {
        const leads = parseLeadsFromJsonInput();
        if (!leads) {
          return null;
        }

        const stats = getImportStats(leads);
        return (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Import Review</p>
                <p className="text-sm text-white/80">{stats.total} leads total, {stats.missingEmail} missing email addresses</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => applyFilter('all')}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${filterMode === 'all' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => applyFilter('with_email')}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${filterMode === 'with_email' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  With Email
                </button>
                <button
                  type="button"
                  onClick={() => applyFilter('missing_email')}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${filterMode === 'missing_email' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
                >
                  Missing Email
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest text-white/35">
              <span>{stats.withEmail} with email</span>
              <span>•</span>
              <span>{stats.missingEmail} without email</span>
            </div>
          </div>
        );
      })()}

      <div className="flex-1 flex flex-col min-h-0 relative">
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          className="flex-1 w-full px-4 py-3 bg-brand-elevated border border-brand-border rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-600 outline-none transition-all text-white/80 placeholder:text-white/10 resize-none overflow-y-auto"
          placeholder='[{"lead_id": "1", "email": "hello@example.com", ...}]'
        />
        {jsonInput && (
          <button 
            onClick={() => {
              setJsonInput('');
              setImportedLeads(null);
              setSelectedFileNames([]);
              setImportWarning(null);
              setFilterMode('all');
            }}
            className="absolute top-2 right-2 p-1.5 hover:bg-white/10 rounded-lg text-white/40 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400 p-3 bg-red-500/10 border border-red-500/20 rounded-lg shrink-0">{error}</p>
      )}

      {importWarning && (
        <p className="text-sm text-amber-300 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg shrink-0">
          {importWarning}
        </p>
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
