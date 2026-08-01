import { useState, useCallback, useEffect } from 'react';
import { supabase, type ReportTemplate } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Spinner, EmptyState, inputCls, Modal, Field } from '@/components/ui';
import { FileBarChart, Download, FileSpreadsheet, FileText, TrendingUp, Wrench, Boxes, Factory, Users, Calendar, Save, Trash2, Settings2, Columns3 } from 'lucide-react';

type ReportType = 'production' | 'maintenance' | 'costs' | 'machines' | 'parts' | 'mechanics' | 'operators' | 'sectors' | 'companies';
type PeriodType = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'custom';

const REPORTS: { id: ReportType; label: string; icon: typeof Factory; color: string }[] = [
  { id: 'production', label: 'Produção', icon: TrendingUp, color: 'text-emerald-400' },
  { id: 'maintenance', label: 'Manutenção', icon: Wrench, color: 'text-orange-400' },
  { id: 'costs', label: 'Custos', icon: FileBarChart, color: 'text-amber-400' },
  { id: 'machines', label: 'Máquinas', icon: Factory, color: 'text-cyan-400' },
  { id: 'parts', label: 'Peças', icon: Boxes, color: 'text-blue-400' },
  { id: 'mechanics', label: 'Mecânicos', icon: Users, color: 'text-violet-400' },
  { id: 'operators', label: 'Operadores', icon: Users, color: 'text-sky-400' },
  { id: 'sectors', label: 'Setores', icon: Factory, color: 'text-teal-400' },
  { id: 'companies', label: 'Empresas', icon: Factory, color: 'text-indigo-400' },
];

function getPeriodRange(period: PeriodType, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  switch (period) {
    case 'today': return { start: fmt(today), end: fmt(today) };
    case 'yesterday': { const y = new Date(today); y.setDate(y.getDate() - 1); return { start: fmt(y), end: fmt(y) }; }
    case 'week': { const w = new Date(today); w.setDate(w.getDate() - 6); return { start: fmt(w), end: fmt(today) }; }
    case 'month': { return { start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0], end: fmt(today) }; }
    case 'year': { return { start: new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0], end: fmt(today) }; }
    case 'custom': return { start: customStart || fmt(today), end: customEnd || fmt(today) };
  }
}

