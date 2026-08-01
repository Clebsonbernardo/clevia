import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Integration, type IntegrationSyncLog } from '@/lib/supabase';
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import {
  Plug, Plus, Search, Trash2, RefreshCw, CheckCircle2,
  XCircle, Clock, AlertTriangle, Cloud, Cpu, Database, Network, Activity,
} from 'lucide-react';

const INTEGRATION_TYPES = [
  { id: 'sap' as const, label: 'SAP', icon: Database, color: 'text-blue-400', desc: 'SAP ERP / S4HANA — ordens de produção, notificações de manutenção, equipamentos' },
  { id: 'erp' as const, label: 'ERP Genérico', icon: Cloud, color: 'text-emerald-400', desc: 'Qualquer ERP com API REST — estoque, ordens de serviço, fornecedores' },
  { id: 'iot_opcua' as const, label: 'IoT — OPC UA', icon: Cpu, color: 'text-cyan-400', desc: 'Servidor OPC UA — leitura de tags de produção em tempo real' },
  { id: 'iot_modbus' as const, label: 'IoT — Modbus TCP', icon: Network, color: 'text-amber-400', desc: 'Protocolo Modbus TCP — leitura de registradores de produção' },
  { id: 'active_directory' as const, label: 'Active Directory', icon: Network, color: 'text-violet-400', desc: 'Microsoft AD / Entra ID — sincronização de usuários e departamentos' },
];

