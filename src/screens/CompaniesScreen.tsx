import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type Branch } from '@/lib/supabase';
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import { Building2, Plus, Pencil, Trash2, MapPin, GitBranch } from 'lucide-react';

export default function CompaniesScreen() {
  const { activeCompany } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<Partial<Branch>>({});
  const [saving, setSaving] = useState(false);

  const cid = activeCompany?.id;

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const { data } = await supabase.from('branches').select('*').eq('company_id', cid).order('created_at', { ascending: false });
    setBranches(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [cid]);

  const openNew = () => { setEditing(null); setForm({}); setModalOpen(true); };
  const openEdit = (b: Branch) => { setEditing(b); setForm(b); setModalOpen(true); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    const payload = { ...form, company_id: cid };
    if (editing) { const { error: updErr } = await supabase.from('branches').update(payload).eq('id', editing.id); if (updErr) { alert('Erro ao atualizar filial: ' + updErr.message); setSaving(false); return; } }
    else { const { error: insErr } = await supabase.from('branches').insert(payload); if (insErr) { alert('Erro ao cadastrar filial: ' + insErr.message); setSaving(false); return; } }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (b: Branch) => {
    if (!confirm(`Excluir a filial "${b.name}"?`)) return;
    const { error: delErr } = await supabase.from('branches').delete().eq('id', b.id);
    if (delErr) { alert('Erro ao excluir filial: ' + delErr.message); return; }
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Empresas</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Gerencie sua matriz e filiais</p>
      </div>

      {/* Matriz card */}
      <div className="bg-gradient-to-br from-slate-900 to-cyan-950 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-slate-950" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-xs text-cyan-300 uppercase tracking-wider">Matriz</p>
            <h3 className="text-xl font-bold">{activeCompany?.name}</h3>
            {activeCompany?.cnpj && <p className="text-sm text-slate-400">CNPJ: {activeCompany.cnpj}</p>}
          </div>
        </div>
      </div>

      {/* Filiais */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-cyan-500" /> Filiais ({branches.length})
        </h3>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm">
          <Plus className="w-5 h-5" /> Nova filial
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : branches.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={Building2} text="Nenhuma filial cadastrada." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-slate-500" />
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">{b.name}</p>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(b)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
              {b.address && <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2"><MapPin className="w-4 h-4" />{b.address}</p>}
              {(b.city || b.state) && <p className="text-sm text-slate-400 mt-1">{b.city}{b.city && b.state && ' - '}{b.state}</p>}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Editar filial' : 'Nova filial'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome" required>
              <input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Ex: Filial Centro" />
            </Field>
            <Field label="Endereço">
              <input value={form.address ?? ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Cidade">
                <input value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Estado">
                <input value={form.state ?? ''} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputCls} />
              </Field>
            </div>
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
