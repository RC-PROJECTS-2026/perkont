'use client';
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/lib/api';
import {
  PageHeader, Card, Badge, Button, SearchInput,
  EmptyState, Modal, Input, Tabs,
} from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { Users, Plus, RefreshCw, Eye, Edit2, Upload, BookOpen, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRouter } from 'next/navigation';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  sales: 'Satış',
  planner: 'Planlamacı',
  inspector: 'Muayene Elemanı',
  technical_manager: 'Teknik Yönetici',
  finance: 'Finans',
  customer_rep: 'Müşteri Temsilcisi',
  executive: 'Üst Yönetim',
  customer: 'Müşteri',
};

const ALL_ROLES = [
  { value: 'inspector', label: 'Muayene Elemanı' },
  { value: 'technical_manager', label: 'Teknik Yönetici' },
  { value: 'planner', label: 'Planlamacı' },
  { value: 'sales', label: 'Satış' },
  { value: 'finance', label: 'Finans' },
  { value: 'customer_rep', label: 'Müşteri Temsilcisi' },
  { value: 'executive', label: 'Üst Yönetim' },
  { value: 'admin', label: 'Admin' },
];

export default function UsersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [qualModal, setQualModal] = useState<any>(null);
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState<any[]>([]);

  // Form states
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', roles: ['inspector'], ekipnetNumber: '', password: '' });
  const [editForm, setEditForm] = useState({ fullName: '', email: '', phone: '', roles: [] as string[], ekipnetNumber: '' });
  const [qualForm, setQualForm] = useState({ certificateName: '', certificateNo: '', issuer: '', issueDate: '', expiryDate: '' });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['users', search],
    queryFn: () => usersApi.list({ search, limit: 100 }),
  });
  const rawUsers = (data as any)?.data?.data || (data as any)?.data || [];
  const users = Array.isArray(rawUsers) ? rawUsers : [];

  const filtered = users.filter((u: any) => {
    if (tab === 'all') return true;
    const userRoles = u.roles ? String(u.roles).split(',') : [u.role];
    return userRoles.includes(tab);
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (d: any) => usersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setShowCreate(false); toast.success('Personel oluşturuldu'); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => usersApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditUser(null); toast.success('Personel güncellendi'); },
    onError: (e: any) => toast.error(e.message),
  });

  const qualMutation = useMutation({
    mutationFn: ({ id, data }: any) => usersApi.addQualification(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setQualModal(null); toast.success('Sertifika eklendi'); },
    onError: (e: any) => toast.error(e.message),
  });

  // Role toggle
  const toggleRole = (roleList: string[], role: string) => {
    return roleList.includes(role) ? roleList.filter(r => r !== role) : [...roleList, role];
  };

  // Open edit modal
  const openEdit = (user: any) => {
    const userRoles = user.roles ? String(user.roles).split(',').map((r: string) => r.trim()) : [user.role || 'inspector'];
    setEditForm({
      fullName: user.fullName || '',
      email: user.email || '',
      phone: user.phone || '',
      roles: userRoles,
      ekipnetNumber: user.ekipnetNumber || '',
    });
    setEditUser(user);
  };

  // Excel import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const XLSX = (await import('xlsx')).default || await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (rows.length < 2) { toast.error('Dosyada veri bulunamadı'); return; }

      const parsed = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[0]) continue;
        const fullName = String(row[0]).trim();
        const phone = String(row[3] || row[2] || '').replace(/\s/g, '');
        const ekipnet = row[6] && row[6] !== '-' ? String(row[6]).trim() : '';
        const titles = [String(row[12]||''), String(row[13]||'-'), String(row[14]||'-'), String(row[15]||'-')];

        const roles: string[] = [];
        if (titles.some(t => t.includes('MUAYENE'))) roles.push('inspector');
        if (titles.some(t => t.includes('TEKNİK YÖNETİCİ'))) roles.push('technical_manager');
        if (titles[0].includes('MÜDÜR') && !titles[0].includes('YARDIMCI')) roles.push('executive');
        if (titles[0].includes('MÜDÜR YARDIMCISI')) roles.push('technical_manager');
        if (titles.some(t => t.includes('SATIŞ') || t.includes('PLANLAMA'))) roles.push('planner');
        if (roles.length === 0) roles.push('inspector');

        const nameParts = fullName.toLowerCase()
          .replace(/[çÇ]/g,'c').replace(/[ğĞ]/g,'g').replace(/[ıİ]/g,'i')
          .replace(/[öÖ]/g,'o').replace(/[şŞ]/g,'s').replace(/[üÜ]/g,'u')
          .split(/\s+/).filter(p => p);
        const email = nameParts.length >= 2
          ? `${nameParts[0]}.${nameParts[nameParts.length-1]}@perkont.com`
          : `${nameParts[0]}@perkont.com`;

        parsed.push({ fullName, email, phone, ekipnetNumber: ekipnet, roles: [...new Set(roles)], password: 'Perkont2026!' });
      }

      setImportData(parsed);
      setShowImport(true);
    } catch (err) {
      toast.error('Excel dosyası okunamadı');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeImport = async () => {
    let ok = 0, fail = 0;
    for (const person of importData) {
      try {
        await usersApi.create({ ...person, roles: person.roles.join(',') });
        ok++;
      } catch { fail++; }
    }
    toast.success(`${ok} personel oluşturuldu${fail > 0 ? `, ${fail} başarısız` : ''}`);
    setShowImport(false);
    setImportData([]);
    qc.invalidateQueries({ queryKey: ['users'] });
  };

  const tabs = [
    { key: 'all', label: 'Tümü' },
    { key: 'inspector', label: 'Muayene Elemanı' },
    { key: 'technical_manager', label: 'Teknik Yönetici' },
    { key: 'planner', label: 'Planlamacı' },
    { key: 'sales', label: 'Satış' },
    { key: 'finance', label: 'Finans' },
  ];

  return (
    <>
      <PageHeader
        title="Personel Yönetimi"
        subtitle={`${users.length} personel`}
        actions={
          <>
            <Button variant="outline" icon={<RefreshCw className="w-4 h-4" />} onClick={() => refetch()}>Yenile</Button>
            <Button variant="outline" icon={<Upload className="w-4 h-4" />} onClick={() => fileInputRef.current?.click()}>
              Excel Yükle
            </Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => { setForm({ fullName: '', email: '', phone: '', roles: ['inspector'], ekipnetNumber: '', password: '' }); setShowCreate(true); }}>
              Personel Ekle
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} />
          </>
        }
      />

      <div className="mb-4 flex items-center gap-4">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="ml-auto">
          <SearchInput value={search} onChange={setSearch} placeholder="Ad veya e-posta ara..." className="w-56" />
        </div>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="animate-pulse p-6 space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-slate-800/50 rounded" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Users className="w-12 h-12" />} title="Personel bulunamadı" />
        ) : (
          <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Personel</th>
                <th>Alan</th>
                <th>EKİPNET No</th>
                <th>Mezuniyet</th>
                <th>Roller</th>
                <th>Telefon</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u: any) => {
                const userRoles = u.roles ? String(u.roles).split(',').map((r: string) => r.trim()) : [u.role || 'inspector'];
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className="w-9 h-9 rounded-full bg-teal-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm font-bold">{u.fullName?.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{u.fullName}</p>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge color={
                        u.specialization === 'MEKANİK' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                        u.specialization === 'ELEKTRİK' || u.specialization === 'ELEKTRİK ' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                        u.specialization === 'OFİS' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                        'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                      }>{u.specialization?.trim() || '—'}</Badge>
                    </td>
                    <td><span className="font-mono text-xs text-teal-400">{u.ekipnetNumber || '—'}</span></td>
                    <td><span className="text-xs text-slate-300">{u.graduationField || '—'}</span></td>
                    <td>
                      <div className="flex flex-wrap gap-1 min-w-[120px]">
                        {userRoles.map((r: string) => (
                          <Badge key={r} color={
                            r === 'technical_manager' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                            r === 'inspector' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' :
                            r === 'executive' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                            r === 'planner' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                            r === 'sales' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                            'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                          }>
                            {ROLE_LABELS[r] || r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td><span className="text-xs text-slate-400 whitespace-nowrap">{u.phone || u.personalPhone || '—'}</span></td>
                    <td>
                      <Badge color={u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} dot>
                        {u.isActive ? 'Aktif' : 'Pasif'}
                      </Badge>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => router.push(`/users/${u.id}`)} className="p-1.5 rounded-lg hover:bg-teal-900/30 text-slate-400 hover:text-teal-400" title="Detay">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg hover:bg-blue-900/30 text-slate-400 hover:text-blue-400" title="Düzenle">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {userRoles.includes('inspector') && (
                          <button onClick={() => { setQualForm({ certificateName: '', certificateNo: '', issuer: '', issueDate: '', expiryDate: '' }); setQualModal(u); }} className="p-1.5 rounded-lg hover:bg-purple-900/30 text-slate-400 hover:text-purple-400" title="Sertifika Ekle">
                            <BookOpen className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </Card>

      {/* ── Create User Modal ── */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Yeni Personel Ekle" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Input label="Ad Soyad" value={form.fullName} onChange={e => setForm({...form, fullName: e.target.value})} /></div>
            <Input label="E-posta" type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
            <Input label="Telefon" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
            <Input label="EKİPNET No" value={form.ekipnetNumber} onChange={e => setForm({...form, ekipnetNumber: e.target.value})} />
            <Input label="Şifre" type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">Roller (birden fazla seçilebilir)</p>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(r => (
                <button key={r.value} onClick={() => setForm({...form, roles: toggleRole(form.roles, r.value)})}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    form.roles.includes(r.value)
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-transparent text-slate-400 border-slate-600 hover:border-teal-500'
                  }`}
                >{r.label}</button>
              ))}
            </div>
          </div>
          <Button className="w-full" loading={createMutation.isPending}
            onClick={() => createMutation.mutate({ ...form, roles: form.roles.join(','), role: form.roles[0] })}>
            Oluştur
          </Button>
        </div>
      </Modal>

      {/* ── Edit User Modal ── */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Düzenle — ${editUser?.fullName}`} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Input label="Ad Soyad" value={editForm.fullName} onChange={e => setEditForm({...editForm, fullName: e.target.value})} /></div>
            <Input label="E-posta" type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
            <Input label="Telefon" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
            <Input label="EKİPNET No" value={editForm.ekipnetNumber} onChange={e => setEditForm({...editForm, ekipnetNumber: e.target.value})} />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300 mb-2">Roller (birden fazla seçilebilir)</p>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.map(r => (
                <button key={r.value} onClick={() => setEditForm({...editForm, roles: toggleRole(editForm.roles, r.value)})}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    editForm.roles.includes(r.value)
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-transparent text-slate-400 border-slate-600 hover:border-teal-500'
                  }`}
                >{r.label}</button>
              ))}
            </div>
          </div>
          <Button className="w-full" loading={updateMutation.isPending}
            onClick={() => updateMutation.mutate({ id: editUser.id, data: { ...editForm, roles: editForm.roles.join(',') } })}>
            Kaydet
          </Button>
        </div>
      </Modal>

      {/* ── Add Qualification Modal ── */}
      <Modal open={!!qualModal} onClose={() => setQualModal(null)} title={`Sertifika Ekle — ${qualModal?.fullName}`} size="md">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Input label="Sertifika Adı" value={qualForm.certificateName} onChange={e => setQualForm({...qualForm, certificateName: e.target.value})} /></div>
          <Input label="Sertifika No" value={qualForm.certificateNo} onChange={e => setQualForm({...qualForm, certificateNo: e.target.value})} />
          <Input label="Veren Kurum" value={qualForm.issuer} onChange={e => setQualForm({...qualForm, issuer: e.target.value})} />
          <Input label="Veriliş Tarihi" type="date" value={qualForm.issueDate} onChange={e => setQualForm({...qualForm, issueDate: e.target.value})} />
          <Input label="Geçerlilik Tarihi" type="date" value={qualForm.expiryDate} onChange={e => setQualForm({...qualForm, expiryDate: e.target.value})} />
        </div>
        <Button className="w-full mt-4" loading={qualMutation.isPending}
          onClick={() => qualMutation.mutate({ id: qualModal.id, data: qualForm })}>
          Ekle
        </Button>
      </Modal>

      {/* ── Excel Import Preview Modal ── */}
      <Modal open={showImport} onClose={() => { setShowImport(false); setImportData([]); }} title={`Excel İçe Aktarma — ${importData.length} personel`} size="lg">
        <div className="max-h-96 overflow-auto">
          <table className="data-table">
            <thead>
              <tr><th>Ad Soyad</th><th>E-posta</th><th>Roller</th><th>EKİPNET</th></tr>
            </thead>
            <tbody>
              {importData.map((p, i) => (
                <tr key={i}>
                  <td className="text-sm font-semibold">{p.fullName}</td>
                  <td className="text-xs text-slate-400">{p.email}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {p.roles.map((r: string) => (
                        <Badge key={r} color="bg-teal-900/30 text-teal-300">{ROLE_LABELS[r] || r}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="font-mono text-xs">{p.ekipnetNumber || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-between items-center mt-4">
          <p className="text-xs text-slate-500">Tüm kullanıcıların varsayılan şifresi: Perkont2026!</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowImport(false); setImportData([]); }}>İptal</Button>
            <Button onClick={executeImport}>{importData.length} Personel İçe Aktar</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
