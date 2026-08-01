import { useState } from 'react';
import { FileText, Download, Cog, Shield, Database, Cloud, Smartphone, Code2, Layers, Bell, MapPin, Brain } from 'lucide-react';

const DOC_FILENAME = 'CLEVIA-Documento-Tecnico.html';

function buildHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>CLEVIA - Documento Tecnico</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #f8fafc; line-height: 1.6; }
  .header { background: linear-gradient(135deg, #0f172a, #1e3a5f); color: white; padding: 48px 24px; text-align: center; }
  .header h1 { font-size: 32px; letter-spacing: 2px; }
  .header .subtitle { margin-top: 8px; color: #94a3b8; font-size: 14px; }
  .header .badge { display: inline-block; margin-top: 16px; padding: 6px 16px; background: #0891b2; color: white; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .container { max-width: 800px; margin: 0 auto; padding: 32px 24px; }
  h2 { color: #0f172a; font-size: 22px; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
  h3 { color: #1e3a5f; font-size: 17px; margin: 20px 0 8px; }
  p { margin-bottom: 12px; color: #334155; }
  ul { margin: 8px 0 16px 20px; }
  li { margin-bottom: 6px; color: #334155; }
  .tech-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin: 16px 0; }
  .tech-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
  .tech-card .name { font-weight: 700; color: #0f172a; font-size: 15px; }
  .tech-card .ver { color: #0891b2; font-size: 13px; font-weight: 600; }
  .tech-card .desc { color: #64748b; font-size: 13px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  th { background: #f1f5f9; color: #0f172a; font-weight: 700; }
  .footer { text-align: center; padding: 24px; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; margin-top: 32px; }
  @media print { .header { -webkit-print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  <h1>CLEVIA &mdash; Gestao de Manutencao Industrial</h1>
  <div class="subtitle">Documento Tecnico de Desenvolvimento</div>
  <div class="badge">Versao 1.0 &middot; Julho 2026</div>
</div>

<div class="container">

  <h2>1. Visao Geral</h2>
  <p>
    O CLEVIA e um sistema web de gestao de manutencao industrial (GMAO/CMMS) desenvolvido
    para a empresa Clevia. O software gerencia ordens de servico, maquinas, mecanicos,
    preventivas, estoque de pecas, indicadores de desempenho e localizacao em tempo real
    da equipe de campo. Funciona como aplicativo web progressivo (PWA), permitindo
    instalacao no celular e funcionamento offline.
  </p>

  <h2>2. Stack Tecnologico</h2>

  <h3>Linguagem principal</h3>
  <div class="tech-grid">
    <div class="tech-card">
      <div class="name">TypeScript</div>
      <div class="ver">5.5+</div>
      <div class="desc">Linguagem principal do frontend e das edge functions. Tipagem estatica em modo strict.</div>
    </div>
  </div>

  <h3>Frontend (Interface do Usuario)</h3>
  <div class="tech-grid">
    <div class="tech-card">
      <div class="name">React</div>
      <div class="ver">18.3</div>
      <div class="desc">Biblioteca para construcao de interfaces componentizadas.</div>
    </div>
    <div class="tech-card">
      <div class="name">Vite</div>
      <div class="ver">5.4</div>
      <div class="desc">Build tool e dev server de alta performance (esbuild + Rollup).</div>
    </div>
    <div class="tech-card">
      <div class="name">Tailwind CSS</div>
      <div class="ver">3.4</div>
      <div class="desc">Framework CSS utility-first para estilizacao. Modo dark nativo.</div>
    </div>
    <div class="tech-card">
      <div class="name">Lucide React</div>
      <div class="ver">0.344</div>
      <div class="desc">Biblioteca de icones SVG leves e consistentes.</div>
    </div>
    <div class="tech-card">
      <div class="name">Leaflet</div>
      <div class="ver">1.9</div>
      <div class="desc">Mapas interativos para localizacao de mecanicos em campo.</div>
    </div>
  </div>

  <h3>Backend e Banco de Dados</h3>
  <div class="tech-grid">
    <div class="tech-card">
      <div class="name">Supabase</div>
      <div class="ver">Plataforma</div>
      <div class="desc">Backend-as-a-Service: banco de dados, autenticacao, armazenamento e funcoes serverless.</div>
    </div>
    <div class="tech-card">
      <div class="name">PostgreSQL</div>
      <div class="ver">15+</div>
      <div class="desc">Banco de dados relacional gerenciado pelo Supabase. Inclui Row Level Security (RLS).</div>
    </div>
    <div class="tech-card">
      <div class="name">Supabase Edge Functions</div>
      <div class="ver">Deno Runtime</div>
      <div class="desc">Funcoes serverless em TypeScript executadas no edge (Deno) para logica de backend.</div>
    </div>
    <div class="tech-card">
      <div class="name">Supabase Realtime</div>
      <div class="ver">WebSockets</div>
      <div class="desc">Sincronizacao de dados em tempo real via WebSockets (notificacoes, OS, localizacao).</div>
    </div>
    <div class="tech-card">
      <div class="name">Supabase Auth</div>
      <div class="ver">Email/Senha</div>
      <div class="desc">Autenticacao por email e senha com sessoes JWT gerenciadas pelo Supabase.</div>
    </div>
  </div>

  <h3>PWA e Notificacoes</h3>
  <div class="tech-grid">
    <div class="tech-card">
      <div class="name">Service Worker</div>
      <div class="ver">PWA</div>
      <div class="desc">Permite funcionamento offline e instalacao como app no celular.</div>
    </div>
    <div class="tech-card">
      <div class="name">Web Push API</div>
      <div class="ver">VAPID</div>
      <div class="desc">Notificacoes push mesmo com o app fechado, via protocolo VAPID.</div>
    </div>
    <div class="tech-card">
      <div class="name">Web Manifest</div>
      <div class="ver">3.0</div>
      <div class="desc">Manifesto PWA para instalacao em Android e iOS (standalone, portrait).</div>
    </div>
  </div>

  <h3>Ferramentas de Desenvolvimento</h3>
  <div class="tech-grid">
    <div class="tech-card">
      <div class="name">ESLint</div>
      <div class="ver">9.x</div>
      <div class="desc">Linter de codigo com plugins para React Hooks e Fast Refresh.</div>
    </div>
    <div class="tech-card">
      <div class="name">PostCSS + Autoprefixer</div>
      <div class="ver">8.x</div>
      <div class="desc">Processamento CSS com prefixos automaticos para compatibilidade entre navegadores.</div>
    </div>
    <div class="tech-card">
      <div class="name">Bolt.new</div>
      <div class="ver">Plataforma</div>
      <div class="desc">Plataforma de desenvolvimento que provisiona o projeto, Supabase e deploy automatico.</div>
    </div>
  </div>

  <h2>3. Arquitetura</h2>
  <p>O sistema segue uma arquitetura de aplicacao web de pagina unica (SPA) com backend serverless:</p>
  <ul>
    <li><strong>Frontend SPA:</strong> React + TypeScript renderizado no navegador. Roteamento interno por estado (sem React Router), com guardas de acesso por perfil de usuario.</li>
    <li><strong>Backend Serverless:</strong> Supabase fornece PostgreSQL, autenticacao, Realtime (WebSockets) e Edge Functions (Deno). Nao ha servidor tradicional para manter.</li>
    <li><strong>Multi-tenant:</strong> Cada empresa (cliente) tem seus proprios dados isolados por <em>company_id</em> e politicas de Row Level Security no banco.</li>
    <li><strong>Tempo real:</strong> Ordens de servico, notificacoes, localizacao de mecanicos e telas de monitor sincronizam via Supabase Realtime.</li>
    <li><strong>Offline-first:</strong> O app funciona offline para consultas e finalizacao de OS. Os dados sao sincronizados automaticamente quando a conexao retorna.</li>
  </ul>

  <h2>4. Funcionalidades Principais</h2>
  <table>
    <tr><th>Modulo</th><th>Descricao</th></tr>
    <tr><td>Dashboard</td><td>Indicadores visuais: disponibilidade, OS abertas, preventivas, KPIs por setor.</td></tr>
    <tr><td>Ordens de Servico (OS)</td><td>Criacao, atribuicao, pausa/retomada, finalizacao com historico tecnico. Funciona offline.</td></tr>
    <tr><td>Maquinas</td><td>Cadastro de maquinas com status (operando, parada, manutencao). Vinculo com setores.</td></tr>
    <tr><td>Quadro de Setores</td><td>Monitor visual de setores com maquinas e status em tempo real.</td></tr>
    <tr><td>Mecanicos</td><td>Gestao da equipe de campo, atribuicao de OS e acompanhamento.</td></tr>
    <tr><td>Localizacao de Mecanicos</td><td>Mapa interativo (Leaflet) com localizacao em tempo real dos mecanicos.</td></tr>
    <tr><td>Preventivas</td><td>Plano de manutencao preventiva com cronograma e lembretes.</td></tr>
    <tr><td>Estoque</td><td>Controle de pecas e insumos com quantidades e movimentacoes.</td></tr>
    <tr><td>Indicadores</td><td>MTBF, MTTR, disponibilidade, graficos e relatorios de desempenho.</td></tr>
    <tr><td>Assistente IA</td><td>Diagnostico inteligente de falhas com base em padroes de manutencao industrial.</td></tr>
    <tr><td>Notificacoes Push</td><td>Alertas em tempo real de novas OS, com som, vibracao e lembretes recorrentes.</td></tr>
    <tr><td>Empresas e Usuarios</td><td>Gestao multi-tenant de empresas clientes, usuarios e permissoes por perfil.</td></tr>
    <tr><td>Licencas e Contratos</td><td>Controle de licencas e contratos das empresas clientes (acesso admin).</td></tr>
    <tr><td>Gerenciar Telas</td><td>Configuracao de monitores de setor personalizados (acesso CEO).</td></tr>
  </table>

  <h2>5. Perfis de Acesso</h2>
  <table>
    <tr><th>Perfil</th><th>Permissoes</th></tr>
    <tr><td>CEO / Admin do Software</td><td>Acesso total a todas as empresas, licencas, contratos e configuracoes.</td></tr>
    <tr><td>Gerente</td><td>Gestao completa da empresa: OS, maquinas, equipe, estoque, indicadores.</td></tr>
    <tr><td>Mecanico</td><td>OS atribuidas, maquinas, historico, localizacao e quadro de setores (leitura).</td></tr>
    <tr><td>Solicitante</td><td>Abertura de OS, acompanhamento de indicadores e historico.</td></tr>
    <tr><td>Supervisora</td><td>Dashboard, indicadores e registros de producao.</td></tr>
  </table>

  <h2>6. Edge Functions (Backend Serverless)</h2>
  <table>
    <tr><th>Funcao</th><th>Finalidade</th></tr>
    <tr><td>ai-assistant</td><td>Diagnostico de falhas com base em padroes de manutencao industrial.</td></tr>
    <tr><td>send-push-notification</td><td>Envio de notificacoes push para mecanicos via Web Push.</td></tr>
    <tr><td>register-client-company</td><td>Cadastro de novas empresas clientes no sistema multi-tenant.</td></tr>
    <tr><td>delete-client-company</td><td>Remocao de empresas clientes.</td></tr>
    <tr><td>create-team-member</td><td>Criacao de usuarios membros da equipe.</td></tr>
    <tr><td>machine-integration-sync</td><td>Sincronizacao de dados de maquinas com sistemas externos.</td></tr>
  </table>

  <h2>7. Seguranca</h2>
  <ul>
    <li><strong>Row Level Security (RLS):</strong> Todas as tabelas do PostgreSQL possuem politicas RLS que garantem que cada usuario so acessa dados da sua empresa.</li>
    <li><strong>Autenticacao JWT:</strong> Sessoes gerenciadas pelo Supabase Auth com tokens seguros.</li>
    <li><strong>Isolamento Multi-tenant:</strong> Dados separados por <em>company_id</em> em todas as consultas.</li>
    <li><strong>CORS controlado:</strong> Todas as Edge Functions possuem cabecalhos CORS configurados.</li>
  </ul>

  <h2>8. Deploy e Infraestrutura</h2>
  <ul>
    <li><strong>Hospedagem do Frontend:</strong> Bolt.new com deploy automatico a cada alteracao.</li>
    <li><strong>Backend:</strong> Supabase Cloud (PostgreSQL, Auth, Realtime, Edge Functions, Storage).</li>
    <li><strong>CDN:</strong> Assets estaticos servidos via CDN integrado do Bolt.</li>
    <li><strong>Dominio:</strong> Acessivel via URL gerada pelo Bolt.new.</li>
  </ul>

  <div class="footer">
    CLEVIA &mdash; Gestao de Manutencao Industrial &middot; Documento gerado em ${new Date().toLocaleDateString('pt-BR')}
    <br/>Desenvolvido por Bolt.new &middot; CEO: Clebson Bernardo Velho
  </div>

</div>

</body>
</html>`;
}

export default function TechDocScreen() {
  const [generated, setGenerated] = useState(false);

  const handleDownload = () => {
    const html = buildHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = DOC_FILENAME;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setGenerated(true);
    setTimeout(() => setGenerated(false), 3000);
  };

  const sections = [
    { icon: Code2, title: 'Linguagem', value: 'TypeScript 5.5+', color: 'text-sky-400' },
    { icon: Layers, title: 'Frontend', value: 'React 18 + Vite + Tailwind CSS', color: 'text-cyan-400' },
    { icon: Database, title: 'Banco de Dados', value: 'PostgreSQL (Supabase)', color: 'text-emerald-400' },
    { icon: Cloud, title: 'Backend', value: 'Supabase Edge Functions (Deno)', color: 'text-amber-400' },
    { icon: Bell, title: 'Notificacoes', value: 'Web Push + Service Worker (PWA)', color: 'text-rose-400' },
    { icon: MapPin, title: 'Mapas', value: 'Leaflet 1.9', color: 'text-orange-400' },
    { icon: Brain, title: 'Inteligencia Artificial', value: 'Diagnostico de falhas (Edge Function)', color: 'text-violet-400' },
    { icon: Smartphone, title: 'Mobile', value: 'PWA instalavel (Android + iOS)', color: 'text-teal-400' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20">
          <FileText className="w-8 h-8 text-sky-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Documento Tecnico</h1>
        <p className="text-slate-400 text-sm max-w-lg mx-auto">
          Documentacao completa de como o CLEVIA foi desenvolvido, com todas as tecnologias
          utilizadas, arquitetura e funcionalidades. Disponivel para download.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.title} className="flex items-center gap-3 bg-slate-900/80 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                <Icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-slate-500 font-medium uppercase tracking-wide">{s.title}</div>
                <div className="text-sm text-white font-semibold truncate">{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">Seguranca e Arquitetura</h2>
        </div>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex gap-2"><Cog className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" /> Row Level Security (RLS) em todas as tabelas do banco</li>
          <li className="flex gap-2"><Cog className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" /> Isolamento multi-tenant por empresa (company_id)</li>
          <li className="flex gap-2"><Cog className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" /> Autenticacao JWT via Supabase Auth</li>
          <li className="flex gap-2"><Cog className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" /> Sincronizacao em tempo real via WebSockets</li>
          <li className="flex gap-2"><Cog className="w-4 h-4 text-slate-600 mt-0.5 flex-shrink-0" /> Funcionamento offline com sincronizacao automatica</li>
        </ul>
      </div>

      <div className="flex flex-col items-center gap-3 pt-2">
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold transition shadow-lg shadow-sky-500/20"
        >
          <Download className="w-5 h-5" />
          Baixar Documento Tecnico
        </button>
        {generated && (
          <p className="text-emerald-400 text-sm font-medium">Documento baixado com sucesso!</p>
        )}
        <p className="text-slate-500 text-xs text-center max-w-sm">
          O arquivo sera baixado no formato HTML, que pode ser aberto em qualquer navegador
          ou convertido para PDF (Ctrl+P &gt; Salvar como PDF).
        </p>
      </div>
    </div>
  );
}
