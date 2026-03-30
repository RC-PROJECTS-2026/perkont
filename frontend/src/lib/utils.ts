import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow, isAfter, isBefore, addDays } from 'date-fns';
import { tr } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined, fmt = 'dd.MM.yyyy') {
  if (!date) return '-';
  return format(new Date(date), fmt, { locale: tr });
}

export function formatDateTime(date: string | Date | null | undefined) {
  if (!date) return '-';
  return format(new Date(date), 'dd.MM.yyyy HH:mm', { locale: tr });
}

export function timeAgo(date: string | Date | null | undefined) {
  if (!date) return '-';
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: tr });
}

export function formatCurrency(amount: number | null | undefined, currency = 'TRY') {
  if (amount === null || amount === undefined) return '-';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(amount);
}

export function isExpiringSoon(date: Date | string, days = 30) {
  const d = new Date(date);
  return isAfter(d, new Date()) && isBefore(d, addDays(new Date(), days));
}

export function isExpired(date: Date | string) {
  return isBefore(new Date(date), new Date());
}

export const INSPECTION_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:              { label: 'Taslak',          color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  in_progress:        { label: 'Devam Ediyor',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  completed:          { label: 'Tamamlandı',      color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  submitted:          { label: 'Gönderildi',      color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' },
  under_review:       { label: 'İncelemede',      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  revision_requested: { label: 'Revizyon',        color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
  approved:           { label: 'Onaylandı',       color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  rejected:           { label: 'Reddedildi',      color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

export const REPORT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:              { label: 'Taslak',          color: 'bg-slate-100 text-slate-600' },
  under_review:       { label: 'İncelemede',      color: 'bg-amber-100 text-amber-700' },
  revision_requested: { label: 'Revizyon',        color: 'bg-orange-100 text-orange-700' },
  approved:           { label: 'Onaylandı',       color: 'bg-green-100 text-green-700' },
  under_signing:      { label: 'İmzalanıyor',     color: 'bg-violet-100 text-violet-700' },
  signed:             { label: 'İmzalandı',       color: 'bg-blue-100 text-blue-700' },
  delivered:          { label: 'Teslim Edildi',   color: 'bg-teal-100 text-teal-700' },
};

export const WORK_ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:           { label: 'Taslak',          color: 'bg-slate-100 text-slate-600' },
  planned:         { label: 'Planlandı',        color: 'bg-blue-100 text-blue-700' },
  assigned:        { label: 'Atandı',           color: 'bg-violet-100 text-violet-700' },
  in_progress:     { label: 'Devam Ediyor',     color: 'bg-amber-100 text-amber-700' },
  completed:       { label: 'Tamamlandı',       color: 'bg-emerald-100 text-emerald-700' },
  report_approved: { label: 'Rapor Onaylı',     color: 'bg-green-100 text-green-700' },
  invoiced:        { label: 'Faturalandı',      color: 'bg-teal-100 text-teal-700' },
  cancelled:       { label: 'İptal',            color: 'bg-red-100 text-red-700' },
};

export const USER_ROLE_LABELS: Record<string, string> = {
  admin:             'Sistem Yöneticisi',
  sales:             'Satış Personeli',
  planner:           'Planlamacı',
  inspector:         'Muayene Elemanı',
  technical_manager: 'Teknik Yönetici',
  finance:           'Finans / Faturalama',
  customer_rep:      'Müşteri Temsilcisi',
  executive:         'Üst Yönetim',
  customer:          'Müşteri',
};
