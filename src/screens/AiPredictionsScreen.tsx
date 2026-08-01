import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Modal, Spinner, EmptyState, inputCls } from '@/components/ui';
import { ScanEye, Brain, AlertTriangle, TrendingDown, Activity, CheckCircle2, Lightbulb, RefreshCw } from 'lucide-react';
import type { AiPrediction, Machine, WorkOrder } from '@/lib/supabase';

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  low: { color: 'text-blue-300', bg: 'bg-blue-500/10', border: 'border-blue-500/30', label: 'Baixa' },
  medium: { color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/30', label: 'Média' },
  high: { color: 'text-orange-300', bg: 'bg-orange-500/10', border: 'border-orange-500/30', label: 'Alta' },
  critical: { color: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/30', label: 'Crítica' },
};

const PREDICTION_TYPE_LABELS: Record<string, string> = {
  failure_prediction: 'Previsão de Falha',
  anomaly_detection: 'Anomalia Detectada',
  maintenance_recommendation: 'Recomendação de Manutenção',
  executive_report: 'Relatório Executivo',
};

export default function AiPredictionsScreen() {
  const { activeCompany } = useAuth();
  const [predictions, setPredictions] = useState<AiPrediction[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');

  const loadData = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const [predRes, machRes] = await Promise.all([
        supabase.from('ai_predictions').select('*').eq('company_id', activeCompany.id).order('created_at', { ascending: false }),
        supabase.from('machines').select('id, name, code, sector, status').eq('company_id', activeCompany.id),
      ]);
      setPredictions((predRes.data || []) as AiPrediction[]);
      setMachines((machRes.data || []) as Machine[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeCompany]);

  useEffect(() => { loadData(); }, [loadData]);

  const runAnalysis = async () => {
    if (!activeCompany || machines.length === 0) return;
    setAnalyzing(true);
    try {
      const { data: workOrders } = await supabase.from('work_orders').select('*').eq('company_id', activeCompany.id).order('created_at', { ascending: false }).limit(100);
      const woList = (workOrders || []) as WorkOrder[];
      const newPredictions: Omit<AiPrediction, 'id' | 'created_at'>[] = [];

      // Analyze machines with repeated failures
      const machineFailureCount: Record<string, number> = {};
      woList.forEach((wo) => { if (wo.machine_id && wo.status === 'finalizada') machineFailureCount[wo.machine_id] = (machineFailureCount[wo.machine_id] || 0) + 1; });
      Object.entries(machineFailureCount).forEach(([machineId, count]) => {
        if (count >= 3) {
          const machine = machines.find((m) => m.id === machineId);
          newPredictions.push({
            company_id: activeCompany.id,
            machine_id: machineId,
            prediction_type: 'failure_prediction',
            severity: count >= 5 ? 'critical' : 'high',
            description: `Máquina ${machine?.code || ''} - ${machine?.name || ''} apresenta ${count} manutenções recentes. Alta probabilidade de falha recorrente.`,
            confidence: Math.min(60 + count * 8, 95),
            recommended_action: 'Agendar inspeção preventiva detalhada e avaliar necessidade de substituição de componentes.',
            metadata: { failure_count: count },
            resolved: false,
          });
        }
      });

      // Detect machines in maintenance for too long
      machines.forEach((m) => {
        if (m.status === 'manutencao' || m.status === 'aguardando_mecanico') {
          const openWOs = woList.filter((w) => w.machine_id === m.id && w.status !== 'finalizada' && w.status !== 'cancelada');
          if (openWOs.length > 0) {
            const oldestWO = openWOs[0];
            const hoursDown = oldestWO.created_at ? (Date.now() - new Date(oldestWO.created_at).getTime()) / 3600000 : 0;
            if (hoursDown > 4) {
              newPredictions.push({
                company_id: activeCompany.id,
                machine_id: m.id,
                prediction_type: 'anomaly_detection',
                severity: hoursDown > 24 ? 'critical' : 'high',
                description: `Máquina ${m.code} - ${m.name} parada há ${Math.round(hoursDown)}h. Tempo de inatividade anormal.`,
                confidence: 85,
                recommended_action: 'Verificar status da OS, alocar mecânico adicional ou escalar para supervisão.',
                metadata: { hours_down: Math.round(hoursDown) },
                resolved: false,
              });
            }
          }
        }
      });

      // Detect machines with no production
      machines.forEach((m) => {
        if (m.status === 'producao') {
          newPredictions.push({
            company_id: activeCompany.id,
            machine_id: m.id,
            prediction_type: 'maintenance_recommendation',
            severity: 'low',
            description: `Máquina ${m.code} - ${m.name} em produção. Recomenda-se manutenção preventiva programada.`,
            confidence: 70,
            recommended_action: 'Manter cronograma de preventivas e monitorar temperatura/vibração.',
            metadata: {},
            resolved: false,
          });
        }
      });

      // Executive summary
      const totalMachines = machines.length;
      const producing = machines.filter((m) => m.status === 'producao').length;
      const inMaintenance = machines.filter((m) => m.status === 'manutencao' || m.status === 'aguardando_mecanico').length;
      const availability = totalMachines > 0 ? Math.round((producing / totalMachines) * 100) : 0;
      newPredictions.push({
        company_id: activeCompany.id,
        machine_id: null,
        prediction_type: 'executive_report',
        severity: availability < 60 ? 'high' : 'medium',
        description: `Relatório Executivo: ${producing} de ${totalMachines} máquinas em produção (${availability}% disponibilidade). ${inMaintenance} em manutenção. ${woList.length} OS no período.`,
        confidence: 90,
        recommended_action: availability < 70 ? 'Disponibilidade abaixo do ideal. Revisar plano de manutenção e alocar recursos.' : 'Manter monitoramento e cronograma preventivo.',
        metadata: { total_machines: totalMachines, producing, in_maintenance: inMaintenance, availability, total_wo: woList.length },
        resolved: false,
      });

      if (newPredictions.length > 0) {
        const { error: predErr } = await supabase.from('ai_predictions').insert(newPredictions);
        if (predErr) { alert('Erro ao salvar previsões: ' + predErr.message); return; }
      }
      loadData();
    } finally {
      setAnalyzing(false);
    }
  };

  const resolvePrediction = async (id: string) => {
    const { error: resErr } = await supabase.from('ai_predictions').update({ resolved: true }).eq('id', id);
    if (resErr) { alert('Erro ao resolver previsão: ' + resErr.message); return; }
    loadData();
  };

  const filteredPredictions = predictions.filter((p) => {
    if (filter === 'unresolved') return !p.resolved;
    if (filter === 'resolved') return p.resolved;
    return true;
  });

  if (loading) return <div className="flex items-center justify-center h-full"><Spinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <ScanEye className="w-6 h-6 text-cyan-300" />
            IA Preditiva
          </h1>
          <p className="text-sm text-slate-400 mt-1">Previsão de falhas, detecção de anomalias e recomendações inteligentes</p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={analyzing || machines.length === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-medium hover:from-cyan-400 hover:to-blue-400 transition disabled:opacity-50"
        >
          {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
          {analyzing ? 'Analisando...' : 'Executar Análise IA'}
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['unresolved', 'resolved', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${filter === f ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {f === 'unresolved' ? 'Ativos' : f === 'resolved' ? 'Resolvidos' : 'Todos'}
          </button>
        ))}
      </div>

      {filteredPredictions.length === 0 ? (
        <EmptyState icon={ScanEye} text={analyzing ? 'Analisando dados...' : 'Nenhuma previsão encontrada. Execute a análise IA.'} />
      ) : (
        <div className="grid gap-3">
          {filteredPredictions.map((p) => {
            const sev = SEVERITY_CONFIG[p.severity] || SEVERITY_CONFIG.medium;
            const machine = p.machine_id ? machines.find((m) => m.id === p.machine_id) : null;
            return (
              <div key={p.id} className={`rounded-xl border ${sev.border} ${sev.bg} p-4`}>
                <div className="flex items-start gap-3">
                  <div className={`shrink-0 w-10 h-10 rounded-lg ${sev.bg} flex items-center justify-center`}>
                    {p.prediction_type === 'failure_prediction' && <AlertTriangle className={`w-5 h-5 ${sev.color}`} />}
                    {p.prediction_type === 'anomaly_detection' && <Activity className={`w-5 h-5 ${sev.color}`} />}
                    {p.prediction_type === 'maintenance_recommendation' && <Lightbulb className={`w-5 h-5 ${sev.color}`} />}
                    {p.prediction_type === 'executive_report' && <TrendingDown className={`w-5 h-5 ${sev.color}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${sev.color}`}>{PREDICTION_TYPE_LABELS[p.prediction_type] || p.prediction_type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${sev.bg} ${sev.color} border ${sev.border}`}>{sev.label}</span>
                      {machine && <span className="text-xs text-slate-400">{machine.code} - {machine.name}</span>}
                      {p.resolved && <span className="text-xs text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolvido</span>}
                    </div>
                    <p className="text-sm text-slate-200 mt-1.5 break-words">{p.description}</p>
                    {p.recommended_action && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-400">{p.recommended_action}</p>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-16 sm:w-20 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                          <div className={`h-full ${sev.color.replace('text-', 'bg-')}`} style={{ width: `${p.confidence}%` }} />
                        </div>
                        <span className="text-xs text-slate-400">{Math.round(p.confidence)}%</span>
                      </div>
                      <span className="text-xs text-slate-500 truncate">{new Date(p.created_at).toLocaleString('pt-BR')}</span>
                      {!p.resolved && (
                        <button onClick={() => resolvePrediction(p.id)} className="ml-auto text-xs text-cyan-400 hover:text-cyan-300 transition">
                          Marcar resolvido
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
