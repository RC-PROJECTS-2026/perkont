'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, Tabs, EmptyState,
  Modal, Input, Select, Textarea,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import {
  MessageSquare, Bell, Plus, CheckCircle2,
  ClipboardList, FileText, RefreshCw, HelpCircle,
  Send, Paperclip,
} from 'lucide-react';
import toast from 'react-hot-toast';

const REQUEST_TYPES = [
  { value: 'new_inspection', label: 'Yeni Denetim Talebi', icon: ClipboardList },
  { value: 'report_copy',   label: 'Rapor Kopyası',       icon: FileText },
  { value: 'renewal',       label: 'Sözleşme Yenileme',   icon: RefreshCw },
  { value: 'general',       label: 'Genel Bilgi Talebi',  icon: HelpCircle },
];

const REQUEST_TYPE_LABELS: Record<string, string> = {
  new_inspection: 'Yeni Denetim',
  report_copy:    'Rapor Kopyası',
  renewal:        'Sözleşme Yenileme',
  general:        'Genel Bilgi',
  complaint:      'Şikayet',
  appeal:         'İtiraz',
};

const REQUEST_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  received:              { label: 'Alındı',      color: 'bg-blue-100 text-blue-700' },
  under_investigation:   { label: 'İncelemede',  color: 'bg-amber-100 text-amber-700' },
  resolved:              { label: 'Çözüldü',     color: 'bg-green-100 text-green-700' },
  closed:                { label: 'Kapatıldı',   color: 'bg-slate-100 text-slate-500' },
  pending:               { label: 'Beklemede',   color: 'bg-yellow-100 text-yellow-700' },
};

