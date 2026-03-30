'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi, equipmentApi, workOrdersApi, reportsApi, quotationsApi, salesPipelineApi, proposalsApi, contractEngineApi } from '@/lib/api';
import {
  PageHeader, Card, CardHeader, CardTitle, Badge, Button,
  Tabs, Modal, Input, Textarea, EmptyState, StatCard,
} from '@/components/ui';
import { formatDate, formatCurrency } from '@/lib/utils';
import {
  Building2, MapPin, Phone, Mail, Plus, Edit, Save,
  Package, FileText, ClipboardList, RefreshCw, MessageSquare,
  AlertTriangle, Calendar, DollarSign, Send, Clock, PhoneCall,
  StickyNote, CheckCircle, XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState('summary');
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);
  const [showQuickQuote, setShowQuickQuote] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('call'); // call, email, visit, note
  const [locForm, setLocForm] = useState({ name: '', city: '', district: '', address: '', contactName: '', contactPhone: '' });
  const [quoteItems, setQuoteItems] = useState([{ description: '', quantity: 1, unitPrice: 0 }]);
  const [locationFilter, setLocationFilter] = useState('all');
  const [editForm, setEditForm] = useState<Record<string, any>>({});

  const { data: custData, isLoading, refetch } = useQuery({
    queryKey: ['customer', id], queryFn: () => customersApi.get(id), enabled: !!id,
  });
  const { data: eqData } = useQuery({
    queryKey: ['equipment', { customerId: id }], queryFn: () => equipmentApi.list({ customerId: id, limit: 500 }), enabled: !!id,
  });
  const { data: woData } = useQuery({
    queryKey: ['work-orders', { customerId: id }], queryFn: () => workOrdersApi.list({ customerId: id, limit: 50 }), enabled: !!id,
  });
  const { data: rpData } = useQuery({
    queryKey: ['reports', { customerId: id }], queryFn: () => reportsApi.list({ customerId: id, limit: 50 }), enabled: !!id,
  });
  const { data: oppData } = useQuery({
    queryKey: ['opportunities', { customerId: id }],
    queryFn: () => salesPipelineApi.list({ customerId: id, limit: 20 }),
    enabled: !!id && tab === 'sales',
  });
  const { data: propData } = useQuery({
    queryKey: ['proposals', { customerId: id }],
    queryFn: () => proposalsApi.list({ customerId: id, limit: 20 }),
    enabled: !!id && tab === 'sales',
  });
  const { data: contData } = useQuery({
    queryKey: ['contracts-customer', { customerId: id }],
    queryFn: () => contractEngineApi.list({ customerId: id, limit: 20 }),
    enabled: !!id && tab === 'sales',
  });

  const customer = (custData as any)?.data;
  const equipment = (eqData as any)?.data?.data || (eqData as any)?.data || [];
  const allEquipment = Array.isArray(equipment) ? equipment : [];
  const workOrders = (woData as any)?.data?.data || [];
  const reports = (rpData as any)?.data?.data || [];
  const opportunities = (oppData as any)?.data?.data || (oppData as any)?.data || [];
  const proposals = (propData as any)?.data?.data || (propData as any)?.data || [];
  const contracts = (contData as any)?.data?.data || (contData as any)?.data || [];

  // Yaklaşan kontroller
  const now = new Date();
  const upcomingControls = allEquipment.filter((e: any) => {
    if (!e.nextControlDate) return false;
    const d = new Date(e.nextControlDate);
    const diff = (d.getTime() - now.getTime()) / 86400000;
    return diff <= 90;
  }).sort((a: any, b: any) => new Date(a.nextControlDate).getTime() - new Date(b.nextControlDate).getTime());

  const overdueControls = allEquipment.filter((e: any) => e.nextControlDate && new Date(e.nextControlDate) < now);

  // Müşteri notları (customer.notes JSON olarak saklanıyor, düz metin de olabilir)
  let customerNotes: any[] = [];
  try {
    if (customer?.notes) {
      const parsed = JSON.parse(customer.notes);
      customerNotes = Array.isArray(parsed) ? parsed : [{ text: customer.notes, type: 'note', date: customer.updatedAt }];
    }
  } catch {
    if (customer?.notes) customerNotes = [{ text: customer.notes, type: 'note', date: customer.updatedAt }];
  }

  // Filtered equipment by location
  const filteredEquipment = locationFilter === 'all'
    ? allEquipment
    : allEquipment.filter((eq: any) => eq.locationId === locationFilter || eq.location?.id === locationFilter);

  // Unique locations from equipment for filter
  const locations = customer?.locations || [];

  // Mutations
  const addLocationMut = useMutation({
    mutationFn: (data: any) => customersApi.createLocation(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer', id] }); setShowAddLocation(false); toast.success('Lokasyon eklendi'); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateCustomerMut = useMutation({
    mutationFn: (data: any) => customersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer', id] }); toast.success('Güncellendi'); },
    onError: (e: any) => toast.error(e.message),
  });

  const addNote = () => {
    if (!noteText.trim()) return;
    const typeLabels: Record<string,string> = { call: 'Telefon Görüşmesi', email: 'E-posta', visit: 'Ziyaret', note: 'Not' };
    const newNote = { text: noteText.trim(), type: noteType, typeLabel: typeLabels[noteType], date: new Date().toISOString(), user: 'Admin' };
    const updatedNotes = [newNote, ...customerNotes];
    updateCustomerMut.mutate({ notes: JSON.stringify(updatedNotes) });
    setNoteText('');
    setShowAddNote(false);
  };

  const createQuote = async () => {
    const items = quoteItems.filter(i => i.description.trim());
    if (items.length === 0) { toast.error('En az bir kalem ekleyin'); return; }
    try {
      await quotationsApi.create({
        customerId: id,
        items: items.map(i => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.quantity * i.unitPrice, discountRate: 0 })),
      });
      toast.success('Teklif oluşturuldu');
      setShowQuickQuote(false);
      setQuoteItems([{ description: '', quantity: 1, unitPrice: 0 }]);
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="space-y-4"><div className="h-10 animate-pulse bg-slate-800/50 rounded-xl w-64" /><div className="h-40 animate-pulse bg-slate-800/50 rounded-xl" /></div>;
  if (!customer) return <EmptyState title="Müşteri bulunamadı" action={<Button onClick={() => router.back()}>Geri Dön</Button>} />;

  const tabs = [
    { key: 'summary', label: 'Özet' },
    { key: 'equipment-locations', label: 'Ekipman & Lokasyonlar', count: allEquipment.length },
    { key: 'sales', label: 'Satış' },
    { key: 'operations', label: 'Operasyon', count: workOrders.length + reports.length },
  ];

  const noteIcons: Record<string, any> = { call: <PhoneCall className="w-4 h-4" />, email: <Mail className="w-4 h-4" />, visit: <MapPin className="w-4 h-4" />, note: <StickyNote className="w-4 h-4" /> };
  const noteColors: Record<string, string> = { call: 'text-blue-400', email: 'text-purple-400', visit: 'text-green-400', note: 'text-amber-400' };

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-900/40 flex items-center justify-center">
            <Building2 className="w-7 h-7 text-teal-400" />
          </div>
          <div>
            <h1 className="font-bold text-2xl text-slate-100 tracking-tight">{customer.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400">{customer.code}</span>
              {customer.city && <span className="text-sm text-slate-500"><MapPin className="w-3 h-3 inline mr-1" />{customer.city}</span>}
              <Badge color={customer.isActive ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'} dot>{customer.isActive ? 'Aktif' : 'Pasif'}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon={<Edit className="w-4 h-4" />} onClick={() => {
            setEditForm({
              code: customer.code || '', name: customer.name || '',
              taxNumber: customer.taxNumber || '', taxOffice: customer.taxOffice || '',
              address: customer.address || '', city: customer.city || '',
              district: customer.district || '', sector: customer.sector || '',
              contactName: customer.contactName || '', contactEmail: customer.contactEmail || '',
              contactPhone: customer.contactPhone || '',
              invoiceEmail: customer.invoiceEmail || '', invoiceContactName: customer.invoiceContactName || '',
              invoiceContactPhone: customer.invoiceContactPhone || '',
              logoCariId: customer.logoCariId || '', logoCariCode: customer.logoCariCode || '',
              isActive: customer.isActive ?? true,
              additionalContacts: customer.additionalContacts || [],
            });
            setShowEdit(true);
          }}>Düzenle</Button>
          <Button variant="outline" size="sm" icon={<MessageSquare className="w-4 h-4" />} onClick={() => setShowAddNote(true)}>Not Ekle</Button>
          <Button variant="outline" size="sm" icon={<DollarSign className="w-4 h-4" />} onClick={() => setShowQuickQuote(true)}>Teklif Oluştur</Button>
          <Button variant="outline" size="sm" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
        </div>
      </div>

      {/* Üst Stat Kartları */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard title="Ekipman" value={allEquipment.length} icon={<Package className="w-5 h-5 text-teal-400" />} />
        <StatCard title="Yaklaşan Kontrol" value={upcomingControls.length} icon={<Calendar className="w-5 h-5 text-amber-400" />} />
        <StatCard title="Gecikmiş" value={overdueControls.length} icon={<AlertTriangle className="w-5 h-5 text-red-400" />} />
        <StatCard title="İş Emri" value={workOrders.length} icon={<ClipboardList className="w-5 h-5 text-blue-400" />} />
        <StatCard title="Rapor" value={reports.length} icon={<FileText className="w-5 h-5 text-emerald-400" />} />
      </div>

      {/* Gecikmiş kontrol uyarısı */}
      {overdueControls.length > 0 && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800/40 rounded-xl flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300"><strong>{overdueControls.length} ekipmanın</strong> kontrol tarihi geçmiş! Acil planlama gerekiyor.</p>
          <Button size="sm" variant="outline" className="ml-auto border-red-700 text-red-400" onClick={() => setTab('equipment-locations')}>Ekipmanları Gör</Button>
        </div>
      )}

      <div className="mb-4"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>

      {/* ═══ ÖZET (merged CRM + Overview) ═══ */}
      {tab === 'summary' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sol — İletişim + Bilgiler + Hızlı Aksiyonlar */}
            <div className="space-y-4">
              <Card>
                <CardHeader><CardTitle>İletişim Bilgileri</CardTitle></CardHeader>
                <div className="space-y-3">
                  {customer.contactName && <div className="flex items-center gap-2 text-sm"><span className="text-slate-500 w-20">Yetkili</span><span className="text-slate-200">{customer.contactName}</span></div>}
                  {customer.contactPhone && (
                    <a href={`tel:${customer.contactPhone}`} className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300">
                      <Phone className="w-4 h-4" />{customer.contactPhone}
                    </a>
                  )}
                  {customer.contactEmail && customer.contactEmail !== '-' && (
                    <a href={`mailto:${customer.contactEmail}`} className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300">
                      <Mail className="w-4 h-4" />{customer.contactEmail}
                    </a>
                  )}
                  {customer.city && (
                    <div className="flex items-center gap-2 text-sm"><span className="text-slate-500 w-20">Şehir</span><span className="text-slate-200">{customer.city}{customer.district ? ' / ' + customer.district : ''}</span></div>
                  )}
                  {customer.address && (
                    <div className="flex items-start gap-2 text-sm"><span className="text-slate-500 w-20 flex-shrink-0">Adres</span><span className="text-slate-200">{customer.address}</span></div>
                  )}
                  {customer.taxNumber && (
                    <div className="flex items-center gap-2 text-sm"><span className="text-slate-500 w-20">Vergi No</span><span className="text-slate-200">{customer.taxNumber}</span></div>
                  )}
                  {customer.taxOffice && (
                    <div className="flex items-center gap-2 text-sm"><span className="text-slate-500 w-20">V. Dairesi</span><span className="text-slate-200">{customer.taxOffice}</span></div>
                  )}
                  {customer.sector && (
                    <div className="flex items-center gap-2 text-sm"><span className="text-slate-500 w-20">Sektör</span><span className="text-slate-200">{customer.sector}</span></div>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader><CardTitle>Hızlı Aksiyonlar</CardTitle></CardHeader>
                <div className="space-y-2">
                  <Button variant="outline" size="sm" className="w-full justify-start" icon={<PhoneCall className="w-4 h-4" />} onClick={() => { setNoteType('call'); setShowAddNote(true); }}>Arama Notu Ekle</Button>
                  <Button variant="outline" size="sm" className="w-full justify-start" icon={<Send className="w-4 h-4" />} onClick={() => { setNoteType('email'); setShowAddNote(true); }}>E-posta Notu Ekle</Button>
                  <Button variant="outline" size="sm" className="w-full justify-start" icon={<MapPin className="w-4 h-4" />} onClick={() => { setNoteType('visit'); setShowAddNote(true); }}>Ziyaret Notu Ekle</Button>
                  <Button variant="outline" size="sm" className="w-full justify-start" icon={<DollarSign className="w-4 h-4" />} onClick={() => setShowQuickQuote(true)}>Fiyat Teklifi Hazırla</Button>
                  <Button variant="outline" size="sm" className="w-full justify-start" icon={<ClipboardList className="w-4 h-4" />} onClick={() => router.push('/work-orders/new')}>İş Emri Oluştur</Button>
                </div>
              </Card>
            </div>

            {/* Orta + Sağ — Görüşme Geçmişi */}
            <div className="lg:col-span-2">
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <CardTitle>Görüşme Geçmişi ve Notlar</CardTitle>
                  <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddNote(true)}>Not Ekle</Button>
                </div>

                {customerNotes.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500">Henüz görüşme notu yok</p>
                    <p className="text-xs text-slate-600 mt-1">Müşteriyle iletişime geçtiğinizde not ekleyerek takip edin</p>
                    <Button size="sm" className="mt-4" onClick={() => setShowAddNote(true)}>İlk Notu Ekle</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customerNotes.map((note: any, i: number) => (
                      <div key={i} className="flex gap-3 p-3 bg-slate-800/50 rounded-lg">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-800 ${noteColors[note.type] || 'text-slate-400'}`}>
                          {noteIcons[note.type] || <StickyNote className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge color="bg-slate-700 text-slate-300">{note.typeLabel || note.type}</Badge>
                            <span className="text-xs text-slate-500">{note.date ? formatDate(note.date) : '—'}</span>
                            {note.user && <span className="text-xs text-slate-600">— {note.user}</span>}
                          </div>
                          <p className="text-sm text-slate-300 whitespace-pre-wrap">{note.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Bottom: Yaklaşan Kontroller (compact, max 5) */}
          <div className="mt-6">
            <Card>
              <CardHeader><CardTitle>Yaklaşan Kontroller ({upcomingControls.length})</CardTitle></CardHeader>
              <div className="space-y-2 max-h-48 overflow-auto">
                {upcomingControls.slice(0, 5).map((eq: any) => {
                  const d = new Date(eq.nextControlDate);
                  const diff = Math.ceil((d.getTime() - now.getTime()) / 86400000);
                  const isOverdue = diff < 0;
                  return (
                    <div key={eq.id} className="flex items-center justify-between py-1.5 border-b border-slate-800 last:border-0">
                      <div>
                        <p className="text-xs font-semibold text-slate-300">{eq.brand || eq.inventoryCode}</p>
                        <p className="text-xs text-slate-500">{eq.inventoryCode}</p>
                      </div>
                      <Badge color={isOverdue ? 'bg-red-900/30 text-red-400' : diff <= 7 ? 'bg-amber-900/30 text-amber-400' : 'bg-teal-900/30 text-teal-400'}>
                        {isOverdue ? `${Math.abs(diff)} gün gecikmiş` : `${diff} gün`}
                      </Badge>
                    </div>
                  );
                })}
                {upcomingControls.length === 0 && <p className="text-xs text-slate-500">90 gün içinde kontrol yok</p>}
                {upcomingControls.length > 5 && <p className="text-xs text-slate-500 text-center mt-2">+{upcomingControls.length - 5} daha...</p>}
              </div>
            </Card>
          </div>
        </>
      )}

      {/* ═══ EKİPMAN & LOKASYONLAR (merged Equipment + Locations) ═══ */}
      {tab === 'equipment-locations' && (
        <>
          {/* Location cards - horizontal scroll */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Lokasyonlar ({locations.length})</h3>
              <Button size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowAddLocation(true)}>Lokasyon Ekle</Button>
            </div>
            {locations.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {locations.map((loc: any) => (
                  <div key={loc.id} className="flex-shrink-0 w-64 bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-teal-900/40 flex items-center justify-center flex-shrink-0"><MapPin className="w-4 h-4 text-teal-400" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-slate-200 truncate">{loc.name}</p>
                        {loc.city && <p className="text-xs text-slate-500">{loc.city}{loc.district && `, ${loc.district}`}</p>}
                        {loc.address && <p className="text-xs text-slate-600 mt-1 line-clamp-2">{loc.address}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 bg-slate-800/30 rounded-xl">
                <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-500">Henüz lokasyon eklenmemiş</p>
                <Button size="sm" className="mt-3" onClick={() => setShowAddLocation(true)}>İlk Lokasyonu Ekle</Button>
              </div>
            )}
          </div>

          {/* Equipment table with location filter */}
          <Card padding="none">
            <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">Ekipmanlar ({filteredEquipment.length})</h3>
              {locations.length > 0 && (
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="text-xs bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-300"
                >
                  <option value="all">Tüm Lokasyonlar</option>
                  {locations.map((loc: any) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Envanter</th><th>Tip</th><th>Ekipman</th><th>Sonraki Kontrol</th><th>Durum</th></tr></thead>
                <tbody>
                  {filteredEquipment.slice(0, 100).map((eq: any) => {
                    const d = eq.nextControlDate ? new Date(eq.nextControlDate) : null;
                    const isOverdue = d && d < now;
                    return (
                      <tr key={eq.id} className="cursor-pointer" onClick={() => router.push(`/equipment/${eq.id}`)}>
                        <td><span className="font-mono text-xs text-teal-400">{eq.inventoryCode}</span></td>
                        <td><span className="text-xs text-slate-400">{eq.equipmentType?.name || '—'}</span></td>
                        <td><span className="text-sm text-slate-300">{eq.brand || '—'}</span></td>
                        <td>{d ? <span className={isOverdue ? 'text-red-400 font-semibold text-xs' : 'text-xs text-slate-400'}>{formatDate(eq.nextControlDate)}</span> : <span className="text-slate-600">—</span>}</td>
                        <td><Badge color={eq.status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-slate-800 text-slate-500'} dot>{eq.status === 'active' ? 'Aktif' : eq.status}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredEquipment.length === 0 && <p className="text-sm text-slate-500 text-center py-8">Ekipman yok</p>}
              {filteredEquipment.length > 100 && <p className="text-xs text-slate-500 text-center py-3">İlk 100 ekipman gösteriliyor. Toplam: {filteredEquipment.length}</p>}
            </div>
          </Card>
        </>
      )}

      {/* ═══ SATIŞ (merged Opportunities + Proposals + Contracts) ═══ */}
      {tab === 'sales' && (
        <div className="space-y-6">
          {/* Aktif Fırsatlar */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Aktif Fırsatlar</h3>
            {(Array.isArray(opportunities) ? opportunities : []).length === 0 ? (
              <Card><p className="text-sm text-slate-500 text-center py-4">Satış fırsatı yok</p></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(Array.isArray(opportunities) ? opportunities : []).slice(0, 3).map((opp: any) => (
                  <Card key={opp.id} className="cursor-pointer hover:border-teal-700/50 transition" onClick={() => router.push('/sales-pipeline')}>
                    <p className="text-sm font-semibold text-slate-200 mb-1">{opp.title}</p>
                    <div className="flex items-center justify-between">
                      <Badge color="bg-slate-800 text-slate-400">{opp.stage || opp.status}</Badge>
                      <span className="text-sm font-semibold text-teal-400">{formatCurrency(opp.estimatedValue || 0)}</span>
                    </div>
                    {opp.probability != null && <p className="text-xs text-slate-500 mt-1">Olasılık: %{opp.probability}</p>}
                  </Card>
                ))}
              </div>
            )}
            {(Array.isArray(opportunities) ? opportunities : []).length > 3 && (
              <p className="text-xs text-slate-500 mt-2 text-center">+{opportunities.length - 3} fırsat daha</p>
            )}
          </div>

          {/* Teklifler */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Teklifler</h3>
            <Card padding="none">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>Teklif No</th><th>Revizyon</th><th>Tutar</th><th>Durum</th></tr></thead>
                  <tbody>
                    {(Array.isArray(proposals) ? proposals : []).map((p: any) => (
                      <tr key={p.id} className="cursor-pointer" onClick={() => router.push(`/proposals/${p.id}`)}>
                        <td><span className="font-mono text-xs font-semibold text-teal-400">{p.proposalNumber || p.number || '—'}</span></td>
                        <td><span className="text-xs text-slate-400">{p.revision || p.revisionNumber || '—'}</span></td>
                        <td><span className="text-sm text-slate-300">{formatCurrency(p.totalAmount || p.amount || 0)}</span></td>
                        <td><Badge color="bg-slate-800 text-slate-400">{p.status}</Badge></td>
                      </tr>
                    ))}
                    {(!Array.isArray(proposals) || proposals.length === 0) && <tr><td colSpan={4} className="text-center text-slate-500 py-6">Teklif yok</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Sözleşmeler */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Sözleşmeler</h3>
            <Card padding="none">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>Sözleşme No</th><th>Başlangıç</th><th>Bitiş</th><th>Tutar</th><th>Durum</th></tr></thead>
                  <tbody>
                    {(Array.isArray(contracts) ? contracts : []).map((c: any) => (
                      <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/contract-engine/${c.id}`)}>
                        <td><span className="font-mono text-xs font-semibold text-teal-400">{c.contractNumber || c.number || '—'}</span></td>
                        <td><span className="text-xs text-slate-400">{c.startDate ? formatDate(c.startDate) : '—'}</span></td>
                        <td><span className="text-xs text-slate-400">{c.endDate ? formatDate(c.endDate) : '—'}</span></td>
                        <td><span className="text-sm text-slate-300">{formatCurrency(c.totalAmount || c.amount || 0)}</span></td>
                        <td><Badge color="bg-slate-800 text-slate-400">{c.status}</Badge></td>
                      </tr>
                    ))}
                    {(!Array.isArray(contracts) || contracts.length === 0) && <tr><td colSpan={5} className="text-center text-slate-500 py-6">Sözleşme yok</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ═══ OPERASYON (merged Orders + Reports) ═══ */}
      {tab === 'operations' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* İş Emirleri */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">İş Emirleri ({workOrders.length})</h3>
            <Card padding="none">
              <table className="data-table">
                <thead><tr><th>İş Emri No</th><th>Tarih</th><th>Durum</th></tr></thead>
                <tbody>
                  {workOrders.map((wo: any) => (
                    <tr key={wo.id} className="cursor-pointer" onClick={() => router.push(`/work-orders/${wo.id}`)}>
                      <td><span className="font-mono text-xs font-semibold text-slate-300">{wo.workOrderNumber}</span></td>
                      <td><span className="text-sm text-slate-400">{formatDate(wo.plannedDate)}</span></td>
                      <td><Badge color="bg-slate-800 text-slate-400">{wo.status}</Badge></td>
                    </tr>
                  ))}
                  {workOrders.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500 py-8">İş emri yok</td></tr>}
                </tbody>
              </table>
            </Card>
          </div>

          {/* Raporlar */}
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Raporlar ({reports.length})</h3>
            <Card padding="none">
              <table className="data-table">
                <thead><tr><th>Rapor No</th><th>Tarih</th><th>Durum</th></tr></thead>
                <tbody>
                  {reports.map((r: any) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/reports/${r.id}`)}>
                      <td><span className="font-mono text-xs font-semibold text-slate-300">{r.reportNumber}</span></td>
                      <td><span className="text-sm text-slate-400">{formatDate(r.createdAt)}</span></td>
                      <td><Badge color="bg-slate-800 text-slate-400">{r.status}</Badge></td>
                    </tr>
                  ))}
                  {reports.length === 0 && <tr><td colSpan={3} className="text-center text-slate-500 py-8">Rapor yok</td></tr>}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}

      {/* ═══ NOT EKLEME MODALI ═══ */}
      <Modal open={showAddNote} onClose={() => setShowAddNote(false)} title="Görüşme Notu Ekle" size="md">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">Not Tipi</p>
            <div className="flex gap-2">
              {[
                { key: 'call', label: 'Telefon', icon: <PhoneCall className="w-4 h-4" /> },
                { key: 'email', label: 'E-posta', icon: <Mail className="w-4 h-4" /> },
                { key: 'visit', label: 'Ziyaret', icon: <MapPin className="w-4 h-4" /> },
                { key: 'note', label: 'Genel Not', icon: <StickyNote className="w-4 h-4" /> },
              ].map(t => (
                <button key={t.key} onClick={() => setNoteType(t.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    noteType === t.key ? 'bg-teal-600 text-white border-teal-600' : 'bg-transparent text-slate-400 border-slate-600 hover:border-teal-500'
                  }`}>{t.icon}{t.label}</button>
              ))}
            </div>
          </div>
          <Textarea label="Not" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Görüşme detaylarını yazın..." className="min-h-[120px]" />
          <Button className="w-full" onClick={addNote} loading={updateCustomerMut.isPending}>Notu Kaydet</Button>
        </div>
      </Modal>

      {/* ═══ LOKASYON EKLEME MODALI ═══ */}
      <Modal open={showAddLocation} onClose={() => setShowAddLocation(false)} title="Yeni Lokasyon Ekle" size="md">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Input label="Lokasyon Adı" value={locForm.name} onChange={e => setLocForm({...locForm, name: e.target.value})} placeholder="Gebze Fabrikası" /></div>
          <Input label="Şehir" value={locForm.city} onChange={e => setLocForm({...locForm, city: e.target.value})} />
          <Input label="İlçe" value={locForm.district} onChange={e => setLocForm({...locForm, district: e.target.value})} />
          <Input label="İletişim" value={locForm.contactName} onChange={e => setLocForm({...locForm, contactName: e.target.value})} />
          <Input label="Telefon" value={locForm.contactPhone} onChange={e => setLocForm({...locForm, contactPhone: e.target.value})} />
          <div className="col-span-2"><Input label="Adres" value={locForm.address} onChange={e => setLocForm({...locForm, address: e.target.value})} /></div>
        </div>
        <Button className="w-full mt-4" loading={addLocationMut.isPending} onClick={() => addLocationMut.mutate(locForm)}>Ekle</Button>
      </Modal>

      {/* ═══ HIZLI TEKLİF MODALI ═══ */}
      <Modal open={showQuickQuote} onClose={() => setShowQuickQuote(false)} title={`Fiyat Teklifi — ${customer.name}`} size="lg">
        <div className="space-y-3">
          {quoteItems.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6"><Input label={i === 0 ? 'Açıklama' : undefined} value={item.description} onChange={e => { const n = [...quoteItems]; n[i].description = e.target.value; setQuoteItems(n); }} placeholder="Kaldırma iletme muayenesi" /></div>
              <div className="col-span-2"><Input label={i === 0 ? 'Adet' : undefined} type="number" value={item.quantity} onChange={e => { const n = [...quoteItems]; n[i].quantity = +e.target.value; setQuoteItems(n); }} /></div>
              <div className="col-span-3"><Input label={i === 0 ? 'Birim Fiyat (₺)' : undefined} type="number" value={item.unitPrice} onChange={e => { const n = [...quoteItems]; n[i].unitPrice = +e.target.value; setQuoteItems(n); }} /></div>
              <div className="col-span-1">
                {quoteItems.length > 1 && <button onClick={() => setQuoteItems(quoteItems.filter((_, j) => j !== i))} className="p-2 text-red-400 hover:text-red-300"><XCircle className="w-4 h-4" /></button>}
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setQuoteItems([...quoteItems, { description: '', quantity: 1, unitPrice: 0 }])}>Kalem Ekle</Button>
          <div className="flex justify-between items-center pt-4 border-t border-slate-700">
            <p className="text-lg font-bold text-slate-200">Toplam: {formatCurrency(quoteItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0))}</p>
            <Button onClick={createQuote}>Teklif Oluştur</Button>
          </div>
        </div>
      </Modal>

      {/* ═══ MÜŞTERİ DÜZENLEME MODALI ═══ */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Müşteri Bilgilerini Düzenle" size="xl">
        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-1">
          {/* Temel Bilgiler */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Temel Bilgiler</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Müşteri Kodu" value={editForm.code || ''} onChange={e => setEditForm({...editForm, code: e.target.value})} required />
              <Input label="Müşteri Adı" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} required />
              <Input label="Vergi No" value={editForm.taxNumber || ''} onChange={e => setEditForm({...editForm, taxNumber: e.target.value})} />
              <Input label="Vergi Dairesi" value={editForm.taxOffice || ''} onChange={e => setEditForm({...editForm, taxOffice: e.target.value})} />
              <Input label="Sektör" value={editForm.sector || ''} onChange={e => setEditForm({...editForm, sector: e.target.value})} />
              <div className="flex items-center gap-3 pt-6">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={editForm.isActive ?? true} onChange={e => setEditForm({...editForm, isActive: e.target.checked})} className="sr-only peer" />
                  <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                  <span className="ml-2 text-sm text-slate-300">{editForm.isActive ? 'Aktif' : 'Pasif'}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Adres Bilgileri */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Adres Bilgileri</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Şehir" value={editForm.city || ''} onChange={e => setEditForm({...editForm, city: e.target.value})} />
              <Input label="İlçe" value={editForm.district || ''} onChange={e => setEditForm({...editForm, district: e.target.value})} />
              <div className="col-span-2">
                <Textarea label="Adres" value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} rows={2} />
              </div>
            </div>
          </div>

          {/* Birincil İletişim */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Birincil İletişim</h4>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Yetkili Kişi" value={editForm.contactName || ''} onChange={e => setEditForm({...editForm, contactName: e.target.value})} />
              <Input label="Telefon" type="tel" value={editForm.contactPhone || ''} onChange={e => setEditForm({...editForm, contactPhone: e.target.value})} />
              <Input label="E-posta" type="email" value={editForm.contactEmail || ''} onChange={e => setEditForm({...editForm, contactEmail: e.target.value})} />
            </div>
          </div>

          {/* Fatura İletişim */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Fatura İletişim</h4>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Fatura Yetkili" value={editForm.invoiceContactName || ''} onChange={e => setEditForm({...editForm, invoiceContactName: e.target.value})} />
              <Input label="Fatura Telefon" value={editForm.invoiceContactPhone || ''} onChange={e => setEditForm({...editForm, invoiceContactPhone: e.target.value})} />
              <Input label="Fatura E-posta" type="email" value={editForm.invoiceEmail || ''} onChange={e => setEditForm({...editForm, invoiceEmail: e.target.value})} />
            </div>
          </div>

          {/* Ek İletişim Kişileri */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ek İletişim Kişileri</h4>
              <Button variant="outline" size="sm" icon={<Plus className="w-3 h-3" />} onClick={() => setEditForm({...editForm, additionalContacts: [...(editForm.additionalContacts || []), { name: '', phone: '', email: '', role: '' }]})}>Kişi Ekle</Button>
            </div>
            {(editForm.additionalContacts || []).map((contact: any, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 mb-2 items-end">
                <div className="col-span-3"><Input label={i === 0 ? 'İsim' : undefined} placeholder="Ad Soyad" value={contact.name || ''} onChange={e => { const c = [...editForm.additionalContacts]; c[i] = {...c[i], name: e.target.value}; setEditForm({...editForm, additionalContacts: c}); }} /></div>
                <div className="col-span-3"><Input label={i === 0 ? 'Telefon' : undefined} placeholder="0555..." value={contact.phone || ''} onChange={e => { const c = [...editForm.additionalContacts]; c[i] = {...c[i], phone: e.target.value}; setEditForm({...editForm, additionalContacts: c}); }} /></div>
                <div className="col-span-3"><Input label={i === 0 ? 'E-posta' : undefined} placeholder="email@..." value={contact.email || ''} onChange={e => { const c = [...editForm.additionalContacts]; c[i] = {...c[i], email: e.target.value}; setEditForm({...editForm, additionalContacts: c}); }} /></div>
                <div className="col-span-2"><Input label={i === 0 ? 'Rol/Ünvan' : undefined} placeholder="Müdür" value={contact.role || ''} onChange={e => { const c = [...editForm.additionalContacts]; c[i] = {...c[i], role: e.target.value}; setEditForm({...editForm, additionalContacts: c}); }} /></div>
                <div className="col-span-1"><button onClick={() => { const c = editForm.additionalContacts.filter((_: any, j: number) => j !== i); setEditForm({...editForm, additionalContacts: c}); }} className="p-2 text-red-400 hover:text-red-300"><XCircle className="w-4 h-4" /></button></div>
              </div>
            ))}
            {(editForm.additionalContacts || []).length === 0 && <p className="text-xs text-slate-500 py-2">Henüz ek iletişim kişisi eklenmemiş</p>}
          </div>

          {/* LOGO Bilgileri */}
          <div>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">LOGO ERP Bilgileri</h4>
            <div className="grid grid-cols-2 gap-4">
              <Input label="LOGO Cari ID" value={editForm.logoCariId || ''} onChange={e => setEditForm({...editForm, logoCariId: e.target.value})} />
              <Input label="LOGO Cari Kodu" value={editForm.logoCariCode || ''} onChange={e => setEditForm({...editForm, logoCariCode: e.target.value})} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
          <Button variant="secondary" onClick={() => setShowEdit(false)}>İptal</Button>
          <Button icon={<Save className="w-4 h-4" />} loading={updateCustomerMut.isPending} onClick={() => {
            const { additionalContacts, ...rest } = editForm;
            const payload: any = { ...rest };
            if (additionalContacts && additionalContacts.length > 0) {
              payload.additionalContacts = additionalContacts.filter((c: any) => c.name || c.phone || c.email);
            } else {
              payload.additionalContacts = [];
            }
            updateCustomerMut.mutate(payload, {
              onSuccess: () => setShowEdit(false),
            });
          }}>Kaydet</Button>
        </div>
      </Modal>
    </>
  );
}
