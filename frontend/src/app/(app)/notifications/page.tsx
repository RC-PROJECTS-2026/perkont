'use client';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import { PageHeader, Card, Badge, Button, Tabs, EmptyState } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import { Bell, Check, CheckCheck, Mail, MessageSquare, RefreshCw } from 'lucide-react';
import { useState } from 'react';

const channelIcons: Record<string, React.ReactNode> = {
  email: <Mail className="w-4 h-4" />,
  sms:   <MessageSquare className="w-4 h-4" />,
};
const channelColors: Record<string, string> = {
  email: 'bg-blue-100 text-blue-700',
  sms:   'bg-green-100 text-green-700',
};

export default function NotificationsPage() {
  const [tab, setTab] = useState('unread');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications', tab],
    queryFn: () => apiClient.get('/notifications/my?limit=100'),
  });

  const notifications = ((data as any)?.data || []).filter((n: any) =>
    tab === 'unread' ? !n.isRead : tab === 'read' ? n.isRead : true,
  );

  const markReadMutation = useMutationWithToast(
    (id: string) => apiClient.put(`/notifications/${id}/read`, {}),
    { invalidateKeys: [['notifications']] },
  );

  const markAllMutation = useMutationWithToast(
    () => apiClient.put('/notifications/read-all', {}),
    { successMessage: 'Tümü okundu işaretlendi', invalidateKeys: [['notifications']] },
  );

  const unreadCount = ((data as any)?.data || []).filter((n: any) => !n.isRead).length;

  const tabs = [
    { key: 'unread', label: 'Okunmamış', count: unreadCount },
    { key: 'read',   label: 'Okunmuş' },
    { key: 'all',    label: 'Tümü' },
  ];

  return (
    <>
      <PageHeader
        title="Bildirim Yönetimi"
        subtitle={`${unreadCount} okunmamış bildirim`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            {unreadCount > 0 && (
              <Button variant="outline" icon={<CheckCheck className="w-4 h-4" />}
                loading={markAllMutation.isPending} onClick={() => markAllMutation.mutate(undefined as any)}>
                Tümünü Oku
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 skeleton rounded-xl" />)
        ) : notifications.length === 0 ? (
          <Card>
            <EmptyState icon={<Bell className="w-12 h-12" />}
              title={tab === 'unread' ? 'Okunmamış bildirim yok' : 'Bildirim bulunamadı'} />
          </Card>
        ) : (
          notifications.map((n: any) => (
            <Card
              key={n.id}
              className={`transition-colors ${!n.isRead ? 'border-teal-200 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-950/10' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.isRead ? 'bg-slate-100 dark:bg-slate-800' : 'bg-teal-100 dark:bg-teal-950/40'}`}>
                  <Bell className={`w-4 h-4 ${n.isRead ? 'text-slate-400' : 'text-teal-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{n.title}</span>
                    {n.channel && (
                      <Badge color={channelColors[n.channel] || 'bg-slate-100 text-slate-500'}>
                        <span className="flex items-center gap-1">{channelIcons[n.channel]}{n.channel}</span>
                      </Badge>
                    )}
                    {!n.isRead && <span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />}
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2">{n.body}</p>
                  <p className="text-xs text-slate-300 mt-1">{formatDateTime(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <button
                    onClick={() => markReadMutation.mutate(n.id)}
                    className="p-1.5 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-950/40 text-slate-400 hover:text-teal-600 flex-shrink-0"
                    title="Okundu işaretle"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
