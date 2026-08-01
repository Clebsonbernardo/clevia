import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Spinner, EmptyState, inputCls } from '@/components/ui';
import { ShieldAlert, Search, Filter, User, Clock, MousePointerClick, Globe } from 'lucide-react';
import type { AuditLog } from '@/lib/supabase';

const ACTION_LABELS: Record<string, { color: string; label: string }> = {
  create: { color: 'text-emerald-400', label: 'Criou' },
  update: { color: 'text-amber-400', label: 'Alterou' },
  delete: { color: 'text-red-400', label: 'Excluiu' },
  login: { color: 'text-blue-400', label: 'Login' },
  logout: { color: 'text-slate-400', label: 'Logout' },
  accept: { color: 'text-cyan-400', label: 'Assumiu' },
  finish: { color: 'text-violet-400', label: 'Finalizou' },
  pause: { color: 'text-orange-400', label: 'Pausou' },
  resume: { color: 'text-teal-400', label: 'Continuou' },
  transfer: { color: 'text-indigo-400', label: 'Transferiu' },
};

export default function AuditLogScreen() {
  const { activeCompany } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  const loadLogs = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('company_id', activeCompany.id)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error) setLogs((data || []) as AuditLog[]);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeCompany]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Realtime
  useEffect(() => {
    if (!activeCompany) return;
    const channel = supabase.channel('audit-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_logs', filter: `company_id=eq.${activeCompany.id}` }, (payload) => {
        setLogs((prev) => [payload.new as AuditLog, ...prev].slice(0, 200));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeCompany]);

  const entityTypes = Array.from(new Set(logs.map((l) => l.entity_type).filter(Boolean))) as string[];
  const actionTypes = Array.from(new Set(logs.map((l) => l.action)));

  const filteredLogs = logs.filter((log) => {
    if (actionFilter !== 'all' && log.action !== actionFilter) return false;
    if (entityFilter !== 'all' && log.entity_type !== entityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (log.description?.toLowerCase().includes(q) || log.user_email?.toLowerCase().includes(q) || log.action.includes(q) || (log.entity_type ?? '').toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-rose-300" />
          Auditoria
        </h1>
        <p className="text-sm text-slate-400 mt-1">Registro completo de todas as ações do sistema — quem fez, quando e o quê</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por descrição, usuário ou ação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} pl-9 text-sm`}
          />
        </div>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className={`${inputCls} text-sm w-auto`}>
          <option value="all">Todas as ações</option>
          {actionTypes.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>)}
        </select>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className={`${inputCls} text-sm w-auto`}>
          <option value="all">Todos os tipos</option>
          {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
          <p className="text-xs text-slate-400">Total de registros</p>
          <p className="text-xl font-bold text-white">{logs.length}</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
          <p className="text-xs text-slate-400">Criados</p>
          <p className="text-xl font-bold text-emerald-400">{logs.filter((l) => l.action === 'create').length}</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
          <p className="text-xs text-slate-400">Alterados</p>
          <p className="text-xl font-bold text-amber-400">{logs.filter((l) => l.action === 'update').length}</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/30">
          <p className="text-xs text-slate-400">Excluídos</p>
          <p className="text-xl font-bold text-red-400">{logs.filter((l) => l.action === 'delete').length}</p>
        </div>
      </div>

      {/* Log list */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : filteredLogs.length === 0 ? (
        <EmptyState icon={ShieldAlert} text="Nenhum registro de auditoria encontrado" />
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const cfg = ACTION_LABELS[log.action] || { color: 'text-slate-400', label: log.action };
            return (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/20 hover:bg-slate-800/60 transition">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center">
                  <MousePointerClick className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
                    {log.entity_type && <span className="text-xs text-slate-500">em {log.entity_type}</span>}
                  </div>
                  {log.description && <p className="text-sm text-slate-300 mt-0.5">{log.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <User className="w-3 h-3" /> {log.user_email || 'Sistema'}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Clock className="w-3 h-3" /> {new Date(log.created_at).toLocaleString('pt-BR')}
                    </span>
                    {log.ip_address && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Globe className="w-3 h-3" /> {log.ip_address}
                      </span>
                    )}
                    {log.device_info && (
                      <span className="text-xs text-slate-500 truncate max-w-[200px]">{log.device_info}</span>
                    )}
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
