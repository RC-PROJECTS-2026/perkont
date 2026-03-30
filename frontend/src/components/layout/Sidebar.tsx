'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import {
  LayoutDashboard, Users, Building2, Package, ClipboardList,
  FileText, Settings, ChevronDown, ChevronRight, Activity,
  LogOut, Bell, Shield, Wrench, BarChart3, CreditCard,
  CheckSquare, AlertTriangle, FileCheck, Zap, TrendingUp,
  Smartphone, Archive, Award, MessageSquare, Calendar,
  Phone, Target, Send, FolderOpen, Search, MapPin,
  Briefcase, PenTool, Eye, UserCheck, Truck, DollarSign,
} from 'lucide-react';

interface NavItem {
  label: string; href?: string; icon: React.ReactNode; roles?: string[]; badge?: number; children?: NavItem[];
}

const navItems: NavItem[] = [
  { label: 'Ana Sayfa', href: '/dashboard', icon: <LayoutDashboard className="w-[18px] h-[18px]" /> },
  {
    label: 'Sat\u0131\u015f & CRM', icon: <TrendingUp className="w-[18px] h-[18px]" />,
    roles: ['admin', 'sales', 'customer_rep', 'executive'],
    children: [
      { label: 'M\u00fc\u015fteriler', href: '/customers', icon: <Building2 className="w-4 h-4" /> },
      { label: 'Sat\u0131\u015f F\u0131rsatlar\u0131', href: '/sales-pipeline', icon: <Target className="w-4 h-4" /> },
      { label: 'Lokasyonlar', href: '/locations', icon: <MapPin className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Teklif & S\u00f6zle\u015fme', icon: <FileCheck className="w-[18px] h-[18px]" />,
    roles: ['admin', 'sales', 'customer_rep', 'finance', 'executive'],
    children: [
      { label: 'Teklifler', href: '/proposals', icon: <FileText className="w-4 h-4" /> },
      { label: 'S\u00f6zle\u015fmeler', href: '/contract-engine', icon: <FileCheck className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Operasyon', icon: <ClipboardList className="w-[18px] h-[18px]" />,
    roles: ['admin', 'planner', 'inspector', 'technical_manager', 'executive'],
    children: [
      { label: '\u0130\u015f Emirleri', href: '/work-orders', icon: <ClipboardList className="w-4 h-4" /> },
      { label: 'Planlama', href: '/planning', icon: <Calendar className="w-4 h-4" />, roles: ['admin', 'planner'] },
      { label: 'Denetimler', href: '/inspections', icon: <CheckSquare className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Teknik S\u00fcrec', icon: <PenTool className="w-[18px] h-[18px]" />,
    roles: ['admin', 'technical_manager', 'executive'],
    children: [
      { label: 'Onay Bekleyenler', href: '/reports/review', icon: <Eye className="w-4 h-4" /> },
      { label: 'T\u00fcm Raporlar', href: '/reports', icon: <FileText className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Ekipman', icon: <Package className="w-[18px] h-[18px]" />,
    children: [
      { label: 'Ekipman Listesi', href: '/equipment', icon: <Package className="w-4 h-4" /> },
      { label: 'Kontrol Takvimi', href: '/equipment/schedule', icon: <Calendar className="w-4 h-4" /> },
      { label: 'Ekipman Tipleri', href: '/equipment/types', icon: <Wrench className="w-4 h-4" />, roles: ['admin', 'technical_manager'] },
    ],
  },
  {
    label: 'Finans', icon: <CreditCard className="w-[18px] h-[18px]" />,
    roles: ['admin', 'finance', 'executive'],
    children: [
      { label: 'Faturalama', href: '/invoicing', icon: <CreditCard className="w-4 h-4" /> },
      { label: '\u00d6demeler', href: '/payments', icon: <DollarSign className="w-4 h-4" /> },
      { label: 'LOGO Entegrasyon', href: '/logo', icon: <Zap className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Kalite', icon: <Shield className="w-[18px] h-[18px]" />,
    roles: ['admin', 'technical_manager', 'executive'],
    children: [
      { label: '\u015eik\u00e2yet / \u0130tiraz', href: '/accreditation/complaints', icon: <MessageSquare className="w-4 h-4" /> },
      { label: 'CAPA', href: '/accreditation/capa', icon: <AlertTriangle className="w-4 h-4" /> },
      { label: '\u0130\u00e7 Tetkik', href: '/accreditation/internal-audit', icon: <Shield className="w-4 h-4" /> },
      { label: 'Risk / YGG', href: '/accreditation/ygg', icon: <AlertTriangle className="w-4 h-4" /> },
      { label: 'Kalibrasyon', href: '/calibration', icon: <Wrench className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Personel', icon: <Users className="w-[18px] h-[18px]" />,
    roles: ['admin', 'executive', 'technical_manager'],
    children: [
      { label: 'Personel Listesi', href: '/users', icon: <Users className="w-4 h-4" /> },
      { label: 'Sertifika Takip', href: '/users/certificates', icon: <Award className="w-4 h-4" /> },
    ],
  },
  {
    label: 'M\u00fc\u015fteri Portal\u0131', icon: <Building2 className="w-[18px] h-[18px]" />,
    roles: ['customer', 'customer_rep'],
    children: [
      { label: 'Portal', href: '/portal', icon: <LayoutDashboard className="w-4 h-4" /> },
      { label: 'Ekipmanlar\u0131m', href: '/portal/equipment', icon: <Package className="w-4 h-4" /> },
      { label: 'Raporlar\u0131m', href: '/portal/reports', icon: <FileText className="w-4 h-4" /> },
      { label: 'S\u00f6zle\u015fmelerim', href: '/portal/contracts', icon: <FileCheck className="w-4 h-4" /> },
      { label: 'Yakla\u015fan Kontroller', href: '/portal/upcoming', icon: <Calendar className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Y\u00f6netim', icon: <BarChart3 className="w-[18px] h-[18px]" />,
    roles: ['admin', 'executive'],
    children: [
      { label: '\u0130statistikler', href: '/analytics', icon: <BarChart3 className="w-4 h-4" /> },
      { label: 'BI Raporlama', href: '/reports/analytics', icon: <BarChart3 className="w-4 h-4" /> },
      { label: 'Denetim \u0130zi', href: '/audit', icon: <Activity className="w-4 h-4" /> },
      { label: 'Form \u015eablonlar\u0131', href: '/form-templates', icon: <Zap className="w-4 h-4" /> },
    ],
  },
  {
    label: 'Sistem', icon: <Settings className="w-[18px] h-[18px]" />,
    roles: ['admin'],
    children: [
      { label: 'Ayarlar', href: '/settings', icon: <Settings className="w-4 h-4" /> },
      { label: 'Bildirimler', href: '/notifications', icon: <Bell className="w-4 h-4" /> },
      { label: 'Cihaz Y\u00f6netimi', href: '/device-management', icon: <Smartphone className="w-4 h-4" /> },
      { label: 'Ta\u015feronlar', href: '/subcontractors', icon: <Truck className="w-4 h-4" /> },
      { label: 'SLA Takip', href: '/sla', icon: <Activity className="w-4 h-4" /> },
      { label: 'Referans Dok\u00fcman', href: '/reference-docs', icon: <FolderOpen className="w-4 h-4" /> },
      { label: 'Depolama', href: '/storage-quota', icon: <Archive className="w-4 h-4" /> },
    ],
  },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const userRoles = user?.roles ? String(user.roles).split(',').map(r => r.trim()) : [user?.role || 'admin'];
  const defaultOpen = userRoles.includes('sales') || userRoles.includes('customer_rep')
    ? ['Sat\u0131\u015f & CRM', 'Teklif & S\u00f6zle\u015fme']
    : userRoles.includes('planner') ? ['Operasyon']
    : userRoles.includes('inspector') ? ['Operasyon']
    : userRoles.includes('technical_manager') ? ['Teknik S\u00fcrec', 'Operasyon']
    : userRoles.includes('finance') ? ['Finans', 'Teklif & S\u00f6zle\u015fme']
    : ['Sat\u0131\u015f & CRM', 'Operasyon'];

  const [openGroups, setOpenGroups] = useState<string[]>(defaultOpen);
  const toggleGroup = (label: string) => setOpenGroups((prev) => prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]);
  const canSee = (item: NavItem) => !item.roles || userRoles.some(r => item.roles!.includes(r));
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className={cn(
      'fixed left-0 top-0 bottom-0 z-30 flex flex-col',
      'bg-navy-900 border-r border-white/[0.06]',
      'transition-all duration-300',
      collapsed ? 'w-16' : 'w-[260px]',
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-14 border-b border-white/[0.06] flex-shrink-0">
        <div className="w-8 h-8 rounded-[10px] bg-cyan-500 flex items-center justify-center flex-shrink-0 shadow-glow">
          <Zap className="w-4 h-4 text-white" />
        </div>
        {!collapsed && <span className="font-display font-bold text-white/90 text-lg tracking-tight">PerKont</span>}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navItems.filter(canSee).map((item) => {
          if (item.children) {
            const visibleChildren = item.children.filter(canSee);
            if (visibleChildren.length === 0) return null;
            const isOpen = openGroups.includes(item.label);
            const hasActiveChild = visibleChildren.some((c) => c.href && isActive(c.href));

            return (
              <div key={item.label} className="mt-1.5">
                <button
                  onClick={() => toggleGroup(item.label)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] transition-all duration-150',
                    hasActiveChild ? 'text-white/90' : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]',
                  )}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left font-medium">{item.label}</span>
                      <ChevronDown className={cn('w-3.5 h-3.5 opacity-30 transition-transform duration-200', !isOpen && '-rotate-90')} />
                    </>
                  )}
                </button>
                {isOpen && !collapsed && (
                  <div className="mt-1 ml-5 pl-3.5 border-l border-white/[0.05] space-y-px">
                    {visibleChildren.map((child) => {
                      const active = child.href && isActive(child.href);
                      return (
                        <Link key={child.href} href={child.href!}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13px] transition-all duration-150 relative',
                            active
                              ? 'text-cyan-400 font-medium bg-cyan-500/[0.08]'
                              : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]',
                          )}
                        >
                          {active && <div className="absolute left-[-15.5px] top-1/2 -translate-y-1/2 w-[3px] h-4 bg-cyan-400 rounded-full" />}
                          <span className={active ? 'opacity-80' : 'opacity-40'}>{child.icon}</span>
                          <span>{child.label}</span>
                          {child.badge !== undefined && (
                            <span className="ml-auto text-[10px] bg-cyan-500/15 text-cyan-400 px-1.5 py-0.5 rounded-md font-semibold">{child.badge}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active = isActive(item.href!);
          return (
            <Link key={item.href} href={item.href!}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] transition-all duration-150',
                active
                  ? 'text-cyan-400 font-medium bg-cyan-500/[0.08]'
                  : 'text-white/35 hover:text-white/60 hover:bg-white/[0.03]',
              )}
            >
              <span className={active ? 'opacity-80' : 'opacity-50'}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-cyan-400 text-xs font-bold">{user?.fullName?.charAt(0).toUpperCase()}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/70 truncate">{user?.fullName}</p>
              <p className="text-[11px] text-white/25 truncate">{userRoles.join(', ')}</p>
            </div>
          )}
          {!collapsed && (
            <button onClick={logout} className="p-1.5 rounded-lg hover:bg-white/[0.05] text-white/25 hover:text-white/50 transition-colors duration-150">
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
