import { useEffect, useState, type FormEvent } from 'react';
import { supabase, type Company, type Contract } from '@/lib/supabase';
import { Modal, Field, inputCls, Spinner, EmptyState } from '@/components/ui';
import {
  FileText, Plus, RefreshCw, Eye, Download, Trash2,
  CheckCircle2, Clock, XCircle, Building2, Calendar, DollarSign, Pencil,
} from 'lucide-react';

type ContractWithCompany = Contract & { company_name: string };

const STATUS_INFO: Record<Contract['status'], { label: string; color: string; icon: typeof CheckCircle2 }> = {
  draft: { label: 'Rascunho', color: 'slate', icon: Pencil },
  sent: { label: 'Enviado', color: 'amber', icon: Clock },
  signed: { label: 'Assinado', color: 'emerald', icon: CheckCircle2 },
  expired: { label: 'Expirado', color: 'rose', icon: XCircle },
  canceled: { label: 'Cancelado', color: 'rose', icon: XCircle },
};

const STATUS_COLORS: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

export default function ContractsScreen() {
  const [contracts, setContracts] = useState<ContractWithCompany[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewing, setViewing] = useState<ContractWithCompany | null>(null);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [form, setForm] = useState<Partial<Contract>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: contractsData } = await supabase
      .from('contracts')
      .select('*')
      .order('created_at', { ascending: false });
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('name', { ascending: true });

    const companyMap = new Map((companiesData ?? []).map((c: Company) => [c.id, c.name]));
    const merged = (contractsData ?? []).map((c: Contract) => ({
      ...c,
      company_name: companyMap.get(c.company_id) ?? 'Empresa removida',
    }));
    setContracts(merged);
    setCompanies(companiesData ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      plan: 'paid',
      monthly_fee: 199.90,
      duration_months: 12,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      status: 'draft',
    });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (c: Contract) => {
    setEditing(c);
    setForm({
      company_id: c.company_id,
      plan: c.plan,
      monthly_fee: c.monthly_fee,
      duration_months: c.duration_months,
      start_date: c.start_date,
      end_date: c.end_date,
      client_name: c.client_name,
      client_email: c.client_email,
      client_cpf: c.client_cpf,
      status: c.status,
      notes: c.notes,
    });
    setError(null);
    setModalOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        company_id: form.company_id,
        plan: form.plan ?? 'paid',
        monthly_fee: form.monthly_fee != null ? Number(form.monthly_fee) : null,
        duration_months: form.duration_months ?? 12,
        start_date: form.start_date,
        end_date: form.end_date,
        client_name: form.client_name || null,
        client_email: form.client_email || null,
        client_cpf: form.client_cpf || null,
        status: form.status ?? 'draft',
        notes: form.notes || null,
      };

      if (editing) {
        const { error: err } = await supabase.from('contracts').update(payload).eq('id', editing.id);
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('contracts').insert(payload);
        if (err) throw err;
      }
      setSaving(false);
      setModalOpen(false);
      load();
    } catch (err) {
      console.error('contracts save failed', err);
      setError('Não foi possível salvar o contrato. Verifique os dados e tente novamente.');
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Excluir este contrato? Esta ação não pode ser desfeita.')) return;
    const { error: delErr } = await supabase.from('contracts').delete().eq('id', id);
    if (delErr) { alert('Erro ao excluir contrato: ' + delErr.message); return; }
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Contratos</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Gere e gerencie contratos de licença das empresas clientes
          </p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm whitespace-nowrap">
          <Plus className="w-5 h-5" /> Novo contrato
        </button>
      </div>

      {!loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Total" value={contracts.length} icon={FileText} color="sky" />
          <SummaryCard label="Assinados" value={contracts.filter(c => c.status === 'signed').length} icon={CheckCircle2} color="emerald" />
          <SummaryCard label="Aguardando" value={contracts.filter(c => c.status === 'draft' || c.status === 'sent').length} icon={Clock} color="amber" />
          <SummaryCard label="Expirados/Cancelados" value={contracts.filter(c => c.status === 'expired' || c.status === 'canceled').length} icon={XCircle} color="rose" />
        </div>
      )}

      <button onClick={load} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition">
        <RefreshCw className="w-4 h-4" /> Atualizar lista
      </button>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : contracts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12">
          <EmptyState icon={FileText} text="Nenhum contrato criado ainda. Clique em 'Novo contrato' para gerar o primeiro." />
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => {
            const info = STATUS_INFO[c.status];
            const StatusIcon = info.icon;
            return (
              <div key={c.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 hover:shadow-md transition">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{c.contract_number}</p>
                      <p className="text-xs text-slate-400 truncate">{c.company_name}</p>
                    </div>
                  </div>

                  <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${STATUS_COLORS[info.color]}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {info.label}
                  </span>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Calendar className="w-4 h-4" />
                      <span className="text-slate-700 dark:text-slate-300">{new Date(c.start_date).toLocaleDateString('pt-BR')} — {new Date(c.end_date).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {c.monthly_fee != null && (
                      <div className="flex items-center gap-1.5 text-slate-500">
                        <DollarSign className="w-4 h-4" />
                        <span className="text-slate-700 dark:text-slate-300">R$ {Number(c.monthly_fee).toFixed(2).replace('.', ',')}/mês</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewing(c)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-cyan-600 transition" title="Visualizar / PDF">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600 transition" title="Editar">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(c.id)} className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 text-slate-400 hover:text-rose-500 transition" title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      {modalOpen && (
        <Modal title={editing ? `Editar contrato ${editing.contract_number}` : 'Novo contrato'} onClose={() => setModalOpen(false)} maxWidth="max-w-xl">
          <form onSubmit={save} className="space-y-4">
            <Field label="Empresa" required>
              <select
                required
                value={form.company_id ?? ''}
                onChange={(e) => setForm({ ...form, company_id: e.target.value })}
                className={inputCls}
                disabled={!!editing}
              >
                <option value="">Selecione...</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Plano">
                <select value={form.plan ?? 'paid'} onChange={(e) => setForm({ ...form, plan: e.target.value as 'trial' | 'paid' })} className={inputCls}>
                  <option value="trial">Teste (Trial)</option>
                  <option value="paid">Pago (Mensal)</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={form.status ?? 'draft'} onChange={(e) => setForm({ ...form, status: e.target.value as Contract['status'] })} className={inputCls}>
                  <option value="draft">Rascunho</option>
                  <option value="sent">Enviado</option>
                  <option value="signed">Assinado</option>
                  <option value="expired">Expirado</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Data de início">
                <input type="date" value={form.start_date ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Data de término">
                <input type="date" value={form.end_date ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
              </Field>
            </div>

            {form.plan === 'paid' && (
              <Field label="Mensalidade (R$)">
                <input type="number" step="0.01" min="0" value={form.monthly_fee ?? ''} onChange={(e) => setForm({ ...form, monthly_fee: parseFloat(e.target.value) })} className={inputCls} placeholder="199.90" />
              </Field>
            )}

            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Dados do responsável (cliente)</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nome do responsável">
                <input value={form.client_name ?? ''} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className={inputCls} placeholder="João Silva" />
              </Field>
              <Field label="E-mail">
                <input type="email" value={form.client_email ?? ''} onChange={(e) => setForm({ ...form, client_email: e.target.value })} className={inputCls} placeholder="joao@empresa.com" />
              </Field>
            </div>
            <Field label="CPF">
              <input value={form.client_cpf ?? ''} onChange={(e) => setForm({ ...form, client_cpf: e.target.value })} className={inputCls} placeholder="000.000.000-00" />
            </Field>

            <Field label="Observações">
              <textarea value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} rows={2} placeholder="Cláusulas adicionais, condições especiais..." />
            </Field>

            {error && (
              <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg p-3 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">
                {saving ? 'Salvando...' : 'Salvar contrato'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Contract viewer / PDF */}
      {viewing && (
        <ContractViewer contract={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: typeof Building2; color: 'sky' | 'amber' | 'emerald' | 'rose';
}) {
  const colors = {
    sky: 'text-sky-500 bg-sky-50 dark:bg-sky-950/30',
    amber: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30',
    emerald: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
    rose: 'text-rose-500 bg-rose-50 dark:bg-rose-950/30',
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function ContractViewer({ contract, onClose }: { contract: ContractWithCompany; onClose: () => void }) {
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fmtMoney = (v: number | null) => v != null ? `R$ ${Number(v).toFixed(2).replace('.', ',')}` : '—';
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  const handlePrint = () => {
    const el = document.getElementById('contract-print-area');
    if (!el) return;
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Contrato ${contract.contract_number}</title>
      <style>
        * { font-family: Georgia, 'Times New Roman', serif; }
        body { padding: 48px; color: #1e293b; max-width: 720px; margin: 0 auto; line-height: 1.8; }
        h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }
        h2 { font-size: 16px; margin-top: 28px; margin-bottom: 8px; }
        .subtitle { text-align: center; color: #64748b; font-size: 13px; margin-bottom: 32px; }
        .clause { margin-bottom: 18px; text-align: justify; font-size: 14px; }
        .sign { margin-top: 48px; display: flex; justify-content: space-between; gap: 48px; }
        .sign-block { flex: 1; }
        .sign-line { border-top: 1px solid #334155; margin-top: 48px; padding-top: 8px; text-align: center; font-size: 12px; color: #475569; }
        .header-info { display: flex; justify-content: space-between; margin-bottom: 24px; font-size: 12px; color: #64748b; }
        @media print { body { padding: 0; } }
      </style></head><body>${el.innerHTML}</body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <Modal title={`Contrato ${contract.contract_number}`} onClose={onClose} maxWidth="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${STATUS_COLORS[STATUS_INFO[contract.status].color]}`}>
          {STATUS_INFO[contract.status].label}
        </span>
        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition text-sm">
          <Download className="w-4 h-4" /> Gerar PDF
        </button>
      </div>

      <div id="contract-print-area" className="bg-white text-slate-800 rounded-xl p-6 sm:p-8 border border-slate-200" style={{ fontFamily: 'Georgia, serif', lineHeight: 1.8 }}>
        <div className="header-info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '12px', color: '#64748b' }}>
          <span>{contract.contract_number}</span>
          <span>Data: {today}</span>
        </div>

        <h1 style={{ textAlign: 'center', fontSize: '22px', marginBottom: '4px' }}>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
        <p className="subtitle" style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginBottom: '32px' }}>
          Plataforma CLEVIA — Software de Gestão de Manutenção Industrial
        </p>

        <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
          Pelo presente instrumento particular, de um lado <strong>CLEVIA SOFTWARE</strong>, inscrita sob CNPJ XX.XXX.XXX/0001-XX, doravante denominada <strong>CONTRATADA</strong>, e de outro lado <strong>{contract.company_name}</strong>{contract.client_name ? `, representada por ${contract.client_name}` : ''}, doravante denominada <strong>CONTRATANTE</strong>, celebram o presente Contrato de Prestação de Serviços, que se regerá pelas cláusulas a seguir:
        </div>

        <h2 style={{ fontSize: '16px', marginTop: '28px', marginBottom: '8px' }}>Cláusula 1ª — Objeto</h2>
        <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
          A CONTRATADA disponibilizará à CONTRATANTE o acesso à plataforma de software CLEVIA, sistema de gestão de manutenção industrial, compreendendo ordens de serviço, gestão de máquinas, mecânicos, indicadores, estoque e assistente de IA, na modalidade Software as a Service (SaaS).
        </div>

        <h2 style={{ fontSize: '16px', marginTop: '28px', marginBottom: '8px' }}>Cláusula 2ª — Plano e Vigência</h2>
        <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
          O plano contratado é <strong>{contract.plan === 'trial' ? 'TESTE GRATUITO (Trial)' : 'PAGO (Mensal)'}</strong>, com vigência de <strong>{contract.duration_months} meses</strong>, iniciando-se em <strong>{fmtDate(contract.start_date)}</strong> e terminando em <strong>{fmtDate(contract.end_date)}</strong>.
          {contract.plan === 'paid' && contract.monthly_fee != null && (
            <> A mensalidade é de <strong>{fmtMoney(contract.monthly_fee)}</strong>, com vencimento no dia 1º de cada mês.</>
          )}
          {contract.plan === 'trial' && <> O período de teste é gratuito e sem ônus para a CONTRATANTE.</>}
        </div>

        <h2 style={{ fontSize: '16px', marginTop: '28px', marginBottom: '8px' }}>Cláusula 3ª — Licença de Uso</h2>
        <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
          A licença concedida é <strong>por empresa</strong>, permitindo o cadastro de usuários ilimitados (gerentes, solicitantes e mecânicos) vinculados à CONTRATANTE, sem custo adicional por usuário. O acesso é pessoal e intransferível, sendo a CONTRATANTE responsável pelas credenciais de seus usuários.
        </div>

        <h2 style={{ fontSize: '16px', marginTop: '28px', marginBottom: '8px' }}>Cláusula 4ª — Obrigações da CONTRATADA</h2>
        <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
          a) Manter o sistema disponível 24 horas por dia, 7 dias por semana, salvo interrupções por manutenção programada;<br />
          b) Prestar suporte técnico via e-mail e WhatsApp;<br />
          c) Garantir a segurança e confidencialidade dos dados da CONTRATANTE.
        </div>

        <h2 style={{ fontSize: '16px', marginTop: '28px', marginBottom: '8px' }}>Cláusula 5ª — Obrigações da CONTRATANTE</h2>
        <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
          a) Efetuar o pagamento da mensalidade em dia (quando plano pago);<br />
          b) Utilizar o sistema de forma lícita e responsável;<br />
          c) Não compartilhar o acesso com terceiros fora da empresa.
        </div>

        <h2 style={{ fontSize: '16px', marginTop: '28px', marginBottom: '8px' }}>Cláusula 6ª — Rescisão</h2>
        <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
          Qualquer das partes poderá rescindir o presente contrato mediante aviso prévio de 30 dias. Em caso de inadimplência superior a 15 dias, a CONTRATADA poderá bloquear o acesso ao sistema sem prejuízo da cobrança dos valores devidos.
        </div>

        <h2 style={{ fontSize: '16px', marginTop: '28px', marginBottom: '8px' }}>Cláusula 7ª — Disposições Gerais</h2>
        <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
          O presente contrato é regido pela legislação brasileira. Fica eleito o foro da comarca do CONTRATANTE para dirimir eventuais dúvidas. E, por estarem de acordo, assinam o presente instrumento em 2 (duas) vias de igual teor.
        </div>

        {contract.notes && (
          <>
            <h2 style={{ fontSize: '16px', marginTop: '28px', marginBottom: '8px' }}>Cláusula 8ª — Observações Adicionais</h2>
            <div className="clause" style={{ marginBottom: '18px', textAlign: 'justify', fontSize: '14px' }}>
              {contract.notes}
            </div>
          </>
        )}

        <div className="sign" style={{ marginTop: '48px', display: 'flex', justifyContent: 'space-between', gap: '48px' }}>
          <div className="sign-block" style={{ flex: 1 }}>
            <div className="sign-line" style={{ borderTop: '1px solid #334155', marginTop: '48px', paddingTop: '8px', textAlign: 'center', fontSize: '12px', color: '#475569' }}>
              CLEVIA SOFTWARE — Contratada
            </div>
          </div>
          <div className="sign-block" style={{ flex: 1 }}>
            <div className="sign-line" style={{ borderTop: '1px solid #334155', marginTop: '48px', paddingTop: '8px', textAlign: 'center', fontSize: '12px', color: '#475569' }}>
              {contract.company_name} — Contratante
              {contract.client_name && <><br />{contract.client_name}</>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
