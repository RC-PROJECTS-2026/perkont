'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { Shield, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MfaPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const tempToken = typeof window !== 'undefined'
    ? sessionStorage.getItem('mfa_temp_token') || ''
    : '';

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const res = await authApi.verifyMfa(tempToken, code);
      const { accessToken, refreshToken, user } = res.data;
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      sessionStorage.removeItem('mfa_temp_token');
      router.replace('/dashboard');
    } catch {
      toast.error('Geçersiz kod. Tekrar deneyin.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center">
            <Shield className="w-7 h-7 text-white" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white text-center mb-2">İki Faktörlü Doğrulama</h1>
        <p className="text-slate-400 text-sm text-center mb-8">
          Authenticator uygulamanızdaki 6 haneli kodu girin
        </p>

        <input
          type="text"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
          placeholder="000000"
          className="w-full h-16 text-4xl text-center tracking-[0.5em] font-mono bg-slate-900 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 mb-6"
          autoFocus
        />

        <button
          onClick={handleVerify}
          disabled={code.length !== 6 || loading}
          className="w-full h-11 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors mb-4"
        >
          {loading ? 'Doğrulanıyor…' : 'Doğrula'}
        </button>

        <button onClick={() => router.replace('/auth/login')} className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Giriş sayfasına dön
        </button>
      </div>
    </div>
  );
}
