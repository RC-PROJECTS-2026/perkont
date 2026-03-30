'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { useMutationWithToast } from '@/lib/api';
import {
  PageHeader, Card, CardHeader, CardTitle, Badge, Button,
  SkeletonTable, EmptyState, Modal, Input, Textarea, Select, Tabs,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Shield, Plus, RefreshCw, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';

const auditApi = {
  listPlans:   ()       => apiClient.get('/internal-audit/plans'),
  createPlan:  (d: any) => apiClient.post('/internal-audit/plans', d),
  addFinding:  (planId: string, d: any) => apiClient.post(`/internal-audit/plans/${planId}/findings`, d),
  closeFinding:(id: string) => apiClient.patch(`/internal-audit/findings/${id}/close`),
  openFindings:()       => apiClient.get('/internal-audit/findings/open'),
};

const sevColors: Record<string, string> = {
  major:       'bg-red-100 text-red-700',
  minor:       'bg-amber-100 text-amber-700',
  observation: 'bg-blue-100 text-blue-700',
};
const planStatusColors: Record<string, string> = {
  planned:     'bg-slate-100 text-slate-600',
  in_progress: 'bg-amber-100 text-amber-700',
  completed:   'bg-green-100 text-green-700',
};

export default function InternalAuditPage() {
  const [tab, setTab]               = useState('plans');
  const [expanded, setExpanded]     = useState<string | null>(null);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [findingModal, setFindingModal]     = useState<any>(null);

  const { data: plansData, isLoading, refetch } = useQuery({
    queryKey: ['internal-audit-plans'],
    queryFn: auditApi.listPlans,
  });
  const { data: openData } = useQuery({
    queryKey: ['open-findings'],
    queryFn: auditApi.openFindings,
  });

  const plans       = (plansData as any)?.data?.data || [];
  const openFindings = (openData as any)?.data || [];

  const { register: planReg, handleSubmit: planSubmit, reset: planReset } = useForm<any>();
  const { register: findReg, handleSubmit: findSubmit, reset: findReset } = useForm<any>();

  const createPlanMutation = useMutationWithToast(auditApi.createPlan, {
    successMessage: 'Tetkik planı oluşturuldu',
    invalidateKeys: [['internal-audit-plans']],
    onSuccess: () => { setShowCreatePlan(false); planReset(); },
  });

  const addFindingMutation = useMutationWithToast(
    (d: any) => auditApi.addFinding(findingModal?.id, d),
    {
      successMessage: 'Bulgu eklendi',
      invalidateKeys: [['internal-audit-plans']],
      onSuccess: () => { setFindingModal(null); findReset(); },
    },
  );

  const closeFindingMutation = useMutationWithToast(auditApi.closeFinding, {
    successMessage: 'Bulgu kapatıldı',
    invalidateKeys: [['internal-audit-plans'], ['open-findings']],
  });

  const tabs = [
    { key: 'plans',    label: 'Tetkik Planları', count: plans.length },
    { key: 'findings', label: 'Açık Bulgular',   count: openFindings.length },
  ];

  return (
    <>
      <PageHeader
        title="İç Tetkik"
        subtitle="ISO/IEC 17020 Madde 8.6"
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreatePlan(true)}>Tetkik Planı Oluştur</Button>
          </>
        }
      />

      <div className="mb-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* Plans tab */}
      {tab === 'plans' && (
        <div className="space-y-4">
          {isLoading ? <SkeletonTable rows={4} cols={4} /> : plans.length === 0 ? (
            <Card>
              <EmptyState icon={<Shield className="w-12 h-12" />} title="Tetkik planı yok"
                action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreatePlan(true)}>Oluştur</Button>} />
            </Card>
          ) : (
            plans.map((plan: any) => (
              <Card key={plan.id} padding="none">
                {/* Plan header */}
                <div
                  className="flex items-center gap-4 p-5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-t-xl"
                  onClick={() => setExpanded(expanded === plan.id ? null : plan.id)}
                >
                  {expanded === plan.id
                    ? <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  }
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-200">{plan.auditNumber}</span>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{plan.title}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(plan.plannedDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {plan.findings?.length > 0 && (
                      <span className="text-xs text-slate-400">{plan.findings.length} bulgu</span>
                    )}
                    <Badge color={planStatusColors[plan.status] || ''} dot>
                      {plan.status === 'planned' ? 'Planlandı' : plan.status === 'in_progress' ? 'Devam' : 'Tamamlandı'}
                    </Badge>
                    <Button variant="outline" size="sm" icon={<Plus className="w-3 h-3" />}
                      onClick={(e) => { e.stopPropagation(); setFindingModal(plan); }}>
                      Bulgu Ekle
                    </Button>
                  </div>
                </div>

                {/* Expanded findings */}
                {expanded === plan.id && plan.findings?.length > 0 && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Bulgu No</th>
                          <th>Madde</th>
                          <th>Açıklama</th>
                          <th>Şiddet</th>
                          <th>Hedef Tarih</th>
                          <th>Durum</th>
                          <th>İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.findings.map((f: any) => (
                          <tr key={f.id}>
                            <td><span className="font-mono text-xs">{f.findingNumber}</span></td>
                            <td><span className="text-xs text-slate-500">{f.clause}</span></td>
                            <td><p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2 max-w-xs">{f.description}</p></td>
                            <td><Badge color={sevColors[f.severity] || ''}>{f.severity}</Badge></td>
                            <td><span className="text-sm text-slate-500">{formatDate(f.targetDate)}</span></td>
                            <td>
                              <Badge color={f.status === 'closed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'} dot>
                                {f.status === 'closed' ? 'Kapatıldı' : 'Açık'}
                              </Badge>
                            </td>
                            <td>
                              {f.status !== 'closed' && (
                                <button
                                  onClick={() => closeFindingMutation.mutate(f.id)}
                                  className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600"
                                  title="Kapat"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {expanded === plan.id && (!plan.findings || plan.findings.length === 0) && (
                  <div className="border-t border-slate-100 dark:border-slate-800 p-4 text-center text-sm text-slate-400">
                    Henüz bulgu eklenmemiş
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Open findings tab */}
      {tab === 'findings' && (
        <Card padding="none">
          {openFindings.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="w-12 h-12" />} title="Açık bulgu yok" description="Tüm bulgular kapatılmış" />
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Bulgu No</th><th>Tetkik</th><th>Madde</th><th>Açıklama</th><th>Şiddet</th><th>Hedef</th><th>İşlem</th></tr>
              </thead>
              <tbody>
                {openFindings.map((f: any) => (
                  <tr key={f.id}>
                    <td><span className="font-mono text-xs font-semibold">{f.findingNumber}</span></td>
                    <td><span className="font-mono text-xs text-slate-400">{f.auditPlan?.auditNumber}</span></td>
                    <td><span className="text-xs text-slate-500">{f.clause}</span></td>
                    <td><p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1 max-w-xs">{f.description}</p></td>
                    <td><Badge color={sevColors[f.severity] || ''}>{f.severity}</Badge></td>
                    <td>
                      {f.targetDate ? (
                        <span className={`text-sm ${new Date(f.targetDate) < new Date() ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                          {formatDate(f.targetDate)}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td>
                      <button onClick={() => closeFindingMutation.mutate(f.id)}
                        className="p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600" title="Kapat">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Create Plan Modal */}
      <Modal open={showCreatePlan} onClose={() => { setShowCreatePlan(false); planReset(); }} title="Tetkik Planı Oluştur" size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setShowCreatePlan(false)}>İptal</Button>
          <Button loading={createPlanMutation.isPending} onClick={planSubmit((d) => createPlanMutation.mutate(d))}>Oluştur</Button>
        </>}>
        <div className="space-y-4">
          <Input label="Tetkik Başlığı" required {...planReg('title', { required: true })} />
          <Input label="Planlanan Tarih" type="date" required {...planReg('plannedDate', { required: true })} />
          <Textarea label="Hedef / Kapsam" {...planReg('objective')} rows={2} />
        </div>
      </Modal>

      {/* Add Finding Modal */}
      <Modal open={!!findingModal} onClose={() => { setFindingModal(null); findReset(); }}
        title={`Bulgu Ekle — ${findingModal?.auditNumber}`} size="md"
        footer={<>
          <Button variant="secondary" onClick={() => setFindingModal(null)}>İptal</Button>
          <Button loading={addFindingMutation.isPending} onClick={findSubmit((d) => addFindingMutation.mutate(d))}>Ekle</Button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <Select label="Şiddet" required options={[{ value: 'major', label: 'Önemli' }, { value: 'minor', label: 'Küçük' }, { value: 'observation', label: 'Gözlem' }]}
            {...findReg('severity', { required: true })} />
          <Input label="Standart Maddesi" placeholder="ISO 17020 Madde 6.2" required {...findReg('clause', { required: true })} />
          <Textarea label="Bulgu Açıklaması" required {...findReg('description', { required: true })} className="col-span-2" rows={3} />
          <Input label="Düzeltici Faaliyet" {...findReg('correctiveAction')} className="col-span-2" />
          <Input label="Hedef Tarih" type="date" {...findReg('targetDate')} />
        </div>
      </Modal>
    </>
  );
}
