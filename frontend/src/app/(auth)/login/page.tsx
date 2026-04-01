'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Zap, Eye, EyeOff, Shield, FileText, Link2, User } from 'lucide-react';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { Button, Input } from '@/components/ui';

const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta giriniz'),
  password: z.string().min(6, 'En az 6 karakter'),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [tempToken, setTempToken] = useState('');

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  // ── Login logic (UNCHANGED) ──
  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    try {
      const res: any = await authApi.login(data);
      const result = res?.data || res;

      if (result?.requiresMfa) {
        setTempToken(result.tempToken);
        setMfaRequired(true);
        toast.success('Doğrulama kodunuzu giriniz');
        return;
      }

      if (!result?.accessToken || !result?.user) {
        toast.error('Sunucudan geçersiz yanıt alındı');
        return;
      }

      setAuth(result.user, result.accessToken, result.refreshToken);
      toast.success(`Hoş geldiniz, ${result.user.fullName}`);
      window.location.href = '/dashboard';
    } catch (err: any) {
      toast.error(err?.message || 'Giriş yapılamadı');
    } finally {
      setLoading(false);
    }
  };

  const onMfaVerify = async () => {
    setLoading(true);
    try {
      const res: any = await authApi.login({ email: '', password: '' });
      toast.success('Doğrulama başarılı');
    } catch (err: any) {
      toast.error(err.message || 'Kod hatalı');
    } finally {
      setLoading(false);
    }
  };

  // ── Dark premium input class ──
  const inputCls = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.04] text-sm text-white placeholder:text-slate-600 px-4 py-3 h-12 transition-all duration-200 hover:border-white/[0.12] focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/30';

  return (
    <div className="min-h-screen flex" style={{ background: '#080e1c' }}>

      {/* ═══ LEFT — Login Form ═══ */}
      <div className="flex-1 flex flex-col px-8 sm:px-12 relative">
        {/* Ambient glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-3xl" style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.04) 0%, transparent 70%)' }} />
        </div>

        {/* Logo at top */}
        <div className="flex items-center gap-3 pt-8 relative z-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0d9488, #06b6d4)', boxShadow: '0 0 20px rgba(6,182,212,0.2)' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-xl text-white tracking-tight">PerKont</h1>
            <p className="text-[11px] text-white/25 tracking-wide">Periyodik Kontrol Sistemi</p>
          </div>
        </div>

        {/* Form centered */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-sm relative z-10">
            {!mfaRequired ? (
              <>
                <h2 className="font-display font-bold text-2xl text-white mb-2">Giriş Yap</h2>
                <p className="text-sm text-white/30 mb-8">Hesabınıza erişmek için bilgilerinizi giriniz</p>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-white/35 uppercase tracking-widest">E-Posta Adresi</label>
                    <div className="relative">
                      <input type="email" placeholder="admin@perkont.com" className={inputCls} {...register('email')} />
                      <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/15" />
                    </div>
                    {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium text-white/35 uppercase tracking-widest">Şifre</label>
                    <div className="relative">
                      <input type={showPw ? 'text' : 'password'} placeholder="••••••••" className={inputCls} {...register('password')} />
                      <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/15 hover:text-white/35 transition-colors">
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
                  </div>

                  {/* Remember + Forgot */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm text-white/30 cursor-pointer">
                      <input type="checkbox" className="rounded border-white/10 bg-white/[0.04] text-cyan-500 focus:ring-cyan-500/20" />
                      Beni Hatırla
                    </label>
                    <a href="/reset-password" className="text-sm text-cyan-400/70 hover:text-cyan-400 transition-colors">
                      Şifremi Unuttum
                    </a>
                  </div>

                  {/* Submit */}
                  <Button type="submit" variant="primary" size="lg" loading={loading}
                    className="w-full !h-12 !rounded-xl !bg-gradient-to-r !from-cyan-500 !to-cyan-400 hover:!from-cyan-400 hover:!to-cyan-300 !shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                    Giriş Yap
                  </Button>
                </form>
              </>
            ) : (
              /* ── MFA ── */
              <>
                <div className="flex items-center gap-3 mb-6 p-4 bg-cyan-500/[0.06] border border-cyan-500/10 rounded-xl">
                  <Shield className="w-5 h-5 text-cyan-400" />
                  <p className="text-sm text-cyan-300/80">İki faktörlü doğrulama gerekli</p>
                </div>
                <h2 className="font-display font-bold text-2xl text-white mb-2">Doğrulama Kodu</h2>
                <p className="text-sm text-white/30 mb-8">Kimlik doğrulama uygulamanızdan 6 haneli kodu giriniz</p>
                <Input label="Doğrulama Kodu" value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} placeholder="000000" maxLength={6} />
                <Button variant="primary" size="lg" loading={loading} onClick={onMfaVerify}
                  className="w-full mt-4 !h-12 !rounded-xl !bg-gradient-to-r !from-cyan-500 !to-cyan-400 !shadow-[0_0_20px_rgba(6,182,212,0.25)]">
                  Doğrula
                </Button>
                <button onClick={() => setMfaRequired(false)} className="w-full text-sm text-white/25 hover:text-white/45 mt-3 transition-colors">
                  Geri dön
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══ RIGHT — Branding Panel ═══ */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0c1a30 0%, #0a1628 40%, #091422 100%)' }}>
        {/* Ambient glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[15%] left-[20%] w-[500px] h-[500px] bg-cyan-600/[0.06] rounded-full blur-3xl" />
          <div className="absolute bottom-[25%] right-[15%] w-[400px] h-[400px] bg-blue-600/[0.04] rounded-full blur-3xl" />
        </div>

        {/* Wave effect */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: '40%' }}>
          <svg viewBox="0 0 1440 500" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="wg1" x1="0" y1="0" x2="1" y2="0.3">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.22" />
                <stop offset="50%" stopColor="#0891b2" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#0d9488" stopOpacity="0.18" />
              </linearGradient>
              <linearGradient id="wg2" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0891b2" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.16" />
              </linearGradient>
            </defs>
            <path fill="url(#wg1)" d="M0,180L60,190C120,200,240,220,360,225C480,230,600,220,720,200C840,180,960,150,1080,155C1200,160,1320,200,1380,220L1440,240L1440,500L0,500Z" />
            <path fill="url(#wg2)" d="M0,280L60,270C120,260,240,240,360,250C480,260,600,290,720,300C840,310,960,300,1080,280C1200,260,1320,250,1380,245L1440,240L1440,500L0,500Z" />
          </svg>
        </div>

        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="absolute rounded-full animate-pulse" style={{
              width: `${1 + (i % 3)}px`, height: `${1 + (i % 3)}px`,
              background: `rgba(6,182,212,${0.12 + (i % 4) * 0.05})`,
              left: `${10 + (i * 7) % 80}%`, top: `${15 + (i * 8) % 60}%`,
              animationDelay: `${i * 0.4}s`, animationDuration: `${2.5 + (i % 3)}s`,
            }} />
          ))}
        </div>

        {/* Content */}
        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/[0.05] rounded-full text-xs text-white/40 mb-8 border border-white/[0.05]">
            <Shield className="w-3 h-3" />
            ISO/IEC 17020 Uyumlu
          </div>
          <h2 className="font-display font-extrabold text-4xl text-white leading-tight tracking-tight mb-4">
            Akredite Muayene<br />Yönetim Sistemi
          </h2>
          <p className="text-white/25 text-base leading-relaxed max-w-sm">
            Periyodik kontrol operasyonunuzu tamamen — sahadan raporlara, faturalamaya — tek sistemde yönetin.
          </p>
        </div>

        {/* Feature cards */}
        <div className="relative space-y-3">
          {[
            { icon: <Zap className="w-5 h-5" />, bg: 'bg-amber-500/15 text-amber-400', title: 'Offline-First Saha Denetimi', desc: 'İnternet olmadan denetim yapın, çevrimdışı modda saklayın' },
            { icon: <FileText className="w-5 h-5" />, bg: 'bg-cyan-500/15 text-cyan-400', title: 'Alanında Uyumlu Raporlama', desc: 'Tüm akreditasyon süreçlerinize uygun raporlama sistemi' },
            { icon: <Link2 className="w-5 h-5" />, bg: 'bg-violet-500/15 text-violet-400', title: 'LOGO ERP Entegrasyonu', desc: 'Tümleşik ERP sistemiyle kolay entegrasyon' },
          ].map((f) => (
            <div key={f.title} className="flex gap-4 p-4 bg-white/[0.03] rounded-xl border border-white/[0.05] hover:bg-white/[0.05] transition-colors">
              <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center flex-shrink-0`}>{f.icon}</div>
              <div>
                <p className="text-sm font-semibold text-white/85">{f.title}</p>
                <p className="text-xs text-white/25 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
