import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, type MachineIntegration } from '@/lib/supabase';
import { Modal, Field, inputCls, EmptyState, Spinner } from '@/components/ui';
import { Settings, Plus, Pencil, Trash2, Plug, Link2, Activity, CheckCircle2, XCircle, Bell, BellOff, Smartphone, Shield, KeyRound, Copy, RefreshCw } from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from '@/lib/push';

export default function SettingsScreen() {
  const { activeCompany, activeRole, user, members } = useAuth();
  const cid = activeCompany?.id;
  const [integrations, setIntegrations] = useState<MachineIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MachineIntegration | null>(null);
  const [form, setForm] = useState<Partial<MachineIntegration>>({});
  const [saving, setSaving] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);

  const load = async () => {
    if (!cid) return;
    setLoading(true);
    const { data } = await supabase.from('machine_integrations').select('*').eq('company_id', cid).order('created_at', { ascending: false });
    setIntegrations(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    if (user) {
      const m = members.find((x) => x.user_id === user.id && x.company_id === cid);
      setProfileName(m?.display_name ?? '');
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushSupported(false);
    } else if (user) {
      isPushSubscribed(user.id).then(setPushEnabled);
    }
  }, [cid, user, members]);

  const togglePush = async () => {
    if (!user || !cid) return;
    setPushLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPush(user.id);
        setPushEnabled(false);
      } else {
        const ok = await subscribeToPush(user.id, cid);
        setPushEnabled(ok);
      }
    } catch {
      // ignore — user may have dismissed the permission prompt
    }
    setPushLoading(false);
  };

  const openNew = () => { setEditing(null); setForm({ poll_interval_seconds: 60, active: true }); setModalOpen(true); };
  const openEdit = (i: MachineIntegration) => { setEditing(i); setForm(i); setModalOpen(true); };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!cid) return;
    setSaving(true);
    const payload = { ...form, company_id: cid, poll_interval_seconds: Number(form.poll_interval_seconds) || 60 };
    if (editing) { const { error: updErr } = await supabase.from('machine_integrations').update(payload).eq('id', editing.id); if (updErr) { alert('Erro ao atualizar integração: ' + updErr.message); setSaving(false); return; } }
    else { const { error: insErr } = await supabase.from('machine_integrations').insert(payload); if (insErr) { alert('Erro ao criar integração: ' + insErr.message); setSaving(false); return; } }
    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (i: MachineIntegration) => {
    if (!confirm(`Excluir a integração "${i.name}"?`)) return;
    const { error: delErr } = await supabase.from('machine_integrations').delete().eq('id', i.id);
    if (delErr) { alert('Erro ao excluir integração: ' + delErr.message); return; }
    load();
  };

  const toggleActive = async (i: MachineIntegration) => {
    const { error: togErr } = await supabase.from('machine_integrations').update({ active: !i.active }).eq('id', i.id);
    if (togErr) { alert('Erro ao alterar status: ' + togErr.message); return; }
    load();
  };

  const saveProfile = async () => {
    if (!user || !cid) return;
    setSavingProfile(true);
    const m = members.find((x) => x.user_id === user.id && x.company_id === cid);
    if (m) {
      const { error: profErr } = await supabase.from('company_members').update({ display_name: profileName }).eq('id', m.id);
      if (profErr) { alert('Erro ao salvar perfil: ' + profErr.message); setSavingProfile(false); return; }
    } else {
      alert('Membro não encontrado para esta empresa.');
    }
    setSavingProfile(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Configurações</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Preferências do sistema e integrações</p>
      </div>

      {/* Perfil */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-400" /> Meu perfil
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex-1 w-full">
            <Field label="Nome de exibição">
              <input value={profileName} onChange={(e) => setProfileName(e.target.value)} className={inputCls} placeholder="Como devemos te chamar" />
            </Field>
          </div>
          <button onClick={saveProfile} disabled={savingProfile} className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition disabled:opacity-60 whitespace-nowrap">
            {savingProfile ? 'Salvando...' : 'Salvar perfil'}
          </button>
        </div>
      </div>

      {/* Integrações */}
      {(activeRole === 'ceo' || activeRole === 'gerente') && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Plug className="w-5 h-5 text-cyan-500" /> Integrações com sistemas externos
            </h3>
            <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium rounded-xl hover:from-cyan-400 hover:to-sky-400 transition shadow-sm text-sm">
              <Plus className="w-4 h-4" /> Nova integração
            </button>
          </div>

          <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded-xl p-4 text-sm text-cyan-700 dark:text-cyan-300 mb-4">
            <p className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Cadastre a URL e a chave da API do sistema externo (ex.: sistema da lavanderia). O CLEVIA buscará o status das máquinas automaticamente e atualizará o painel em tempo real.</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : integrations.length === 0 ? (
            <EmptyState icon={Plug} text="Nenhuma integração configurada. Clique em 'Nova integração' para conectar um sistema externo." />
          ) : (
            <div className="space-y-3">
              {integrations.map((i) => (
                <div key={i.id} className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 hover:shadow-sm transition group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${i.active ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        {i.active ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <XCircle className="w-5 h-5 text-slate-400" />}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{i.name}</p>
                        <p className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">{i.api_url}</p>
                        <p className="text-xs text-slate-400 mt-0.5">A cada {i.poll_interval_seconds}s {i.last_sync_at && `· Última sincronização: ${new Date(i.last_sync_at).toLocaleString('pt-BR')}`}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition">
                      <button onClick={() => toggleActive(i)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${i.active ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                        {i.active ? 'Pausar' : 'Ativar'}
                      </button>
                      <button onClick={() => openEdit(i)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-sky-600"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => remove(i)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notificações no celular */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-cyan-500" /> Notificações no celular
        </h3>
        {pushSupported ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Receba avisos no celular quando uma nova ordem de serviço for aberta. Funciona mesmo com o CLEVIA fechado.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {pushEnabled ? 'Notificações ativas neste dispositivo.' : 'Toque em ativar e permita as notificações quando o navegador perguntar.'}
              </p>
            </div>
            <button
              onClick={togglePush}
              disabled={pushLoading}
              className={`flex items-center gap-2 px-4 py-2.5 font-medium rounded-xl transition disabled:opacity-60 whitespace-nowrap ${
                pushEnabled
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 hover:bg-rose-200'
                  : 'bg-gradient-to-r from-cyan-500 to-sky-500 text-white hover:from-cyan-400 hover:to-sky-400 shadow-sm'
              }`}
            >
              {pushEnabled ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              {pushLoading ? 'Aguarde...' : pushEnabled ? 'Desativar' : 'Ativar notificações'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Seu navegador não suporta notificações push. Tente abrir o CLEVIA no Chrome ou Edge no celular.</p>
        )}
      </div>

      {/* Autenticação em dois fatores (2FA) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-cyan-500" /> Autenticação em dois fatores (2FA)
        </h3>
        <TwoFactorSection />
      </div>

      {/* Sobre */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-5 mb-24">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
          <Activity className="w-5 h-5 text-slate-400" /> Sobre o sistema
        </h3>
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <p><span className="text-slate-400">Sistema:</span> CLEVIA Cloud 2.0</p>
          <p><span className="text-slate-400">Empresa ativa:</span> {activeCompany?.name}</p>
          <p><span className="text-slate-400">Banco de dados:</span> PostgreSQL (Supabase)</p>
          <p><span className="text-slate-400">Desenvolvedor:</span> Clebson Bernardo Velho</p>
        </div>
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Editar integração' : 'Nova integração'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            <Field label="Nome" required>
              <input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Ex: Sistema da Lavanderia" />
            </Field>
            <Field label="URL da API" required>
              <input required type="url" value={form.api_url ?? ''} onChange={(e) => setForm({ ...form, api_url: e.target.value })} className={inputCls} placeholder="https://sistema.empresa.com/api/status" />
            </Field>
            <Field label="Chave da API">
              <input value={form.api_key ?? ''} onChange={(e) => setForm({ ...form, api_key: e.target.value })} className={inputCls} placeholder="Token ou chave de acesso" />
            </Field>
            <Field label="Intervalo de consulta (segundos)" required>
              <input type="number" required min={10} value={form.poll_interval_seconds ?? 60} onChange={(e) => setForm({ ...form, poll_interval_seconds: parseInt(e.target.value) })} className={inputCls} />
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

function TwoFactorSection() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const [otpUri, setOtpUri] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('user_2fa_secrets').select('enabled').eq('user_id', user.id).maybeSingle();
      setEnabled(data?.enabled ?? false);
      setLoading(false);
    })();
  }, [user]);

  const generateSecret = () => {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let s = '';
    for (let i = 0; i < bytes.length; i += 5) {
      let bits = 0, value = 0;
      for (let j = 0; j < 5 && i + j < bytes.length; j++) {
        value = (value << 8) | bytes[i + j];
        bits += 8;
      }
      while (bits >= 5) {
        s += base32[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    const cleanSecret = s.replace(/=+$/, '');
    setSecret(cleanSecret);
    const issuer = 'CLEVIA';
    const account = user?.email || 'user';
    setOtpUri(`otpauth://totp/${issuer}:${account}?secret=${cleanSecret}&issuer=${issuer}`);
    setError('');
  };

  const enable2FA = async () => {
    if (!user || !secret) return;
    if (!verifyCode || verifyCode.length !== 6) {
      setError('Digite o código de 6 dígitos do seu app autenticador.');
      return;
    }
    const expected = generateTotp(secret);
    if (verifyCode !== expected) {
      setError('Código incorreto. Verifique se o horário do dispositivo está correto e tente novamente.');
      return;
    }
    const { data: existing } = await supabase.from('user_2fa_secrets').select('id').eq('user_id', user.id).maybeSingle();
    if (existing) {
      await supabase.from('user_2fa_secrets').update({ secret, enabled: true, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    } else {
      await supabase.from('user_2fa_secrets').insert({ user_id: user.id, secret, enabled: true });
    }
    setEnabled(true);
    setSecret(null);
    setOtpUri(null);
    setVerifyCode('');
    setError('');
  };

  const disable2FA = async () => {
    if (!user) return;
    await supabase.from('user_2fa_secrets').delete().eq('user_id', user.id);
    setEnabled(false);
    setSecret(null);
    setOtpUri(null);
    setVerifyCode('');
  };

  const copySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return <Spinner />;

  if (enabled) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-300">2FA ativo. Sua conta está protegida com autenticação em dois fatores.</span>
        </div>
        <button onClick={disable2FA} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium hover:bg-red-500/20 transition border border-red-500/30">
          <Shield className="w-4 h-4" /> Desativar 2FA
        </button>
      </div>
    );
  }

  if (secret && otpUri) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            1. Escaneie o QR Code ou digite a chave no seu app autenticador (Google Authenticator, Authy, etc):
          </p>
          <div className="flex flex-col items-center gap-3">
            <div className="p-3 bg-white rounded-xl">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpUri)}`} alt="QR Code 2FA" className="w-40 h-40" />
            </div>
            <div className="flex items-center gap-2 w-full">
              <code className="flex-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-600 dark:text-slate-300 break-all">{secret}</code>
              <button onClick={copySecret} className="shrink-0 p-2 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 transition">
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-500" />}
              </button>
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">2. Digite o código de 6 dígitos gerado pelo app:</p>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputCls} text-center text-lg tracking-widest`}
              placeholder="000000"
            />
            <button onClick={enable2FA} className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium text-sm hover:from-cyan-400 hover:to-sky-400 transition">
              Ativar
            </button>
          </div>
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
        </div>
        <button onClick={() => { setSecret(null); setOtpUri(null); }} className="text-xs text-slate-400 hover:text-slate-300 transition">Cancelar</button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Adicione uma camada extra de segurança à sua conta. Ao ativar o 2FA, você precisará de um código gerado pelo seu celular além da senha para entrar.
      </p>
      <button onClick={generateSecret} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 text-white font-medium text-sm hover:from-cyan-400 hover:to-sky-400 transition">
        <KeyRound className="w-4 h-4" /> Configurar 2FA
      </button>
    </div>
  );
}

// Simple TOTP generator for verification (RFC 6238)
function generateTotp(secret: string): string {
  // Decode base32 secret
  const base32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const c of secret.toUpperCase()) {
    const idx = base32.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  // Time counter (30-second window)
  const counter = Math.floor(Date.now() / 30000);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter & 0xffffffff);

  // HMAC-SHA1 using Web Crypto
  // This is synchronous — we use a simple SHA1 implementation
  const keyBytes = new Uint8Array(bytes);
  const msgBytes = new Uint8Array(buf);

  // Simple synchronous HMAC-SHA1 (not using Web Crypto for sync)
  const hmac = hmacSha1(keyBytes, msgBytes);
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  const otp = (code % 1000000).toString().padStart(6, '0');
  return otp;
}

// Simple synchronous SHA1 HMAC implementation
function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  // Block size for SHA1 is 64 bytes
  const blockSize = 64;
  let k = key;
  if (k.length > blockSize) {
    k = sha1(k);
  }
  if (k.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(k);
    k = padded;
  }

  // ipad and opad
  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }

  // inner hash: H(ipad || message)
  const inner = new Uint8Array(blockSize + message.length);
  inner.set(ipad);
  inner.set(message, blockSize);
  const innerHash = sha1(inner);

  // outer hash: H(opad || innerHash)
  const outer = new Uint8Array(blockSize + 20);
  outer.set(opad);
  outer.set(innerHash, blockSize);
  return sha1(outer);
}

function sha1(data: Uint8Array): Uint8Array {
  const h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const ml = data.length * 8;
  const withOne = new Uint8Array(data.length + 1);
  withOne.set(data);
  withOne[data.length] = 0x80;
  const rem = withOne.length % 64;
  const padLen = rem <= 56 ? 56 - rem : 120 - rem;
  const padded = new Uint8Array(withOne.length + padLen + 8);
  padded.set(withOne);
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(ml / 0x100000000));
  dv.setUint32(padded.length - 4, ml & 0xffffffff);

  let [a, b, c, d, e] = [h0, h1, h2, h3, h4];
  for (let off = 0; off < padded.length; off += 64) {
    const w = new Uint32Array(80);
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(off + i * 4);
    }
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (n << 1) | (n >>> 31);
    }
    let [aa, bb, cc, dd, ee] = [a, b, c, d, e];
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (bb & cc) | (~bb & dd); k = 0x5a827999; }
      else if (i < 40) { f = bb ^ cc ^ dd; k = 0x6ed9eba1; }
      else if (i < 60) { f = (bb & cc) | (bb & dd) | (cc & dd); k = 0x8f1bbcdc; }
      else { f = bb ^ cc ^ dd; k = 0xca62c1d6; }
      const t = ((aa << 5) | (aa >>> 27)) + f + ee + k + w[i];
      ee = dd; dd = cc; cc = (bb << 30) | (bb >>> 2); bb = aa; aa = t >>> 0;
    }
    a = (a + aa) >>> 0; b = (b + bb) >>> 0; c = (c + cc) >>> 0; d = (d + dd) >>> 0; e = (e + ee) >>> 0;
  }
  const result = new Uint8Array(20);
  const rdv = new DataView(result.buffer);
  rdv.setUint32(0, a); rdv.setUint32(4, b); rdv.setUint32(8, c); rdv.setUint32(12, d); rdv.setUint32(16, e);
  return result;
}
