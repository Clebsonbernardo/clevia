import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type ComplianceAudit, type ComplianceFinding, type Nr12MachineInspection, type ComplianceDocument, type Machine } from '@/lib/supabase';
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import {
  ShieldCheck, ClipboardCheck, AlertTriangle, CheckCircle2, XCircle,
  Clock, Plus, Trash2, FileText, Calendar, Award, Search,
  Zap, Lock, ShieldAlert, BookOpen, Wrench, Eye, Download,
} from 'lucide-react';

type Tab = 'overview' | 'iso55001' | 'nr12' | 'documents';

const ISO_55001_REQUIREMENTS = [
  { ref: '4.1', desc: 'Compreensão da organização e seu contexto' },
  { ref: '4.2', desc: 'Necessidades e expectativas das partes interessadas' },
  { ref: '5.1', desc: 'Liderança e comprometimento da alta direção' },
  { ref: '5.2', desc: 'Política de gestão de ativos' },
  { ref: '6.1', desc: 'Ações para riscos e oportunidades' },
  { ref: '6.2', desc: 'Objetivos de gestão de ativos e planejamento' },
  { ref: '7.1', desc: 'Recursos para o sistema de gestão de ativos' },
  { ref: '7.2', desc: 'Competência e treinamento' },
  { ref: '7.3', desc: 'Conscientização' },
  { ref: '7.4', desc: 'Comunicação' },
  { ref: '7.5', desc: 'Informação documentada' },
  { ref: '8.1', desc: 'Planejamento e controle operacional' },
  { ref: '8.2', desc: 'Gestão de ativos ao longo do ciclo de vida' },
  { ref: '8.3', desc: 'Avaliação de ativos e desempenho' },
  { ref: '9.1', desc: 'Monitoramento, medição, análise e avaliação' },
  { ref: '9.2', desc: 'Auditoria interna' },
  { ref: '9.3', desc: 'Análise crítica pela alta direção' },
  { ref: '10.1', desc: 'Não conformidade e ações corretivas' },
  { ref: '10.2', desc: 'Melhoria contínua' },
];

const NR12_CHECKLIST = [
  { key: 'emergency_stop_ok', label: 'Dispositivo de parada de emergência', icon: Zap },
  { key: 'guards_ok', label: 'Proteções e resguardos físicos', icon: ShieldCheck },
  { key: 'interlocks_ok', label: 'Intertravamentos de segurança', icon: Lock },
  { key: 'signage_ok', label: 'Sinalização e placas de advertência', icon: Eye },
  { key: 'grounding_ok', label: 'Aterramento elétrico', icon: Zap },
  { key: 'lockout_tagout_ok', label: 'Bloqueio e etiquetagem (LOTO)', icon: Lock },
  { key: 'training_ok', label: 'Treinamento de operadores', icon: BookOpen },
  { key: 'maintenance_ok', label: 'Manutenção preventiva em dia', icon: Wrench },
] as const;

const severityStyles: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  major: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  minor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  observation: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
};

const severityLabels: Record<string, string> = {
  critical: 'Crítica', major: 'Maior', minor: 'Menor', observation: 'Observação',
};

const statusStyles: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  in_progress: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  archived: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
};

const statusLabels: Record<string, string> = {
  planned: 'Planejada', in_progress: 'Em andamento', completed: 'Concluída', archived: 'Arquivada',
};

const findingStatusLabels: Record<string, string> = {
  open: 'Aberta', in_progress: 'Em tratamento', resolved: 'Resolvida',
};