const syncStatusStyles: Record<string, string> = {
  idle: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  running: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 animate-pulse',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  error: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

const syncStatusLabels: Record<string, string> = {
  idle: 'Em espera', running: 'Sincronizando...', success: 'Sucesso', error: 'Erro',
};

export default function IntegrationsScreen() {
  const { activeCompany, activeRole } = useAuth();
  const cid = activeCompany?.id;
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<IntegrationSyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<Integration['type'] | null>(null);
  const [form, setForm] = useState<Partial<Integration>>({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState<string | null>(null);

  const canManage = activeRole === 'ceo' || activeRole === 'gerente';

  const load = async () => {
    if (!cid) return;
    const [i, l] = await Promise.all([
      supabase.from('integrations').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('integration_sync_logs').select('*').eq('company_id', cid).order('started_at', { ascending: false }).limit(50),
    ]);
    setIntegrations(i.data ?? []);
    setLogs(l.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (!cid) return;
    const channel = supabase.channel('integrations-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'integrations', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'integration_sync_logs', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const openNew = () => { setSelectedType(null); setForm({ active: true, config: {} }); setModalOpen(true); };

  const selectType = (type: Integration['type']) => {
    setSelectedType(type);
    setForm({ ...form, type, config: {} });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid || !selectedType) return;
    setSaving(true);
    const meta = INTEGRATION_TYPES.find((t) => t.id === selectedType)!;
    const payload = {
      ...form,
      company_id: cid,
      type: selectedType,
      name: form.name || meta.label,
      config: form.config || {},
      credentials_encrypted: {
        api_key: (form as any).api_key || null,
        username: (form as any).username || null,
        password: (form as any).password || null,
      },
    };
    const { error: insErr } = await supabase.from('integrations').insert(payload);
    if (insErr) { alert('Erro ao criar integração: ' + insErr.message); setSaving(false); return; }
    setSaving(false);
    setModalOpen(false);
    setForm({});
    setSelectedType(null);
    load();
  };

  const remove = async (i: Integration) => {
    if (!confirm(`Remover a integração "${i.name}"?`)) return;
    const { error: delErr } = await supabase.from('integrations').delete().eq('id', i.id);
    if (delErr) { alert('Erro ao remover integração: ' + delErr.message); return; }
    load();
  };

  const toggleActive = async (i: Integration) => {
    const { error: togErr } = await supabase.from('integrations').update({ active: !i.active, updated_at: new Date().toISOString() }).eq('id', i.id);
    if (togErr) { alert('Erro ao alterar status: ' + togErr.message); return; }
    load();
  };

  const syncNow = async (i: Integration) => {
    if (!i.active) return;
    setSyncing(i.id);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ integration_id: i.id, action: 'sync' }),
      });
      if (!res.ok) { alert('Falha na sincronização. Tente novamente.'); }
    } catch { /* best-effort */ }
    setSyncing(null);
    load();
  };

  const integrationLogs = (id: string) => logs.filter((l) => l.integration_id === id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Plug className="w-6 h-6 text-cyan-500" /> Integrações
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Conecte o CLEVIA com SAP, ERP, IoT e Active Directory</p>
        </div>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm">
            <Plus className="w-5 h-5" /> Nova Integração
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : integrations.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={Plug} text="Nenhuma integração configurada. Clique em 'Nova Integração' para conectar SAP, ERP, IoT ou Active Directory." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {integrations.map((i) => {
            const meta = INTEGRATION_TYPES.find((t) => t.id === i.type)!;
            const Icon = meta.icon;
            const iLogs = integrationLogs(i.id);
            const lastLog = iLogs[0];
            return (
              <div key={i.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                      <Icon className={`w-5 h-5 ${meta.color}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{i.name}</p>
                      <p className="text-xs text-slate-400">{meta.label}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${syncStatusStyles[i.sync_status] ?? ''}`}>
                    {syncStatusLabels[i.sync_status] ?? i.sync_status}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 line-clamp-2">{meta.desc}</p>

                {i.endpoint_url && (
                  <p className="text-xs text-slate-400 truncate mb-3 font-mono">{i.endpoint_url}</p>
                )}

                {i.last_error && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 mb-3">
                    <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-700 dark:text-rose-300 line-clamp-2">{i.last_error}</p>
                  </div>
                )}

                {i.last_sync_at && (
                  <p className="text-xs text-slate-400 mb-3 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Última sincronização: {new Date(i.last_sync_at).toLocaleString('pt-BR')}
                  </p>
                )}

                {iLogs.length > 0 && (
                  <div className="mb-3">
                    <button onClick={() => setShowLogs(showLogs === i.id ? null : i.id)} className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">
                      {showLogs === i.id ? 'Ocultar' : 'Ver'} logs ({iLogs.length})
                    </button>
                    {showLogs === i.id && (
                      <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {iLogs.slice(0, 10).map((log) => (
                          <div key={log.id} className="flex items-center gap-2 text-xs px-2 py-1 rounded bg-slate-50 dark:bg-slate-800/50">
                            {log.status === 'success' ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <XCircle className="w-3 h-3 text-rose-500" />}
                            <span className="text-slate-500 dark:text-slate-400">{new Date(log.started_at).toLocaleString('pt-BR')}</span>
                            <span className="text-slate-400">· {log.records_synced} registros</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {canManage && (
                  <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button onClick={() => syncNow(i)} disabled={!i.active || syncing === i.id}
                      className="flex-1 px-3 py-2 rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 text-xs font-medium hover:bg-cyan-200 dark:hover:bg-cyan-900/60 transition flex items-center justify-center gap-1.5 disabled:opacity-40">
                      <RefreshCw className={`w-4 h-4 ${syncing === i.id ? 'animate-spin' : ''}`} /> Sincronizar
                    </button>
                    <button onClick={() => toggleActive(i)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition ${i.active ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                      {i.active ? 'Pausar' : 'Ativar'}
                    </button>
                    <button onClick={() => remove(i)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && canManage && (
        <Modal title="Nova Integração" onClose={() => setModalOpen(false)} maxWidth="max-w-lg">
          <form onSubmit={save} className="space-y-4">
            {!selectedType ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">Selecione o tipo de integração:</p>
                {INTEGRATION_TYPES.map((t) => (
                  <button key={t.id} type="button" onClick={() => selectType(t.id)}
                    className="w-full flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-cyan-500 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition text-left">
                    <t.icon className={`w-5 h-5 ${t.color} mt-0.5`} />
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-100">{t.label}</p>
                      <p className="text-xs text-slate-400">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  {(() => { const meta = INTEGRATION_TYPES.find((t) => t.id === selectedType)!; const Icon = meta.icon; return <Icon className={`w-5 h-5 ${meta.color}`} />; })()}
                  <span className="font-medium text-slate-800 dark:text-slate-100">{INTEGRATION_TYPES.find((t) => t.id === selectedType)?.label}</span>
                </div>
                <Field label="Nome" required>
                  <input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Ex: SAP Produção" />
                </Field>
                <Field label="URL do Endpoint" required>
                  <input required value={form.endpoint_url ?? ''} onChange={(e) => setForm({ ...form, endpoint_url: e.target.value })} className={inputCls} placeholder="https://servidor/api" />
                </Field>
                <Field label="API Key / Token">
                  <input type="password" value={(form as any).api_key ?? ''} onChange={(e) => setForm({ ...form, api_key: e.target.value } as any)} className={inputCls} placeholder="Token de acesso" />
                </Field>
                {(selectedType === 'sap' || selectedType === 'erp' || selectedType === 'active_directory') && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Usuário">
                      <input value={(form as any).username ?? ''} onChange={(e) => setForm({ ...form, username: e.target.value } as any)} className={inputCls} placeholder="Usuário" />
                    </Field>
                    <Field label="Senha">
                      <input type="password" value={(form as any).password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value } as any)} className={inputCls} placeholder="Senha" />
                    </Field>
                  </div>
                )}
                {(selectedType === 'iot_opcua' || selectedType === 'iot_modbus') && (
                  <Field label="Tags / Registradores (JSON)">
                    <textarea value={JSON.stringify(form.config?.tags ?? [], null, 2)} onChange={(e) => { try { const tags = JSON.parse(e.target.value); setForm({ ...form, config: { ...form.config, tags } }); } catch { /* ignore invalid JSON while typing */ } }} className={inputCls} rows={4} placeholder='[{"nodeId":"ns=2;s=Production","machine_id":"..."}]' />
                  </Field>
                )}
                {selectedType === 'sap' && (
                  <Field label="Entidades SAP (JSON)">
                    <textarea value={JSON.stringify(form.config?.entities ?? ['ProductionOrders', 'MaintenanceNotifications'], null, 2)} onChange={(e) => { try { const entities = JSON.parse(e.target.value); setForm({ ...form, config: { ...form.config, entities } }); } catch { /* ignore */ } }} className={inputCls} rows={3} />
                  </Field>
                )}
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setSelectedType(null)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Voltar</button>
                  <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                    {saving ? 'Salvando...' : 'Criar Integração'}
                  </button>
                </div>
              </>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