export default function ReportsScreen() {
  const { activeCompany, activeRole } = useAuth();
  const [reportType, setReportType] = useState<ReportType>('production');
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  const generateReport = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    setHasGenerated(true);
    const { start, end } = getPeriodRange(period, customStart, customEnd);
    try {
      let rows: Record<string, unknown>[] = [];
      const cid = activeCompany.id;

      if (reportType === 'production') {
        const { data: logs } = await supabase.from('production_logs').select('log_date, units_produced, uptime_hours, production_hour, shift, machine_id').eq('company_id', cid).gte('log_date', start).lte('log_date', end).order('log_date', { ascending: false });
        const { data: machines } = await supabase.from('machines').select('id, name, code').eq('company_id', cid);
        const machineMap: Record<string, string> = {};
        (machines || []).forEach((m: Record<string, unknown>) => { machineMap[m.id as string] = `${m.code} - ${m.name}`; });
        const dayMap: Record<string, { date: string; units: number; hours: number; entries: number }> = {};
        (logs || []).forEach((l: Record<string, unknown>) => {
          const d = l.log_date as string;
          if (!dayMap[d]) dayMap[d] = { date: d, units: 0, hours: 0, entries: 0 };
          dayMap[d].units += Number(l.units_produced) || 0;
          dayMap[d].hours += Number(l.uptime_hours) || 0;
          dayMap[d].entries += 1;
        });
        rows = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date)).map((d) => ({
          Data: d.date,
          'Unidades Produzidas': d.units,
          'Horas Operando': d.hours.toFixed(1),
          'Registros': d.entries,
        }));
      } else if (reportType === 'maintenance') {
        const { data: wos } = await supabase.from('work_orders').select('*').eq('company_id', cid).gte('created_at', start).lte('created_at', end + 'T23:59:59').order('created_at', { ascending: false });
        const { data: machines } = await supabase.from('machines').select('id, name, code').eq('company_id', cid);
        const { data: mechs } = await supabase.from('mechanics').select('id, name').eq('company_id', cid);
        const machineMap: Record<string, string> = {};
        (machines || []).forEach((m: Record<string, unknown>) => { machineMap[m.id as string] = `${m.code} - ${m.name}`; });
        const mechMap: Record<string, string> = {};
        (mechs || []).forEach((m: Record<string, unknown>) => { mechMap[m.id as string] = m.name as string; });
        rows = (wos || []).map((w: Record<string, unknown>) => ({
          'OS #': w.os_number || w.id?.toString().slice(0, 8),
          Título: w.title || '—',
          Máquina: machineMap[w.machine_id as string] || '—',
          Mecânico: mechMap[w.mechanic_id as string] || '—',
          Status: w.status,
          Prioridade: w.priority,
          'Defeito': w.defect || '—',
          'Abertura': w.created_at ? new Date(w.created_at as string).toLocaleString('pt-BR') : '—',
          'Finalização': w.finished_at ? new Date(w.finished_at as string).toLocaleString('pt-BR') : '—',
        }));
      } else if (reportType === 'costs') {
        const { data: wos } = await supabase.from('work_orders').select('id, status, priority, replaced_part').eq('company_id', cid).gte('created_at', start).lte('created_at', end + 'T23:59:59');
        const { data: inv } = await supabase.from('inventory_items').select('name, quantity, min_quantity, cost, supplier').eq('company_id', cid);
        const osTotal = (wos || []).length;
        const osConcluidas = (wos || []).filter((w: Record<string, unknown>) => w.status === 'concluida').length;
        const osCriticas = (wos || []).filter((w: Record<string, unknown>) => w.priority === 'critica').length;
        const stockValue = (inv || []).reduce((sum: number, i: Record<string, unknown>) => sum + ((i.cost as number) || 0) * ((i.quantity as number) || 0), 0);
        const lowStock = (inv || []).filter((i: Record<string, unknown>) => Number(i.quantity) <= Number(i.min_quantity)).length;
        rows = [
          { Categoria: 'Ordens de Serviço', 'Quantidade': osTotal, 'Detalhes': `Total de OS no período` },
          { Categoria: 'OS Concluídas', 'Quantidade': osConcluidas, 'Detalhes': `${osTotal > 0 ? Math.round((osConcluidas / osTotal) * 100) : 0}% do total` },
          { Categoria: 'OS Críticas', 'Quantidade': osCriticas, 'Detalhes': `Prioridade crítica` },
          { Categoria: 'Valor em Estoque', 'Valor (R$)': stockValue.toFixed(2), 'Detalhes': `${(inv || []).length} itens cadastrados` },
          { Categoria: 'Itens com Estoque Baixo', 'Quantidade': lowStock, 'Detalhes': `Abaixo da quantidade mínima` },
        ];
      } else if (reportType === 'machines') {
        const { data: machines } = await supabase.from('machines').select('*').eq('company_id', cid).order('sector');
        const { data: wos } = await supabase.from('work_orders').select('machine_id, status').eq('company_id', cid).gte('created_at', start).lte('created_at', end + 'T23:59:59');
        const osCount: Record<string, number> = {};
        const osOpen: Record<string, number> = {};
        (wos || []).forEach((w: Record<string, unknown>) => {
          const mid = w.machine_id as string;
          if (!mid) return;
          osCount[mid] = (osCount[mid] || 0) + 1;
          if (w.status !== 'concluida' && w.status !== 'cancelada') osOpen[mid] = (osOpen[mid] || 0) + 1;
        });
        rows = (machines || []).map((m: Record<string, unknown>) => ({ Código: m.code, Nome: m.name, Setor: m.sector, Modelo: m.model, Fabricante: m.manufacturer || '—', Status: m.status, Criticidade: m.criticality, 'OS no Período': osCount[m.id as string] || 0, 'OS em Aberto': osOpen[m.id as string] || 0 }));
      } else if (reportType === 'parts') {
        const { data: items } = await supabase.from('inventory_items').select('*').eq('company_id', cid).order('name');
        rows = (items || []).map((i: Record<string, unknown>) => ({ Código: i.code, Nome: i.name, Categoria: i.category, Quantidade: i.quantity, 'Qtd Mínima': i.min_quantity, Localização: i.location, Custo: i.cost, Fornecedor: i.supplier }));
      } else if (reportType === 'mechanics') {
        const { data: mechs } = await supabase.from('mechanics').select('*').eq('company_id', cid).order('name');
        const { data: wos } = await supabase.from('work_orders').select('mechanic_id, status').eq('company_id', cid).gte('created_at', start).lte('created_at', end + 'T23:59:59');
        const woCount: Record<string, number> = {};
        const woDone: Record<string, number> = {};
        (wos || []).forEach((w: Record<string, unknown>) => {
          if (w.mechanic_id) {
            woCount[w.mechanic_id as string] = (woCount[w.mechanic_id as string] || 0) + 1;
            if (w.status === 'concluida') woDone[w.mechanic_id as string] = (woDone[w.mechanic_id as string] || 0) + 1;
          }
        });
        rows = (mechs || []).map((m: Record<string, unknown>) => ({ Nome: m.name, Especialidade: m.specialty || '—', Telefone: m.phone || '—', Status: m.status, 'OS no Período': woCount[m.id as string] || 0, 'OS Concluídas': woDone[m.id as string] || 0 }));
      } else if (reportType === 'operators' || reportType === 'sectors') {
        const { data: machines } = await supabase.from('machines').select('sector, status, name, code').eq('company_id', cid);
        if (reportType === 'sectors') {
          const sectorMap: Record<string, { total: number; producing: number; stopped: number; maintenance: number }> = {};
          (machines || []).forEach((m: Record<string, unknown>) => {
            const s = (m.sector as string) || 'Sem setor';
            if (!sectorMap[s]) sectorMap[s] = { total: 0, producing: 0, stopped: 0, maintenance: 0 };
            sectorMap[s].total++;
            if (m.status === 'producao') sectorMap[s].producing++;
            else if (m.status === 'manutencao' || m.status === 'aguardando_mecanico') sectorMap[s].maintenance++;
            else sectorMap[s].stopped++;
          });
          rows = Object.entries(sectorMap).map(([sector, d]) => ({ Setor: sector, 'Total Máquinas': d.total, Produzindo: d.producing, Paradas: d.stopped, 'Em Manutenção': d.maintenance }));
        } else {
          rows = (machines || []).map((m: Record<string, unknown>) => ({ Máquina: `${m.code} - ${m.name}`, Setor: m.sector, Status: m.status }));
        }
      } else if (reportType === 'companies') {
        const { data: company } = await supabase.from('companies').select('id, name, cnpj, created_at').eq('id', cid).maybeSingle();
        const { data: members } = await supabase.from('company_members').select('role, display_name').eq('company_id', cid);
        const roleCount: Record<string, number> = {};
        (members || []).forEach((m: Record<string, unknown>) => { roleCount[m.role as string] = (roleCount[m.role as string] || 0) + 1; });
        rows = [
          { Empresa: company?.name || '—', CNPJ: company?.cnpj || '—', 'Total de Usuários': (members || []).length, 'Cadastro': company?.created_at || '—' },
          ...Object.entries(roleCount).map(([role, count]) => ({ Empresa: `Cargo: ${role}`, CNPJ: '—', 'Total de Usuários': count, 'Cadastro': '—' })),
        ];
      }
      setData(rows);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [activeCompany, reportType, period, customStart, customEnd]);

  useEffect(() => { generateReport(); }, [generateReport]);

  useEffect(() => {
    if (data.length > 0) {
      const cols = Object.keys(data[0]);
      if (selectedColumns.length === 0) setSelectedColumns(cols);
    }
  }, [data]);

  const loadTemplates = async () => {
    if (!activeCompany) return;
    const { data: tpls } = await supabase.from('report_templates')
      .select('*').eq('company_id', activeCompany.id).order('created_at', { ascending: false });
    setTemplates(tpls ?? []);
  };

  useEffect(() => { loadTemplates(); }, [activeCompany]);

  const saveTemplate = async () => {
    if (!activeCompany || !templateName.trim()) return;
    const { error: tplErr } = await supabase.from('report_templates').insert({
      company_id: activeCompany.id,
      name: templateName.trim(),
      report_type: reportType,
      period_type: period,
      custom_start: customStart || null,
      custom_end: customEnd || null,
      columns: selectedColumns,
      created_by: (await supabase.auth.getSession()).data.session?.user?.id ?? null,
    });
    if (tplErr) { alert('Erro ao salvar modelo: ' + tplErr.message); return; }
    setTemplateName('');
    setShowTemplateModal(false);
    loadTemplates();
  };

  const applyTemplate = (t: ReportTemplate) => {
    setReportType(t.report_type as ReportType);
    setPeriod(t.period_type as PeriodType);
    setCustomStart(t.custom_start ?? '');
    setCustomEnd(t.custom_end ?? '');
    setSelectedColumns(t.columns ?? []);
  };

  const deleteTemplate = async (t: ReportTemplate) => {
    const { error: delErr } = await supabase.from('report_templates').delete().eq('id', t.id);
    if (delErr) { alert('Erro ao excluir modelo: ' + delErr.message); return; }
    loadTemplates();
  };

  const visibleData = data.length > 0 && selectedColumns.length > 0
    ? data.map((row) => {
        const filtered: Record<string, unknown> = {};
        selectedColumns.forEach((col) => { filtered[col] = row[col]; });
        return filtered;
      })
    : data;

  const exportCSV = () => {
    if (visibleData.length === 0) return;
    const headers = Object.keys(visibleData[0]);
    const csv = [
      headers.join(';'),
      ...visibleData.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(';')),
    ].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${reportType}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (visibleData.length === 0) return;
    const headers = Object.keys(visibleData[0]);
    const { start, end } = getPeriodRange(period, customStart, customEnd);
    const reportLabel = REPORTS.find((r) => r.id === reportType)?.label || reportType;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório ${reportLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #1e293b; }
      h1 { color: #0891b2; border-bottom: 2px solid #0891b2; padding-bottom: 10px; }
      .meta { color: #64748b; margin-bottom: 20px; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th { background: #0891b2; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
      td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
      tr:nth-child(even) { background: #f8fafc; }
      .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: center; }
    </style></head><body>
    <h1>CLEVIA — Relatório de ${reportLabel}</h1>
    <div class="meta">Período: ${start} a ${end} · Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
    <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${visibleData.map((row) => `<tr>${headers.map((h) => `<td>${String(row[h] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="footer">CLEVIA Cloud — Plataforma Inteligente de Gestão Industrial</div>
    </body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${reportType}_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <FileBarChart className="w-6 h-6 text-blue-300" />
          Relatórios
        </h1>
        <p className="text-sm text-slate-400 mt-1">Gere e exporte relatórios em PDF e Excel</p>
      </div>

      {/* Report type selector */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {REPORTS.map((r) => (
          <button
            key={r.id}
            onClick={() => { setReportType(r.id); setSelectedColumns([]); }}
            className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-xl border transition ${reportType === r.id ? 'bg-cyan-500/20 border-cyan-500/40' : 'bg-slate-800/50 border-slate-700/30 hover:bg-slate-700/50'}`}
          >
            <r.icon className={`w-5 h-5 ${r.color}`} />
            <span className="text-xs text-slate-300 text-center leading-tight">{r.label}</span>
          </button>
        ))}
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {(['today', 'yesterday', 'week', 'month', 'year', 'custom'] as PeriodType[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${period === p ? 'bg-cyan-500 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {p === 'today' ? 'Hoje' : p === 'yesterday' ? 'Ontem' : p === 'week' ? 'Semana' : p === 'month' ? 'Mês' : p === 'year' ? 'Ano' : 'Personalizado'}
          </button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={`${inputCls} text-sm`} />
            <span className="text-slate-400 text-sm">até</span>
            <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={`${inputCls} text-sm`} />
          </div>
        )}
      </div>

      {/* Saved templates */}
      {templates.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <p className="text-xs text-slate-500 mb-2 flex items-center gap-1"><Save className="w-3 h-3" /> Modelos salvos</p>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 group">
                <button onClick={() => applyTemplate(t)} className="text-sm text-slate-700 dark:text-slate-200 hover:text-cyan-600 dark:hover:text-cyan-300 transition">{t.name}</button>
                <button onClick={() => deleteTemplate(t)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition"><Trash2 className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Export buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={exportPDF} disabled={visibleData.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-500 transition disabled:opacity-40 disabled:cursor-not-allowed">
          <FileText className="w-4 h-4" /> Exportar PDF
        </button>
        <button onClick={exportCSV} disabled={visibleData.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition disabled:opacity-40 disabled:cursor-not-allowed">
          <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
        </button>
        <button onClick={() => setShowColumnPicker(!showColumnPicker)} disabled={data.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition disabled:opacity-40">
          <Columns3 className="w-4 h-4" /> Colunas
        </button>
        <button onClick={() => setShowTemplateModal(true)} disabled={data.length === 0} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 text-sm font-medium hover:bg-cyan-200 dark:hover:bg-cyan-900/60 transition disabled:opacity-40">
          <Save className="w-4 h-4" /> Salvar Modelo
        </button>
        <span className="text-sm text-slate-400 ml-2">{visibleData.length} registros</span>
      </div>

      {/* Column picker */}
      {showColumnPicker && data.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <p className="text-xs text-slate-500 mb-2">Selecione as colunas para incluir no relatório:</p>
          <div className="flex flex-wrap gap-2">
            {Object.keys(data[0]).map((col) => (
              <label key={col} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                <input type="checkbox" checked={selectedColumns.includes(col)} onChange={(e) => {
                  if (e.target.checked) setSelectedColumns([...selectedColumns, col]);
                  else setSelectedColumns(selectedColumns.filter((c) => c !== col));
                }} className="rounded" />
                <span className="text-sm text-slate-700 dark:text-slate-200">{col}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Data table */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><Spinner /></div>
      ) : data.length === 0 ? (
        <EmptyState icon={FileBarChart} text="Nenhum dado encontrado para este período" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/50">
                {Object.keys(visibleData[0]).map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-slate-300 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleData.slice(0, 100).map((row, i) => (
                <tr key={i} className="border-t border-slate-700/20 hover:bg-slate-800/30">
                  {Object.keys(visibleData[0]).map((h) => (
                    <td key={h} className="px-3 py-2 text-slate-300 whitespace-nowrap">{String(row[h] ?? '—')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {visibleData.length > 100 && <div className="p-2 text-center text-xs text-slate-500">Mostrando 100 de {visibleData.length} registros. Exporte para ver todos.</div>}
        </div>
      )}

      {showTemplateModal && (
        <Modal title="Salvar Modelo de Relatório" onClose={() => setShowTemplateModal(false)} maxWidth="max-w-md">
          <div className="space-y-4">
            <Field label="Nome do modelo">
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} className={inputCls} placeholder="Ex: Produção Mensal Padrão" autoFocus />
            </Field>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowTemplateModal(false)} className="flex-1 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Cancelar</button>
              <button onClick={saveTemplate} disabled={!templateName.trim()} className="flex-1 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60">Salvar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
