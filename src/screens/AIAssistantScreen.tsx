import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type KnowledgeBase, type AiSearchHistory, type Machine } from '@/lib/supabase';
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import { safeUrl } from '@/lib/safeUrl';
import {
  Search, Sparkles, BookOpen, Video, FileText, Wrench, Bookmark, BookmarkCheck,
  ExternalLink, Trash2, Cog, Filter, BookMarked, Lightbulb, X, Send, History, RotateCw,
  TrendingUp, Zap,
} from 'lucide-react';

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source_type: string;
};

type AIResponse = {
  query: string;
  answer: string;
  results: SearchResult[];
};

const sourceTypeMeta: Record<string, { label: string; icon: typeof FileText; color: string; bg: string }> = {
  manual: { label: 'Manual', icon: FileText, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  video: { label: 'Vídeo', icon: Video, color: 'text-rose-400', bg: 'bg-rose-500/10' },
  article: { label: 'Artigo', icon: BookOpen, color: 'text-sky-400', bg: 'bg-sky-500/10' },
  procedure: { label: 'Procedimento', icon: Wrench, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  other: { label: 'Recurso', icon: BookMarked, color: 'text-slate-400', bg: 'bg-slate-500/10' },
};

const quickSuggestions = [
  'Como regular prensa pneumática',
  'Manutenção preventiva compressor de ar',
  'Troca de óleo hidráulico',
  'Alinhamento de eixo cardan',
  'Calibração de sensor de temperatura',
];

const liveSuggestions = [
  'Como regular prensa pneumática',
  'Manutenção preventiva compressor de ar',
  'Troca de óleo hidráulico',
  'Alinhamento de eixo cardan',
  'Calibração de sensor de temperatura',
  'Diagnóstico de vibração excessiva',
  'Procedimento de troca de filtro',
  'Ajuste de pressão hidráulica',
  'Inspeção de correias transportadoras',
  'Lubrificação de rolamentos industriais',
  'Sintoma: máquina não liga',
  'Sintoma: superaquecimento do motor',
  'Sintoma: vazamento de óleo',
  'Sintoma: ruído anômalo',
  'Como criar ordem de serviço',
  'Como ver indicadores de produção',
  'Como finalizar uma OS',
];

export default function AIAssistantScreen() {
  const { activeCompany, activeRole } = useAuth();
  const cid = activeCompany?.id;
  const [machines, setMachines] = useState<Machine[]>([]);
  const [query, setQuery] = useState('');
  const [selectedMachine, setSelectedMachine] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [searchError, setSearchError] = useState('');
  const [saved, setSaved] = useState<KnowledgeBase[]>([]);
  const [savedFilter, setSavedFilter] = useState('');
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [savingResult, setSavingResult] = useState<SearchResult | null>(null);
  const [saveForm, setSaveForm] = useState({ title: '', content: '', tags: '' });
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<AiSearchHistory[]>([]);
  const [activeTab, setActiveTab] = useState<'search' | 'saved' | 'history'>('search');
  const [liveResults, setLiveResults] = useState<string[]>([]);
  const [liveIndex, setLiveIndex] = useState(-1);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!cid) return;
    (async () => {
      const { data } = await supabase.from('machines').select('*').eq('company_id', cid).order('name');
      setMachines(data ?? []);
    })();
  }, [cid]);

  const loadSaved = async () => {
    if (!cid) return;
    const { data } = await supabase.from('knowledge_base')
      .select('*').eq('company_id', cid).order('created_at', { ascending: false });
    setSaved(data ?? []);
  };

  useEffect(() => { loadSaved(); loadHistory(); }, [cid]);

  const loadHistory = async () => {
    if (!cid) return;
    const { data } = await supabase.from('ai_search_history')
      .select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(50);
    setHistory(data ?? []);
  };

  const machine = machines.find((m) => m.id === selectedMachine);

  // Live predictive suggestions as user types
  useEffect(() => {
    if (liveSearchRef.current) clearTimeout(liveSearchRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setLiveResults([]);
      setLiveIndex(-1);
      return;
    }
    liveSearchRef.current = setTimeout(() => {
      const q = query.toLowerCase().trim();
      const matched = liveSuggestions.filter(s =>
        s.toLowerCase().includes(q) || q.includes(s.toLowerCase().split(' ')[0])
      ).slice(0, 6);
      // Also match machine names
      machines.forEach(m => {
        if (m.name.toLowerCase().includes(q) && matched.length < 8) {
          matched.push(`Informações sobre ${m.name}`);
        }
      });
      setLiveResults(matched.slice(0, 8));
      setLiveIndex(-1);
    }, 200);
  }, [query, machines]);

  // Debounced live search — fires automatically after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 3) {
      if (hasSearched) setAiResponse(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      doSearch(true);
    }, 900);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, selectedMachine]);

  const doSearch = async (isLive = false) => {
    if (!query.trim() || !cid) return;
    setSearching(true);
    setSearchError('');
    if (!isLive) setAiResponse(null);
    setHasSearched(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query.trim(),
          machine_name: machine?.name,
          machine_model: machine?.code,
          machine_manufacturer: machine?.sector,
        }),
      });
      if (!response.ok) throw new Error(`Busca falhou (${response.status})`);
      const data: AIResponse = await response.json();
      if (!data.results) throw new Error('Resposta inválida da IA');
      setAiResponse(data);
      const { error: histErr } = await supabase.from('ai_search_history').insert({
        company_id: cid,
        machine_id: selectedMachine || null,
        query: query.trim(),
        results_count: data.results.length,
      });
      if (histErr) console.error('ai_search_history insert failed', histErr);
      loadHistory();
    } catch (err) {
      setSearchError((err as Error).message);
    }
    setSearching(false);
  };

  const openSaveModal = (result: SearchResult) => {
    setSavingResult(result);
    setSaveForm({ title: result.title, content: result.snippet, tags: '' });
    setSaveModalOpen(true);
  };

  const saveKnowledge = async () => {
    if (!cid || !savingResult || !saveForm.title) return;
    setSaving(true);
    const tags = saveForm.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const { error: kbErr } = await supabase.from('knowledge_base').insert({
      company_id: cid,
      machine_id: selectedMachine || null,
      query: query,
      title: saveForm.title,
      content: saveForm.content,
      source_url: savingResult.url,
      source_type: savingResult.source_type,
      tags,
    });
    if (kbErr) { alert('Erro ao salvar conhecimento: ' + kbErr.message); setSaving(false); return; }
    setSaving(false);
    setSaveModalOpen(false);
    setSavingResult(null);
    loadSaved();
  };

  const removeSaved = async (item: KnowledgeBase) => {
    if (!confirm(`Excluir "${item.title}"?`)) return;
    const { error: delErr } = await supabase.from('knowledge_base').delete().eq('id', item.id);
    if (delErr) { alert('Erro ao excluir: ' + delErr.message); return; }
    loadSaved();
  };

  const removeHistory = async (item: AiSearchHistory) => {
    const { error: delErr } = await supabase.from('ai_search_history').delete().eq('id', item.id);
    if (delErr) { alert('Erro ao excluir histórico: ' + delErr.message); return; }
    loadHistory();
  };

  const repeatSearch = (item: AiSearchHistory) => {
    setQuery(item.query);
    if (item.machine_id) setSelectedMachine(item.machine_id);
    setActiveTab('search');
    setTimeout(() => doSearch(), 100);
  };

  const isSaved = (url: string) => saved.some((s) => s.source_url === url);

  const filteredSaved = useMemo(() => {
    const q = savedFilter.toLowerCase();
    return saved.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      s.content.toLowerCase().includes(q) ||
      s.query.toLowerCase().includes(q) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(q)));
  }, [saved, savedFilter]);

  const canEdit = activeRole === 'ceo' || activeRole === 'gerente' || activeRole === 'mecanico';

  const pickLiveSuggestion = (s: string) => {
    setQuery(s);
    setLiveResults([]);
    setLiveIndex(-1);
  };

  return (
    <div className="relative z-10 h-[calc(100vh-13rem)] bg-slate-950 flex flex-col overflow-hidden rounded-2xl">
      {/* Animated background */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 flex flex-col gap-3 px-4 sm:px-8 py-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/30">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Assistente IA CLEVIA</h1>
            <p className="text-xs sm:text-sm text-slate-400 truncate">Pesquise manuais, vídeos e procedimentos — resultados em tempo real</p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1.5 bg-slate-800/60 rounded-xl p-1">
          <button onClick={() => setActiveTab('search')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${activeTab === 'search'
              ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
            <Search className="w-4 h-4" /> <span>Buscar</span>
          </button>
          <button onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${activeTab === 'history'
              ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
            <History className="w-4 h-4" /> <span>Histórico</span>
            {history.length > 0 && <span className="text-xs text-cyan-300">{history.length}</span>}
          </button>
          <button onClick={() => setActiveTab('saved')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${activeTab === 'saved'
              ? 'bg-cyan-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
            <BookmarkCheck className="w-4 h-4" /> <span>Salvos</span>
            {saved.length > 0 && <span className="text-xs text-cyan-300">{saved.length}</span>}
          </button>
        </div>
      </header>

      {/* Content area */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-8 py-6 sm:py-8">
        <div className="max-w-4xl mx-auto">
          {/* SEARCH TAB */}
          {activeTab === 'search' && (
            <div className="space-y-6">
              {/* Search bar — large, prominent */}
              <div className="relative">
                <div className="relative bg-slate-900/80 rounded-2xl border border-slate-700/80 shadow-2xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4 sm:p-5">
                    <Search className={`w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0 transition-colors ${query.trim() ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (liveIndex >= 0 && liveIndex < liveResults.length) {
                            pickLiveSuggestion(liveResults[liveIndex]);
                          } else {
                            doSearch();
                          }
                        } else if (e.key === 'ArrowDown' && liveResults.length > 0) {
                          e.preventDefault();
                          setLiveIndex(prev => Math.min(prev + 1, liveResults.length - 1));
                        } else if (e.key === 'ArrowUp' && liveResults.length > 0) {
                          e.preventDefault();
                          setLiveIndex(prev => Math.max(prev - 1, -1));
                        }
                      }}
                      placeholder="Digite sua pesquisa... ex: como regular prensa pneumática"
                      className="flex-1 bg-transparent text-lg sm:text-xl text-white placeholder-slate-500 focus:outline-none min-w-0"
                      autoFocus
                    />
                    {searching && <Spinner className="!w-6 !h-6 !border-2 !border-slate-700 !border-t-cyan-400 flex-shrink-0" />}
                    {query.trim() && !searching && (
                      <button onClick={() => { setQuery(''); setAiResponse(null); setHasSearched(false); setLiveResults([]); }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition flex-shrink-0">
                        <X className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  {/* Machine selector */}
                  <div className="px-4 sm:px-5 pb-4 sm:pb-5 flex items-center gap-3 flex-wrap">
                    <select
                      value={selectedMachine}
                      onChange={(e) => setSelectedMachine(e.target.value)}
                      className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-200 focus:outline-none focus:border-cyan-500 transition"
                    >
                      <option value="">Todas as máquinas</option>
                      {machines.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    {query.trim().length >= 3 && !searching && (
                      <span className="text-xs text-cyan-400 flex items-center gap-1 animate-pulse">
                        <Zap className="w-3.5 h-3.5" /> Buscando automaticamente...
                      </span>
                    )}
                  </div>
                </div>

                {/* Live predictive dropdown */}
                {liveResults.length > 0 && !aiResponse && !searching && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800/95 backdrop-blur-xl rounded-2xl border border-slate-700 shadow-2xl overflow-hidden z-20 animate-in">
                    {liveResults.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => pickLiveSuggestion(s)}
                        onMouseEnter={() => setLiveIndex(i)}
                        className={`w-full text-left px-4 sm:px-5 py-3 flex items-center gap-3 transition ${liveIndex === i ? 'bg-cyan-500/15' : 'hover:bg-slate-700/50'}`}
                      >
                        <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
                        <span className="text-base text-slate-200">{s}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick suggestions — only before first search */}
              {!hasSearched && !searching && (
                <div className="flex flex-wrap gap-2.5">
                  <span className="text-sm text-slate-400 flex items-center gap-1.5 w-full mb-1">
                    <Lightbulb className="w-4 h-4 text-amber-400" /> Sugestões rápidas:
                  </span>
                  {quickSuggestions.map((s) => (
                    <button key={s} onClick={() => setQuery(s)}
                      className="px-4 py-2.5 bg-slate-800/60 text-slate-300 text-sm rounded-xl hover:bg-cyan-500/15 hover:text-cyan-300 transition border border-slate-700/50">
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Error */}
              {searchError && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 text-base text-rose-400">
                  {searchError}
                </div>
              )}

              {/* AI Response */}
              {aiResponse && (
                <div className="space-y-5">
                  {/* Answer summary */}
                  <div className="bg-gradient-to-br from-cyan-500/10 to-sky-500/5 border border-cyan-500/30 rounded-2xl p-5 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center shrink-0">
                        <Sparkles className="w-6 h-6 text-cyan-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-cyan-300 text-base sm:text-lg mb-2">Resumo da IA</p>
                        <p className="text-base sm:text-lg text-slate-200 leading-relaxed">{aiResponse.answer}</p>
                      </div>
                    </div>
                  </div>

                  {/* Results */}
                  {aiResponse.results.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-base text-slate-400 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-cyan-400" />
                        {aiResponse.results.length} recurso(s) encontrado(s) {machine && `para ${machine.name}`}
                      </p>
                      {aiResponse.results.map((result, i) => {
                        const meta = sourceTypeMeta[result.source_type] ?? sourceTypeMeta.other;
                        const Icon = meta.icon;
                        const savedFlag = isSaved(result.url);
                        return (
                          <div key={i} className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4 sm:p-5 hover:border-slate-700 hover:shadow-lg transition">
                            <div className="flex items-start gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${meta.bg}`}>
                                <Icon className={`w-6 h-6 ${meta.color}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-100 text-base sm:text-lg">{result.title}</p>
                                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-medium ${meta.bg} ${meta.color} mt-1.5`}>{meta.label}</span>
                                  </div>
                                  {canEdit && (
                                    <button
                                      onClick={() => savedFlag ? null : openSaveModal(result)}
                                      disabled={savedFlag}
                                      className={`p-2.5 rounded-xl transition shrink-0 ${savedFlag
                                        ? 'text-emerald-400 cursor-default'
                                        : 'text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10'}`}
                                      title={savedFlag ? 'Já salvo' : 'Salvar conhecimento'}
                                    >
                                      {savedFlag ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
                                    </button>
                                  )}
                                </div>
                                <p className="text-sm sm:text-base text-slate-400 mt-2.5 leading-relaxed">{result.snippet}</p>
                                {safeUrl(result.url) && (
                                  <a href={safeUrl(result.url)} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-sm text-cyan-400 hover:underline mt-3">
                                    <ExternalLink className="w-4 h-4" /> Abrir recurso
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Loading state with skeleton */}
              {searching && !aiResponse && (
                <div className="space-y-4">
                  <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 animate-pulse">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 shrink-0" />
                      <div className="flex-1 space-y-3">
                        <div className="h-5 bg-slate-800 rounded w-1/3" />
                        <div className="h-4 bg-slate-800 rounded w-full" />
                        <div className="h-4 bg-slate-800 rounded w-4/5" />
                      </div>
                    </div>
                  </div>
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-slate-900/60 rounded-2xl border border-slate-800 p-5 animate-pulse">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-800 shrink-0" />
                        <div className="flex-1 space-y-2.5">
                          <div className="h-5 bg-slate-800 rounded w-2/3" />
                          <div className="h-4 bg-slate-800 rounded w-full" />
                          <div className="h-4 bg-slate-800 rounded w-1/2" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              {history.length === 0 ? (
                <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-12 sm:p-16">
                  <EmptyState icon={History} text="Nenhuma pesquisa realizada ainda. As buscas que você fizer aparecerão aqui como histórico." />
                </div>
              ) : (
                <>
                  <p className="text-base text-slate-400">
                    Últimas {history.length} pesquisa(s) realizadas pela equipe. Clique para refazer a busca.
                  </p>
                  {history.map((item) => {
                    const machineName = machines.find((m) => m.id === item.machine_id)?.name;
                    return (
                      <div key={item.id} className="bg-slate-900/80 rounded-2xl border border-slate-800 p-4 sm:p-5 hover:border-slate-700 transition group flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center shrink-0">
                          <History className="w-6 h-6 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => repeatSearch(item)}>
                          <p className="font-medium text-slate-100 text-base sm:text-lg truncate">{item.query}</p>
                          <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
                            {machineName && <span className="flex items-center gap-1"><Cog className="w-3.5 h-3.5" /> {machineName}</span>}
                            <span>{item.results_count} resultado(s)</span>
                            <span>{new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => repeatSearch(item)}
                            className="p-2.5 rounded-xl text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition" title="Refazer busca">
                            <RotateCw className="w-5 h-5" />
                          </button>
                          {canEdit && (
                            <button onClick={() => removeHistory(item)}
                              className="p-2.5 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition sm:opacity-0 sm:group-hover:opacity-100" title="Excluir do histórico">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {/* SAVED TAB */}
          {activeTab === 'saved' && (
            <div className="space-y-5">
              <div className="relative w-full sm:max-w-md">
                <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  value={savedFilter}
                  onChange={(e) => setSavedFilter(e.target.value)}
                  placeholder="Filtrar por título, conteúdo, tags..."
                  className="w-full pl-12 pr-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-base text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              {filteredSaved.length === 0 ? (
                <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-12 sm:p-16">
                  <EmptyState icon={BookmarkCheck} text={saved.length === 0 ? "Nenhum conhecimento salvo ainda. Faça uma busca e salve os recursos relevantes." : "Nenhum resultado para o filtro."} />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSaved.map((item) => {
                    const meta = sourceTypeMeta[item.source_type] ?? sourceTypeMeta.other;
                    const Icon = meta.icon;
                    const machineName = machines.find((m) => m.id === item.machine_id)?.name;
                    return (
                      <div key={item.id} className="bg-slate-900/80 rounded-2xl border border-slate-800 p-5 hover:border-slate-700 transition group">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${meta.bg}`}>
                              <Icon className={`w-5 h-5 ${meta.color}`} />
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${meta.bg} ${meta.color}`}>{meta.label}</span>
                          </div>
                          {canEdit && (
                            <button onClick={() => removeSaved(item)}
                              className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition sm:opacity-0 sm:group-hover:opacity-100">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="font-semibold text-slate-100 text-base">{item.title}</p>
                        <p className="text-sm text-slate-400 mt-1.5 line-clamp-3 leading-relaxed">{item.content}</p>
                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {item.tags.map((tag) => (
                              <span key={tag} className="px-2.5 py-0.5 bg-slate-800 text-slate-400 text-xs rounded-md">#{tag}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
                          {machineName && <span className="flex items-center gap-1"><Cog className="w-3.5 h-3.5" /> {machineName}</span>}
                          <span>{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                        </div>
                        {safeUrl(item.source_url) && (
                          <a href={safeUrl(item.source_url)} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-cyan-400 hover:underline mt-2.5">
                            <ExternalLink className="w-4 h-4" /> Abrir recurso original
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Save Modal */}
      {saveModalOpen && savingResult && (
        <Modal title="Salvar conhecimento" onClose={() => setSaveModalOpen(false)}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              {(() => {
                const meta = sourceTypeMeta[savingResult.source_type] ?? sourceTypeMeta.other;
                const Icon = meta.icon;
                return <><Icon className={`w-4 h-4 ${meta.color}`} /> {meta.label}</>
              })()}
            </div>
            <Field label="Título" required>
              <input value={saveForm.title} onChange={(e) => setSaveForm({ ...saveForm, title: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Conteúdo / Anotações">
              <textarea value={saveForm.content} onChange={(e) => setSaveForm({ ...saveForm, content: e.target.value })}
                rows={4} className={inputCls} placeholder="Adicione anotações sobre o procedimento, defeito, solução..." />
            </Field>
            <Field label="Tags (separadas por vírgula)">
              <input value={saveForm.tags} onChange={(e) => setSaveForm({ ...saveForm, tags: e.target.value })}
                className={inputCls} placeholder="ex: regulagem, pneumática, preventiva" />
            </Field>
            {machine && (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Cog className="w-3.5 h-3.5" /> Vinculado à máquina: {machine.name}
              </p>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setSaveModalOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                Cancelar
              </button>
              <button onClick={saveKnowledge} disabled={saving || !saveForm.title}
                className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
