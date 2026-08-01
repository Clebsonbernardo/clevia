import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Machine } from '@/lib/supabase';
import { Modal, Field, inputCls, Spinner } from '@/components/ui';
import {
  Plus, Pencil, Trash2, GripVertical, Monitor, X,
  Scissors, Sparkles, Zap, WashingMachine, Shirt,
  Cog, Boxes, Factory, Wrench,
  Package, Layers, Wind, Droplets, Flame, Snowflake,
  CircuitBoard, Hammer, PaintBucket, Shield,
  Lock, UserCog, Crown, Check, ChevronDown,
  PlayCircle, Settings, Square, MoonStar, AlertTriangle,
} from 'lucide-react';

export type MonitorScreen = {
  id: string;
  company_id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
};

type Grant = {
  id: string;
  user_id: string;
  permission_key: string;
  granted: boolean;
  granted_by: string | null;
};

type CompanyMemberInfo = {
  user_id: string;
  role: string;
  display_name: string | null;
  email: string | null;
};

const ICON_OPTIONS = [
  { name: 'Monitor', icon: Monitor },
  { name: 'Scissors', icon: Scissors },
  { name: 'Sparkles', icon: Sparkles },
  { name: 'Zap', icon: Zap },
  { name: 'WashingMachine', icon: WashingMachine },
  { name: 'Shirt', icon: Shirt },
  { name: 'Cog', icon: Cog },
  { name: 'Boxes', icon: Boxes },
  { name: 'Factory', icon: Factory },
  { name: 'Wrench', icon: Wrench },
  { name: 'Package', icon: Package },
  { name: 'Layers', icon: Layers },
  { name: 'Wind', icon: Wind },
  { name: 'Droplets', icon: Droplets },
  { name: 'Flame', icon: Flame },
  { name: 'Snowflake', icon: Snowflake },
  { name: 'CircuitBoard', icon: CircuitBoard },
  { name: 'Hammer', icon: Hammer },
  { name: 'PaintBucket', icon: PaintBucket },
  { name: 'Roll', icon: Layers },
  { name: 'Shield', icon: Shield },
];