const findingStatusStyles: Record<string, string> = {
  open: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  resolved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export default function ComplianceScreen() {
  const { activeCompany, activeRole } = useAuth();
  const cid = activeCompany?.id;
  const [tab, setTab] = useState<Tab>('overview');
  const [audits, setAudits] = useState<ComplianceAudit[]>([]);
  const [findings, setFindings] = useState<ComplianceFinding[]>([]);
  const [inspections, setInspections] = useState<Nr12MachineInspection[]>([]);
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'audit' | 'finding' | 'inspection' | 'document'>('audit');
  const [selectedAudit, setSelectedAudit] = useState<ComplianceAudit | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const canManage = activeRole === 'ceo' || activeRole === 'gerente';

  const load = async () => {
    if (!cid) return;
    const [a, f, ins, docs, m] = await Promise.all([
      supabase.from('compliance_audits').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('compliance_findings').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('nr12_machine_inspections').select('*').eq('company_id', cid).order('inspection_date', { ascending: false }),
      supabase.from('compliance_documents').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('machines').select('id, name, code, sector').eq('company_id', cid).order('name'),
    ]);
    setAudits(a.data ?? []);
    setFindings(f.data ?? []);
    setInspections(ins.data ?? []);
    setDocuments(docs.data ?? []);
    setMachines(m.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!cid) return;
    const channel = supabase.channel('compliance-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compliance_audits', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compliance_findings', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'nr12_machine_inspections', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'compliance_documents', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const isoAudits = audits.filter((a) => a.framework === 'iso_55001');
  const nr12Audits = audits.filter((a) => a.framework === 'nr_12');
  const isoFindings = findings.filter((f) => isoAudits.some((a) => a.id === f.audit_id));
  const nr12Findings = findings.filter((f) => nr12Audits.some((a) => a.id === f.audit_id));
  const openFindings = findings.filter((f) => f.status !== 'resolved');
  const criticalFindings = findings.filter((f) => f.severity === 'critical' && f.status !== 'resolved');
  const conformInspections = inspections.filter((i) => i.status === 'conforme').length;
  const nonConformInspections = inspections.filter((i) => i.status === 'nao_conforme').length;
  const pendingInspections = inspections.filter((i) => i.status === 'pendente').length;
  const complianceRate = inspections.length > 0 ? Math.round((conformInspections / inspections.length) * 100) : 0;

  const openModal = (type: 'audit' | 'finding' | 'inspection' | 'document', audit?: ComplianceAudit) => {
    setModalType(type);
    setSelectedAudit(audit ?? null);
    if (type === 'audit') setForm({ framework: tab === 'nr12' ? 'nr_12' : 'iso_55001', status: 'planned', scope: 'Geral' });
    else if (type === 'finding') setForm({ severity: 'minor', status: 'open', audit_id: audit?.id ?? '' });
    else if (type === 'inspection') {
      setForm({ status: 'pendente', emergency_stop_ok: false, guards_ok: false, interlocks_ok: false, signage_ok: false, grounding_ok: false, lockout_tagout_ok: false, training_ok: false, maintenance_ok: false, inspection_date: new Date().toISOString().split('T')[0] });
    } else setForm({ framework: 'iso_55001', document_type: 'certificate' });
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    if (modalType === 'audit') {
      const { error: auditErr } = await supabase.from('compliance_audits').insert({ ...form, company_id: cid });
      if (auditErr) { alert('Erro ao salvar auditoria: ' + auditErr.message); setSaving(false); return; }
    } else if (modalType === 'finding') {
      const { error: findErr } = await supabase.from('compliance_findings').insert({ ...form, company_id: cid, audit_id: form.audit_id || selectedAudit?.id });
      if (findErr) { alert('Erro ao salvar não-conformidade: ' + findErr.message); setSaving(false); return; }
    } else if (modalType === 'inspection') {
      const checks = NR12_CHECKLIST.every((c) => form[c.key]);
      const status = checks ? 'conforme' : (NR12_CHECKLIST.some((c) => form[c.key]) ? 'nao_conforme' : 'pendente');
      const { error: inspErr } = await supabase.from('nr12_machine_inspections').insert({ ...form, status, company_id: cid });
      if (inspErr) { alert('Erro ao salvar inspeção: ' + inspErr.message); setSaving(false); return; }
    } else if (modalType === 'document') {
      const { error: docErr } = await supabase.from('compliance_documents').insert({ ...form, company_id: cid });
      if (docErr) { alert('Erro ao salvar documento: ' + docErr.message); setSaving(false); return; }
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (table: string, id: string) => {
    if (!confirm('Remover este item?')) return;
    const { error: delErr } = await supabase.from(table).delete().eq('id', id);
    if (delErr) { alert('Erro ao remover item: ' + delErr.message); return; }
    load();
  };

  const updateFindingStatus = async (f: ComplianceFinding, status: 'open' | 'in_progress' | 'resolved') => {
    const { error: updErr } = await supabase.from('compliance_findings').update({
      status, resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    }).eq('id', f.id);
    if (updErr) { alert('Erro ao atualizar status: ' + updErr.message); return; }
    load();
  };

  const updateAuditStatus = async (a: ComplianceAudit, status: string) => {
    const { error: audErr } = await supabase.from('compliance_audits').update({
      status, completed_date: status === 'completed' ? new Date().toISOString().split('T')[0] : null,
    }).eq('id', a.id);
    if (audErr) { alert('Erro ao atualizar auditoria: ' + audErr.message); return; }
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-500" /> Conformidade
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">ISO 55001 (Gestão de Ativos) e NR-12 (Segurança de Máquinas)</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {tab === 'iso55001' && <button onClick={() => openModal('audit')} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl hover:from-emerald-400 hover:to-teal-400 transition shadow-sm"><Plus className="w-5 h-5" /> Nova Auditoria</button>}
            {tab === 'nr12' && <button onClick={() => openModal('inspection')} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-400 hover:to-orange-400 transition shadow-sm"><Plus className="w-5 h-5" /> Nova Inspeção</button>}
            {tab === 'documents' && <button onClick={() => openModal('document')} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-500 text-white font-medium rounded-xl hover:from-sky-400 hover:to-blue-400 transition shadow-sm"><Plus className="w-5 h-5" /> Novo Documento</button>}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto">
        {([
          { id: 'overview' as const, label: 'Visão Geral', icon: ClipboardCheck },
          { id: 'iso55001' as const, label: 'ISO 55001', icon: Award },
          { id: 'nr12' as const, label: 'NR-12', icon: ShieldAlert },
          { id: 'documents' as const, label: 'Documentos', icon: FileText },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition whitespace-nowrap ${
              tab === t.id ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={ClipboardCheck} label="Auditorias" value={audits.length} color="text-sky-400" bg="bg-sky-50 dark:bg-sky-950/30" />
            <StatCard icon={AlertTriangle} label="NC Abertas" value={openFindings.length} color="text-rose-400" bg="bg-rose-50 dark:bg-rose-950/30" />
            <StatCard icon={ShieldAlert} label="NC Críticas" value={criticalFindings.length} color="text-orange-400" bg="bg-orange-50 dark:bg-orange-950/30" />
            <StatCard icon={CheckCircle2} label="Conformidade NR-12" value={`${complianceRate}%`} color="text-emerald-400" bg="bg-emerald-50 dark:bg-emerald-950/30" />
          </div>

          {/* NR-12 inspection summary */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-amber-500" /> Inspeções NR-12</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{conformInspections}</p>
                <p className="text-xs text-slate-500 mt-1">Conformes</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30">
                <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{nonConformInspections}</p>
                <p className="text-xs text-slate-500 mt-1">Não Conformes</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{pendingInspections}</p>
                <p className="text-xs text-slate-500 mt-1">Pendentes</p>
              </div>
            </div>
          </div>

          {/* Recent findings */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-500" /> Não-Conformidades Recentes</h3>
            {findings.length === 0 ? (
              <EmptyState icon={CheckCircle2} text="Nenhuma não-conformidade registrada." />
            ) : (
              <div className="space-y-3">
                {findings.slice(0, 5).map((f) => (
                  <div key={f.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${severityStyles[f.severity]}`}>{severityLabels[f.severity]}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{f.requirement_ref} — {f.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{findingStatusLabels[f.status]} · {new Date(f.created_at).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ISO 55001 */}
      {tab === 'iso55001' && (
        <div className="space-y-6">
          {/* Requirements reference */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2"><Award className="w-5 h-5 text-emerald-500" /> Requisitos ISO 55001</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {ISO_55001_REQUIREMENTS.map((r) => {
                const relatedFindings = isoFindings.filter((f) => f.requirement_ref === r.ref);
                const hasOpen = relatedFindings.some((f) => f.status !== 'resolved');
                return (
                  <div key={r.ref} className={`flex items-start gap-2 p-2.5 rounded-lg ${hasOpen ? 'bg-rose-50 dark:bg-rose-950/30' : 'bg-slate-50 dark:bg-slate-800/50'}`}>
                    <span className="text-xs font-bold text-slate-400 w-12 flex-shrink-0">{r.ref}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-300 flex-1">{r.desc}</span>
                    {hasOpen ? <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" /> : relatedFindings.length > 0 ? <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audits */}
          {isoAudits.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
              <EmptyState icon={Award} text="Nenhuma auditoria ISO 55001 registrada. Clique em 'Nova Auditoria' para começar." />
            </div>
          ) : (
            <div className="space-y-4">
              {isoAudits.map((a) => {
                const aFindings = isoFindings.filter((f) => f.audit_id === a.id);
                return (
                  <div key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{a.scope}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Auditor: {a.auditor_name || '—'} · {a.scheduled_date ? new Date(a.scheduled_date).toLocaleDateString('pt-BR') : 'Sem data'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {a.score != null && <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{a.score}%</span>}
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[a.status]}`}>{statusLabels[a.status]}</span>
                      </div>
                    </div>
                    {a.notes && <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{a.notes}</p>}
                    {aFindings.length > 0 && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-xs font-medium text-slate-500 mb-2">Não-conformidades ({aFindings.length}):</p>
                        {aFindings.map((f) => (
                          <div key={f.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${severityStyles[f.severity]}`}>{severityLabels[f.severity]}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 dark:text-slate-200"><span className="font-mono text-xs text-slate-400">{f.requirement_ref}</span> {f.description}</p>
                              {f.corrective_action && <p className="text-xs text-slate-400 mt-0.5">Ação: {f.corrective_action}</p>}
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${findingStatusStyles[f.status]}`}>{findingStatusLabels[f.status]}</span>
                            {canManage && (
                              <select value={f.status} onChange={(e) => updateFindingStatus(f, e.target.value as any)} className="text-xs border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 bg-transparent text-slate-600 dark:text-slate-300">
                                <option value="open">Aberta</option><option value="in_progress">Em tratamento</option><option value="resolved">Resolvida</option>
                              </select>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {canManage && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button onClick={() => openModal('finding', a)} className="text-xs px-3 py-1.5 rounded-lg bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/60 transition flex items-center gap-1"><Plus className="w-3 h-3" /> NC</button>
                        {a.status !== 'completed' && <button onClick={() => updateAuditStatus(a, 'completed')} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition">Concluir</button>}
                        <button onClick={() => remove('compliance_audits', a.id)} className="text-xs p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* NR-12 */}
      {tab === 'nr12' && (
        <div className="space-y-6">
          {/* NR-12 audits */}
          {nr12Audits.length > 0 && (
            <div className="space-y-3">
              {nr12Audits.map((a) => {
                const aFindings = nr12Findings.filter((f) => f.audit_id === a.id);
                return (
                  <div key={a.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{a.scope}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Auditor: {a.auditor_name || '—'} · {a.scheduled_date ? new Date(a.scheduled_date).toLocaleDateString('pt-BR') : 'Sem data'}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[a.status]}`}>{statusLabels[a.status]}</span>
                    </div>
                    {aFindings.length > 0 && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        {aFindings.map((f) => (
                          <div key={f.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${severityStyles[f.severity]}`}>{severityLabels[f.severity]}</span>
                            <p className="text-sm text-slate-700 dark:text-slate-200 flex-1"><span className="font-mono text-xs text-slate-400">NR-12 {f.requirement_ref}</span> {f.description}</p>
                            <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${findingStatusStyles[f.status]}`}>{findingStatusLabels[f.status]}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Machine inspections */}
          {inspections.length === 0 && nr12Audits.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
              <EmptyState icon={ShieldAlert} text="Nenhuma inspeção NR-12 registrada. Clique em 'Nova Inspeção' para avaliar uma máquina." />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {inspections.map((ins) => {
                const machine = machines.find((m) => m.id === ins.machine_id);
                const passedCount = NR12_CHECKLIST.filter((c) => ins[c.key]).length;
                return (
                  <div key={ins.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{machine ? `${machine.code} — ${machine.name}` : 'Inspeção Geral'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Inspetor: {ins.inspector_name || '—'} · {new Date(ins.inspection_date).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                        ins.status === 'conforme' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : ins.status === 'nao_conforme' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}>{ins.status === 'conforme' ? 'Conforme' : ins.status === 'nao_conforme' ? 'Não Conforme' : 'Pendente'}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                      {NR12_CHECKLIST.map((c) => {
                        const ok = ins[c.key];
                        const Icon = c.icon;
                        return (
                          <div key={c.key} className="flex items-center gap-1.5 text-xs">
                            {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />}
                            <Icon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className={ok ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 line-through'}>{c.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{passedCount}/{NR12_CHECKLIST.length} itens conformes</span>
                      {ins.next_inspection_date && <span className="text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> Próx: {new Date(ins.next_inspection_date).toLocaleDateString('pt-BR')}</span>}
                    </div>
                    {ins.observations && <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">{ins.observations}</p>}
                    {canManage && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                        <button onClick={() => remove('nr12_machine_inspections', ins.id)} className="text-xs p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <div className="space-y-4">
          {documents.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
              <EmptyState icon={FileText} text="Nenhum documento de conformidade registrado." />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {documents.map((d) => {
                const expired = d.expiry_date && new Date(d.expiry_date) < new Date();
                const expiringSoon = d.expiry_date && !expired && new Date(d.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                return (
                  <div key={d.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-sky-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{d.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{d.framework === 'iso_55001' ? 'ISO 55001' : 'NR-12'} · {d.document_type}</p>
                        {d.issue_date && <p className="text-xs text-slate-400 mt-0.5">Emissão: {new Date(d.issue_date).toLocaleDateString('pt-BR')}</p>}
                        {d.expiry_date && (
                          <p className={`text-xs mt-0.5 flex items-center gap-1 ${expired ? 'text-rose-500' : expiringSoon ? 'text-amber-500' : 'text-emerald-500'}`}>
                            <Clock className="w-3 h-3" /> {expired ? 'Vencido' : 'Validade'}: {new Date(d.expiry_date).toLocaleDateString('pt-BR')}
                          </p>
                        )}
                      </div>
                      {canManage && (
                        <button onClick={() => remove('compliance_documents', d.id)} className="text-slate-400 hover:text-rose-500 transition"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalOpen && canManage && (
        <Modal title={modalType === 'audit' ? 'Nova Auditoria' : modalType === 'finding' ? 'Nova Não-Conformidade' : modalType === 'inspection' ? 'Nova Inspeção NR-12' : 'Novo Documento'} onClose={() => setModalOpen(false)} maxWidth="max-w-lg">
          <form onSubmit={save} className="space-y-4">
            {modalType === 'audit' && (
              <>
                <Field label="Norma" required>
                  <select value={form.framework as string} onChange={(e) => setForm({ ...form, framework: e.target.value })} className={inputCls}>
                    <option value="iso_55001">ISO 55001</option>
                    <option value="nr_12">NR-12</option>
                  </select>
                </Field>
                <Field label="Escopo" required>
                  <input required value={form.scope as string ?? ''} onChange={(e) => setForm({ ...form, scope: e.target.value })} className={inputCls} placeholder="Ex: Manutenção predial" />
                </Field>
                <Field label="Auditor">
                  <input value={form.auditor_name as string ?? ''} onChange={(e) => setForm({ ...form, auditor_name: e.target.value })} className={inputCls} placeholder="Nome do auditor" />
                </Field>
                <Field label="Data prevista">
                  <input type="date" value={form.scheduled_date as string ?? ''} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Observações">
                  <textarea value={form.notes as string ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} rows={3} />
                </Field>
              </>
            )}
            {modalType === 'finding' && (
              <>
                <Field label="Auditoria" required>
                  <select required value={form.audit_id as string ?? ''} onChange={(e) => setForm({ ...form, audit_id: e.target.value })} className={inputCls}>
                    <option value="">Selecione...</option>
                    {audits.map((a) => <option key={a.id} value={a.id}>{a.scope} ({a.framework === 'iso_55001' ? 'ISO 55001' : 'NR-12'})</option>)}
                  </select>
                </Field>
                <Field label="Referência do requisito" required>
                  <input required value={form.requirement_ref as string ?? ''} onChange={(e) => setForm({ ...form, requirement_ref: e.target.value })} className={inputCls} placeholder="Ex: 7.2.1 ou 12.3.1" />
                </Field>
                <Field label="Severidade" required>
                  <select value={form.severity as string ?? 'minor'} onChange={(e) => setForm({ ...form, severity: e.target.value })} className={inputCls}>
                    <option value="critical">Crítica</option><option value="major">Maior</option><option value="minor">Menor</option><option value="observation">Observação</option>
                  </select>
                </Field>
                <Field label="Descrição" required>
                  <textarea required value={form.description as string ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} rows={3} placeholder="Descreva a não-conformidade" />
                </Field>
                <Field label="Ação corretiva">
                  <textarea value={form.corrective_action as string ?? ''} onChange={(e) => setForm({ ...form, corrective_action: e.target.value })} className={inputCls} rows={2} placeholder="Plano de ação para resolver" />
                </Field>
                <Field label="Prazo">
                  <input type="date" value={form.due_date as string ?? ''} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inputCls} />
                </Field>
              </>
            )}
            {modalType === 'inspection' && (
              <>
                <Field label="Máquina">
                  <select value={form.machine_id as string ?? ''} onChange={(e) => setForm({ ...form, machine_id: e.target.value || null })} className={inputCls}>
                    <option value="">Inspeção geral</option>
                    {machines.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.name}</option>)}
                  </select>
                </Field>
                <Field label="Inspetor">
                  <input value={form.inspector_name as string ?? ''} onChange={(e) => setForm({ ...form, inspector_name: e.target.value })} className={inputCls} placeholder="Nome do inspetor" />
                </Field>
                <Field label="Data da inspeção" required>
                  <input type="date" required value={form.inspection_date as string ?? ''} onChange={(e) => setForm({ ...form, inspection_date: e.target.value })} className={inputCls} />
                </Field>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Checklist NR-12:</p>
                  <div className="space-y-2">
                    {NR12_CHECKLIST.map((c) => (
                      <label key={c.key} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                        <input type="checkbox" checked={form[c.key] as boolean ?? false} onChange={(e) => setForm({ ...form, [c.key]: e.target.checked })} className="w-4 h-4 rounded" />
                        <c.icon className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-600 dark:text-slate-300">{c.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Field label="Observações">
                  <textarea value={form.observations as string ?? ''} onChange={(e) => setForm({ ...form, observations: e.target.value })} className={inputCls} rows={2} />
                </Field>
                <Field label="Próxima inspeção">
                  <input type="date" value={form.next_inspection_date as string ?? ''} onChange={(e) => setForm({ ...form, next_inspection_date: e.target.value })} className={inputCls} />
                </Field>
              </>
            )}
            {modalType === 'document' && (
              <>
                <Field label="Norma" required>
                  <select value={form.framework as string ?? 'iso_55001'} onChange={(e) => setForm({ ...form, framework: e.target.value })} className={inputCls}>
                    <option value="iso_55001">ISO 55001</option>
                    <option value="nr_12">NR-12</option>
                  </select>
                </Field>
                <Field label="Título" required>
                  <input required value={form.title as string ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} placeholder="Ex: Certificado ISO 55001:2024" />
                </Field>
                <Field label="Tipo">
                  <select value={form.document_type as string ?? 'certificate'} onChange={(e) => setForm({ ...form, document_type: e.target.value })} className={inputCls}>
                    <option value="certificate">Certificado</option><option value="report">Relatório</option><option value="laudo">Laudo</option><option value="manual">Manual</option>
                  </select>
                </Field>
                <Field label="Data de emissão">
                  <input type="date" value={form.issue_date as string ?? ''} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Data de validade">
                  <input type="date" value={form.expiry_date as string ?? ''} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className={inputCls} />
                </Field>
              </>
            )}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl hover:from-emerald-400 hover:to-teal-400 transition disabled:opacity-60">{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: { icon: typeof ShieldCheck; label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className={`rounded-2xl p-5 ${bg} border border-slate-100 dark:border-slate-800`}>
      <Icon className={`w-6 h-6 ${color} mb-2`} />
      <p className="text-2xl font-bold text-slate-800 dark:text-white">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}
