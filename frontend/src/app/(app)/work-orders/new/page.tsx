'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  customersApi, equipmentApi, usersApi,
  formTemplatesApi, workOrdersApi, useMutationWithToast,
} from '@/lib/api';
import {
  PageHeader, Card, CardHeader, CardTitle, Button,
  Input, Select, Textarea, Badge, SearchInput,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import {
  ArrowLeft, ArrowRight, Building2, MapPin, Package,
  User, CheckCircle2, Save, Search, Check, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── useDebounce hook ──────────────────────────────────────────────────────────
function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: 'Musteri Sec',
  2: 'Lokasyon Sec',
  3: 'Ekipman Sec',
  4: 'Muayene Elemani',
  5: 'Ozet & Olustur',
};

export default function NewWorkOrderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultEquipmentId = searchParams.get('equipmentId');
  const defaultCustomerId = searchParams.get('customerId');

  // ── Wizard state ──────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(defaultCustomerId ? 2 : 1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(defaultCustomerId || '');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>(
    defaultEquipmentId ? [defaultEquipmentId] : [],
  );
  const [selectedInspectorId, setSelectedInspectorId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [plannedTime, setPlannedTime] = useState('');
  const [priority, setPriority] = useState<'normal' | 'urgent' | 'critical'>('normal');
  const [notes, setNotes] = useState('');

  // ── Equipment search & filter state (Step 3) ───────────────────────────
  const [eqSearch, setEqSearch] = useState('');
  const [eqTypeFilter, setEqTypeFilter] = useState('');
  const debouncedEqSearch = useDebounce(eqSearch, 300);

  // ── Queries ───────────────────────────────────────────────────────────
  const { data: customersData } = useQuery({
    queryKey: ['customers-select', customerSearch],
    queryFn: () => customersApi.list({ search: customerSearch || undefined, limit: 50 }),
  });
  const { data: locationsData } = useQuery({
    queryKey: ['locations', selectedCustomerId],
    queryFn: () => customersApi.getLocations(selectedCustomerId),
    enabled: !!selectedCustomerId,
  });
  const { data: equipmentData } = useQuery({
    queryKey: ['equipment-select', selectedCustomerId, debouncedEqSearch, eqTypeFilter],
    queryFn: () => equipmentApi.list({
      customerId: selectedCustomerId,
      search: debouncedEqSearch || undefined,
      equipmentTypeId: eqTypeFilter || undefined,
      limit: 50,
    }),
    enabled: !!selectedCustomerId,
  });
  const { data: eqTypesData } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentApi.listTypes(),
  });
  const { data: inspectorsData } = useQuery({
    queryKey: ['users-inspectors'],
    queryFn: () => usersApi.list({ role: 'inspector', limit: 100 }),
  });
  const { data: customerDetail } = useQuery({
    queryKey: ['customer-detail-wizard', selectedCustomerId],
    queryFn: () => customersApi.get(selectedCustomerId),
    enabled: !!selectedCustomerId,
  });

  // ── Also fetch selected equipment that may not be in current search results ──
  const { data: selectedEqData } = useQuery({
    queryKey: ['equipment-selected', selectedEquipmentIds],
    queryFn: () => equipmentApi.list({
      ids: selectedEquipmentIds.join(','),
      limit: 200,
    }),
    enabled: selectedEquipmentIds.length > 0,
  });

  const customers = (customersData as any)?.data?.data || [];
  const locations = (locationsData as any)?.data || [];
  const equipmentList = (equipmentData as any)?.data?.data || [];
  const eqTypes = (eqTypesData as any)?.data?.data || (eqTypesData as any)?.data || [];
  const inspectors = (inspectorsData as any)?.data?.data || [];
  const customer = (customerDetail as any)?.data;

  // Build selected equipment list from either the selected query or the main equipment list
  const selectedEqList = (selectedEqData as any)?.data?.data || [];
  const allKnownEquipment = [...equipmentList];
  // Add any selected equipment not already in the visible list
  selectedEqList.forEach((eq: any) => {
    if (!allKnownEquipment.find((e: any) => e.id === eq.id)) {
      allKnownEquipment.push(eq);
    }
  });

  const selectedLocation = locations.find((l: any) => l.id === selectedLocationId);
  const selectedInspector = inspectors.find((u: any) => u.id === selectedInspectorId);
  const selectedEquipment = allKnownEquipment.filter((eq: any) =>
    selectedEquipmentIds.includes(eq.id),
  );

  // ── Mutation ──────────────────────────────────────────────────────────
  const createMutation = useMutationWithToast(
    (data: any) => workOrdersApi.create(data),
    {
      successMessage: 'Is emri olusturuldu',
      invalidateKeys: [['work-orders']],
      onSuccess: (res: any) => router.push(`/work-orders/${res?.data?.id}`),
    },
  );

  const [noContractWarningShown, setNoContractWarningShown] = useState(false);

  const handleCreate = () => {
    const payload: any = {
      customerId: selectedCustomerId,
      locationId: selectedLocationId || undefined,
      plannedDate: plannedDate || undefined,
      plannedTime: plannedTime || undefined,
      priority,
      notes: notes || undefined,
      assignedInspectorId: selectedInspectorId || undefined,
      equipmentItems: selectedEquipmentIds.map((eqId) => ({
        equipmentId: eqId,
      })),
    };

    // Sozlesme yoksa uyari goster
    if (!payload.contractId && !noContractWarningShown) {
      toast('Bu is emri sozlesmesiz baslatilacak. Devam etmek icin tekrar tiklayin.', { icon: '\u26A0\uFE0F', duration: 5000 });
      setNoContractWarningShown(true);
      return;
    }

    createMutation.mutate(payload);
  };

  const toggleEquipment = (eqId: string) => {
    setSelectedEquipmentIds((prev) =>
      prev.includes(eqId) ? prev.filter((id) => id !== eqId) : [...prev, eqId],
    );
  };

  const removeEquipment = (eqId: string) => {
    setSelectedEquipmentIds((prev) => prev.filter((id) => id !== eqId));
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 1: return !!selectedCustomerId;
      case 2: return true; // location is optional
      case 3: return selectedEquipmentIds.length > 0;
      case 4: return true; // inspector is optional
      case 5: return true;
      default: return false;
    }
  };

  return (
    <>
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Is Emirleri
        </button>

        <PageHeader
          title="Yeni Is Emri"
          subtitle="Adim adim is emri olusturun"
        />

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {([1, 2, 3, 4, 5] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 transition-colors ${
                  s === step
                    ? 'bg-teal-600 text-white'
                    : s < step
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                }`}
              >
                {s < step ? <Check className="w-4 h-4" /> : s}
              </div>
              <span
                className={`text-xs hidden md:inline ${
                  s === step
                    ? 'text-teal-600 font-semibold'
                    : 'text-slate-400'
                }`}
              >
                {STEP_LABELS[s]}
              </span>
              {s < 5 && <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />}
            </div>
          ))}
        </div>

        {/* Step 1: Customer Selection */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" /> Musteri Secimi
              </CardTitle>
            </CardHeader>
            <div className="mb-4">
              <SearchInput
                placeholder="Musteri ara..."
                value={customerSearch}
                onChange={(e: any) => setCustomerSearch(e.target.value)}
              />
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {customers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Musteri bulunamadi</p>
              ) : (
                customers.map((c: any) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                      selectedCustomerId === c.id
                        ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                    }`}
                    onClick={() => {
                      setSelectedCustomerId(c.id);
                      setSelectedLocationId('');
                      setSelectedEquipmentIds([]);
                      setEqSearch('');
                      setEqTypeFilter('');
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950/40 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-teal-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                        {c.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {c.code} {c.city && `- ${c.city}`}
                      </p>
                    </div>
                    {selectedCustomerId === c.id && (
                      <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>
          </Card>
        )}

        {/* Step 2: Location Selection */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" /> Lokasyon Secimi
              </CardTitle>
            </CardHeader>
            <p className="text-sm text-slate-400 mb-4">Lokasyon secimi opsiyoneldir.</p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* No location option */}
              <div
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                  !selectedLocationId
                    ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                }`}
                onClick={() => setSelectedLocationId('')}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm text-slate-500">Lokasyon belirtme</p>
                {!selectedLocationId && (
                  <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0 ml-auto" />
                )}
              </div>

              {locations.map((loc: any) => (
                <div
                  key={loc.id}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                    selectedLocationId === loc.id
                      ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                  }`}
                  onClick={() => setSelectedLocationId(loc.id)}
                >
                  <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                      {loc.name}
                    </p>
                    {loc.city && (
                      <p className="text-xs text-slate-400">
                        {loc.city}
                        {loc.district && `, ${loc.district}`}
                      </p>
                    )}
                  </div>
                  {selectedLocationId === loc.id && (
                    <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
                  )}
                </div>
              ))}

              {locations.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">
                  Bu musteriye ait lokasyon bulunamadi
                </p>
              )}
            </div>
          </Card>
        )}

        {/* Step 3: Equipment Multi-select with Server-side Search */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5" /> Ekipman Secimi
              </CardTitle>
            </CardHeader>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Envanter kodu, marka veya model ile ara..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-600 bg-slate-900 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  value={eqSearch}
                  onChange={(e) => setEqSearch(e.target.value)}
                />
              </div>
              <select
                className="rounded-lg border border-slate-600 bg-slate-900 text-sm text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 min-w-[180px]"
                value={eqTypeFilter}
                onChange={(e) => setEqTypeFilter(e.target.value)}
              >
                <option value="">Tum Ekipman Turleri</option>
                {eqTypes.map((t: any) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {/* Selected count & chips */}
            <div className="mb-4">
              <p className="text-sm text-slate-400 mb-2">
                <span className="font-semibold text-teal-400">{selectedEquipmentIds.length} ekipman secildi</span>
              </p>
              {selectedEquipment.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedEquipment.map((eq: any) => (
                    <span
                      key={eq.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-900/40 border border-teal-700/50 text-xs text-teal-300"
                    >
                      <span className="font-mono font-semibold">{eq.inventoryCode}</span>
                      <span className="text-teal-400/60">
                        {eq.brand && `${eq.brand}`}{eq.model && ` ${eq.model}`}
                      </span>
                      <button
                        onClick={() => removeEquipment(eq.id)}
                        className="ml-0.5 p-0.5 rounded hover:bg-teal-700/40 text-teal-400 hover:text-teal-200 transition-colors"
                        title="Kaldir"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Equipment List - compact card format */}
            <div className="space-y-1.5 max-h-[28rem] overflow-y-auto">
              {equipmentList.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">
                    {eqSearch || eqTypeFilter
                      ? 'Aramanizla eslesen ekipman bulunamadi'
                      : 'Bu musteriye ait ekipman bulunamadi'}
                  </p>
                  {(eqSearch || eqTypeFilter) && (
                    <button
                      onClick={() => { setEqSearch(''); setEqTypeFilter(''); }}
                      className="text-xs text-teal-500 hover:text-teal-400 mt-2"
                    >
                      Filtreleri temizle
                    </button>
                  )}
                </div>
              ) : (
                equipmentList.map((eq: any) => {
                  const isSelected = selectedEquipmentIds.includes(eq.id);
                  const isOverdue = eq.nextControlDate && new Date(eq.nextControlDate) < new Date();
                  return (
                    <div
                      key={eq.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                        isSelected
                          ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                      }`}
                      onClick={() => toggleEquipment(eq.id)}
                    >
                      {/* Checkbox */}
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-teal-600 border-teal-600'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>

                      {/* Inventory code */}
                      <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 w-20 flex-shrink-0">
                        {eq.inventoryCode}
                      </span>

                      {/* Separator */}
                      <span className="text-slate-600 dark:text-slate-500 flex-shrink-0">|</span>

                      {/* Brand & Model */}
                      <span className="text-xs text-slate-600 dark:text-slate-300 min-w-0 truncate flex-shrink-0 max-w-[160px]">
                        {eq.brand ? `${eq.brand}${eq.model ? ` ${eq.model}` : ''}` : eq.equipmentType?.name || '\u2014'}
                      </span>

                      {/* Separator */}
                      <span className="text-slate-600 dark:text-slate-500 flex-shrink-0">|</span>

                      {/* Capacity */}
                      <span className="text-xs text-slate-400 flex-shrink-0 w-16 text-center">
                        {eq.capacity || '\u2014'}
                      </span>

                      {/* Separator */}
                      <span className="text-slate-600 dark:text-slate-500 flex-shrink-0">|</span>

                      {/* Location */}
                      <span className="text-xs text-slate-400 truncate flex-1 min-w-0">
                        {eq.location?.name || '\u2014'}
                      </span>

                      {/* Separator */}
                      <span className="text-slate-600 dark:text-slate-500 flex-shrink-0">|</span>

                      {/* Next control date */}
                      <span
                        className={`text-xs flex-shrink-0 w-24 text-right ${
                          isOverdue
                            ? 'text-red-500 font-semibold'
                            : 'text-slate-400'
                        }`}
                      >
                        {eq.nextControlDate ? `Kontrol: ${formatDate(eq.nextControlDate)}` : '\u2014'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Result count info */}
            {equipmentList.length > 0 && (
              <p className="text-xs text-slate-500 mt-3 text-center">
                {equipmentList.length} ekipman gosteriliyor (maks. 50)
                {(eqSearch || eqTypeFilter) && ' \u2014 filtrelenmis sonuclar'}
              </p>
            )}
          </Card>
        )}

        {/* Step 4: Inspector Assignment */}
        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" /> Muayene Elemani Atama
              </CardTitle>
            </CardHeader>
            <p className="text-sm text-slate-400 mb-4">
              Muayene elemani atamasi opsiyoneldir, sonra da atanabilir.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <Input
                label="Planlanan Tarih"
                type="date"
                value={plannedDate}
                onChange={(e: any) => setPlannedDate(e.target.value)}
              />
              <Input
                label="Planlanan Saat"
                type="time"
                value={plannedTime}
                onChange={(e: any) => setPlannedTime(e.target.value)}
              />
              <Select
                label="Oncelik"
                options={[
                  { value: 'normal', label: 'Normal' },
                  { value: 'urgent', label: 'Acil' },
                  { value: 'critical', label: 'Kritik' },
                ]}
                value={priority}
                onChange={(e: any) => setPriority(e.target.value)}
              />
            </div>

            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Muayene Elemani
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
              {/* No inspector option */}
              <div
                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                  !selectedInspectorId
                    ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                }`}
                onClick={() => setSelectedInspectorId('')}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-slate-400" />
                </div>
                <p className="text-sm text-slate-500">Sonra ata</p>
                {!selectedInspectorId && (
                  <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0 ml-auto" />
                )}
              </div>

              {inspectors.map((u: any) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                    selectedInspectorId === u.id
                      ? 'bg-teal-50 dark:bg-teal-950/30 border-teal-300 dark:border-teal-700'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-transparent'
                  }`}
                  onClick={() => setSelectedInspectorId(u.id)}
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0 text-white font-semibold">
                    {u.fullName?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                      {u.fullName}
                    </p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </div>
                  {selectedInspectorId === u.id && (
                    <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>

            <Textarea
              label="Notlar (opsiyonel)"
              value={notes}
              onChange={(e: any) => setNotes(e.target.value)}
              placeholder="Is emrine ait ek notlar..."
              rows={3}
            />
          </Card>
        )}

        {/* Step 5: Review & Create */}
        {step === 5 && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Ozet</CardTitle></CardHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Musteri</p>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {customer?.name || selectedCustomerId.slice(0, 8) + '...'}
                    </p>
                    {customer?.code && (
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{customer.code}</p>
                    )}
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Lokasyon</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      {selectedLocation?.name || 'Belirtilmedi'}
                    </p>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Planlama</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      {plannedDate ? formatDate(plannedDate) : 'Tarih belirtilmedi'}
                      {plannedTime && ` - ${plannedTime}`}
                    </p>
                    <Badge
                      color={
                        priority === 'critical'
                          ? 'bg-red-100 text-red-700'
                          : priority === 'urgent'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }
                      className="mt-1"
                    >
                      {priority === 'critical'
                        ? 'Kritik'
                        : priority === 'urgent'
                        ? 'Acil'
                        : 'Normal'}
                    </Badge>
                  </div>

                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Muayene Elemani</p>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      {selectedInspector?.fullName || 'Henuz atanmadi'}
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Ekipmanlar ({selectedEquipment.length})
                  </p>
                  <div className="space-y-1">
                    {selectedEquipment.map((eq: any) => (
                      <div key={eq.id} className="flex items-center gap-2 text-sm">
                        <Package className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono text-xs">{eq.inventoryCode}</span>
                        <span className="text-slate-400">
                          {eq.brand && `${eq.brand} ${eq.model || ''}`}
                          {eq.equipmentType?.name && ` - ${eq.equipmentType.name}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {notes && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Notlar</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{notes}</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="secondary"
            onClick={() => {
              if (step === 1) router.back();
              else setStep((step - 1) as Step);
            }}
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            {step === 1 ? 'Iptal' : 'Geri'}
          </Button>

          {step < 5 ? (
            <Button
              onClick={() => setStep((step + 1) as Step)}
              disabled={!canProceed()}
              icon={<ArrowRight className="w-4 h-4" />}
            >
              Devam
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              loading={createMutation.isPending}
              icon={<Save className="w-4 h-4" />}
            >
              Is Emri Olustur
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
