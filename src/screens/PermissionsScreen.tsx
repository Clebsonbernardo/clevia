import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type CeoGrant, type CompanyMember } from '@/lib/supabase';
import { PERMISSION_KEYS } from '@/lib/useGrants';
import { Shield, Crown, Check, X, Search, UserCog, Sparkles } from 'lucide-react';

export default function PermissionsScreen() {
  const { activeCompany, session } = useAuth();
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [grants, setGrants] = useState<CeoGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cid = activeCompany?.id;

  const loadData = async () => {
    if (!cid) return;
    const [mRes, gRes] = await Promise.all([
      supabase.from('company_members').select('*').eq('company_id', cid),
      supabase.from('ceo_grants').select('*').eq('company_id', cid),
    ]);
    setMembers(mRes.data ?? []);
    setGrants(gRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [cid]);

  const toggleGrant = async (userId: string, permKey: string) => {
    setBusy(true);
    const existing = grants.find(g => g.user_id === userId && g.permission_key === permKey);
    if (existing) {
      await supabase.from('ceo_grants').update({ granted: !existing.granted }).eq('id', existing.id);
    } else {
      await supabase.from('ceo_grants').insert({
        company_id: cid,
        user_id: userId,
        permission_key: permKey,
        granted_by: session?.user?.id ?? null,
        granted: true,
      });
    }
    await loadData();
    setBusy(false);
  };

  const grantAll = async (userId: string) => {
    setBusy(true);
    for (const perm of PERMISSION_KEYS) {
      const existing = grants.find(g => g.user_id === userId && g.permission_key === perm.key);
      if (!existing) {
        await supabase.from('ceo_grants').insert({
          company_id: cid, user_id: userId, permission_key: perm.key,
          granted_by: session?.user?.id ?? null, granted: true,
        });
      } else if (!existing.granted) {
        await supabase.from('ceo_grants').update({ granted: true }).eq('id', existing.id);
      }
    }
    await loadData();
    setBusy(false);
  };

  const revokeAll = async (userId: string) => {
    setBusy(true);
    const userGrants = grants.filter(g => g.user_id === userId);
    for (const g of userGrants) {
      await supabase.from('ceo_grants').update({ granted: false }).eq('id', g.id);
    }
    await loadData();
    setBusy(false);
  };

  const filteredMembers = members.filter(m => {
    if (!search) return true;
    const name = m.display_name?.toLowerCase() ?? '';
    return name.includes(search.toLowerCase());
  });

  const selectedMember = members.find(m => m.user_id === selectedUserId);
  const selectedMemberGrants = grants.filter(g => g.user_id === selectedUserId);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Carregando...</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Crown className="w-7 h-7 text-amber-400" /> Permissões do Sistema
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          Como CEO, você decide quem pode acessar cada parte do sistema. Conceda permissões individuais a qualquer pessoa da sua empresa.
        </p>
      </div>

      {/* CEO info banner */}
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-yellow-500/5 p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-300">Acesso exclusivo do CEO</p>
          <p className="text-xs text-amber-200/70 mt-0.5">
            Esta tela só é visível para você (CEO). Outros usuários não veem este botão no menu.
            Você tem acesso total a tudo automaticamente.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Member list */}
        <div className="lg:col-span-1 bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h3 className="font-semibold text-white flex items-center gap-2 mb-3">
              <UserCog className="w-5 h-5 text-cyan-400" /> Membros da Empresa
            </h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar membro..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-800/50 max-h-[60vh] overflow-y-auto">
            {filteredMembers.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-500">Nenhum membro encontrado.</p>
            ) : filteredMembers.map((m) => {
              const userGrants = grants.filter(g => g.user_id === m.user_id && g.granted);
              const isCEO = m.role === 'ceo';
              const isSelected = selectedUserId === m.user_id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedUserId(m.user_id)}
                  className={`w-full text-left p-4 flex items-center gap-3 hover:bg-slate-800/40 transition ${isSelected ? 'bg-slate-800/60' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    isCEO ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950' : 'bg-gradient-to-br from-cyan-500 to-sky-600 text-white'
                  }`}>
                    {(m.display_name ?? '?')[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-200 text-sm truncate">
                      {m.display_name ?? 'Sem nome'}
                    </p>
                    <p className="text-xs text-slate-500 capitalize">{m.role}</p>
                  </div>
                  {isCEO ? (
                    <span className="text-xs font-bold text-amber-400 flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5" /> CEO
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 flex-shrink-0">
                      {userGrants.length} perm.
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Permission panel */}
        <div className="lg:col-span-2 bg-slate-900/80 rounded-2xl border border-slate-800 p-5">
          {!selectedMember ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <UserCog className="w-12 h-12 text-slate-600 mb-3" />
              <p className="text-sm text-slate-400">Selecione um membro para gerenciar suas permissões</p>
            </div>
          ) : selectedMember.role === 'ceo' ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <Crown className="w-12 h-12 text-amber-400 mb-3" />
              <p className="text-sm font-semibold text-amber-300">Este membro é CEO</p>
              <p className="text-xs text-slate-400 mt-1">O CEO tem acesso total a tudo automaticamente.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-sky-600 text-white flex items-center justify-center font-bold text-lg">
                    {(selectedMember.display_name ?? '?')[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{selectedMember.display_name ?? 'Sem nome'}</p>
                    <p className="text-xs text-slate-500 capitalize">{selectedMember.role}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => grantAll(selectedMember.user_id)}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Conceder tudo
                  </button>
                  <button
                    onClick={() => revokeAll(selectedMember.user_id)}
                    disabled={busy}
                    className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <X className="w-3.5 h-3.5" /> Revogar tudo
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
                {PERMISSION_KEYS.map((perm) => {
                  const grant = selectedMemberGrants.find(g => g.permission_key === perm.key);
                  const isGranted = grant?.granted === true;
                  return (
                    <div
                      key={perm.key}
                      className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 transition ${
                        isGranted
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-slate-800 bg-slate-800/30'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${isGranted ? 'text-emerald-300' : 'text-slate-300'}`}>
                          {perm.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{perm.desc}</p>
                      </div>
                      <button
                        onClick={() => toggleGrant(selectedMember.user_id, perm.key)}
                        disabled={busy}
                        className={`flex-shrink-0 w-11 h-6 rounded-full transition relative ${
                          isGranted ? 'bg-emerald-500' : 'bg-slate-700'
                        } disabled:opacity-50`}
                        aria-label={isGranted ? 'Revogar' : 'Conceder'}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                          isGranted ? 'left-5.5' : 'left-0.5'
                        }`} style={{ left: isGranted ? '22px' : '2px' }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
