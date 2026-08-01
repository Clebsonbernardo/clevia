import { useState } from 'react';
import { supabase, type Machine } from '@/lib/supabase';
import { Spinner } from '@/components/ui';
import { safeUrl } from '@/lib/safeUrl';
import {
  Sparkles, Stethoscope, AlertTriangle, CheckCircle2, Lightbulb,
  ExternalLink, ChevronDown, ChevronUp, Wrench, ShieldAlert, Search,
} from 'lucide-react';

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  source_type: string;
};

type DiagnosisStep = {
  step: string;
  description: string;
};

type DiagnosisResult = {
  problem: string;
  possible_causes: string[];
  recommended_steps: DiagnosisStep[];
  warnings: string[];
  search_results: SearchResult[];
};

type MachineLite = Pick<Machine, 'id' | 'name' | 'code' | 'sector'>;

export function OSDiagnosticPanel({ workOrder, machine }: {
  workOrder: { id: string; description: string | null; machine_id: string | null };
  machine: MachineLite | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [error, setError] = useState('');

  const problemText = workOrder.description ?? '';

  const runDiagnosis = async () => {
    if (!problemText.trim()) return;
    setDiagnosing(true);
    setError('');
    setDiagnosis(null);
    setExpanded(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'diagnose',
          problem: problemText,
          machine_name: machine?.name,
          machine_model: machine?.code,
          machine_manufacturer: machine?.sector,
        }),
      });
      if (!response.ok) throw new Error(`Diagnóstico falhou (${response.status})`);
      const data: DiagnosisResult = await response.json();
      if (!data.recommended_steps) throw new Error('Resposta inválida da IA');
      setDiagnosis(data);
    } catch (err) {
      setError((err as Error).message);
    }
    setDiagnosing(false);
  };

  if (!problemText.trim()) {
    return null;
  }

  return (
    <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
      <button
        onClick={() => { setExpanded(!expanded); if (!diagnosis && !diagnosing) runDiagnosis(); }}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/20 border border-cyan-200 dark:border-cyan-800 hover:from-cyan-100 hover:to-sky-100 dark:hover:from-cyan-950/50 dark:hover:to-sky-950/30 transition"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
            <Stethoscope className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-200">Assistente de Diagnóstico IA</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">A IA sugere possíveis causas e passos para resolver</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-cyan-500" /> : <ChevronDown className="w-5 h-5 text-cyan-500" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {diagnosing && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Spinner className="!w-6 !h-6" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Analisando o problema e buscando soluções...</p>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          {diagnosis && (
            <>
              {/* Possible causes */}
              {diagnosis.possible_causes.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> Possíveis causas
                  </p>
                  <ul className="space-y-1.5">
                    {diagnosis.possible_causes.map((cause, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        {cause}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommended steps */}
              {diagnosis.recommended_steps.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-3">
                    <Wrench className="w-4 h-4 text-cyan-500" /> Passos recomendados
                  </p>
                  <ol className="space-y-2.5">
                    {diagnosis.recommended_steps.map((step, i) => (
                      <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-3">
                        <span className="w-6 h-6 rounded-lg bg-cyan-100 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 text-xs font-bold flex items-center justify-center shrink-0">
                          {step.step}
                        </span>
                        {step.description}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Warnings */}
              {diagnosis.warnings.length > 0 && (
                <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-4">
                  <p className="text-sm font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 mb-2">
                    <ShieldAlert className="w-4 h-4" /> Avisos de segurança
                  </p>
                  <ul className="space-y-1.5">
                    {diagnosis.warnings.map((warning, i) => (
                      <li key={i} className="text-sm text-rose-600 dark:text-rose-400 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Search results */}
              {diagnosis.search_results.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 mb-3">
                    <Search className="w-4 h-4 text-sky-500" /> Recursos encontrados
                  </p>
                  <div className="space-y-2">
                    {diagnosis.search_results.map((result, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm">
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <a href={safeUrl(result.url)} target="_blank" rel="noreferrer" className="text-cyan-600 dark:text-cyan-400 hover:underline truncate block">
                            {result.title}
                          </a>
                          <p className="text-xs text-slate-400 truncate">{result.snippet}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-slate-400 flex items-start gap-1.5 px-1">
                <Lightbulb className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Sugestão da IA baseada no problema relatado. Sempre confirme com o manual do fabricante e use EPI adequado.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
