import type { Machine, WorkOrder } from '@/lib/supabase';

export type OSPriority = 'critica' | 'alta' | 'media' | 'baixa';

export const PRIORITY_ORDER: OSPriority[] = ['critica', 'alta', 'media', 'baixa'];

export const PRIORITY_RANK: Record<OSPriority, number> = {
  critica: 0, alta: 1, media: 2, baixa: 3,
};

export const PRIORITY_LABELS: Record<OSPriority, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
};

export interface PriorityStyle {
  key: OSPriority;
  label: string;
  hex: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
  ring: string;
  gradient: string;
}

export const PRIORITY_STYLES: Record<OSPriority, PriorityStyle> = {
  critica: {
    key: 'critica', label: 'Crítica', hex: '#ef4444',
    bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/40',
    dot: 'bg-rose-500', ring: 'ring-rose-500/40',
    gradient: 'from-rose-500 to-red-600',
  },
  alta: {
    key: 'alta', label: 'Alta', hex: '#f97316',
    bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/40',
    dot: 'bg-orange-500', ring: 'ring-orange-500/40',
    gradient: 'from-orange-500 to-amber-600',
  },
  media: {
    key: 'media', label: 'Média', hex: '#0ea5e9',
    bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/40',
    dot: 'bg-sky-500', ring: 'ring-sky-500/40',
    gradient: 'from-sky-500 to-blue-600',
  },
  baixa: {
    key: 'baixa', label: 'Baixa', hex: '#64748b',
    bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/40',
    dot: 'bg-slate-500', ring: 'ring-slate-500/40',
    gradient: 'from-slate-500 to-slate-600',
  },
};

const OPEN_STATUSES = ['aberta', 'em_andamento', 'pausada', 'aguardando_pecas'];

export function machineEffectivePriority(
  machineId: string | null,
  workOrders: WorkOrder[]
): OSPriority | null {
  if (!machineId) return null;
  const open = workOrders.filter(
    (w) => w.machine_id === machineId && OPEN_STATUSES.includes(w.status)
  );
  if (open.length === 0) return null;
  return open.reduce<OSPriority>((highest, w) => {
    const p = w.priority as OSPriority;
    return PRIORITY_RANK[p] < PRIORITY_RANK[highest] ? p : highest;
  }, 'baixa');
}

export function machinesByPriority(
  machines: Machine[],
  workOrders: WorkOrder[]
): Record<OSPriority, Machine[]> {
  const result: Record<OSPriority, Machine[]> = {
    critica: [], alta: [], media: [], baixa: [],
  };
  for (const m of machines) {
    const p = machineEffectivePriority(m.id, workOrders);
    if (p) result[p].push(m);
  }
  return result;
}

export function priorityCounts(
  machines: Machine[],
  workOrders: WorkOrder[]
): Record<OSPriority, number> {
  const grouped = machinesByPriority(machines, workOrders);
  return {
    critica: grouped.critica.length,
    alta: grouped.alta.length,
    media: grouped.media.length,
    baixa: grouped.baixa.length,
  };
}
