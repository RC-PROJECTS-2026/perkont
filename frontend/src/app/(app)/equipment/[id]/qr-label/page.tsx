'use client';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api-client';
import { Card, Button } from '@/components/ui';
import { ArrowLeft, Printer, Download } from 'lucide-react';
import toast from 'react-hot-toast';

export default function QrLabelPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const { data } = useQuery({
    queryKey: ['equipment-qr', id],
    queryFn: () => apiClient.get(`/equipment/${id}`),
    enabled: !!id,
  });

  const equipment = (data as any)?.data;

  const downloadQr = async () => {
    try {
      const res = await apiClient.get(`/equipment/${id}/qr-label`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as any);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `${equipment?.inventoryCode || id}_QR.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('QR etiket indirilemedi');
    }
  };

  const printLabel = () => window.print();

  if (!equipment) return (
    <><div className="h-64 skeleton rounded-xl animate-pulse" /></>
  );

  return (
    <>
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> {equipment.inventoryCode}
      </button>

      <div className="max-w-sm mx-auto">
        <div className="flex gap-3 mb-6 print:hidden">
          <Button icon={<Printer className="w-4 h-4" />} onClick={printLabel} className="flex-1">Yazdır</Button>
          <Button variant="outline" icon={<Download className="w-4 h-4" />} onClick={downloadQr} className="flex-1">İndir</Button>
        </div>

        {/* QR Etiket — Baskı alanı */}
        <Card className="print:shadow-none print:border-2 print:border-black" id="qr-label-area">
          <div className="text-center p-6">
            {/* QR Kodu */}
            <div className="w-48 h-48 bg-slate-100 dark:bg-slate-800 rounded-xl mx-auto mb-4 flex items-center justify-center">
              {/* Backend'den QR kod PNG olarak çekilir */}
              <img
                src={`${process.env.NEXT_PUBLIC_API_URL}/equipment/${id}/qr-label`}
                alt={`QR: ${equipment.qrCode}`}
                className="w-44 h-44 rounded-lg"
                onError={(e) => {
                  // Fallback: QR kodu gösterilemezse metin göster
                  (e.target as any).style.display = 'none';
                }}
              />
            </div>

            {/* Ekipman Bilgileri */}
            <p className="font-mono text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
              {equipment.inventoryCode}
            </p>
            <p className="font-mono text-sm text-slate-500 mb-4">{equipment.qrCode}</p>

            <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
              <p className="font-medium">{equipment.equipmentType?.name}</p>
              {equipment.brand && <p>{equipment.brand} {equipment.model}</p>}
              {equipment.capacity && <p>Kapasite: {equipment.capacity}</p>}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
              <p>Sonraki Kontrol:</p>
              <p className="font-semibold text-slate-600 dark:text-slate-400">
                {equipment.nextControlDate
                  ? new Date(equipment.nextControlDate).toLocaleDateString('tr-TR')
                  : '—'
                }
              </p>
            </div>

            {/* Doğrulama URL */}
            <p className="mt-3 text-xs text-slate-300 break-all">
              PKT-{equipment.qrCode}
            </p>
          </div>
        </Card>

        <p className="text-center text-xs text-slate-400 mt-4 print:hidden">
          Bu QR kodu saha denetiminde okutarak denetim başlatabilirsiniz.
        </p>
      </div>
    </>
  );
}
