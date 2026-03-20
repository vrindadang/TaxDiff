import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { RULE_NAVIGATOR, FORM_NAVIGATOR } from '@/constants/navigator';

interface Props {
  type: 'rule' | 'form';
  onSelect: (oldNo: string, newNo: string) => void;
}

export default function StaticReference({ type, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const navigator = type === 'rule' ? RULE_NAVIGATOR : FORM_NAVIGATOR;

  const entries = Object.entries(navigator).map(([newNo, oldNo]) => ({
    newNo,
    oldNo,
    description: `${type.toUpperCase()} ${newNo} (New) -> ${type.toUpperCase()} ${oldNo} (Old)`
  }));

  const filtered = entries.filter(e => 
    e.newNo.toLowerCase().includes(search.toLowerCase()) ||
    e.oldNo.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
        <input 
          type="text"
          placeholder={`Search static ${type} mapping...`}
          className="input-base pl-12 h-14 text-lg"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-neutral-50 border-b border-neutral-200">
              <th className="px-6 py-4 font-semibold text-neutral-700">New {type === 'form' ? 'Form' : 'Rule'} No.</th>
              <th className="px-6 py-4 font-semibold text-neutral-700">Old {type === 'form' ? 'Form' : 'Rule'} No.</th>
              <th className="px-6 py-4 font-semibold text-neutral-700">Description</th>
              <th className="px-6 py-4 font-semibold text-neutral-700 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map((entry, idx) => (
              <tr key={idx} className="hover:bg-neutral-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <span className="font-bold text-emerald-700">{entry.newNo}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="font-bold text-neutral-700">{entry.oldNo}</span>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-neutral-600">{entry.description}</p>
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => onSelect(entry.oldNo, entry.newNo)}
                    className="btn-primary py-1.5 px-4 text-xs flex items-center gap-2 ml-auto"
                  >
                    Select for Comparison
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
