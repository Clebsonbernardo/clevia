import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type WorkOrder, type WorkOrderHistory, type Machine, type Branch, type WorkOrderApproval } from '@/lib/supabase';
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import {
  cacheWorkData, getCachedWorkData, getPendingFinishes, isOnline,
  queuePendingFinish, removePendingFinish, type PendingFinish,
} from '@/lib/offline';
import { OSDiagnosticPanel } from '@/components/OSDiagnosticPanel';
import {
  ClipboardList, Plus, Search, Pencil, Trash2, CheckCircle2,
  XCircle, Clock, Wrench, AlertTriangle, Cog,
  WifiOff, RefreshCw, Pause, Play, UserPlus,
  ShieldCheck, ThumbsUp, ThumbsDown, CheckCheck, ChevronDown, MapPin,
} from 'lucide-react';

const STATUS = ['aberta', 'em_andamento', 'pausada', 'concluida', 'cancelada'] as const;
const PRIORITY = ['baixa', 'media', 'alta', 'critica'] as const;
const TYPE = ['preventiva', 'corretiva', 'preditiva'] as const;

const statusStyles: Record<string, string> = {
  aberta: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  em_andamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  pausada: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  concluida: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelada: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};
const priorityStyles: Record<string, string> = {
  baixa: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  media: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  alta: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  critica: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};
const statusLabels: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em andamento', pausada: 'Pausada', concluida: 'Concluída', cancelada: 'Cancelada',
};
const priorityLabels: Record<string, string> = {
  baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica',
};
const priorityRank: Record<string, number> = {
  critica: 0, alta: 1, media: 2, baixa: 3,
};
const typeLabels: Record<string, string> = {
  preventiva: 'Preventiva', corretiva: 'Corretiva', preditiva: 'Preditiva',
};

type MachineLite = Pick<Machine, 'id' | 'name' | 'branch_id' | 'status' | 'sector'>;
type MechanicLite = { id: string; name: string; status: string; user_id?: string | null };
type BranchLite = Pick<Branch, 'id' | 'name'>;

