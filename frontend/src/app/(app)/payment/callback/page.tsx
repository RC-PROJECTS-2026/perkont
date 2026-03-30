'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { paymentsApi } from '@/lib/api';
import { Card, Button } from '@/components/ui';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function PaymentCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('failed');
      setMessage('Ödeme token bulunamadı');
      return;
    }

    paymentsApi.handleCallback(token)
      .then((res: any) => {
        const payment = res.data;
        if (payment.status === 'success') {
          setStatus('success');
          setMessage(`Ödeme başarılı! Tutar: ${Number(payment.amount).toLocaleString('tr-TR')} ₺`);
        } else {
          setStatus('failed');
          setMessage(payment.errorMessage || 'Ödeme başarısız');
        }
      })
      .catch((err: any) => {
        setStatus('failed');
        setMessage(err.response?.data?.message || err.message || 'Ödeme doğrulama hatası');
      });
  }, [searchParams]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center py-12">
        {status === 'loading' && (
          <>
            <Loader2 className="w-16 h-16 text-teal-400 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-200 mb-2">Ödeme Doğrulanıyor...</h2>
            <p className="text-sm text-slate-400">Lütfen bekleyiniz</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-200 mb-2">Ödeme Başarılı!</h2>
            <p className="text-sm text-slate-400 mb-6">{message}</p>
            <Button onClick={() => router.push('/payments')}>Ödemelere Dön</Button>
          </>
        )}
        {status === 'failed' && (
          <>
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-200 mb-2">Ödeme Başarısız</h2>
            <p className="text-sm text-red-400 mb-6">{message}</p>
            <Button onClick={() => router.push('/payments')}>Ödemelere Dön</Button>
          </>
        )}
      </Card>
    </div>
  );
}
