'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Bell, Menu, Moon, Sun, Search, ChevronRight } from 'lucide-react';
import { useUnreadCount } from '@/lib/api';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

function Breadcrumb() {
  const pathname = usePathname();
  const parts = pathname.split('/').filter(Boolean);
  const labels: Record<string, string> = {
    dashboard: 'Dashboard', customers: 'M\u00fc\u015fteriler', equipment: 'Ekipman',
    'work-orders': '\u0130\u015f Emirleri', inspections: 'Denetimler', reports: 'Raporlar',
    'form-templates': 'Form \u015eablonlar\u0131', logo: 'LOGO Entegrasyon', users: 'Personel',
    settings: 'Ayarlar', audit: 'Denetim \u0130zi', analytics: '\u0130statistikler',
    calibration: 'Kalibrasyon', invoicing: 'Faturalama', planning: 'Planlama',
    payments: '\u00d6demeler', 'sales-pipeline': 'Sat\u0131\u015f F\u0131rsatlar\u0131',
    proposals: 'Teklifler', 'contract-engine': 'S\u00f6zle\u015fmeler',
  };
  return (
    <nav className="flex items-center gap-1.5 text-[13px]">
      <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors duration-150">Ana Sayfa</Link>
      {parts.map((part, idx) => (
        <span key={idx} className="flex items-center gap-1.5">
          <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
          <span className={idx === parts.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'}>
            {labels[part] || part}
          </span>
        </span>
      ))}
    </nav>
  );
}

function Header({ sidebarCollapsed, onToggleSidebar }: { sidebarCollapsed: boolean; onToggleSidebar: () => void; }) {
  const { data: unreadData } = useUnreadCount();
  const unread = (unreadData as any)?.data || 0;
  const { theme, setTheme } = useTheme();

  return (
    <header className={cn(
      'fixed top-0 right-0 z-20 h-14 flex items-center gap-4 px-5',
      'backdrop-blur-xl',
      'border-b border-white/[0.04]',
      'transition-all duration-300',
      sidebarCollapsed ? 'left-16' : 'left-[260px]',
    )}>
      <button onClick={onToggleSidebar} className="p-2 rounded-lg hover:bg-[hsl(var(--accent))] text-muted-foreground hover:text-foreground transition-colors duration-150">
        <Menu className="w-4 h-4" />
      </button>
      <Breadcrumb />
      <div className="flex-1" />

      <div className="relative hidden md:block">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
        <input type="text" placeholder="H\u0131zl\u0131 ara..."
          className={cn(
            'w-48 pl-9 pr-3 py-1.5 h-8 rounded-lg text-sm',
            'border border-[hsl(var(--border))] bg-[hsl(var(--muted))]',
            'text-foreground placeholder:text-muted-foreground/35',
            'focus:outline-none focus:ring-2 focus:ring-cyan-500/15 focus:border-cyan-500/30 focus:w-64 transition-all duration-250',
          )}
        />
      </div>

      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="p-2 rounded-lg hover:bg-[hsl(var(--accent))] text-muted-foreground hover:text-foreground transition-colors duration-150">
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      <Link href="/notifications" className="relative p-2 rounded-lg hover:bg-[hsl(var(--accent))] text-muted-foreground hover:text-foreground transition-colors duration-150">
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-cyan-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </header>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  return (
    <div className="min-h-screen bg-background" style={{ background: 'var(--surface-base, hsl(var(--background)))' }}>
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((v) => !v)} />
      <Header sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed((v) => !v)} />
      <main className={cn('pt-14 min-h-screen transition-all duration-300', sidebarCollapsed ? 'pl-16' : 'pl-[260px]')}>
        <div className="p-7 animate-fade-in">{children}</div>
      </main>
    </div>
  );
}
