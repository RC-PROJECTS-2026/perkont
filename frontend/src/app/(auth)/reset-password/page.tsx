'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { Lock, CheckCircle2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

// Forgot Password
function ForgotPasswordForm() {
  const [email, setEmail]     = useState('');
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      toast.error('E-posta gönderilemedi. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-white mb-2">E-posta Gönderildi</h2>
        <p className="text-slate-400 text-sm">
          <strong className="text-white">{email}</strong> adresine şifre sıfırlama bağlantısı gönderildi.
          1 saat içinde geçerlidir.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white text-center mb-2">Şifremi Unuttum</h1>
      <p className="text-slate-400 text-sm text-center mb-8">E-posta adresinizi girin, sıfırlama bağlantısı gönderelim</p>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="ad@firma.com"
        className="w-full h-11 px-4 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 mb-4"
        autoFocus
      />

      <button
        onClick={submit}
        disabled={!email || loading}
        className="w-full h-11 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
      >
        {loading ? 'Gönderiliyor…' : 'Sıfırlama Bağlantısı Gönder'}
      </button>
    </>
  );
}

// Reset Password (token ile)
function ResetPasswordForm({ token }: { token: string }) {
  const router  = useRouter();
  const [pw, setPw]       = useState('');
  const [pw2, setPw2]     = useState('');
  const [done, setDone]   = useState(false);
  const [loading, setLoad] = useState(false);

  const submit = async () => {
    if (pw.length < 8) { toast.error('Şifre en az 8 karakter olmalı'); return; }
    if (pw !== pw2)    { toast.error('Şifreler eşleşmiyor'); return; }
    setLoad(true);
    try {
      await apiClient.post('/auth/reset-password', { token, newPassword: pw });
      setDone(true);
      setTimeout(() => router.replace('/auth/login'), 2500);
    } catch {
      toast.error('Token geçersiz veya süresi dolmuş.');
    } finally {
      setLoad(false);
    }
  };

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-white mb-2">Şifre Güncellendi</h2>
        <p className="text-slate-400 text-sm">Giriş sayfasına yönlendiriliyorsunuz…</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white text-center mb-2">Yeni Şifre Belirle</h1>
      <p className="text-slate-400 text-sm text-center mb-8">En az 8 karakter kullanın</p>

      <div className="space-y-3 mb-6">
        <input type="password" value={pw}  onChange={(e) => setPw(e.target.value)} placeholder="Yeni şifre"
          className="w-full h-11 px-4 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500" />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Şifre tekrar"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full h-11 px-4 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500" />
      </div>

      <button
        onClick={submit}
        disabled={!pw || !pw2 || loading}
        className="w-full h-11 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
      >
        {loading ? 'Kaydediliyor…' : 'Şifremi Güncelle'}
      </button>
    </>
  );
}

export default function ResetPasswordPage() {
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const token         = searchParams.get('token');

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center">
            <Lock className="w-7 h-7 text-white" />
          </div>
        </div>

        {token ? <ResetPasswordForm token={token} /> : <ForgotPasswordForm />}

        <button onClick={() => router.replace('/auth/login')} className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors mt-6">
          <ArrowLeft className="w-4 h-4" /> Giriş sayfasına dön
        </button>
      </div>
    </div>
  );
}
