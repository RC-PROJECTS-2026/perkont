'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi, auditApi, useMutationWithToast } from '@/lib/api';
import {
  Card, CardHeader, CardTitle, Badge, Button, Modal,
  Input, Select, Tabs, EmptyState, ConfirmModal,
} from '@/components/ui';
import {
  formatDate, formatDateTime, timeAgo, USER_ROLE_LABELS,
} from '@/lib/utils';
import {
  ArrowLeft, User, Award, Plus, AlertTriangle,
  CheckCircle2, Shield, Clock, Mail, Phone, Hash,
  Activity, Edit, UserX, Save, Key,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  expiring_soon: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
};
const statusLabels: Record<string, string> = {
  active: 'Gecerli',
  expiring_soon: 'Yakinda Dolacak',
  expired: 'Suresi Dolmus',
};

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState('profile');
  const [showCert, setShowCert] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-detail', id],
    queryFn: () => usersApi.get(id),
    enabled: !!id,
  });
  const { data: qualsData, refetch: refetchQuals } = useQuery({
    queryKey: ['qualifications', id],
    queryFn: () => usersApi.getQualifications(id),
    enabled: !!id,
  });
  const { data: auditData } = useQuery({
    queryKey: ['audit-user', id],
    queryFn: () => auditApi.list({ userId: id, limit: 30 }),
    enabled: !!id && tab === 'activity',
  });

  const user = (data as any)?.data;
  const quals = (qualsData as any)?.data || [];
  const auditLogs = (auditData as any)?.data?.data || [];

  // ── Forms ─────────────────────────────────────────────────────────────
  const {
    register: certReg,
    handleSubmit: certSubmit,
    reset: certReset,
  } = useForm<any>();

  const {
    register: profileReg,
    handleSubmit: profileSubmit,
    reset: profileReset,
    setValue: profileSetValue,
  } = useForm<any>();

  // ── Mutations ─────────────────────────────────────────────────────────
  const addQualMutation = useMutationWithToast(
    (d: any) => usersApi.addQualification(id, d),
    {
      successMessage: 'Sertifika eklendi',
      invalidateKeys: [['qualifications', id]],
      onSuccess: () => {
        setShowCert(false);
        certReset();
      },
    },
  );

  const updateProfileMutation = useMutationWithToast(
    (d: any) => usersApi.update(id, d),
    {
      successMessage: 'Profil guncellendi',
      invalidateKeys: [['user-detail', id]],
      onSuccess: () => {
        setEditMode(false);
      },
    },
  );

  const deactivateMutation = useMutationWithToast(
    () => usersApi.update(id, { isActive: false }),
    {
      successMessage: 'Kullanici deaktif edildi',
      invalidateKeys: [['user-detail', id], ['users']],
      onSuccess: () => setShowDeactivate(false),
    },
  );

  // ── Loading / not found ───────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <div className="space-y-4">
          <div className="h-8 skeleton rounded-xl w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="h-64 skeleton rounded-xl" />
            <div className="h-64 skeleton rounded-xl md:col-span-2" />
          </div>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <EmptyState
          icon={<User className="w-10 h-10" />}
          title="Kullanici bulunamadi"
          action={<Button onClick={() => router.push('/users')}>Geri Don</Button>}
        />
      </>
    );
  }

  const roleLabel = USER_ROLE_LABELS[user.role] || user.role;
  const expiringCount = quals.filter((q: any) => q.status === 'expiring_soon').length;
  const expiredCount = quals.filter((q: any) => q.status === 'expired').length;

  const roleOptions = Object.entries(USER_ROLE_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const tabs = [
    { key: 'profile', label: 'Profil' },
    { key: 'qualifications', label: 'Sertifikalar', count: quals.length },
    { key: 'activity', label: 'Aktivite' },
  ];

  const startEdit = () => {
    profileReset({
      fullName: user.fullName,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      ekipnetNumber: user.ekipnetNumber || '',
    });
    setEditMode(true);
  };

  return (
    <>
      <button
        onClick={() => router.push('/users')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Personel
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-teal-600 flex items-center justify-center text-white text-2xl font-bold">
            {user.fullName?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display font-extrabold text-2xl text-slate-900 dark:text-slate-100 tracking-tight">
              {user.fullName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                {roleLabel}
              </Badge>
              <Badge
                color={
                  user.isActive
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                }
                dot
              >
                {user.isActive ? 'Aktif' : 'Pasif'}
              </Badge>
              {user.mfaEnabled && (
                <Badge color="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  <Shield className="w-3 h-3 mr-1 inline" />
                  MFA
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {!editMode && tab === 'profile' && (
            <Button
              size="sm"
              variant="outline"
              icon={<Edit className="w-4 h-4" />}
              onClick={startEdit}
            >
              Duzenle
            </Button>
          )}
          {user.isActive && (
            <Button
              size="sm"
              variant="outline"
              icon={<UserX className="w-4 h-4" />}
              onClick={() => setShowDeactivate(true)}
            >
              Deaktif Et
            </Button>
          )}
        </div>
      </div>

      {/* Warning banner */}
      {(expiringCount > 0 || expiredCount > 0) && (
        <div
          className={`flex items-center gap-3 p-4 rounded-xl border text-sm mb-6 ${
            expiredCount > 0
              ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300'
              : 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300'
          }`}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            {expiredCount > 0 && `${expiredCount} sertifikanin suresi dolmus. `}
            {expiringCount > 0 && `${expiringCount} sertifika yakinda dolacak.`}
          </span>
        </div>
      )}

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {editMode ? (
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Profil Duzenle</CardTitle>
              </CardHeader>
              <form
                onSubmit={profileSubmit((d) => updateProfileMutation.mutate(d))}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="Ad Soyad"
                    required
                    {...profileReg('fullName', { required: true })}
                  />
                  <Input
                    label="E-posta"
                    type="email"
                    required
                    {...profileReg('email', { required: true })}
                  />
                  <Input
                    label="Telefon"
                    type="tel"
                    {...profileReg('phone')}
                  />
                  <Select
                    label="Rol"
                    options={roleOptions}
                    {...profileReg('role')}
                  />
                  <Input
                    label="EKIPNet Numarasi"
                    {...profileReg('ekipnetNumber')}
                  />
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditMode(false)}
                  >
                    Iptal
                  </Button>
                  <Button
                    type="submit"
                    loading={updateProfileMutation.isPending}
                    icon={<Save className="w-4 h-4" />}
                  >
                    Kaydet
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle>Iletisim Bilgileri</CardTitle></CardHeader>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="w-28 text-slate-400">E-posta</span>
                    <a
                      href={`mailto:${user.email}`}
                      className="text-teal-600 hover:underline"
                    >
                      {user.email}
                    </a>
                  </div>
                  {user.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span className="w-28 text-slate-400">Telefon</span>
                      <a
                        href={`tel:${user.phone}`}
                        className="text-teal-600 hover:underline"
                      >
                        {user.phone}
                      </a>
                    </div>
                  )}
                  {user.ekipnetNumber && (
                    <div className="flex items-center gap-3">
                      <Hash className="w-4 h-4 text-slate-400" />
                      <span className="w-28 text-slate-400">EKIPNet No</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {user.ekipnetNumber}
                      </span>
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader><CardTitle>Hesap Bilgileri</CardTitle></CardHeader>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="w-28 text-slate-400">Rol</span>
                    <Badge color="bg-teal-100 text-teal-700">{roleLabel}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Shield className="w-4 h-4 text-slate-400" />
                    <span className="w-28 text-slate-400">MFA Durumu</span>
                    <Badge
                      color={
                        user.mfaEnabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-500'
                      }
                    >
                      {user.mfaEnabled ? 'Aktif' : 'Pasif'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="w-28 text-slate-400">Son Giris</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {user.lastLoginAt ? (
                        <span>
                          {formatDateTime(user.lastLoginAt)}{' '}
                          <span className="text-xs text-slate-400">
                            ({timeAgo(user.lastLoginAt)})
                          </span>
                        </span>
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="w-28 text-slate-400">Kayit Tarihi</span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {formatDate(user.createdAt)}
                    </span>
                  </div>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* Qualifications Tab */}
      {tab === 'qualifications' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              size="sm"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCert(true)}
            >
              Sertifika Ekle
            </Button>
          </div>

          {quals.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Award className="w-10 h-10" />}
                title="Sertifika eklenmemis"
                action={
                  <Button
                    icon={<Plus className="w-4 h-4" />}
                    onClick={() => setShowCert(true)}
                  >
                    Sertifika Ekle
                  </Button>
                }
              />
            </Card>
          ) : (
            <Card padding="none">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sertifika Adi</th>
                    <th>Sertifika No</th>
                    <th>Veren Kurum</th>
                    <th>Duzenleme Tarihi</th>
                    <th>Son Gecerlilik</th>
                    <th>Durum</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {quals.map((q: any) => (
                    <tr key={q.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          {q.status === 'active' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <AlertTriangle
                              className={`w-4 h-4 flex-shrink-0 ${
                                q.status === 'expired'
                                  ? 'text-red-500'
                                  : 'text-amber-500'
                              }`}
                            />
                          )}
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                            {q.certificateName}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-slate-500">
                          {q.certificateNo || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-slate-500">
                          {q.issuer || '—'}
                        </span>
                      </td>
                      <td>
                        <span className="text-sm text-slate-500">
                          {formatDate(q.issueDate)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`text-sm ${
                            q.status === 'expired'
                              ? 'text-red-600 font-semibold'
                              : q.status === 'expiring_soon'
                              ? 'text-amber-600 font-semibold'
                              : 'text-slate-500'
                          }`}
                        >
                          {formatDate(q.expiryDate)}
                        </span>
                      </td>
                      <td>
                        <Badge color={statusColors[q.status] || 'bg-slate-100 text-slate-500'}>
                          {statusLabels[q.status] || q.status}
                        </Badge>
                      </td>
                      <td>
                        {q.documentUrl && (
                          <a
                            href={q.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-teal-600 hover:underline"
                          >
                            Belge
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {tab === 'activity' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-4 h-4" /> Son Aktiviteler
            </CardTitle>
          </CardHeader>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">
              Aktivite kaydi bulunamadi
            </p>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                    <Activity className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {log.action}
                      </p>
                      {log.entityType && (
                        <Badge color="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {log.entityType}
                        </Badge>
                      )}
                    </div>
                    {log.description && (
                      <p className="text-xs text-slate-500">{log.description}</p>
                    )}
                    {log.ipAddress && (
                      <p className="text-xs text-slate-300 dark:text-slate-600">
                        IP: {log.ipAddress}
                      </p>
                    )}
                    <p className="text-xs text-slate-300 dark:text-slate-600 mt-0.5">
                      {formatDateTime(log.createdAt)}{' '}
                      <span className="text-slate-400">
                        ({timeAgo(log.createdAt)})
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Add Certificate Modal */}
      <Modal
        open={showCert}
        onClose={() => {
          setShowCert(false);
          certReset();
        }}
        title="Sertifika Ekle"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCert(false)}>
              Iptal
            </Button>
            <Button
              loading={addQualMutation.isPending}
              onClick={certSubmit((d) => addQualMutation.mutate(d))}
            >
              Ekle
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Sertifika Adi"
            required
            className="col-span-2"
            {...certReg('certificateName', { required: true })}
          />
          <Input label="Sertifika No" {...certReg('certificateNo')} />
          <Input label="Veren Kurum" {...certReg('issuer')} />
          <Input
            label="Duzenleme Tarihi"
            type="date"
            {...certReg('issueDate')}
          />
          <Input
            label="Son Gecerlilik"
            type="date"
            {...certReg('expiryDate')}
          />
          <Input
            label="Ekipman Tipi ID (opsiyonel)"
            className="col-span-2"
            {...certReg('equipmentTypeId')}
          />
        </div>
      </Modal>

      {/* Deactivate Confirmation */}
      <Modal
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        title="Kullaniciyi Deaktif Et"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeactivate(false)}>
              Iptal
            </Button>
            <Button
              variant="danger"
              loading={deactivateMutation.isPending}
              onClick={() => deactivateMutation.mutate(undefined as any)}
            >
              Deaktif Et
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">
              <strong>{user.fullName}</strong> adli kullaniciyi deaktif etmek istediginize emin misiniz?
              Bu islem kullanicinin sisteme girisini engelleyecektir.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
