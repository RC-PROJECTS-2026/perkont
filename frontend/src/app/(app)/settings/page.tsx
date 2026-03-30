'use client';
import { useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { authApi, useMutationWithToast } from '@/lib/api';
import { PageHeader, Card, CardHeader, CardTitle, Button, Input, Tabs } from '@/components/ui';
import { Shield, Bell, User, Key, Smartphone, Save } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [tab, setTab] = useState('profile');
  const { user } = useAuthStore();

  const { register: regPw, handleSubmit: handlePw, reset: resetPw, formState: { errors: pwErrors } } = useForm<any>();
  const { register: regMfa, handleSubmit: handleMfa } = useForm<any>();
  const [mfaSetup, setMfaSetup] = useState<any>(null);
  const [mfaConfirming, setMfaConfirming] = useState(false);

  const changePwMutation = useMutationWithToast(authApi.changePassword, {
    successMessage: 'Şifreniz başarıyla değiştirildi',
    onSuccess: () => resetPw(),
  });

  const setupMfaMutation = useMutationWithToast(authApi.setupMfa, {
    onSuccess: (res: any) => setMfaSetup(res.data),
  });

  const confirmMfaMutation = useMutationWithToast(authApi.confirmMfa, {
    successMessage: 'İki faktörlü doğrulama aktif edildi',
    onSuccess: () => { setMfaSetup(null); setMfaConfirming(false); },
  });

  const tabs = [
    { key: 'profile',  label: 'Profil' },
    { key: 'security', label: 'Güvenlik' },
    { key: 'mfa',      label: '2FA' },
    { key: 'notifications', label: 'Bildirimler' },
  ];

  return (
    <>
      <PageHeader title="Ayarlar" subtitle="Hesap ve sistem ayarları" />

      <div className="mb-6">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {tab === 'profile' && (
        <Card className="max-w-lg">
          <CardHeader><CardTitle>Profil Bilgileri</CardTitle></CardHeader>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-full bg-teal-600 flex items-center justify-center">
              <span className="text-white text-2xl font-bold">{user?.fullName?.charAt(0)}</span>
            </div>
            <div>
              <p className="font-bold text-slate-900 dark:text-slate-100">{user?.fullName}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
              <span className="text-xs bg-teal-100 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full">{user?.role}</span>
            </div>
          </div>
          <p className="text-sm text-slate-500">Profil bilgileri admin tarafından yönetilir. Değişiklik için sistem yöneticinize başvurunuz.</p>
        </Card>
      )}

      {tab === 'security' && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Şifre Değiştir</CardTitle>
            <Key className="w-5 h-5 text-slate-400" />
          </CardHeader>
          <form onSubmit={handlePw((d) => changePwMutation.mutate(d))} className="space-y-4">
            <Input
              label="Mevcut Şifre"
              type="password"
              required
              {...regPw('currentPassword', { required: 'Zorunlu' })}
              error={pwErrors.currentPassword?.message}
            />
            <Input
              label="Yeni Şifre"
              type="password"
              required
              hint="En az 8 karakter, büyük harf ve rakam içermeli"
              {...regPw('newPassword', {
                required: 'Zorunlu',
                minLength: { value: 8, message: 'En az 8 karakter' },
                pattern: {
                  value: /((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*/,
                  message: 'Büyük harf, küçük harf ve rakam içermeli',
                },
              })}
              error={pwErrors.newPassword?.message}
            />
            <Button type="submit" loading={changePwMutation.isPending} icon={<Save className="w-4 h-4" />}>
              Şifreyi Değiştir
            </Button>
          </form>
        </Card>
      )}

      {tab === 'mfa' && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>İki Faktörlü Doğrulama</CardTitle>
            <Shield className="w-5 h-5 text-slate-400" />
          </CardHeader>

          {user?.mfaEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 rounded-xl">
                <Shield className="w-5 h-5 text-green-600" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">2FA Aktif</p>
                  <p className="text-xs text-green-600 dark:text-green-400">Hesabınız iki faktörlü doğrulama ile korunuyor</p>
                </div>
              </div>
              <p className="text-sm text-slate-500">2FA'yı devre dışı bırakmak için sistem yöneticinize başvurunuz.</p>
            </div>
          ) : !mfaSetup ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                İki faktörlü doğrulama, hesabınıza ekstra güvenlik katmanı ekler.
                Google Authenticator veya benzeri bir uygulama gerektirir.
              </p>
              <Button
                icon={<Smartphone className="w-4 h-4" />}
                loading={setupMfaMutation.isPending}
                onClick={() => setupMfaMutation.mutate(undefined as any)}
              >
                2FA Kurulumunu Başlat
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Authenticator uygulamanızla QR kodu tarayın:
              </p>
              {mfaSetup.qrCodeUrl && (
                <img src={mfaSetup.qrCodeUrl} alt="QR Code" className="w-48 h-48 border rounded-xl mx-auto" />
              )}
              <p className="text-xs text-slate-500 text-center">
                QR okutamazsanız kodu manuel girin: <br />
                <code className="font-mono text-teal-600 bg-teal-50 dark:bg-teal-950/30 px-2 py-0.5 rounded">
                  {mfaSetup.secret}
                </code>
              </p>
              <form
                onSubmit={handleMfa((d) => confirmMfaMutation.mutate({
                  secret: mfaSetup.secret,
                  token: d.token,
                }))}
                className="space-y-3"
              >
                <Input
                  label="Doğrulama Kodu"
                  placeholder="6 haneli kod"
                  maxLength={6}
                  {...regMfa('token', { required: true })}
                />
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setMfaSetup(null)}>İptal</Button>
                  <Button type="submit" loading={confirmMfaMutation.isPending}>
                    Etkinleştir
                  </Button>
                </div>
              </form>
            </div>
          )}
        </Card>
      )}

      {tab === 'notifications' && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Bildirim Tercihleri</CardTitle>
            <Bell className="w-5 h-5 text-slate-400" />
          </CardHeader>
          <div className="space-y-4">
            {[
              { label: 'İş emri atandığında', description: 'SMS ve e-posta' },
              { label: 'Sertifika süresi dolmadan', description: '30 gün önce e-posta' },
              { label: 'Rapor onaylandığında', description: 'E-posta' },
              { label: 'Periyodik kontrol yaklaştığında', description: 'E-posta' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
                  <p className="text-xs text-slate-400">{item.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer" />
                  <div className="w-10 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-teal-600 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
                </label>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