export default function PortalRequestsPage() {
  const [tab, setTab] = useState('new');
  const [showModal, setShowModal] = useState(false);

  // Form alanları
  const [requestType, setRequestType] = useState('new_inspection');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);

  // Bildirimler
  const { data: notifData } = useQuery({
    queryKey: ['portal-notifications'],
    queryFn: () => apiClient.get('/notifications'),
  });

  // Geçmiş talepler
  const { data: complaintData } = useQuery({
    queryKey: ['portal-complaints'],
    queryFn: () => apiClient.get('/complaints?limit=50'),
  });

  const notifications = (notifData as any)?.data || [];
  const complaints = (complaintData as any)?.data?.data || (complaintData as any)?.data || [];
  const unread = notifications.filter((n: any) => !n.isRead).length;

  // Talep gönder
  const createMutation = useMutationWithToast(
    (d: any) => apiClient.post('/complaints', d),
    {
      successMessage: 'Talebiniz başarıyla iletildi',
      invalidateKeys: [['portal-complaints']],
      onSuccess: () => {
        setShowModal(false);
        resetForm();
      },
    },
  );

  // Bildirimi okundu işaretle
  const markReadMutation = useMutationWithToast(
    (id: string) => apiClient.patch(`/notifications/${id}/read`),
    { invalidateKeys: [['portal-notifications']] },
  );

  const resetForm = () => {
    setRequestType('new_inspection');
    setSubject('');
    setDescription('');
    setAttachment(null);
  };

  const handleSubmit = () => {
    if (!subject.trim()) {
      toast.error('Konu alanı zorunludur');
      return;
    }
    if (!description.trim()) {
      toast.error('Açıklama alanı zorunludur');
      return;
    }
    createMutation.mutate({
      type: requestType,
      subject: subject.trim(),
      description: description.trim(),
    });
  };

  const tabs = [
    { key: 'new',           label: 'Yeni Talep' },
    { key: 'history',       label: 'Geçmiş Talepler', count: complaints.length },
    { key: 'notifications', label: 'Bildirimler', count: unread || undefined },
  ];

  return (
    <>
      <PageHeader
        title="Talepler ve Bildirimler"
        subtitle="Talep oluşturun, geçmiş taleplerinizi ve bildirimlerinizi görüntüleyin"
        actions={
          tab !== 'new' && (
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setTab('new'); }}>
              Yeni Talep
            </Button>
          )
        }
      />

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Yeni Talep Formu */}
      {tab === 'new' && (
        <div className="max-w-2xl">
          <Card>
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 mb-6">Talep Oluştur</h3>

            {/* Talep tipi seçimi */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Talep Türü
              </label>
              <div className="grid grid-cols-2 gap-3">
                {REQUEST_TYPES.map((type) => {
                  const Icon = type.icon;
                  const isSelected = requestType === type.value;
                  return (
                    <button
                      key={type.value}
                      onClick={() => setRequestType(type.value)}
                      className={`
                        flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left
                        ${isSelected
                          ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/30'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                        }
                      `}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-teal-100 dark:bg-teal-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                        <Icon className={`w-5 h-5 ${isSelected ? 'text-teal-600' : 'text-slate-400'}`} />
                      </div>
                      <span className={`text-sm font-medium ${isSelected ? 'text-teal-700 dark:text-teal-300' : 'text-slate-600 dark:text-slate-400'}`}>
                        {type.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Konu */}
            <div className="mb-4">
              <Input
                label="Konu"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Talebinizin konusunu kısaca yazın"
              />
            </div>

            {/* Açıklama */}
            <div className="mb-4">
              <Textarea
                label="Açıklama"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="Talebinizi detaylı olarak açıklayın..."
              />
            </div>

            {/* Ek dosya */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Ek Dosya (opsiyonel)
              </label>
              <div
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center cursor-pointer hover:border-teal-400 transition-colors"
                onClick={() => document.getElementById('request-attachment')?.click()}
              >
                <Paperclip className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                {attachment ? (
                  <p className="text-sm font-semibold text-teal-600">{attachment.name}</p>
                ) : (
                  <p className="text-sm text-slate-500">Dosya eklemek için tıklayın</p>
                )}
                <input
                  id="request-attachment"
                  type="file"
                  className="hidden"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            {/* Gönder butonu */}
            <div className="flex justify-end">
              <Button
                icon={<Send className="w-4 h-4" />}
                loading={createMutation.isPending}
                onClick={handleSubmit}
              >
                Talebi Gönder
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Geçmiş Talepler */}
      {tab === 'history' && (
        <div className="space-y-3">
          {complaints.length === 0 ? (
            <Card>
              <EmptyState
                icon={<MessageSquare className="w-12 h-12" />}
                title="Henüz talep kaydı yok"
                description="Oluşturduğunuz talepler burada listelenecek"
                action={
                  <Button icon={<Plus className="w-4 h-4" />} onClick={() => setTab('new')}>
                    Yeni Talep Oluştur
                  </Button>
                }
              />
            </Card>
          ) : (
            complaints.map((c: any) => {
              const st = REQUEST_STATUS_LABELS[c.status] || { label: c.status, color: 'bg-slate-100 text-slate-500' };
              return (
                <Card key={c.id}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-slate-800">
                      <MessageSquare className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        {c.complaintNumber && (
                          <span className="font-mono text-xs text-slate-400">{c.complaintNumber}</span>
                        )}
                        <Badge color="bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                          {REQUEST_TYPE_LABELS[c.type] || c.type}
                        </Badge>
                        <Badge color={st.color} dot>{st.label}</Badge>
                      </div>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">{c.subject}</p>
                      {c.description && (
                        <p className="text-xs text-slate-500 line-clamp-2">{c.description}</p>
                      )}
                      <p className="text-xs text-slate-300 mt-1">{formatDateTime(c.createdAt)}</p>
                      {c.resolution && (
                        <div className="mt-2 p-2.5 bg-green-50 dark:bg-green-950/30 rounded-lg text-xs text-green-700 dark:text-green-300">
                          <strong>Yanıt:</strong> {c.resolution}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Bildirimler */}
      {tab === 'notifications' && (
        <div className="space-y-2">
          {notifications.length === 0 ? (
            <Card>
              <EmptyState icon={<Bell className="w-12 h-12" />} title="Bildirim yok" />
            </Card>
          ) : (
            notifications.map((n: any) => (
              <Card key={n.id} className={!n.isRead ? 'border-teal-200 dark:border-teal-800' : ''}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${!n.isRead ? 'bg-teal-100 dark:bg-teal-950/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                    <Bell className={`w-4 h-4 ${!n.isRead ? 'text-teal-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{n.title}</p>
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-teal-500" />}
                    </div>
                    <p className="text-sm text-slate-500">{n.body}</p>
                    <p className="text-xs text-slate-300 mt-1">{formatDateTime(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <button
                      onClick={() => markReadMutation.mutate(n.id)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                      title="Okundu olarak işaretle"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </>
  );
}
