import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { safeUrl } from '@/lib/safeUrl';
import {
  Sparkles, X, Send, Stethoscope, AlertTriangle, Wrench,
  ShieldAlert, ExternalLink, Search, Lightbulb, ChevronDown,
} from 'lucide-react';

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source_type: string;
};

type DiagnosisStep = { step: string; description: string };
type DiagnosisResult = {
  problem: string;
  possible_causes: string[];
  recommended_steps: DiagnosisStep[];
  warnings: string[];
  search_results: SearchResult[];
};

type ChatResult = {
  reply: string;
  suggestions: string[];
  search_results: SearchResult[];
  diagnosis: DiagnosisResult | null;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  searchResults?: SearchResult[];
  diagnosis?: DiagnosisResult | null;
};

export function FloatingAIAssistant() {
  const { activeCompany } = useAuth();
  const cid = activeCompany?.id;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDiagnosis, setShowDiagnosis] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'Olá! Sou seu Assistente de IA. Estou aqui para ajudar em qualquer tarefa — criar OS, diagnosticar problemas, buscar manuais, explicar como usar o sistema... É só perguntar!',
        suggestions: ['Como abrir uma OS?', 'Máquina vazando vapor', 'Como ver indicadores?', 'Como finalizar uma OS?'],
      }]);
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'chat', message: text, history }),
      });
      if (!response.ok) throw new Error(`Erro na IA (${response.status})`);
      const data: ChatResult = await response.json();

      const aiMsg: Message = {
        role: 'assistant',
        content: data.reply,
        suggestions: data.suggestions,
        searchResults: data.search_results,
        diagnosis: data.diagnosis,
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Save to search history
      if (cid) {
        const { error: histErr } = await supabase.from('ai_search_history').insert({
          company_id: cid,
          query: text,
          results_count: data.search_results?.length ?? 0,
        });
        if (histErr) console.error('ai_search_history insert failed', histErr);
      }
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `Desculpe, tive um problema ao processar sua mensagem: ${(err as Error).message}. Tente novamente.`,
      }]);
    }
    setLoading(false);
  };

  if (!cid) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-16 right-4 sm:bottom-20 sm:right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 shadow-lg shadow-cyan-500/30 flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all duration-300 group"
          aria-label="Abrir Assistente IA"
        >
          <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-20 group-hover:opacity-30" />
          <Sparkles className="w-6 h-6 relative z-10" />
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-slate-950 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
          </span>
        </button>
      )}

      {/* Chat panel — full screen like the AI Assistant screen */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 overflow-hidden animate-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-slate-800/80 bg-slate-900/50 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/30">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Assistente IA CLEVIA</h1>
                <p className="text-xs sm:text-sm text-slate-400 truncate flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" /> Online — pergunte sobre OS, máquinas, manuais e mais
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition shrink-0">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-950">
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[80%] sm:max-w-[70%] ${msg.role === 'user'
                  ? 'bg-gradient-to-br from-cyan-500 to-sky-600 text-white rounded-2xl rounded-br-md'
                  : 'bg-slate-800 text-slate-100 rounded-2xl rounded-bl-md border border-slate-700'
                } px-4 py-3 shadow-sm`}>
                  {/* Content */}
                  <p className="text-sm sm:text-base whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                  {/* Diagnosis (collapsible) */}
                  {msg.diagnosis && (
                    <div className="mt-3 border-t border-slate-200 dark:border-slate-700 pt-2">
                      <button
                        onClick={() => setShowDiagnosis((prev) => ({ ...prev, [i]: !prev[i] }))}
                        className="w-full flex items-center justify-between gap-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
                      >
                        <span className="flex items-center gap-1"><Stethoscope className="w-3.5 h-3.5" /> Ver diagnóstico detalhado</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDiagnosis[i] ? 'rotate-180' : ''}`} />
                      </button>
                      {showDiagnosis[i] && (
                        <div className="mt-2 space-y-2 text-xs">
                          {msg.diagnosis.possible_causes.length > 0 && (
                            <div>
                              <p className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 mb-1"><AlertTriangle className="w-3 h-3" /> Possíveis causas</p>
                              <ul className="space-y-0.5 ml-4 list-disc">
                                {msg.diagnosis.possible_causes.map((c, j) => <li key={j}>{c}</li>)}
                              </ul>
                            </div>
                          )}
                          {msg.diagnosis.recommended_steps.length > 0 && (
                            <div>
                              <p className="font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1 mb-1 mt-2"><Wrench className="w-3 h-3" /> Passos</p>
                              <ol className="space-y-0.5 ml-4 list-decimal">
                                {msg.diagnosis.recommended_steps.map((s, j) => <li key={j}>{s.description}</li>)}
                              </ol>
                            </div>
                          )}
                          {msg.diagnosis.warnings.length > 0 && (
                            <div>
                              <p className="font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 mb-1 mt-2"><ShieldAlert className="w-3 h-3" /> Segurança</p>
                              <ul className="space-y-0.5 ml-4 list-disc">
                                {msg.diagnosis.warnings.map((w, j) => <li key={j}>{w}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Search results */}
                  {msg.searchResults && msg.searchResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1"><Search className="w-3 h-3" /> Recursos:</p>
                      {msg.searchResults.map((r, j) => (
                        <a key={j} href={safeUrl(r.url)} target="_blank" rel="noreferrer"
                          className="flex items-start gap-1 text-xs text-cyan-600 dark:text-cyan-400 hover:underline">
                          <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
                          <span className="truncate">{r.title}</span>
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Suggestions */}
                  {msg.suggestions && msg.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.suggestions.map((s, j) => (
                        <button key={j} onClick={() => sendMessage(s)}
                          className="px-2.5 py-1 text-xs bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 rounded-lg hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition border border-cyan-200 dark:border-cyan-800">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-800 rounded-2xl rounded-bl-md border border-slate-700 px-4 py-3 shadow-sm">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-slate-800 bg-slate-900 shrink-0">
            <div className="flex gap-2 max-w-3xl mx-auto">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage(input)}
                placeholder="Pergunte qualquer coisa... ex: máquina vazando vapor"
                className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="px-3.5 py-2.5 bg-gradient-to-br from-cyan-500 to-sky-600 text-white rounded-xl hover:from-cyan-400 hover:to-sky-500 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-2 flex items-center gap-1 max-w-3xl mx-auto">
              <Lightbulb className="w-3 h-3" /> A IA pode ajudar com OS, diagnósticos, manuais, procedimentos e segurança.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
