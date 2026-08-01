import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type InventoryItem, type Branch } from '@/lib/supabase';
type BranchLite = Pick<Branch, 'id' | 'name'>;
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import { Boxes, Plus, Search, Pencil, Trash2, MapPin, AlertTriangle, Package, Minus, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';

export default function InventoryScreen() {
  const { activeCompany, activeRole } = useAuth();
  const cid = activeCompany?.id;
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [branches, setBranches] = useState<BranchLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<Partial<InventoryItem>>({});
  const [saving, setSaving] = useState(false);
  const [baixaItem, setBaixaItem] = useState<InventoryItem | null>(null);
  const [baixaQty, setBaixaQty] = useState(1);
  const [baixaSaving, setBaixaSaving] = useState(false);
  const [entradaItem, setEntradaItem] = useState<InventoryItem | null>(null);
  const [entradaQty, setEntradaQty] = useState(1);
  const [entradaSaving, setEntradaSaving] = useState(false);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const [i, b] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
      supabase.from('branches').select('id, name').eq('company_id', cid),
    ]);
    setItems(i.data ?? []);
    setBranches(b.data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  useEffect(() => {
    if (!cid) return;
    const channel = supabase.channel('inventory-screen-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items', filter: `company_id=eq.${cid}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

  const filtered = items.filter((i) => {
    const q = search.toLowerCase();
    return i.name.toLowerCase().includes(q) ||
      (i.code ?? '').toLowerCase().includes(q) ||
      (i.category ?? '').toLowerCase().includes(q) ||
      (i.location ?? '').toLowerCase().includes(q);
  });
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'Matriz';
  const canEdit = activeRole === 'ceo' || activeRole === 'gerente' || activeRole === 'solicitante';

  const openNew = () => { setEditing(null); setForm({ quantity: 0, min_quantity: 0, unit: 'un' }); setModalOpen(true); };
  const openEdit = (i: InventoryItem) => { setEditing(i); setForm(i); setModalOpen(true); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    const payload = { ...form, company_id: cid, quantity: Number(form.quantity), min_quantity: Number(form.min_quantity) };
    if (editing) { const { error: updErr } = await supabase.from('inventory_items').update(payload).eq('id', editing.id); if (updErr) { alert('Erro ao atualizar item: ' + updErr.message); setSaving(false); return; } }
    else { const { error: insErr } = await supabase.from('inventory_items').insert(payload); if (insErr) { alert('Erro ao cadastrar item: ' + insErr.message); setSaving(false); return; } }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (i: InventoryItem) => {
    if (!confirm(`Excluir o item "${i.name}"?`)) return;
    const { error: delErr } = await supabase.from('inventory_items').delete().eq('id', i.id);
    if (delErr) { alert('Erro ao excluir item: ' + delErr.message); return; }
    load();
  };

  const darBaixa = async () => {
    if (!baixaItem) return;
    const qty = Math.max(0, Number(baixaQty) || 0);
    if (qty <= 0) return;
    const novaQtd = Math.max(0, baixaItem.quantity - qty);
    setBaixaSaving(true);
    const { error: baixaErr } = await supabase.from('inventory_items').update({ quantity: novaQtd }).eq('id', baixaItem.id);
    setBaixaSaving(false);
    if (baixaErr) { alert('Erro ao dar baixa: ' + baixaErr.message); return; }
    setBaixaItem(null);
    setBaixaQty(1);
    load();
  };

  const openBaixa = (i: InventoryItem) => {
    setBaixaItem(i);
    setBaixaQty(1);
  };

  const darEntrada = async () => {
    if (!entradaItem) return;
    const qty = Math.max(0, Number(entradaQty) || 0);
    if (qty <= 0) return;
    const novaQtd = entradaItem.quantity + qty;
    setEntradaSaving(true);
    const { error: entradaErr } = await supabase.from('inventory_items').update({ quantity: novaQtd }).eq('id', entradaItem.id);
    setEntradaSaving(false);
    if (entradaErr) { alert('Erro ao adicionar ao estoque: ' + entradaErr.message); return; }
    setEntradaItem(null);
    setEntradaQty(1);
    load();
  };

  const openEntrada = (i: InventoryItem) => {
    setEntradaItem(i);
    setEntradaQty(1);
  };

  const lowStock = items.filter((i) => i.quantity <= i.min_quantity).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Estoque</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Peças e insumos para manutenção</p>
        </div>
        {canEdit && (
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm">
            <Plus className="w-5 h-5" /> Novo item
          </button>
        )}
      </div>

      {lowStock > 0 && (
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-4 text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> {lowStock} {lowStock === 1 ? 'item está' : 'itens estão'} com estoque baixo ou zerado.
        </div>
      )}

      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar item..."
          className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition" />
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={Boxes} text="Nenhum item em estoque." />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {filtered.map((i) => {
            const low = i.quantity <= i.min_quantity;
            return (
              <div key={i.id} className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-sm p-5 hover:shadow-md transition group ${low ? 'border-rose-200 dark:border-rose-800' : 'border-slate-100 dark:border-slate-800'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${low ? 'bg-rose-50 dark:bg-rose-950/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                      <Package className={`w-5 h-5 ${low ? 'text-rose-500' : 'text-slate-500'}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-slate-100">{i.name}</p>
                      {i.code && <p className="text-xs text-slate-400">{i.code}</p>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition">
                      <button onClick={() => openEdit(i)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>
                      {(activeRole === 'ceo' || activeRole === 'gerente') && <button onClick={() => remove(i)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 text-sm">
                  {i.category && <p className="text-slate-500 dark:text-slate-400">{i.category}</p>}
                  <p className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><MapPin className="w-4 h-4" />{branchName(i.branch_id)}</p>
                </div>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${low ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{i.quantity} <span className="text-sm font-normal text-slate-400">{i.unit}</span></p>
                      <p className="text-xs text-slate-400">Mínimo: {i.min_quantity} {i.unit}</p>
                    </div>
                    {low && <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Estoque baixo</span>}
                  </div>
                  {canEdit && (
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => openEntrada(i)} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition">
                        <ArrowUpCircle className="w-4 h-4 flex-shrink-0" /> <span className="truncate">Adicionar</span>
                      </button>
                      <button onClick={() => openBaixa(i)} disabled={i.quantity <= 0} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition disabled:opacity-40 disabled:cursor-not-allowed">
                        <ArrowDownCircle className="w-4 h-4 flex-shrink-0" /> <span className="truncate">Dar baixa</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {entradaItem && (
        <Modal title="Adicionar ao estoque" onClose={() => { setEntradaItem(null); setEntradaQty(1); }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{entradaItem.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Disponivel: <span className="font-medium text-slate-700 dark:text-slate-200">{entradaItem.quantity} {entradaItem.unit}</span></p>
              </div>
            </div>
            <Field label="Quantidade a adicionar" required>
              <input
                type="number"
                required
                min={1}
                step="any"
                value={entradaQty}
                onChange={(e) => setEntradaQty(Number(e.target.value))}
                className={inputCls}
                autoFocus
              />
            </Field>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-sm">
              <Plus className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500 dark:text-slate-400">Novo saldo:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">{entradaItem.quantity + Math.max(0, Number(entradaQty) || 0)} {entradaItem.unit}</span>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setEntradaItem(null); setEntradaQty(1); }} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="button" onClick={darEntrada} disabled={entradaSaving || !entradaQty || entradaQty <= 0} className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-medium rounded-xl hover:from-emerald-400 hover:to-teal-400 transition disabled:opacity-60">
                {entradaSaving ? 'Processando...' : 'Confirmar entrada'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {baixaItem && (
        <Modal title="Dar baixa no estoque" onClose={() => { setBaixaItem(null); setBaixaQty(1); }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
              <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950/40 flex items-center justify-center">
                <Package className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{baixaItem.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">Disponível: <span className="font-medium text-slate-700 dark:text-slate-200">{baixaItem.quantity} {baixaItem.unit}</span></p>
              </div>
            </div>
            <Field label="Quantidade a retirar" required>
              <input
                type="number"
                required
                min={1}
                max={baixaItem.quantity}
                step="any"
                value={baixaQty}
                onChange={(e) => setBaixaQty(Number(e.target.value))}
                className={inputCls}
                autoFocus
              />
            </Field>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-sm">
              <Minus className="w-4 h-4 text-slate-400" />
              <span className="text-slate-500 dark:text-slate-400">Novo saldo:</span>
              <span className="font-bold text-slate-800 dark:text-slate-100">{Math.max(0, baixaItem.quantity - Math.max(0, Number(baixaQty) || 0))} {baixaItem.unit}</span>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => { setBaixaItem(null); setBaixaQty(1); }} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="button" onClick={darBaixa} disabled={baixaSaving || !baixaQty || baixaQty <= 0} className="flex-1 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:from-amber-400 hover:to-orange-400 transition disabled:opacity-60">
                {baixaSaving ? 'Processando...' : 'Confirmar baixa'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Editar item' : 'Novo item'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome" required>
              <input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Ex: Rolamento 6204 ZZ" />
            </Field>
            <Field label="Código">
              <input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Quantidade" required>
                <input type="number" required min={0} step="any" value={form.quantity ?? 0} onChange={(e) => setForm({ ...form, quantity: e.target.value as unknown as number })} className={inputCls} />
              </Field>
              <Field label="Mínimo" required>
                <input type="number" required min={0} step="any" value={form.min_quantity ?? 0} onChange={(e) => setForm({ ...form, min_quantity: e.target.value as unknown as number })} className={inputCls} />
              </Field>
              <Field label="Unidade">
                <input value={form.unit ?? 'un'} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Field label="Localização">
              <input value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Filial">
              <select value={form.branch_id ?? ''} onChange={(e) => setForm({ ...form, branch_id: e.target.value || null })} className={inputCls}>
                <option value="">Matriz</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
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
    </div>
  );
}
