import React, { useState, useEffect, useRef } from 'react';
import { Upload, CheckCircle, XCircle, Trash2, AlertTriangle, Loader2, FileText } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parseNavigatorTable } from '@/services/geminiService';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DocStatus {
  key: string;
  label: string;
  filename: string | null;
  pages: number | null;
  chars: number | null;
  savedAt: string | null;
  loading: boolean;
  progress: number;
}

const DOC_KEYS = [
  { key: 'old_rules', label: 'OLD RULES PDF (IT Rules 1962)' },
  { key: 'old_forms', label: 'OLD FORMS PDF (IT Forms 1962)' },
  { key: 'new_rules', label: 'NEW RULES PDF (IT Rules 2026)' },
  { key: 'new_forms', label: 'NEW FORMS PDF (IT Forms 2026)' },
  { key: 'navigator', label: 'NAVIGATOR (Forms Mapping)' },
  { key: 'rules_navigator', label: 'NAVIGATOR (Rules Mapping)' },
];

export default function LibrarySetup() {
  const [statuses, setStatuses] = useState<DocStatus[]>(
    DOC_KEYS.map(d => ({
      ...d,
      filename: null,
      pages: null,
      chars: null,
      savedAt: null,
      loading: false,
      progress: 0,
    }))
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    loadStatuses();
  }, []);

  const loadStatuses = () => {
    const newStatuses = statuses.map(s => {
      const data = localStorage.getItem(`taxdiff_${s.key}`);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          return {
            ...s,
            filename: parsed.filename,
            pages: parsed.pages,
            chars: parsed.chars,
            savedAt: parsed.savedAt,
          };
        } catch {
          return s;
        }
      }
      return s;
    });
    setStatuses(newStatuses);
  };

  const handleClear = (key: string) => {
    localStorage.removeItem(`taxdiff_${key}`);
    loadStatuses();
    window.dispatchEvent(new Event('storage_updated'));
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all documents?")) {
      DOC_KEYS.forEach(d => localStorage.removeItem(`taxdiff_${d.key}`));
      loadStatuses();
      window.dispatchEvent(new Event('storage_updated'));
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeKey) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a PDF file.");
      return;
    }

    setStatuses(prev => prev.map(s => s.key === activeKey ? { ...s, loading: true, progress: 0 } : s));

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const typedArray = new Uint8Array(reader.result as ArrayBuffer);
        const pdfjsLib = (window as any).pdfjsLib;
        const pdf = await pdfjsLib.getDocument(typedArray).promise;
        
        let fullText = "";
        const pageTexts: string[] = [];
        const numPages = pdf.numPages;

        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str);
          const pageText = strings.join(" ");
          pageTexts.push(pageText);
          fullText += pageText + "\n";
          
          setStatuses(prev => prev.map(s => s.key === activeKey ? { ...s, progress: Math.round((i / numPages) * 100) } : s));
        }

        // Browser localStorage limit check (approx 5MB)
        if (fullText.length > 400000) {
          alert("Document is too large for browser storage. Only the first 400,000 characters will be saved.");
          fullText = fullText.substring(0, 400000);
        }

        let links = null;
        if (activeKey === 'navigator' || activeKey === 'rules_navigator') {
          links = await parseNavigatorTable(fullText);
        }

        const docData = {
          text: fullText,
          pageTexts: (activeKey.includes('forms') || activeKey.includes('navigator')) ? pageTexts : undefined,
          filename: file.name,
          pages: numPages,
          chars: fullText.length,
          savedAt: new Date().toISOString(),
          links
        };

        try {
          localStorage.setItem(`taxdiff_${activeKey}`, JSON.stringify(docData));
          loadStatuses();
          window.dispatchEvent(new Event('storage_updated'));
        } catch {
          alert("Storage failed: Document exceeds browser's localStorage limit (usually 5-10MB). Try a smaller PDF.");
        } finally {
          setStatuses(prev => prev.map(s => s.key === activeKey ? { ...s, loading: false } : s));
          setActiveKey(null);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (error) {
      console.error("PDF processing error:", error);
      alert("Failed to process PDF.");
      setStatuses(prev => prev.map(s => s.key === activeKey ? { ...s, loading: false } : s));
      setActiveKey(null);
    }
  };

  const triggerUpload = (key: string) => {
    setActiveKey(key);
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {statuses.map(s => (
            <div key={s.key} className={cn(
              "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border",
              s.filename ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-neutral-100 text-neutral-500 border-neutral-200"
            )}>
              {s.filename ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {s.key.split('_').pop()?.toUpperCase()}
            </div>
          ))}
        </div>
        <button onClick={handleClearAll} className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1.5">
          <Trash2 className="w-4 h-4" />
          Clear All
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {statuses.map((s) => (
          <div key={s.key} className="card group relative">
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="p-3 bg-neutral-50 rounded-2xl group-hover:bg-emerald-50 transition-colors">
                  <FileText className={cn("w-6 h-6", s.filename ? "text-emerald-600" : "text-neutral-400")} />
                </div>
                {s.filename && (
                  <button onClick={() => handleClear(s.key)} className="p-2 text-neutral-400 hover:text-red-600 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-neutral-900 line-clamp-1">{s.label}</h3>
                <p className="text-xs text-neutral-500 mt-1">
                  {s.filename ? `Uploaded: ${new Date(s.savedAt!).toLocaleDateString()}` : "No document uploaded"}
                </p>
              </div>

              {s.loading ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-emerald-600 font-medium">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Extracting text...
                    </span>
                    <span>{s.progress}%</span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${s.progress}%` }} />
                  </div>
                </div>
              ) : s.filename ? (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="bg-neutral-50 p-2 rounded-xl text-center">
                    <div className="text-xs text-neutral-500 uppercase tracking-wider font-bold">Pages</div>
                    <div className="text-sm font-semibold text-neutral-900">{s.pages}</div>
                  </div>
                  <div className="bg-neutral-50 p-2 rounded-xl text-center">
                    <div className="text-xs text-neutral-500 uppercase tracking-wider font-bold">Chars</div>
                    <div className="text-sm font-semibold text-neutral-900">{(s.chars! / 1000).toFixed(1)}k</div>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => triggerUpload(s.key)}
                  className="w-full py-3 border-2 border-dashed border-neutral-200 rounded-2xl flex flex-col items-center gap-2 hover:border-emerald-300 hover:bg-emerald-50/50 transition-all text-neutral-400 hover:text-emerald-600"
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-sm font-medium">Upload PDF</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Storage Limitation Warning</p>
          <p className="mt-1 opacity-90">
            Documents are stored in your browser's <strong>localStorage</strong>. This is limited to ~5-10MB. 
            Large PDFs may fail to save. If you encounter issues, try uploading smaller PDF snippets or clearing existing documents.
          </p>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".pdf" 
        onChange={onFileChange} 
      />
    </div>
  );
}
