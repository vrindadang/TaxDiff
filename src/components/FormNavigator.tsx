import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, FileText } from 'lucide-react';
import { RULE_NAVIGATOR, FORM_NAVIGATOR } from '@/constants/navigator';
import { extractByPage } from '@/services/pdfExtractor';

interface NavigatorEntry {
  label: string;
  oldLabel?: string;
  oldPage: number | null;
  newPage: number | null;
  description?: string;
}

interface Props {
  onUseAsOld: (text: string, no: string) => void;
  onUseAsNew: (text: string, no: string) => void;
  onSelectMapping?: (oldNo: string, newNo: string) => void;
  filterType?: 'rule' | 'form';
  mode?: 'dynamic' | 'static';
}

export default function FormNavigator({ onUseAsOld, onUseAsNew, onSelectMapping, filterType = 'form', mode = 'dynamic' }: Props) {
  const [entries, setEntries] = useState<NavigatorEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEntries();
    window.addEventListener('storage_updated', loadEntries);
    return () => window.removeEventListener('storage_updated', loadEntries);
  }, [filterType, mode]);

  const loadEntries = () => {
    if (mode === 'static') {
      const mapping = filterType === 'form' ? FORM_NAVIGATOR : RULE_NAVIGATOR;
      const staticEntries: NavigatorEntry[] = Object.entries(mapping).map(([newNo, oldNo]) => ({
        label: newNo,
        oldLabel: oldNo,
        newPage: null,
        oldPage: null,
        description: `Static mapping for ${filterType === 'form' ? 'Form' : 'Rule'} ${newNo} to ${oldNo}`
      }));
      setEntries(staticEntries);
      return;
    }

    const key = filterType === 'form' ? 'taxdiff_navigator' : 'taxdiff_rules_navigator';
    const data = localStorage.getItem(key);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        setEntries(parsed.links || []);
      } catch {
        setEntries([]);
      }
    } else {
      setEntries([]);
    }
  };

  const handleUse = async (entry: NavigatorEntry, side: 'old' | 'new') => {
    setLoading(true);
    try {
      const libKey = side === 'old' 
        ? (filterType === 'form' ? 'taxdiff_old_forms' : 'taxdiff_old_rules')
        : (filterType === 'form' ? 'taxdiff_new_forms' : 'taxdiff_new_rules');
      
      const libData = localStorage.getItem(libKey);
      if (!libData) {
        alert(`Please upload the ${side.toUpperCase()} ${filterType.toUpperCase()}S PDF in Library Setup first.`);
        return;
      }

      const parsedLib = JSON.parse(libData);
      const page = side === 'old' ? entry.oldPage : entry.newPage;
      const label = side === 'old' ? entry.oldLabel : entry.label;

      if (!label) {
        alert("Label not found in navigator mapping.");
        return;
      }

      // If we don't have a page number (e.g., static mode), we can't extract by page.
      // We have to rely on the user to use the Quick Search in Compare tab, which uses detectAndExtract.
      if (!page) {
        alert(`Static mode doesn't have page numbers. Please use the Quick Search in the Compare tab for ${filterType} ${label}.`);
        return;
      }

      const result = extractByPage(parsedLib.pageTexts || [], page, filterType);
      if (result) {
        if (side === 'old') onUseAsOld(result.text, label);
        else onUseAsNew(result.text, label);
      } else {
        alert("Failed to extract text from specified page.");
      }
    } catch (error) {
      console.error("Extraction error:", error);
    } finally {
      setLoading(false);
    }
  };


  const filtered = entries.filter(e => 
    e.label.toLowerCase().includes(search.toLowerCase()) ||
    e.oldLabel?.toLowerCase().includes(search.toLowerCase()) ||
    e.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (entries.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center text-center space-y-4">
        <div className="p-4 bg-neutral-50 rounded-full">
          <FileText className="w-8 h-8 text-neutral-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-neutral-900">No Navigator Data</h3>
          <p className="text-neutral-500 max-w-md mt-1">
            Upload the {filterType === 'form' ? 'Forms' : 'Rules'} Navigator PDF in the Library Setup tab to enable dynamic mapping.
          </p>
        </div>
        <button 
          onClick={() => window.dispatchEvent(new CustomEvent('change_tab', { detail: 'library' }))}
          className="btn-primary"
        >
          Go to Library Setup
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
        <input 
          type="text"
          placeholder={`Search ${filterType}s by number or description...`}
          className="input-base pl-12 h-14 text-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              <th className="px-6 py-4 font-semibold text-neutral-700">New {filterType === 'form' ? 'Form' : 'Rule'}</th>
              <th className="px-6 py-4 font-semibold text-neutral-700">Old {filterType === 'form' ? 'Form' : 'Rule'}</th>
              <th className="px-6 py-4 font-semibold text-neutral-700">Description</th>
              <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map((entry, idx) => (
              <tr key={idx} className="hover:bg-neutral-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-700">{entry.label}</span>
                    <span className="text-xs text-neutral-400 font-mono">p.{entry.newPage}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-neutral-700">{entry.oldLabel || "—"}</span>
                    {entry.oldPage && <span className="text-xs text-neutral-400 font-mono">p.{entry.oldPage}</span>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-neutral-600 line-clamp-1">{entry.description || "No description available"}</p>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button 
                      onClick={() => handleUse(entry, 'old')}
                      className="px-3 py-1.5 text-xs font-semibold bg-neutral-100 text-neutral-700 rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                      Use as OLD
                    </button>
                    <button 
                      onClick={() => handleUse(entry, 'new')}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors"
                    >
                      Use as NEW
                    </button>
                    {onSelectMapping && entry.oldLabel && (
                      <button 
                        onClick={() => onSelectMapping(entry.oldLabel!, entry.label)}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Map & Compare"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-4">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <span className="font-semibold text-neutral-900">Extracting from library...</span>
          </div>
        </div>
      )}
    </div>
  );
}
