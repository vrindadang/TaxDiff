import React, { useState, useEffect } from 'react';
import { 
  Library, 
  FileText, 
  ArrowRightLeft, 
  History as HistoryIcon, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Download, 
  Copy, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  BookOpen,
  Scale
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import LibrarySetup from '@/components/LibrarySetup';
import FormNavigator from '@/components/FormNavigator';
import { analyzeTaxForms, TaxAnalysisInput } from '@/services/geminiService';
import { detectAndExtract } from '@/services/pdfExtractor';
import { generateAnalysisPDF } from '@/services/pdfGenerator';
import { RULE_NAVIGATOR, FORM_NAVIGATOR } from '@/constants/navigator';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'library' | 'rules' | 'forms' | 'compare' | 'history';

interface AnalysisHistory {
  id: string;
  date: string;
  oldFormNo: string;
  newFormNo: string;
  report: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('compare');
  const [input, setInput] = useState<TaxAnalysisInput>({
    oldRuleText: '',
    oldFormText: '',
    newRuleText: '',
    newFormText: '',
    oldRuleNo: '',
    oldFormNo: '',
    newRuleNo: '',
    newFormNo: '',
    oldSection: '',
    newSection: '',
    selectedSections: [
      'SECTION 1', 'SECTION 2', 'SECTION 3', 
      'SECTION 4', 'SECTION 5', 'SECTION 6'
    ]
  });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalysisHistory[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<Record<string, boolean>>({});
  const [previews, setPreviews] = useState<Record<string, { status: string; type: 'success' | 'warning' | 'idle' }>>({
    old: { status: 'Ready to extract', type: 'idle' },
    new: { status: 'Ready to extract', type: 'idle' }
  });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ old: true, new: true });
  const [autoMap, setAutoMap] = useState(true);
  const [navigatorMode, setNavigatorMode] = useState<'dynamic' | 'static'>('dynamic');

  useEffect(() => {
    const handleTabChange = (e: any) => setActiveTab(e.detail);
    window.addEventListener('change_tab', handleTabChange);
    
    loadLibraryStatus();
    loadHistory();
    
    window.addEventListener('storage_updated', loadLibraryStatus);
    return () => {
      window.removeEventListener('change_tab', handleTabChange);
      window.removeEventListener('storage_updated', loadLibraryStatus);
    };
  }, []);

  const loadLibraryStatus = () => {
    const status: Record<string, boolean> = {};
    ['old_rules', 'old_forms', 'new_rules', 'new_forms', 'navigator', 'rules_navigator'].forEach(key => {
      status[key] = !!localStorage.getItem(`taxdiff_${key}`);
    });
    setLibraryStatus(status);
  };

  const loadHistory = () => {
    const data = localStorage.getItem('taxdiff_history');
    if (data) {
      try {
        setHistory(JSON.parse(data));
      } catch {
        setHistory([]);
      }
    }
  };

  const saveToHistory = (newReport: string) => {
    const entry: AnalysisHistory = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      oldFormNo: input.oldFormNo,
      newFormNo: input.newFormNo,
      report: newReport
    };
    const newHistory = [entry, ...history].slice(0, 10);
    setHistory(newHistory);
    localStorage.setItem('taxdiff_history', JSON.stringify(newHistory));
  };

  const handleExtract = async (side: 'old' | 'new') => {
    const ruleNo = side === 'old' ? input.oldRuleNo : input.newRuleNo;
    const formNo = side === 'old' ? input.oldFormNo : input.newFormNo;

    if (!ruleNo && !formNo) {
      alert(`Please enter a Rule or Form number for the ${side.toUpperCase()} framework.`);
      return;
    }

    const ruleKey = side === 'old' ? 'taxdiff_old_rules' : 'taxdiff_new_rules';
    const formKey = side === 'old' ? 'taxdiff_old_forms' : 'taxdiff_new_forms';

    const ruleLib = localStorage.getItem(ruleKey);
    const formLib = localStorage.getItem(formKey);

    let ruleText = "";
    let formText = "";
    let statusMsg = "";
    let statusType: 'success' | 'warning' = 'success';

    if (ruleNo && ruleLib) {
      const parsed = JSON.parse(ruleLib);
      const result = detectAndExtract(parsed.text, ruleNo, 'rule');
      if (result) {
        ruleText = result.text;
        statusMsg += `Found Rule ${ruleNo} (${result.method}). `;
      } else {
        statusMsg += `Rule ${ruleNo} NOT found. `;
        statusType = 'warning';
      }
    }

    if (formNo && formLib) {
      const parsed = JSON.parse(formLib);
      const result = detectAndExtract(parsed.text, formNo, 'form');
      if (result) {
        formText = result.text;
        statusMsg += `Found Form ${formNo} (${result.method}). `;
      } else {
        statusMsg += `Form ${formNo} NOT found. `;
        statusType = 'warning';
      }
    }

    if (!ruleLib && ruleNo) statusMsg += "Rule PDF missing. ";
    if (!formLib && formNo) statusMsg += "Form PDF missing. ";

    setInput(prev => ({
      ...prev,
      [`${side}RuleText`]: ruleText || prev[`${side}RuleText` as keyof TaxAnalysisInput],
      [`${side}FormText`]: formText || prev[`${side}FormText` as keyof TaxAnalysisInput]
    }));

    setPreviews(prev => ({
      ...prev,
      [side]: { status: statusMsg.trim() || "Nothing extracted", type: statusType }
    }));
  };

  // Auto-map and Auto-extract logic
  useEffect(() => {
    if (!autoMap) return;

    const triggerExtraction = () => {
      setTimeout(() => {
        handleExtract('old');
        handleExtract('new');
      }, 150);
    };

    // Case 1: User entered New Form No, but Old Form No is empty
    if (input.newFormNo && !input.oldFormNo) {
      const oldNo = FORM_NAVIGATOR[input.newFormNo];
      if (oldNo) {
        setInput(prev => ({ ...prev, oldFormNo: oldNo }));
        triggerExtraction();
        return;
      }
    }

    // Case 2: User entered New Rule No, but Old Rule No is empty
    if (input.newRuleNo && !input.oldRuleNo) {
      const oldNo = RULE_NAVIGATOR[input.newRuleNo];
      if (oldNo) {
        setInput(prev => ({ ...prev, oldRuleNo: oldNo }));
        triggerExtraction();
        return;
      }
    }

    // Case 3: Both are entered (e.g. via Navigator), but text is missing
    const needsOld = (input.oldFormNo || input.oldRuleNo) && !input.oldFormText && !input.oldRuleText;
    const needsNew = (input.newFormNo || input.newRuleNo) && !input.newFormText && !input.newRuleText;
    
    if (needsOld || needsNew) {
      triggerExtraction();
    }
  }, [input.newFormNo, input.newRuleNo, input.oldFormNo, input.oldRuleNo, autoMap]);

  const handleAnalyze = async () => {
    if (input.selectedSections.length === 0) {
      setError("Please select at least one section for analysis.");
      return;
    }

    const hasOld = input.oldRuleText.trim().length > 100 || input.oldFormText.trim().length > 100;
    const hasNew = input.newRuleText.trim().length > 100 || input.newFormText.trim().length > 100;

    if (!hasOld || !hasNew) {
      const missing = (!hasOld && !hasNew) 
        ? "Both OLD and NEW framework texts are missing."
        : (!hasOld) ? "OLD framework text is missing." : "NEW framework text is missing.";

      setError(`${missing} Please click 'Extract from Library' for both sides or ensure the PDFs are uploaded in the Library Setup.`);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setReport(null);

    try {
      const result = await analyzeTaxForms(input);
      if (!result || result.trim() === "") {
        throw new Error("The analysis returned an empty report. Please check your inputs and selected sections.");
      }
      setReport(result);
      saveToHistory(result);
    } catch (e: any) {
      console.error("Analysis failed:", e);
      setError(e.message || "An error occurred during analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!report) return;
    generateAnalysisPDF({
      title: "TaxDiff Legal Analysis Report",
      subtitle: "Income Tax Act 1961 -> New Income Tax Act 2025",
      oldForm: `Form ${input.oldFormNo || "N/A"} / Rule ${input.oldRuleNo || "N/A"}`,
      newForm: `Form ${input.newFormNo || "N/A"} / Rule ${input.newRuleNo || "N/A"}`,
      content: report
    });
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(report);
    alert("Report copied to clipboard!");
  };

  const quickSearch = (val: string) => {
    const isRule = val.toLowerCase().includes('rule') || val.length > 3;
    if (isRule) {
      const no = val.replace(/rule\s*/i, '').trim();
      setInput(prev => ({ ...prev, newRuleNo: no, oldRuleNo: '', newFormNo: '', oldFormNo: '' }));
    } else {
      const no = val.replace(/form\s*/i, '').trim();
      setInput(prev => ({ ...prev, newFormNo: no, oldFormNo: '', newRuleNo: '', oldRuleNo: '' }));
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'library':
        return <LibrarySetup />;
      case 'rules':
        return (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-neutral-900">Rules Navigator</h2>
              <div className="flex bg-neutral-100 p-1 rounded-xl">
                <button 
                  onClick={() => setNavigatorMode('dynamic')}
                  className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-colors", navigatorMode === 'dynamic' ? "bg-white shadow-sm text-emerald-600" : "text-neutral-500 hover:text-neutral-700")}
                >
                  Dynamic (PDF)
                </button>
                <button 
                  onClick={() => setNavigatorMode('static')}
                  className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-colors", navigatorMode === 'static' ? "bg-white shadow-sm text-emerald-600" : "text-neutral-500 hover:text-neutral-700")}
                >
                  Static (Built-in)
                </button>
              </div>
            </div>
            <FormNavigator 
              filterType="rule"
              mode={navigatorMode}
              onUseAsOld={(text, no) => { setInput(p => ({ ...p, oldRuleText: text, oldRuleNo: no })); setActiveTab('compare'); }}
              onUseAsNew={(text, no) => { setInput(p => ({ ...p, newRuleText: text, newRuleNo: no })); setActiveTab('compare'); }}
              onSelectMapping={(oldNo, newNo) => { setInput(p => ({ ...p, oldRuleNo: oldNo, newRuleNo: newNo })); setActiveTab('compare'); }}
            />
          </div>
        );
      case 'forms':
        return (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-neutral-900">Forms Navigator</h2>
              <div className="flex bg-neutral-100 p-1 rounded-xl">
                <button 
                  onClick={() => setNavigatorMode('dynamic')}
                  className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-colors", navigatorMode === 'dynamic' ? "bg-white shadow-sm text-emerald-600" : "text-neutral-500 hover:text-neutral-700")}
                >
                  Dynamic (PDF)
                </button>
                <button 
                  onClick={() => setNavigatorMode('static')}
                  className={cn("px-4 py-1.5 text-sm font-medium rounded-lg transition-colors", navigatorMode === 'static' ? "bg-white shadow-sm text-emerald-600" : "text-neutral-500 hover:text-neutral-700")}
                >
                  Static (Built-in)
                </button>
              </div>
            </div>
            <FormNavigator 
              filterType="form"
              mode={navigatorMode}
              onUseAsOld={(text, no) => { setInput(p => ({ ...p, oldFormText: text, oldFormNo: no })); setActiveTab('compare'); }}
              onUseAsNew={(text, no) => { setInput(p => ({ ...p, newFormText: text, newFormNo: no })); setActiveTab('compare'); }}
              onSelectMapping={(oldNo, newNo) => { setInput(p => ({ ...p, oldFormNo: oldNo, newFormNo: newNo })); setActiveTab('compare'); }}
            />
          </div>
        );
      case 'history':
        return (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-neutral-900">Analysis History</h2>
            {history.length === 0 ? (
              <div className="card p-12 text-center text-neutral-500">No analysis reports found in history.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {history.map(h => (
                  <div key={h.id} className="card hover:border-emerald-200 transition-all cursor-pointer group" onClick={() => { setReport(h.report); setInput(p => ({ ...p, oldFormNo: h.oldFormNo, newFormNo: h.newFormNo })); setActiveTab('compare'); }}>
                    <div className="p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-600 font-bold">
                          <span>Form {h.oldFormNo}</span>
                          <ArrowRightLeft className="w-4 h-4" />
                          <span>Form {h.newFormNo}</span>
                        </div>
                        <span className="text-xs text-neutral-400">{new Date(h.date).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-neutral-500 line-clamp-3 italic">"{h.report.substring(0, 200)}..."</p>
                      <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                        View Full Report <ExternalLink className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'compare':
        return (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Quick Search */}
            <div className="card bg-gradient-to-br from-emerald-600 to-emerald-800 p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
              <div className="relative z-10 space-y-4">
                <h2 className="text-2xl font-bold">Quick Navigator Search</h2>
                <div className="relative max-w-2xl">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-200" />
                  <input 
                    type="text"
                    placeholder="Enter New Rule or Form number (e.g. 'Rule 128' or 'Form 10E')..."
                    className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-lg placeholder:text-emerald-100/50 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all backdrop-blur-sm"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') quickSearch((e.target as HTMLInputElement).value);
                    }}
                  />
                </div>
                <p className="text-emerald-100/70 text-sm">Press Enter to auto-map and extract from library.</p>
              </div>
            </div>

            {/* Library Status Bar */}
            <div className="flex items-center justify-between bg-neutral-100/50 p-4 rounded-2xl border border-neutral-200">
              <div className="flex items-center gap-6">
                <span className="text-sm font-semibold text-neutral-500 uppercase tracking-wider">Library Status:</span>
                <div className="flex gap-4">
                  {['old_rules', 'old_forms', 'new_rules', 'new_forms'].map(k => (
                    <div key={k} className="flex items-center gap-2" title={k.replace('_', ' ').toUpperCase()}>
                      <div className={cn("w-3 h-3 rounded-full", libraryStatus[k] ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-neutral-300")} />
                      <span className="text-xs font-bold text-neutral-600">{k.split('_').map(w => w[0]).join('').toUpperCase()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => setActiveTab('library')} className="text-sm text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1">
                <Library className="w-4 h-4" />
                Library Setup
              </button>
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* OLD FRAMEWORK */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                    <Scale className="w-5 h-5 text-neutral-400" />
                    OLD FRAMEWORK (1961/1962)
                  </h3>
                  <button onClick={() => setExpanded(e => ({ ...e, old: !e.old }))} className="p-1 hover:bg-neutral-100 rounded-lg transition-colors">
                    {expanded.old ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
                <div className="card p-6 space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-500 uppercase">Rule No.</label>
                      <input type="text" value={input.oldRuleNo} onChange={e => setInput(p => ({ ...p, oldRuleNo: e.target.value }))} className="input-base" placeholder="e.g. 128" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-500 uppercase">Form No.</label>
                      <input type="text" value={input.oldFormNo} onChange={e => setInput(p => ({ ...p, oldFormNo: e.target.value }))} className="input-base" placeholder="e.g. 67" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-500 uppercase">Section</label>
                      <input type="text" value={input.oldSection} onChange={e => setInput(p => ({ ...p, oldSection: e.target.value }))} className="input-base" placeholder="e.g. 91" />
                    </div>
                  </div>
                  <button onClick={() => handleExtract('old')} className="w-full btn-secondary py-3 flex items-center justify-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Extract from Library
                  </button>
                  <div className={cn(
                    "p-3 rounded-xl text-xs font-medium flex items-center gap-2",
                    previews.old.type === 'success' ? "bg-emerald-50 text-emerald-700" : 
                    previews.old.type === 'warning' ? "bg-amber-50 text-amber-700" : "bg-neutral-50 text-neutral-500"
                  )}>
                    {previews.old.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {previews.old.status}
                  </div>
                  <AnimatePresence>
                    {expanded.old && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Rule Text</label>
                        {!input.oldRuleText && input.oldRuleNo && <span className="text-[10px] text-amber-600 font-bold animate-pulse">TEXT MISSING</span>}
                      </div>
                      <textarea value={input.oldRuleText} onChange={e => setInput(p => ({ ...p, oldRuleText: e.target.value }))} className="input-base h-32 font-mono text-xs resize-none" placeholder="Paste or extract rule text..." />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Form Text</label>
                        {!input.oldFormText && input.oldFormNo && <span className="text-[10px] text-amber-600 font-bold animate-pulse">TEXT MISSING</span>}
                      </div>
                      <textarea value={input.oldFormText} onChange={e => setInput(p => ({ ...p, oldFormText: e.target.value }))} className="input-base h-48 font-mono text-xs resize-none" placeholder="Paste or extract form text..." />
                    </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* NEW FRAMEWORK */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                    <Scale className="w-5 h-5 text-emerald-600" />
                    NEW FRAMEWORK (2025/2026)
                  </h3>
                  <button onClick={() => setExpanded(e => ({ ...e, new: !e.new }))} className="p-1 hover:bg-neutral-100 rounded-lg transition-colors">
                    {expanded.new ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
                <div className="card p-6 space-y-6 border-emerald-100 bg-emerald-50/10">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-500 uppercase">Rule No.</label>
                      <input type="text" value={input.newRuleNo} onChange={e => setInput(p => ({ ...p, newRuleNo: e.target.value }))} className="input-base" placeholder="e.g. 76" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-500 uppercase">Form No.</label>
                      <input type="text" value={input.newFormNo} onChange={e => setInput(p => ({ ...p, newFormNo: e.target.value }))} className="input-base" placeholder="e.g. 44" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-500 uppercase">Section</label>
                      <input type="text" value={input.newSection} onChange={e => setInput(p => ({ ...p, newSection: e.target.value }))} className="input-base" placeholder="e.g. 112" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <button onClick={() => handleExtract('new')} className="flex-1 btn-primary py-3 flex items-center justify-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Extract from Library
                    </button>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input type="checkbox" checked={autoMap} onChange={e => setAutoMap(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
                      <span className="text-xs font-bold text-neutral-600 uppercase">Auto-map</span>
                    </label>
                  </div>
                  <div className={cn(
                    "p-3 rounded-xl text-xs font-medium flex items-center gap-2",
                    previews.new.type === 'success' ? "bg-emerald-50 text-emerald-700" : 
                    previews.new.type === 'warning' ? "bg-amber-50 text-amber-700" : "bg-neutral-50 text-neutral-500"
                  )}>
                    {previews.new.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {previews.new.status}
                  </div>
                  <AnimatePresence>
                    {expanded.new && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-4 overflow-hidden">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Rule Text</label>
                        {!input.newRuleText && input.newRuleNo && <span className="text-[10px] text-amber-600 font-bold animate-pulse">TEXT MISSING</span>}
                      </div>
                      <textarea value={input.newRuleText} onChange={e => setInput(p => ({ ...p, newRuleText: e.target.value }))} className="input-base h-32 font-mono text-xs resize-none" placeholder="Paste or extract rule text..." />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-neutral-500 uppercase">Form Text</label>
                        {!input.newFormText && input.newFormNo && <span className="text-[10px] text-amber-600 font-bold animate-pulse">TEXT MISSING</span>}
                      </div>
                      <textarea value={input.newFormText} onChange={e => setInput(p => ({ ...p, newFormText: e.target.value }))} className="input-base h-48 font-mono text-xs resize-none" placeholder="Paste or extract form text..." />
                    </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Analysis Options */}
            <div className="card p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { id: 'SECTION 1', label: 'Identity Card' },
                  { id: 'SECTION 2', label: 'Track Changes' },
                  { id: 'SECTION 3', label: 'Categorised Analysis' },
                  { id: 'SECTION 4', label: 'System Impact' },
                  { id: 'SECTION 5', label: 'Risk Flags' },
                  { id: 'SECTION 6', label: 'Executive Summary' }
                ].map(s => (
                  <label key={s.id} className="flex items-center gap-2 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      checked={input.selectedSections.includes(s.id)} 
                      onChange={e => {
                        const next = e.target.checked 
                          ? [...input.selectedSections, s.id]
                          : input.selectedSections.filter(x => x !== s.id);
                        setInput(p => ({ ...p, selectedSections: next }));
                      }}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    <span className="text-xs font-bold text-neutral-600 uppercase group-hover:text-emerald-600 transition-colors">
                      {s.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex justify-center">
              <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="btn-primary px-12 py-4 text-lg shadow-xl shadow-emerald-500/20 flex items-center gap-3"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Analyzing Legal Frameworks...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-6 h-6" />
                    Generate Comparative Analysis
                  </>
                )}
              </button>
            </div>

            {/* Report Area */}
            <div className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-center gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5" />
                  <p className="font-medium">{error}</p>
                </div>
              )}

              {report ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-bold text-neutral-900">Analysis Report</h3>
                    <div className="flex gap-3">
                      <button onClick={handleCopy} className="btn-secondary py-2 flex items-center gap-2">
                        <Copy className="w-4 h-4" />
                        Copy
                      </button>
                      <button onClick={handleDownloadPDF} className="btn-primary py-2 flex items-center gap-2">
                        <Download className="w-4 h-4" />
                        Download PDF
                      </button>
                    </div>
                  </div>
                  <div className="card p-8 markdown-body">
                    <ReactMarkdown>{report}</ReactMarkdown>
                  </div>
                </div>
              ) : !isAnalyzing && (
                <div className="card p-24 flex flex-col items-center text-center space-y-6 opacity-50">
                  <div className="p-6 bg-neutral-50 rounded-full">
                    <ArrowRightLeft className="w-12 h-12 text-neutral-300" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-neutral-400">Ready for Analysis</h3>
                    <p className="text-neutral-400 max-w-sm mt-2">
                      Select rules and forms from the library or paste text manually to begin deep comparative analysis.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <Scale className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-neutral-900">TaxDiff <span className="text-emerald-600">Analyst</span></h1>
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Legal Intelligence Tool</p>
            </div>
          </div>

          <nav className="bg-neutral-100 p-1.5 rounded-2xl flex gap-1">
            {[
              { id: 'library', label: 'Library Setup', icon: Library },
              { id: 'rules', label: 'Rules Navigator', icon: FileText },
              { id: 'forms', label: 'Forms Navigator', icon: FileText },
              { id: 'compare', label: 'Compare Forms', icon: ArrowRightLeft },
              { id: 'history', label: 'History', icon: HistoryIcon },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as Tab)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all",
                  activeTab === t.id 
                    ? "bg-white text-emerald-600 shadow-sm" 
                    : "text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50"
                )}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-12 w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 pb-12 w-full">
        <div className="card bg-neutral-900 text-white p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-emerald-500">Analysis Rules</h4>
              <ul className="space-y-2 text-sm text-neutral-400">
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  Never assume changes are cosmetic
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  Always cite old section equivalents
                </li>
                <li className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  Flag concepts present in old but absent in new
                </li>
              </ul>
            </div>
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-emerald-500">Expert Review</h4>
              <p className="text-sm text-neutral-400 leading-relaxed">
                All AI-generated reports must be reviewed by a qualified tax professional. 
                Look for the <span className="text-amber-500 font-bold">[NEEDS EXPERT REVIEW]</span> flag for high-risk or ambiguous changes.
              </p>
            </div>
            <div className="flex flex-col items-end justify-between">
              <div className="text-right">
                <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest">Powered by</p>
                <p className="text-xl font-black text-white">Gemini 2.0 Flash</p>
              </div>
              <p className="text-[10px] text-neutral-600 font-medium">© 2026 TaxDiff Analyst. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