export default function WorkOrdersScreen() {
  const { activeCompany, activeRole, user, members } = useAuth();
  const cid = activeCompany?.id;
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<MachineLite[]>([]);
  const [mechanics, setMechanics] = useState<MechanicLite[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ativas');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState<Partial<WorkOrder>>({});
  const [saving, setSaving] = useState(false);
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  const [history, setHistory] = useState<WorkOrderHistory[]>([]);
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(getPendingFinishes().length);
  const [syncing, setSyncing] = useState(false);
  const [transferWO, setTransferWO] = useState<WorkOrder | null>(null);
  const [transferMechanic, setTransferMechanic] = useState('');
  const [approvals, setApprovals] = useState<WorkOrderApproval[]>([]);
  const [machineSearch, setMachineSearch] = useState('');
  const [machineDropdownOpen, setMachineDropdownOpen] = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    if (isOnline()) {
      const [w, m, me, b] = await Promise.all([
        supabase.from('work_orders').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
        supabase.from('machines').select('id, name, branch_id, status, sector').eq('company_id', cid),
        supabase.from('mechanics').select('id, name, status, user_id').eq('company_id', cid),
        supabase.from('branches').select('id, name').eq('company_id', cid),
      ]);
      setOrders(w.data ?? []);
      setMachines(m.data ?? []);
      setMechanics(me.data ?? []);
      setBranches(b.data ?? []);
      cacheWorkData({ orders: w.data ?? [], machines: m.data ?? [], mechanics: me.data ?? [], branches: b.data ?? [] }, cid);
    } else {
      const cached = getCachedWorkData(cid);
      if (cached) {
        setOrders(cached.orders as WorkOrder[]);
        setMachines(cached.machines as MachineLite[]);
        setMechanics(cached.mechanics as MechanicLite[]);
        setBranches(cached.branches as BranchLite[]);
      }
    }
    setLoading(false);
  };

  const syncPending = async () => {
    const queue = getPendingFinishes();
    if (queue.length === 0) return;
    setSyncing(true);
    for (const pf of queue) {
      const { data: wo } = await supabase.from('work_orders').select('machine_id').eq('id', pf.work_order_id).maybeSingle();
      const { error: syncErr } = await supabase.from('work_orders').update({
        status: 'concluida', finished_at: pf.finished_at,
        defect: pf.defect, procedure: pf.procedure, replaced_part: pf.replaced_part,
      }).eq('id', pf.work_order_id);
      if (syncErr) { console.error('syncPending OS update failed', syncErr); continue; }
      const { error: histErr } = await supabase.from('work_order_history').insert({
        work_order_id: pf.work_order_id, event_type: 'concluida',
        event_description: `OS concluída por ${pf.actor_name} às ${new Date(pf.finished_at).toLocaleString('pt-BR')}`,
        actor_name: pf.actor_name,
      });
      if (histErr) console.error('syncPending history insert failed', histErr);
      if (pf.mechanic_id) {
        const { error: mechErr } = await supabase.from('mechanics').update({ status: 'disponivel' }).eq('id', pf.mechanic_id);
        if (mechErr) console.error('syncPending mechanic update failed', mechErr);
      }
      removePendingFinish(pf.id);
    }
    setPendingCount(0);
    setSyncing(false);
    load();
  };

  useEffect(() => {
    load();
    const handleOnline = () => { setOnline(true); syncPending(); };
    const handleOffline = () => { setOnline(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (isOnline() && getPendingFinishes().length > 0) syncPending();
    if (!cid) return;
    const channel = supabase.channel('wo-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders', filter: `company_id=eq.${cid}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const loadHistory = async (id: string) => {
    const { data } = await supabase.from('work_order_history')
      .select('*').eq('work_order_id', id).order('created_at', { ascending: true });
    setHistory(data ?? []);
  };

  // Keep detail modal in sync with realtime updates
  useEffect(() => {
    if (!detailWO) return;
    // Find the latest version of the open WO in the orders array
    const updated = orders.find((o) => o.id === detailWO.id);
    if (updated && updated !== detailWO) {
      setDetailWO(updated);
    }
  }, [orders]);

  useEffect(() => {
    if (detailWO) loadHistory(detailWO.id);
  }, [detailWO?.id]);

  useEffect(() => {
    if (detailWO) loadApprovals(detailWO.id);
  }, [detailWO?.id]);

  const canManage = activeRole === 'ceo' || activeRole === 'gerente';
  const canApprove = activeRole === 'ceo' || activeRole === 'gerente';
  const loadApprovals = async (id: string) => {
    const { data } = await supabase.from('work_order_approvals')
      .select('*').eq('work_order_id', id).order('approval_level', { ascending: true });
    setApprovals(data ?? []);
  };

  const requestApproval = async (w: WorkOrder) => {
    if (!cid || !user) return;
    const { error: reqErr } = await supabase.from('work_orders').update({
      requires_approval: true, approval_status: 'pending',
    }).eq('id', w.id);
    if (reqErr) { alert('Erro ao solicitar aprovação: ' + reqErr.message); return; }
    await supabase.from('work_order_approvals').insert({
      work_order_id: w.id, company_id: cid,
      approval_level: 1, approver_role: 'gerente', status: 'pending',
    });
    await supabase.from('work_order_history').insert({
      work_order_id: w.id, event_type: 'aprovacao_solicitada',
      event_description: `Aprovação solicitada por ${members.find((m) => m.user_id === user.id && m.company_id === cid)?.display_name ?? user.email ?? 'Sistema'}`,
      actor_name: members.find((m) => m.user_id === user.id && m.company_id === cid)?.display_name ?? user.email ?? 'Sistema',
    });
    load();
  };

  const approveOrder = async (w: WorkOrder, status: 'approved' | 'rejected', comment?: string) => {
    if (!cid || !user) return;
    const pendingApproval = approvals.find((a) => a.status === 'pending');
    if (!pendingApproval) return;
    const actor = members.find((m) => m.user_id === user.id && m.company_id === cid)?.display_name ?? user.email ?? 'Sistema';
    const { error: apprErr } = await supabase.from('work_order_approvals').update({
      status, approver_user_id: user.id, comment: comment || null, acted_at: new Date().toISOString(),
    }).eq('id', pendingApproval.id);
    if (apprErr) { alert('Erro ao registrar aprovação: ' + apprErr.message); return; }

    if (status === 'approved') {
      // Check if there's a next level (CEO)
      const nextLevel = pendingApproval.approval_level + 1;
      const hasNextLevel = pendingApproval.approver_role === 'gerente';
      if (hasNextLevel) {
        await supabase.from('work_order_approvals').insert({
          work_order_id: w.id, company_id: cid,
          approval_level: nextLevel, approver_role: 'ceo', status: 'pending',
        });
        await supabase.from('work_order_history').insert({
          work_order_id: w.id, event_type: 'aprovacao_parcial',
          event_description: `Aprovado por ${actor} (gerente). Aguardando aprovação do CEO.`,
          actor_name: actor,
        });
      } else {
        const { error: apprUpdErr } = await supabase.from('work_orders').update({ approval_status: 'approved' }).eq('id', w.id);
        if (apprUpdErr) { alert('Erro ao aprovar OS: ' + apprUpdErr.message); return; }
        const { error: apprHistErr } = await supabase.from('work_order_history').insert({
          work_order_id: w.id, event_type: 'aprovada',
          event_description: `OS aprovada por ${actor}`,
          actor_name: actor,
        });
        if (apprHistErr) console.error('approve history insert failed', apprHistErr);
      }
    } else {
      const { error: rejErr } = await supabase.from('work_orders').update({ approval_status: 'rejected' }).eq('id', w.id);
      if (rejErr) { alert('Erro ao reprovar OS: ' + rejErr.message); return; }
      const { error: rejHistErr } = await supabase.from('work_order_history').insert({
          work_order_id: w.id, event_type: 'reprovada',
          event_description: `OS reprovada por ${actor}${comment ? ': ' + comment : ''}`,
          actor_name: actor,
        });
      if (rejHistErr) console.error('reject history insert failed', rejHistErr);
    }
    load();
  };

  const osLabel = (w: WorkOrder) => w.os_number != null ? `OS #${String(w.os_number).padStart(4, '0')}` : 'OS';

  const machineName = (id: string | null) => machines.find((m) => m.id === id)?.name ?? '—';
  const mechanicName = (id: string | null) => mechanics.find((m) => m.id === id)?.name ?? '—';

  const filtered = orders.filter((w) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (w.title ?? '').toLowerCase().includes(q) ||
      (w.description ?? '').toLowerCase().includes(q) ||
      String(w.os_number ?? '').includes(q) ||
      `#${String(w.os_number ?? '').padStart(4, '0')}`.includes(q) ||
      machineName(w.machine_id).toLowerCase().includes(q) ||
      mechanicName(w.mechanic_id).toLowerCase().includes(q) ||
      (w.defect ?? '').toLowerCase().includes(q) ||
      (w.replaced_part ?? '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || filterStatus === 'ativas' && (w.status === 'aberta' || w.status === 'em_andamento' || w.status === 'pausada') || w.status === filterStatus;
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    // Sort by priority (critical first), then by created_at (newest first)
    const pa = priorityRank[a.priority] ?? 99;
    const pb = priorityRank[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const openNew = () => { if (!canManage) return; setEditing(null); setForm({ status: 'aberta', priority: 'media' }); setMachineSearch(''); setMachineDropdownOpen(false); setModalOpen(true); };
  const openEdit = (w: WorkOrder) => { if (!canManage) return; setEditing(w); setForm(w); setMachineSearch(machines.find((m) => m.id === w.machine_id)?.name ?? ''); setMachineDropdownOpen(false); setModalOpen(true); };

  const filteredMachines = machines.filter((m) =>
    m.name.toLowerCase().includes(machineSearch.toLowerCase()) ||
    (m.sector ?? '').toLowerCase().includes(machineSearch.toLowerCase())
  );

  const machineStatusMeta: Record<string, { label: string; cls: string }> = {
    producao:   { label: 'Produção',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    setup:      { label: 'Setup',      cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    parada:     { label: 'Parada',     cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
    manutencao: { label: 'Manutenção', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
    fora_turno: { label: 'Fora turno',  cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid || !user || !canManage) return;
    setSaving(true);
    const machineLabel = machines.find((m) => m.id === form.machine_id)?.name;
    const now = new Date().toISOString();
    const payload = {
      ...form,
      company_id: cid,
      user_id: user.id,
      title: machineLabel ? `OS ${machineLabel}` : null,
      scheduled_date: editing ? form.scheduled_date : now,
    };
    if (editing) {
      const { error: updErr } = await supabase.from('work_orders').update(payload).eq('id', editing.id);
      if (updErr) { alert('Erro ao atualizar OS: ' + updErr.message); setSaving(false); return; }
    } else {
      const { data: newWO, error: insErr } = await supabase.from('work_orders').insert(payload).select().single();
      if (insErr || !newWO) { alert('Erro ao criar OS: ' + (insErr?.message ?? 'desconhecido')); setSaving(false); return; }
      if (newWO) {
        const actor = members.find((m) => m.user_id === user.id && m.company_id === cid)?.display_name ?? user.email ?? 'Sistema';

        // Fire history + member lookup in parallel
        const [, { data: companyMembers }] = await Promise.all([
          supabase.from('work_order_history').insert({
            work_order_id: newWO.id, event_type: 'aberta', event_description: `OS aberta por ${actor}`, actor_name: actor,
          }),
          supabase.from('company_members').select('user_id, role').eq('company_id', cid).eq('role', 'mecanico'),
        ]);

        if (companyMembers && companyMembers.length > 0) {
          const userIds = companyMembers.map((cm) => cm.user_id);
          const notifs = companyMembers.map((cm) => ({
            company_id: cid, user_id: cm.user_id, work_order_id: newWO.id,
            title: `${osLabel(newWO)} — ${machineName(newWO.machine_id)}`,
            body: `Prioridade ${priorityLabels[newWO.priority] ?? newWO.priority}${newWO.description ? ' · ' + newWO.description.slice(0, 80) : ''}`,
            type: 'os_aberta',
          }));
          const pushTitle = `Nova ${osLabel(newWO)} — ${machineName(newWO.machine_id)}`;
          const pushBody = `Prioridade ${priorityLabels[newWO.priority] ?? newWO.priority}${newWO.description ? ' · ' + newWO.description.slice(0, 80) : ''}`;

          // Insert in-app notifications immediately
          await supabase.from('notifications').insert(notifs);

          // Fire the alert loop edge function — it sends the first push instantly,
          // then repeats every 15 seconds until a mechanic accepts the OS.
          // We don't await the loop (it runs up to 5 min); just kick it off.
          try {
            const { data: sess } = await supabase.auth.getSession();
            const accessToken = sess.session?.access_token;
            if (accessToken) fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/os-alert-loop`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                work_order_id: newWO.id,
                user_ids: userIds,
                title: pushTitle,
                body: pushBody,
                url: '/#workorders',
              }),
            });
          } catch {
            // push delivery is best-effort; in-app notifications still work
          }
        }
      }
    }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (w: WorkOrder) => {
    if (!confirm(`Excluir esta ordem de serviço?`)) return;
    const { error: delErr } = await supabase.from('work_orders').delete().eq('id', w.id);
    if (delErr) { alert('Erro ao excluir OS: ' + delErr.message); return; }
    load();
  };

  const acceptOrder = async (w: WorkOrder) => {
    if (!user || !cid) return;
    const { data: mech, error: mechErr } = await supabase.from('mechanics')
      .select('id, name').eq('company_id', cid).eq('user_id', user.id).maybeSingle();
    if (mechErr) { alert('Erro ao buscar mecânico: ' + mechErr.message); return; }
    if (!mech) { alert('Seu usuário não está vinculado a um perfil de mecânico. Peça ao CEO para vincular.'); return; }

    const now = new Date().toISOString();
    const { error: accErr } = await supabase.from('work_orders').update({
      status: 'em_andamento', mechanic_id: mech.id, accepted_at: now,
    }).eq('id', w.id);
    if (accErr) { alert('Erro ao aceitar OS: ' + accErr.message); return; }

    // Mark all os_aberta notifications for this OS as read so reminders stop
    await supabase.from('notifications')
      .update({ read: true })
      .eq('work_order_id', w.id)
      .eq('type', 'os_aberta');

    await supabase.from('mechanics').update({ status: 'em_atendimento' }).eq('id', mech.id);

    await supabase.from('work_order_history').insert({
      work_order_id: w.id, event_type: 'aceita',
      event_description: `OS aceita por ${mech.name} às ${new Date(now).toLocaleString('pt-BR')}`,
      actor_name: mech.name,
    });

    const { data: companyMembers } = await supabase
      .from('company_members').select('user_id').eq('company_id', cid).eq('role', 'mecanico').neq('user_id', user.id);
    if (companyMembers && companyMembers.length > 0) {
      await supabase.from('notifications').insert(companyMembers.map((cm) => ({
        company_id: cid, user_id: cm.user_id, work_order_id: w.id,
        title: `OS em atendimento: ${machineName(w.machine_id)}`,
        body: `Aceita por ${mech.name}`,
        type: 'os_aceita',
      })));
    }
    load();
  };

  const canAccept = (w: WorkOrder) => activeRole === 'mecanico' && w.status === 'aberta';

  const pauseOrder = async (w: WorkOrder) => {
    if (!user || !cid) return;
    const { data: mech } = await supabase.from('mechanics')
      .select('id, name').eq('company_id', cid).eq('user_id', user.id).maybeSingle();
    if (!mech) return;
    const now = new Date().toISOString();
    const { error: pauseErr } = await supabase.from('work_orders').update({
      status: 'pausada', paused_at: now,
    }).eq('id', w.id);
    if (pauseErr) { alert('Erro ao pausar OS: ' + pauseErr.message); return; }
    await supabase.from('mechanics').update({ status: 'disponivel' }).eq('id', mech.id);
    await supabase.from('work_order_history').insert({
      work_order_id: w.id, event_type: 'pausada',
      event_description: `OS pausada por ${mech.name} às ${new Date(now).toLocaleString('pt-BR')} para atender outra OS de maior prioridade`,
      actor_name: mech.name,
    });
    load();
  };

  const resumeOrder = async (w: WorkOrder) => {
    if (!user || !cid) return;
    const { data: mech } = await supabase.from('mechanics')
      .select('id, name').eq('company_id', cid).eq('user_id', user.id).maybeSingle();
    if (!mech) return;
    const now = new Date().toISOString();
    const { error: resumeErr } = await supabase.from('work_orders').update({
      status: 'em_andamento', resumed_at: now,
    }).eq('id', w.id);
    if (resumeErr) { alert('Erro ao retomar OS: ' + resumeErr.message); return; }
    await supabase.from('mechanics').update({ status: 'em_atendimento' }).eq('id', mech.id);
    await supabase.from('work_order_history').insert({
      work_order_id: w.id, event_type: 'retomada',
      event_description: `OS retomada por ${mech.name} às ${new Date(now).toLocaleString('pt-BR')}`,
      actor_name: mech.name,
    });
    load();
  };

  const transferOrder = async (w: WorkOrder, newMechanicId: string) => {
    if (!user || !cid || !newMechanicId) return;
    const { data: mech } = await supabase.from('mechanics')
      .select('id, name').eq('company_id', cid).eq('user_id', user.id).maybeSingle();
    const oldName = mech?.name ?? 'Mecânico';
    const newMech = mechanics.find((m) => m.id === newMechanicId);
    const now = new Date().toISOString();
    const { error: transferErr } = await supabase.from('work_orders').update({
      mechanic_id: newMechanicId, status: 'aberta', paused_at: null, resumed_at: null,
    }).eq('id', w.id);
    if (transferErr) { alert('Erro ao transferir OS: ' + transferErr.message); return; }
    await supabase.from('work_order_history').insert({
      work_order_id: w.id, event_type: 'transferencia',
      event_description: `OS transferida de ${oldName} para ${newMech?.name ?? 'outro mecânico'} às ${new Date(now).toLocaleString('pt-BR')}`,
      actor_name: oldName,
    });
    // Notify the new mechanic
    const { data: newMechUser } = await supabase.from('mechanics')
      .select('user_id').eq('id', newMechanicId).maybeSingle();
    if (newMechUser?.user_id) {
      await supabase.from('notifications').insert({
        company_id: cid, user_id: newMechUser.user_id, work_order_id: w.id,
        title: `OS transferida para você: ${osLabel(w)}`,
        body: `Transferida de ${oldName}. Prioridade ${priorityLabels[w.priority] ?? w.priority}.`,
        type: 'os_transferida',
      });
    }
    load();
  };

  const cancelOrder = async () => {
    if (!detailWO || !user || !cid) return;
    if (!confirm('Cancelar esta ordem de serviço? A OS será marcada como cancelada e não poderá ser reaberta.')) return;
    const actor = members.find((m) => m.user_id === user.id && m.company_id === cid)?.display_name ?? user.email ?? 'Sistema';
    const { error: cancelErr } = await supabase.from('work_orders').update({ status: 'cancelada' }).eq('id', detailWO.id);
    if (cancelErr) { alert('Erro ao cancelar OS: ' + cancelErr.message); return; }

    await supabase.from('work_order_history').insert({
      work_order_id: detailWO.id, event_type: 'cancelada',
      event_description: `OS cancelada por ${actor}`,
      actor_name: actor,
    });
    await supabase.from('notifications').insert({
      user_id: user.id, company_id: cid,
      title: 'OS cancelada',
      body: `A OS #${String(detailWO.os_number ?? 0).padStart(4, '0')} foi cancelada por ${actor}.`,
      type: 'os_cancelada',
    });
    setDetailWO(null);
    load();
  };

  const finishOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!detailWO || !user || !cid) return;
    const actor = members.find((m) => m.user_id === user.id && m.company_id === cid)?.display_name ?? user.email ?? 'Sistema';
    const now = new Date().toISOString();

    if (!isOnline()) {
      const pf: PendingFinish = {
        id: crypto.randomUUID(),
        work_order_id: detailWO.id, company_id: cid,
        defect: (form.defect ?? '').trim(), procedure: (form.procedure ?? '').trim(),
        replaced_part: (form.replaced_part ?? '').trim(),
        finished_at: now, actor_name: actor, mechanic_id: detailWO.mechanic_id,
      };
      queuePendingFinish(pf);
      setPendingCount(getPendingFinishes().length);
      setOrders((prev) => prev.map((o) => o.id === detailWO.id ? { ...o, status: 'concluida', finished_at: now, defect: pf.defect, procedure: pf.procedure, replaced_part: pf.replaced_part } : o));
      setDetailWO(null);
      setForm({});
      return;
    }

    const { error: finishError } = await supabase.from('work_orders').update({
      status: 'concluida',
      finished_at: now,
      defect: form.defect ?? null,
      procedure: form.procedure ?? null,
      replaced_part: form.replaced_part ?? null,
    }).eq('id', detailWO.id);

    if (finishError) {
      alert('Não foi possível concluir a OS: ' + finishError.message);
      return;
    }

    await supabase.from('work_order_history').insert({
      work_order_id: detailWO.id, event_type: 'concluida',
      event_description: `OS concluída por ${actor} às ${new Date(now).toLocaleString('pt-BR')}`,
      actor_name: actor,
    });
    await supabase.from('notifications').insert({
      user_id: user.id, company_id: cid,
      title: 'OS concluída',
      body: `A OS #${String(detailWO.os_number ?? 0).padStart(4, '0')} foi concluída por ${actor}.`,
      type: 'os_concluida',
    });

    if (detailWO.mechanic_id) {
      await supabase.from('mechanics').update({ status: 'disponivel' }).eq('id', detailWO.mechanic_id);
    }

    setDetailWO(null);
    setForm({});
    load();
  };

  const canFinish = activeRole === 'mecanico' && detailWO?.status === 'em_andamento';

  const finishFieldsFilled = Boolean((form.defect ?? '').trim() && (form.procedure ?? '').trim() && (form.replaced_part ?? '').trim());

  return (
    <div className="space-y-6">
      {/* Offline banner */}
      {(!online || pendingCount > 0) && (
        <div className={`rounded-xl p-4 flex items-start gap-3 border ${!online ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800'}`}>
          {!online ? (
            <><WifiOff className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-800 dark:text-amber-200">Sem conexão com a internet</p>
              <p className="text-amber-700 dark:text-amber-300 mt-0.5">Você está no modo offline. Pode visualizar as ordens já carregadas e finalizar OS — as finalizações ficam salvas no aparelho e serão enviadas automaticamente quando a internet voltar.</p>
            </div></>
          ) : (
            <><RefreshCw className={`w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5 ${syncing ? 'animate-spin' : ''}`} />
            <div className="text-sm">
              <p className="font-semibold text-sky-800 dark:text-sky-200">{syncing ? 'Sincronizando...' : `${pendingCount} finalização(ões) pendente(s)`}</p>
              <p className="text-sky-700 dark:text-sky-300 mt-0.5">{syncing ? 'Enviando as finalizações para o servidor...' : 'Serão enviadas automaticamente.'}</p>
            </div></>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Ordens de Serviço</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Controle de manutenções preventivas e corretivas</p>
        </div>
        {canManage && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm">
            <Plus className="w-5 h-5" /> Nova Ordem de Serviço
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar ordem..."
            className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 focus:outline-none focus:border-cyan-500 transition">
          <option value="ativas">Ativas (aberta, em andamento, pausada)</option>
          <option value="all">Todos os status</option>
          {STATUS.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={ClipboardList} text={canManage ? "Nenhuma ordem encontrada. Clique em 'Nova Ordem de Serviço' para começar." : 'Nenhuma ordem de serviço no momento. Quando uma OS for aberta, ela aparecerá aqui.'} />
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nº</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Ordem</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Máquina</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Prioridade</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Mecânico</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Aberta em</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {filtered.map((w) => (
                    <tr key={w.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition group cursor-pointer" onClick={() => setDetailWO(w)}>
                      <td className="px-5 py-3.5"><span className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400">{w.os_number != null ? `#${String(w.os_number).padStart(4, '0')}` : '—'}</span></td>
                      <td className="px-5 py-3.5">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{w.title ?? machineName(w.machine_id)}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[200px]">{w.description ?? '—'}</p>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">{machineName(w.machine_id)}</td>
                      <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${priorityStyles[w.priority] ?? ''}`}>{priorityLabels[w.priority] ?? w.priority}</span></td>
                      <td className="px-5 py-3.5"><span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[w.status] ?? ''}`}>{statusLabels[w.status] ?? w.status}</span></td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-300">
                        {w.mechanic_id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${w.status === 'em_andamento' ? 'bg-emerald-400 animate-mech-blink' : 'bg-amber-400 animate-mech-blink'}`} />
                            {mechanicName(w.mechanic_id)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-500 dark:text-slate-400">{new Date(w.created_at).toLocaleString('pt-BR')}</td>
                      <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 lg:opacity-0 lg:group-hover:opacity-100 transition justify-end flex-wrap">
                          {canAccept(w) && (
                            <button onClick={() => acceptOrder(w)} className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-medium transition flex items-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Aceitar
                            </button>
                          )}
                          {activeRole === 'mecanico' && w.status === 'em_andamento' && w.mechanic_id && mechanics.find((m) => m.id === w.mechanic_id)?.name === mechanics.find((m) => m.user_id === user?.id)?.name && (
                            <button onClick={() => pauseOrder(w)} className="px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-300 text-xs font-medium transition flex items-center gap-1">
                              <Pause className="w-4 h-4" /> Pausar
                            </button>
                          )}
                          {activeRole === 'mecanico' && w.status === 'pausada' && w.mechanic_id && mechanics.find((m) => m.id === w.mechanic_id)?.name === mechanics.find((m) => m.user_id === user?.id)?.name && (
                            <button onClick={() => resumeOrder(w)} className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-medium transition flex items-center gap-1">
                              <Play className="w-4 h-4" /> Retomar
                            </button>
                          )}
                          {activeRole === 'mecanico' && w.status === 'pausada' && w.mechanic_id && mechanics.find((m) => m.id === w.mechanic_id)?.name === mechanics.find((m) => m.user_id === user?.id)?.name && (
                            <button onClick={() => { setTransferWO(w); setTransferMechanic(''); }} className="px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 hover:bg-sky-200 dark:bg-sky-900/40 dark:text-sky-300 text-xs font-medium transition flex items-center gap-1">
                              <UserPlus className="w-4 h-4" /> Transferir
                            </button>
                          )}
                          {canManage && <button onClick={() => openEdit(w)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>}
                          {canManage && <button onClick={() => remove(w)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {filtered.map((w) => (
              <div key={w.id} onClick={() => setDetailWO(w)} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 active:bg-slate-50 dark:active:bg-slate-800/50 transition cursor-pointer">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    {w.os_number != null && <p className="font-mono text-xs font-semibold text-cyan-600 dark:text-cyan-400">#{String(w.os_number).padStart(4, '0')}</p>}
                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{w.title ?? machineName(w.machine_id)}</p>
                    <p className="text-xs text-slate-400 truncate">{w.description ?? '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyles[w.status] ?? ''}`}>{statusLabels[w.status] ?? w.status}</span>
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${priorityStyles[w.priority] ?? ''}`}>{priorityLabels[w.priority] ?? w.priority}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    {w.mechanic_id ? (
                      <>
                        <span className={`w-2 h-2 rounded-full ${w.status === 'em_andamento' ? 'bg-emerald-400 animate-mech-blink' : 'bg-amber-400 animate-mech-blink'}`} />
                        <span className={w.status === 'em_andamento' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : ''}>{mechanicName(w.mechanic_id)}</span>
                      </>
                    ) : 'Sem mecânico'}
                  </span>
                  <span>{new Date(w.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  {canAccept(w) && (
                    <button onClick={() => acceptOrder(w)} className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs font-medium transition flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Aceitar
                    </button>
                  )}
                  {activeRole === 'mecanico' && w.status === 'em_andamento' && w.mechanic_id && mechanics.find((m) => m.id === w.mechanic_id)?.name === mechanics.find((m) => m.user_id === user?.id)?.name && (
                    <button onClick={() => pauseOrder(w)} className="flex-1 px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 text-xs font-medium transition flex items-center justify-center gap-1">
                      <Pause className="w-4 h-4" /> Pausar
                    </button>
                  )}
                  {activeRole === 'mecanico' && w.status === 'pausada' && w.mechanic_id && mechanics.find((m) => m.id === w.mechanic_id)?.name === mechanics.find((m) => m.user_id === user?.id)?.name && (
                    <button onClick={() => resumeOrder(w)} className="flex-1 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-medium transition flex items-center justify-center gap-1">
                      <Play className="w-4 h-4" /> Retomar
                    </button>
                  )}
                  {activeRole === 'mecanico' && w.status === 'pausada' && w.mechanic_id && mechanics.find((m) => m.id === w.mechanic_id)?.name === mechanics.find((m) => m.user_id === user?.id)?.name && (
                    <button onClick={() => { setTransferWO(w); setTransferMechanic(''); }} className="flex-1 px-3 py-1.5 rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 text-xs font-medium transition flex items-center justify-center gap-1">
                      <UserPlus className="w-4 h-4" /> Transferir
                    </button>
                  )}
                  {canManage && <button onClick={() => openEdit(w)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-medium transition flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>}
                  {canManage && <button onClick={() => remove(w)} className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs font-medium transition flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Modal Nova/Editar OS */}
      {modalOpen && canManage && (
        <Modal title={editing ? 'Editar ordem' : 'Nova Ordem de Serviço'} onClose={() => setModalOpen(false)} maxWidth="max-w-xl">
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Máquina" required>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      required={!form.machine_id}
                      value={machineSearch}
                      onChange={(e) => { setMachineSearch(e.target.value); setMachineDropdownOpen(true); setForm({ ...form, machine_id: null }); }}
                      onFocus={() => setMachineDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setMachineDropdownOpen(false), 200)}
                      placeholder="Buscar máquina por nome ou setor..."
                      className={`${inputCls} pl-9 pr-9`}
                      autoComplete="off"
                    />
                    {form.machine_id && (
                      <button type="button" onClick={() => { setMachineSearch(''); setForm({ ...form, machine_id: null }); setMachineDropdownOpen(true); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                    {!form.machine_id && (
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    )}
                  </div>
                  {machineDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg">
                      {filteredMachines.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-400">Nenhuma máquina encontrada.</div>
                      ) : (
                        filteredMachines.map((m) => {
                          const sm = machineStatusMeta[m.status ?? 'fora_turno'] ?? machineStatusMeta.fora_turno;
                          return (
                            <button key={m.id} type="button" onMouseDown={(e) => { e.preventDefault(); setForm({ ...form, machine_id: m.id }); setMachineSearch(m.name); setMachineDropdownOpen(false); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-cyan-50 dark:hover:bg-cyan-950/30 transition ${form.machine_id === m.id ? 'bg-cyan-50 dark:bg-cyan-950/30' : ''}`}>
                              <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                                <Cog className="w-4 h-4 text-slate-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{m.name}</p>
                                {m.sector && <p className="text-xs text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{m.sector}</p>}
                              </div>
                              <span className={`px-2 py-0.5 rounded-md text-xs font-medium flex-shrink-0 ${sm.cls}`}>{sm.label}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                  <input type="hidden" required value={form.machine_id ?? ''} onChange={() => {}} />
                </div>
              </Field>
              <Field label="Filial">
                <select value={form.branch_id ?? ''} onChange={(e) => setForm({ ...form, branch_id: e.target.value || null })} className={inputCls}>
                  <option value="">Matriz</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Prioridade">
                <select value={form.priority ?? 'media'} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={inputCls}>
                  {PRIORITY.map((p) => <option key={p} value={p}>{priorityLabels[p]}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status ?? 'aberta'} onChange={(e) => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  {STATUS.map((s) => <option key={s} value={s}>{statusLabels[s]}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Descrição">
              <textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} rows={3} placeholder="Descreva o problema ou serviço..." />
            </Field>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal Detalhe OS */}
      {detailWO && (
        <Modal title="Detalhes da Ordem de Serviço" onClose={() => setDetailWO(null)} maxWidth="max-w-2xl">
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                {detailWO.os_number != null && <p className="font-mono text-sm font-semibold text-cyan-600 dark:text-cyan-400 mb-0.5">OS #{String(detailWO.os_number).padStart(4, '0')}</p>}
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{detailWO.title ?? machineName(detailWO.machine_id)}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{machineName(detailWO.machine_id)}</p>
                {(() => {
                  const m = machines.find((mc) => mc.id === detailWO.machine_id);
                  if (!m) return null;
                  const meta: Record<string, { label: string; cls: string }> = {
                    producao: { label: 'Em produção', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
                    setup: { label: 'Em setup', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
                    parada: { label: 'Parada', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
                    manutencao: { label: 'Em manutenção', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
                    fora_turno: { label: 'Fora de turno', cls: 'bg-amber-700/10 text-amber-700 dark:bg-amber-900/30 dark:text-amber-500' },
                  };
                  const s = meta[m.status ?? 'fora_turno'] ?? meta.fora_turno;
                  return (
                    <span className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${s.cls}`}>
                      <Cog className="w-3 h-3" /> Máquina: {s.label}
                    </span>
                  );
                })()}
              </div>
              <span className={`px-3 py-1 rounded-lg text-xs font-medium ${statusStyles[detailWO.status]}`}>{statusLabels[detailWO.status]}</span>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${priorityStyles[detailWO.priority] ?? ''}`}>
                <AlertTriangle className="w-3 h-3 inline mr-1" />{priorityLabels[detailWO.priority] ?? detailWO.priority}
              </span>
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Wrench className="w-3 h-3 inline mr-1" />{typeLabels[detailWO.type] ?? detailWO.type}
              </span>
              {detailWO.scheduled_date && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <Clock className="w-3 h-3 inline mr-1" />{new Date(detailWO.scheduled_date).toLocaleDateString('pt-BR')}
                </span>
              )}
            </div>

            {/* Description */}
            {detailWO.description && (
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{detailWO.description}</p>
              </div>
            )}

            {/* AI Diagnostic Panel */}
            <OSDiagnosticPanel workOrder={detailWO} machine={machines.find((m) => m.id === detailWO.machine_id)} />

            {/* Approval Flow */}
            {detailWO.requires_approval && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-500" />
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Fluxo de Aprovação</h4>
                  <span className={`ml-auto px-2.5 py-1 rounded-lg text-xs font-medium ${
                    detailWO.approval_status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : detailWO.approval_status === 'rejected' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  }`}>
                    {detailWO.approval_status === 'approved' ? 'Aprovada' : detailWO.approval_status === 'rejected' ? 'Reprovada' : 'Pendente'}
                  </span>
                </div>
                {approvals.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 text-sm">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                      a.status === 'approved' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : a.status === 'rejected' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300'
                      : 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300'
                    }`}>{a.approval_level}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-700 dark:text-slate-200 capitalize">{a.approver_role === 'ceo' ? 'CEO' : a.approver_role}</p>
                      {a.acted_at && <p className="text-xs text-slate-400">{new Date(a.acted_at).toLocaleString('pt-BR')}</p>}
                      {a.comment && <p className="text-xs text-slate-500 mt-0.5">"{a.comment}"</p>}
                    </div>
                    {a.status === 'approved' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {a.status === 'rejected' && <XCircle className="w-4 h-4 text-rose-500" />}
                    {a.status === 'pending' && <Clock className="w-4 h-4 text-amber-500" />}
                  </div>
                ))}
                {canApprove && detailWO.approval_status === 'pending' && approvals.some((a) => a.status === 'pending' && a.approver_role === activeRole) && (
                  <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button onClick={() => approveOrder(detailWO, 'approved')} className="flex-1 py-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition flex items-center justify-center gap-1.5 text-sm font-medium">
                      <ThumbsUp className="w-4 h-4" /> Aprovar
                    </button>
                    <button onClick={() => { const c = prompt('Motivo da reprovação:'); if (c !== null) approveOrder(detailWO, 'rejected', c); }} className="flex-1 py-2 bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/60 transition flex items-center justify-center gap-1.5 text-sm font-medium">
                      <ThumbsDown className="w-4 h-4" /> Reprovar
                    </button>
                  </div>
                )}
              </div>
            )}
            {!detailWO.requires_approval && canManage && detailWO.status === 'aberta' && (
              <button onClick={() => requestApproval(detailWO)} className="w-full py-2.5 border border-cyan-200 dark:border-cyan-800 text-cyan-600 dark:text-cyan-300 rounded-xl hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition flex items-center justify-center gap-1.5 text-sm font-medium">
                <CheckCheck className="w-4 h-4" /> Solicitar Aprovação
              </button>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Mecânico</p>
                <p className="text-slate-700 dark:text-slate-200 mt-0.5">{detailWO.mechanic_id ? mechanicName(detailWO.mechanic_id) : 'Não atribuído'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Aberta em</p>
                <p className="text-slate-700 dark:text-slate-200 mt-0.5">{new Date(detailWO.created_at).toLocaleString('pt-BR')}</p>
              </div>
              {detailWO.accepted_at && (
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Aceita em</p>
                  <p className="text-slate-700 dark:text-slate-200 mt-0.5">{new Date(detailWO.accepted_at).toLocaleString('pt-BR')}</p>
                </div>
              )}
              {detailWO.finished_at && (
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold">Concluída em</p>
                  <p className="text-slate-700 dark:text-slate-200 mt-0.5">{new Date(detailWO.finished_at).toLocaleString('pt-BR')}</p>
                </div>
              )}
            </div>

            {/* Completion details removed — view in OS History screen */}

            {/* Pause / Resume / Transfer buttons (mechanic) */}
            {activeRole === 'mecanico' && detailWO.mechanic_id && mechanics.find((m) => m.id === detailWO.mechanic_id)?.name === mechanics.find((m) => m.user_id === user?.id)?.name && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 flex gap-2">
                {detailWO.status === 'em_andamento' && (
                  <button onClick={() => pauseOrder(detailWO)} className="flex-1 py-2.5 bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 rounded-xl hover:bg-orange-200 dark:hover:bg-orange-900/60 transition flex items-center justify-center gap-1.5 text-sm font-medium">
                    <Pause className="w-4 h-4" /> Pausar OS
                  </button>
                )}
                {detailWO.status === 'pausada' && (
                  <button onClick={() => resumeOrder(detailWO)} className="flex-1 py-2.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 rounded-xl hover:bg-amber-200 dark:hover:bg-amber-900/60 transition flex items-center justify-center gap-1.5 text-sm font-medium">
                    <Play className="w-4 h-4" /> Retomar OS
                  </button>
                )}
                {detailWO.status === 'pausada' && (
                  <button onClick={() => { setTransferWO(detailWO); setTransferMechanic(''); }} className="flex-1 py-2.5 bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 rounded-xl hover:bg-sky-200 dark:hover:bg-sky-900/60 transition flex items-center justify-center gap-1.5 text-sm font-medium">
                    <UserPlus className="w-4 h-4" /> Transferir
                  </button>
                )}
              </div>
            )}

            {/* Paused info */}
            {detailWO.paused_at && (
              <div className="px-4 py-3 rounded-lg text-sm bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 flex items-center gap-2">
                <Pause className="w-4 h-4 shrink-0" />
                <span>OS pausada em {new Date(detailWO.paused_at).toLocaleString('pt-BR')}. Você pode retomar ou transferir para outro mecânico.</span>
              </div>
            )}

            {/* Cancel order (CEO, open or in-progress) */}
            {(activeRole === 'ceo' || activeRole === 'gerente') && (detailWO.status === 'aberta' || detailWO.status === 'em_andamento' || detailWO.status === 'pausada') && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <button onClick={cancelOrder} className="w-full py-2.5 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 transition flex items-center justify-center gap-1.5 text-sm font-medium">
                  <XCircle className="w-4 h-4" /> Cancelar ordem de serviço
                </button>
              </div>
            )}

            {/* Finish form */}
            {canFinish && (
              <form onSubmit={finishOrder} className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-semibold text-slate-800 dark:text-slate-100">Finalizar OS</h4>
                </div>
                <div className="px-4 py-3 rounded-lg text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
                  Para finalizar a OS, é obrigatório preencher os três campos abaixo. Eles formam o histórico técnico da máquina.
                </div>
                <Field label="Defeito encontrado" required>
                  <textarea required value={form.defect ?? ''} onChange={(e) => setForm({ ...form, defect: e.target.value })} className={inputCls} rows={2} placeholder="Descreva o problema encontrado na máquina" />
                </Field>
                <Field label="Procedimento / regulagem realizada" required>
                  <textarea required value={form.procedure ?? ''} onChange={(e) => setForm({ ...form, procedure: e.target.value })} className={inputCls} rows={2} placeholder="O que foi feito para resolver (regulagem, ajuste, etc.)" />
                </Field>
                <Field label="Peça(s) trocada(s)" required>
                  <input required value={form.replaced_part ?? ''} onChange={(e) => setForm({ ...form, replaced_part: e.target.value })} className={inputCls} placeholder="Ex: Correia, rolamento, sensor..." />
                </Field>
                <button type="submit" disabled={!finishFieldsFilled}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl hover:from-emerald-400 hover:to-teal-400 transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
                  <CheckCircle2 className="w-4 h-4" /> {finishFieldsFilled ? 'Concluir OS' : 'Preencha os 3 campos para finalizar'}
                </button>
              </form>
            )}


          </div>
        </Modal>
      )}

      {/* Transfer Modal */}
      {transferWO && (
        <Modal title="Transferir OS para outro mecânico" onClose={() => setTransferWO(null)} maxWidth="max-w-md">
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Selecione um mecânico disponível para assumir a OS <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">{osLabel(transferWO)}</span>.
            </p>
            <Field label="Mecânico">
              <select value={transferMechanic} onChange={(e) => setTransferMechanic(e.target.value)} className={inputCls}>
                <option value="">Selecione...</option>
                {mechanics.filter((m) => m.id !== transferWO.mechanic_id).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.status === 'disponivel' ? 'Disponível' : m.status === 'em_atendimento' ? 'Em atendimento' : m.status})</option>
                ))}
              </select>
            </Field>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setTransferWO(null)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="button" disabled={!transferMechanic} onClick={() => { transferOrder(transferWO, transferMechanic); setTransferWO(null); }} className="flex-1 py-2.5 bg-gradient-to-r from-sky-500 to-cyan-500 text-white font-medium rounded-xl hover:from-sky-400 hover:to-cyan-400 transition disabled:opacity-40 disabled:cursor-not-allowed">
                Transferir
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