const COLOR_OPTIONS = [
  { name: 'sky', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
  { name: 'rose', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' },
  { name: 'amber', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  { name: 'cyan', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30' },
  { name: 'violet', color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30' },
  { name: 'emerald', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { name: 'orange', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  { name: 'teal', color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/30' },
  { name: 'blue', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
  { name: 'yellow', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
];

const PERMISSION_LABELS: Record<string, string> = {
  manage_screens: 'Editar e Excluir Telas',
  manage_users: 'Gerenciar Usuários',
  manage_companies: 'Gerenciar Empresas',
  manage_inventory: 'Gerenciar Estoque',
  view_indicators: 'Ver Indicadores',
};

type MachineStatus = 'producao' | 'setup' | 'parada' | 'manutencao' | 'fora_turno';

const STATUS_META: Record<MachineStatus, { label: string; color: string; bg: string; border: string; dot: string; icon: typeof Cog }> = {
  producao:   { label: 'Em Produção',  color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', dot: 'bg-emerald-500', icon: PlayCircle },
  setup:      { label: 'Em Setup',     color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   dot: 'bg-amber-500',   icon: Settings },
  parada:     { label: 'Parada',        color: 'text-rose-300',    bg: 'bg-rose-500/10',    border: 'border-rose-500/30',    dot: 'bg-rose-500',    icon: Square },
  manutencao: { label: 'Em Manutenção', color: 'text-sky-300',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     dot: 'bg-sky-500',     icon: Wrench },
  fora_turno: { label: 'Fora de Turno', color: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/30',   dot: 'bg-slate-500',   icon: MoonStar },
};

function getStatusMeta(status: string) {
  return STATUS_META[status as MachineStatus] ?? STATUS_META.fora_turno;
}

function getIcon(name: string) {
  return ICON_OPTIONS.find((i) => i.name === name)?.icon ?? Monitor;
}

function getColor(name: string) {
  return COLOR_OPTIONS.find((c) => c.name === name) ?? COLOR_OPTIONS[0];
}

export default function ManageScreensScreen() {
  const { activeCompany, activeRole, user } = useAuth();
  const cid = activeCompany?.id;
  const isCEO = activeRole === 'ceo';
  const [screens, setScreens] = useState<MonitorScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MonitorScreen | null>(null);
  const [form, setForm] = useState<{ name: string; icon: string; color: string }>({ name: '', icon: 'Monitor', color: 'sky' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Permission grants
  const [grants, setGrants] = useState<Grant[]>([]);
  const [companyMembers, setCompanyMembers] = useState<CompanyMemberInfo[]>([]);
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [grantForm, setGrantForm] = useState<{ user_id: string; permission_key: string }>({ user_id: '', permission_key: 'manage_screens' });
  const [grantError, setGrantError] = useState('');
  const [grantSaving, setGrantSaving] = useState(false);

  // Machine listing for selected screen
  const [selectedScreen, setSelectedScreen] = useState<MonitorScreen | null>(null);
  const [screenMachines, setScreenMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  // Check if current user has edit/delete permission
  const canEditScreens = isCEO || grants.some(
    (g) => g.user_id === user?.id && g.permission_key === 'manage_screens' && g.granted
  );

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const [screensRes, grantsRes, membersRes] = await Promise.all([
      supabase.from('monitor_screens').select('*').eq('company_id', cid).order('sort_order', { ascending: true }),
      supabase.from('ceo_grants').select('id, user_id, permission_key, granted, granted_by').eq('company_id', cid),
      supabase.from('company_members').select('user_id, role, display_name').eq('company_id', cid),
    ]);
    setScreens(screensRes.data ?? []);
    setGrants(grantsRes.data ?? []);
    setCompanyMembers(membersRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  useEffect(() => {
    if (!cid) return;
    const channel = supabase.channel('manage-screens-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'monitor_screens', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ceo_grants', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, () => {
        if (selectedScreen) loadScreenMachines(selectedScreen);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid, selectedScreen]);

  const loadScreenMachines = async (screen: MonitorScreen) => {
    if (!cid) return;
    setMachinesLoading(true);
    const { data } = await supabase
      .from('machines')
      .select('*')
      .eq('company_id', cid)
      .eq('sector', screen.name)
      .order('created_at', { ascending: false });
    setScreenMachines(data ?? []);
    setMachinesLoading(false);
  };

  const openScreen = (s: MonitorScreen) => {
    setSelectedScreen(s);
    loadScreenMachines(s);
  };

  const closeScreen = () => {
    setSelectedScreen(null);
    setScreenMachines([]);
  };

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', icon: 'Monitor', color: 'sky' });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (s: MonitorScreen) => {
    if (!canEditScreens) return;
    setEditing(s);
    setForm({ name: s.name, icon: s.icon, color: s.color });
    setError('');
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    if (!canEditScreens) { setError('Você não tem permissão para editar telas.'); return; }
    if (!form.name.trim()) { setError('Informe o nome da tela'); return; }
    setSaving(true);
    setError('');

    if (editing) {
      await supabase.from('monitor_screens').update({
        name: form.name.trim(), icon: form.icon, color: form.color,
      }).eq('id', editing.id);
    } else {
      const maxOrder = screens.reduce((mx, s) => Math.max(mx, s.sort_order), -1);
      await supabase.from('monitor_screens').insert({
        company_id: cid, name: form.name.trim(), icon: form.icon,
        color: form.color, sort_order: maxOrder + 1,
      });
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (s: MonitorScreen) => {
    if (!canEditScreens) return;
    if (!confirm(`Excluir a tela "${s.name}"? As máquinas neste setor não serão excluídas, mas precisarão ser realocadas.`)) return;
    await supabase.from('monitor_screens').delete().eq('id', s.id);
    if (selectedScreen?.id === s.id) closeScreen();
    load();
  };

  const moveOrder = async (s: MonitorScreen, dir: -1 | 1) => {
    if (!canEditScreens) return;
    const sorted = [...screens].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((x) => x.id === s.id);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    await Promise.all([
      supabase.from('monitor_screens').update({ sort_order: other.sort_order }).eq('id', s.id),
      supabase.from('monitor_screens').update({ sort_order: s.sort_order }).eq('id', other.id),
    ]);
    load();
  };

  const openGrantModal = () => {
    setGrantForm({ user_id: '', permission_key: 'manage_screens' });
    setGrantError('');
    setGrantModalOpen(true);
  };

  const saveGrant = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid || !user) return;
    if (!grantForm.user_id) { setGrantError('Selecione um usuário'); return; }
    setGrantSaving(true);
    setGrantError('');

    const existing = grants.find(
      (g) => g.user_id === grantForm.user_id && g.permission_key === grantForm.permission_key
    );
    if (existing) {
      await supabase.from('ceo_grants').update({ granted: !existing.granted, granted_by: user.id }).eq('id', existing.id);
    } else {
      await supabase.from('ceo_grants').insert({
        company_id: cid, user_id: grantForm.user_id,
        permission_key: grantForm.permission_key, granted_by: user.id,
      });
    }
    setGrantSaving(false);
    setGrantModalOpen(false);
    load();
  };

  const toggleGrant = async (g: Grant) => {
    await supabase.from('ceo_grants').update({ granted: !g.granted, granted_by: user?.id }).eq('id', g.id);
    load();
  };

  const removeGrant = async (g: Grant) => {
    await supabase.from('ceo_grants').delete().eq('id', g.id);
    load();
  };

  const memberName = (uid: string) => {
    const m = companyMembers.find((x) => x.user_id === uid);
    return m?.display_name || m?.user_id?.slice(0, 8) || 'Usuário';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500/20 to-blue-700/20 border border-cyan-400/30 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-sky-400 animate-icon-pulse-continuous" />
            </div>
            Gerenciar Telas
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {isCEO
              ? 'Crie e organize as telas do Monitor de Setores. Como CEO, você tem acesso total.'
              : canEditScreens
                ? 'Você tem permissão do CEO para editar e excluir telas.'
                : 'Apenas o CEO pode editar ou excluir telas. Você pode visualizar as telas existentes.'}
          </p>
        </div>
        <div className="flex gap-2">
          {isCEO && (
            <button onClick={openGrantModal}
              className="flex items-center gap-2 px-4 py-3 bg-slate-800 border border-amber-500/30 text-amber-400 font-medium rounded-xl hover:bg-slate-700 transition">
              <Crown className="w-5 h-5 animate-icon-pulse-continuous" /> Autorizar Pessoas
            </button>
          )}
          <button onClick={openNew} disabled={!canEditScreens}
            className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-lg shadow-cyan-500/10 disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-5 h-5" /> Nova Tela
          </button>
        </div>
      </div>

      {/* CEO Grant Management Panel - only visible to CEO */}
      {isCEO && grants.length > 0 && (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
            <UserCog className="w-4 h-4 animate-icon-pulse-continuous" />
            Permissões Ativas
          </h3>
          <div className="flex flex-wrap gap-2">
            {grants.map((g) => (
              <div key={g.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${g.granted ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
                <span className="font-medium">{memberName(g.user_id)}</span>
                <span className="text-slate-500">·</span>
                <span>{PERMISSION_LABELS[g.permission_key] ?? g.permission_key}</span>
                <button onClick={() => toggleGrant(g)} className="ml-1 hover:scale-110 transition">
                  <Check className={`w-3.5 h-3.5 ${g.granted ? 'text-emerald-400' : 'text-slate-600'}`} />
                </button>
                <button onClick={() => removeGrant(g)} className="hover:scale-110 transition">
                  <X className="w-3.5 h-3.5 text-slate-500 hover:text-rose-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner /></div>
      ) : screens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
            <Monitor className="w-8 h-8 text-slate-500" />
          </div>
          <p className="text-slate-400 font-medium">Nenhuma tela criada ainda</p>
          <p className="text-sm text-slate-500 mt-1">{canEditScreens ? 'Clique em "Nova Tela" para começar.' : 'Aguarde o CEO criar as telas.'}</p>
        </div>
      ) : selectedScreen ? (
        <div className="space-y-4">
          <button onClick={closeScreen} className="flex items-center gap-2 text-sm text-slate-400 hover:text-sky-400 transition">
            <ChevronDown className="w-4 h-4 rotate-90" /> Voltar para as telas
          </button>
          <div className="flex items-center gap-3">
            {(() => {
              const I = getIcon(selectedScreen.icon);
              const c = getColor(selectedScreen.color);
              return (
                <>
                  <div className={`w-12 h-12 rounded-xl ${c.bg} ring-2 ring-${selectedScreen.color}-500/40 flex items-center justify-center`}>
                    <I className={`w-6 h-6 ${c.color} animate-icon-pulse-continuous`} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">{selectedScreen.name}</h3>
                    <p className="text-sm text-slate-400">
                      {screenMachines.length} {screenMachines.length === 1 ? 'máquina cadastrada' : 'máquinas cadastradas'}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>

          {machinesLoading ? (
            <div className="flex items-center justify-center h-40"><Spinner /></div>
          ) : screenMachines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                <Cog className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-slate-400 font-medium">Nenhuma máquina cadastrada nesta tela</p>
              <p className="text-sm text-slate-500 mt-1">Cadastre máquinas no setor "{selectedScreen.name}" para que apareçam aqui.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {screenMachines.map((m) => {
                const status = getStatusMeta(m.status ?? 'fora_turno');
                const SIcon = status.icon;
                return (
                  <div key={m.id} className={`rounded-xl border ${status.border} ${status.bg} p-4 transition hover:shadow-lg`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-lg ${status.bg} flex items-center justify-center`}>
                          <SIcon className={`w-5 h-5 ${status.color}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{m.name}</p>
                          {m.code && <p className="text-xs text-slate-500">Código: {m.code}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${status.bg} ${status.color} border ${status.border}`}>
                        <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      {m.model && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800/60 text-slate-400 border border-slate-700">
                          {m.model}
                        </span>
                      )}
                      {m.manufacturer && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800/60 text-slate-400 border border-slate-700">
                          {m.manufacturer}
                        </span>
                      )}
                    </div>
                    {m.criticality && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <AlertTriangle className={`w-3.5 h-3.5 ${m.criticality === 'critica' ? 'text-rose-400' : m.criticality === 'alta' ? 'text-amber-400' : 'text-slate-500'}`} />
                        <span className="text-xs text-slate-500">Criticidade: {m.criticality}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {screens.map((s, i) => {
            const I = getIcon(s.icon);
            const c = getColor(s.color);
            return (
              <div key={s.id} className={`rounded-2xl border ${c.border} ${c.bg} p-5 transition group hover:shadow-lg`}>
                <div className="flex items-start justify-between mb-3">
                  <button onClick={() => openScreen(s)} className="flex items-center gap-3 text-left flex-1 min-w-0">
                    <div className={`relative w-14 h-14 rounded-xl ${c.bg} ring-2 ring-${s.color}-500/40 flex items-center justify-center flex-shrink-0`}>
                      <I className={`w-7 h-7 ${c.color} animate-icon-pulse-continuous`} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-100 text-lg truncate">{s.name}</p>
                      <p className="text-xs text-slate-500">Tela {i + 1} de {screens.length}</p>
                    </div>
                  </button>
                  {canEditScreens && (
                    <div className="flex flex-col gap-1 flex-shrink-0">
                      <button onClick={() => moveOrder(s, -1)} disabled={i === 0}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-400 disabled:opacity-30 transition">
                        <GripVertical className="w-4 h-4 rotate-180" />
                      </button>
                      <button onClick={() => moveOrder(s, 1)} disabled={i === screens.length - 1}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-sky-400 disabled:opacity-30 transition">
                        <GripVertical className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.bg} ${c.color} border ${c.border}`}>
                    {s.icon}
                  </span>
                  <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${c.bg} ${c.color} border ${c.border}`}>
                    Cor: {s.color}
                  </span>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => openScreen(s)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-sky-400 transition">
                    <Monitor className="w-4 h-4" /> Ver Máquinas
                  </button>
                  <button onClick={() => openEdit(s)} disabled={!canEditScreens}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      canEditScreens
                        ? 'bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-sky-400'
                        : 'bg-slate-800/30 text-slate-600 cursor-not-allowed'
                    }`}>
                    {canEditScreens ? <Pencil className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    {canEditScreens ? 'Editar' : 'Bloqueado'}
                  </button>
                  <button onClick={() => remove(s)} disabled={!canEditScreens}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      canEditScreens
                        ? 'bg-slate-800/60 hover:bg-rose-500/10 text-slate-300 hover:text-rose-400'
                        : 'bg-slate-800/30 text-slate-600 cursor-not-allowed'
                    }`}>
                    {canEditScreens ? <Trash2 className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    {canEditScreens ? 'Excluir' : 'Bloqueado'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Editar tela' : 'Nova tela'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-5">
            <Field label="Nome da tela" required>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                placeholder="Ex: Estamparia, Embalagem, Qualidade..."
                autoFocus
              />
            </Field>

            <Field label="Ícone">
              <div className="grid grid-cols-7 gap-2">
                {ICON_OPTIONS.map((opt) => {
                  const I = opt.icon;
                  const selected = form.icon === opt.name;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => setForm({ ...form, icon: opt.name })}
                      className={`flex items-center justify-center w-full aspect-square rounded-xl border transition-all ${
                        selected
                          ? 'bg-sky-500/20 border-sky-500/50 scale-110 shadow-lg'
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600 hover:bg-slate-800'
                      }`}
                    >
                      <I className={`w-5 h-5 ${selected ? 'text-sky-400 animate-icon-bounce-soft' : 'text-slate-400'}`} />
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Cor">
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((opt) => {
                  const selected = form.color === opt.name;
                  return (
                    <button
                      key={opt.name}
                      type="button"
                      onClick={() => setForm({ ...form, color: opt.name })}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                        selected
                          ? `${opt.bg} ${opt.border} scale-105 shadow-lg`
                          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full ${opt.color.replace('text-', 'bg-')}`} />
                      <span className={`text-sm font-medium ${selected ? opt.color : 'text-slate-400'}`}>{opt.name}</span>
                    </button>
                  );
                })}
              </div>
            </Field>

            {error && (
              <p className="text-sm text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* CEO Grant Modal - only CEO can see */}
      {grantModalOpen && isCEO && (
        <Modal title="Autorizar Pessoa" onClose={() => setGrantModalOpen(false)}>
          <form onSubmit={saveGrant} className="space-y-5">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
              <p className="text-sm text-amber-300 flex items-center gap-2">
                <Crown className="w-4 h-4 animate-icon-pulse-continuous" />
                Apenas o CEO pode autorizar pessoas. Esta opção não aparece para outros usuários.
              </p>
            </div>

            <Field label="Pessoa" required>
              <select
                value={grantForm.user_id}
                onChange={(e) => setGrantForm({ ...grantForm, user_id: e.target.value })}
                className={inputCls}
              >
                <option value="">Selecione...</option>
                {companyMembers.filter((m) => m.role !== 'ceo').map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.display_name || m.user_id.slice(0, 8)} ({m.role})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Permissão" required>
              <select
                value={grantForm.permission_key}
                onChange={(e) => setGrantForm({ ...grantForm, permission_key: e.target.value })}
                className={inputCls}
              >
                {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </Field>

            {grantError && (
              <p className="text-sm text-rose-400 bg-rose-500/10 rounded-lg px-3 py-2">{grantError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setGrantModalOpen(false)}
                className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                Cancelar
              </button>
              <button type="submit" disabled={grantSaving}
                className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-400 hover:to-orange-400 transition disabled:opacity-60">
                {grantSaving ? 'Salvando...' : 'Autorizar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
