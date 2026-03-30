'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Zap, Eye, EyeOff, Shield } from 'lucide-react';
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
      const res: any = await authApi.login({ email: '', password: '' }); // MFA verify
      // TODO: implement MFA verify call
      toast.success('Doğrulama başarılı');
    } catch (err: any) {
      toast.error(err.message || 'Kod hatalı');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left — form */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 bg-white dark:bg-slate-950">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shadow-glow">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-extrabold text-xl text-slate-900 dark:text-slate-100 tracking-tight">PerKont</h1>
              <p className="text-xs text-slate-400">Periyodik Kontrol Sistemi</p>
            </div>
          </div>

          {!mfaRequired ? (
            <>
              <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100 mb-2">Giriş Yap</h2>
              <p className="text-sm text-slate-500 mb-8">Hesabınıza erişmek için bilgilerinizi giriniz</p>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input
                  label="E-posta Adresi"
                  type="email"
                  placeholder="ornek@firma.com"
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Input
                  label="Şifre"
                  type={showPw ? 'text' : 'password'}
                  placeholder="Şifrenizi giriniz"
                  error={errors.password?.message}
                  rightElement={
                    <button type="button" onClick={() => setShowPw((v) => !v)} className="text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                  {...register('password')}
                />
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" className="rounded" />
                    Beni hatırla
                  </label>
                  <a href="/reset-password" className="text-sm text-teal-600 hover:text-teal-700">
                    Şifremi Unuttum
                  </a>
                </div>
                <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full mt-2">
                  Giriş Yap
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6 p-4 bg-teal-50 dark:bg-teal-950/30 rounded-xl">
                <Shield className="w-5 h-5 text-teal-600" />
                <p className="text-sm text-teal-700 dark:text-teal-300">İki faktörlü doğrulama gerekli</p>
              </div>
              <h2 className="font-display font-bold text-2xl text-slate-900 dark:text-slate-100 mb-2">Doğrulama Kodu</h2>
              <p className="text-sm text-slate-500 mb-8">Kimlik doğrulama uygulamanızdan 6 haneli kodu giriniz</p>
              <Input
                label="Doğrulama Kodu"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                placeholder="000000"
                maxLength={6}
              />
              <Button variant="primary" size="lg" loading={loading} onClick={onMfaVerify} className="w-full mt-4">
                Doğrula
              </Button>
              <button onClick={() => setMfaRequired(false)} className="w-full text-sm text-slate-500 hover:text-slate-700 mt-3">
                Geri dön
              </button>
            </>
          )}
        </div>
      </div>

      {/* Right — branding panel */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-gradient-to-br from-slate-950 via-teal-950 to-slate-950 relative overflow-hidden">
        {/* Background effect */}
        <div className="absolute inset-0">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-600/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-cyan-600/15 rounded-full blur-3xl" />
        </div>

        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 rounded-full text-xs text-white/70 mb-8">
            <Shield className="w-3 h-3" />
            ISO/IEC 17020 Uyumlu
          </div>
          <h2 className="font-display font-extrabold text-4xl text-white leading-tight tracking-tight mb-4">
            Akredite Muayene<br />Yönetim Sistemi
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-sm">
            Periyodik kontrol operasyonunuzun tamamını — sahadan raporlara, faturalara — tek sistemde yönetin.
          </p>
        </div>

        {/* Feature list */}
        <div className="relative space-y-4">
          {[
            { icon: '⚡', title: 'Offline-First Saha Denetimi', desc: 'İnternet olmadan denetim yapın, bağlantı gelince otomatik senkronize edin' },
            { icon: '📄', title: 'Akreditasyon Uyumlu Raporlama', desc: 'Firmaya özgü formlardan birebir PDF çıktısı, e-imza ile arşivleme' },
            { icon: '🔗', title: 'LOGO ERP Entegrasyonu', desc: 'Tamamlanan işleri otomatik faturaya dönüştürün' },
          ].map((f) => (
            <div key={f.title} className="flex gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
              <span className="text-2xl">{f.icon}</span>
              <div>
                <p className="text-sm font-semibold text-white">{f.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
