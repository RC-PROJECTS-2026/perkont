import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import axios, { AxiosInstance } from 'axios';

export interface LogoCariKart {
  CODE: string;
  DEFINITION_: string;         // Cari ünvan
  TAXNR: string;               // Vergi No
  TELNRS1: string;
  EMAILADDR: string;
  ADDR1: string;
  CITY: string;
  ACCNT: string;               // Hesap kodu
}

export interface LogoFaturaItem {
  TYPE: number;                // 0 = Mal/Hizmet
  MASTER_CODE: string;         // Hizmet kodu
  UNIT_CODE: string;
  QUANTITY: number;
  PRICE: number;
  VAT_RATE: number;
  DESCRIPTION?: string;
}

export interface LogoFatura {
  FICHETYPE: number;           // 8 = Satış Faturası
  CLIENTREF: string;           // Cari referans
  DATE: string;                // YYYY-MM-DD
  AUXIL_CODE?: string;
  TRANSACTIONS: {
    items: LogoFaturaItem[];
  };
}

@Injectable()
export class LogoApiClient {
  private client: AxiosInstance;
  private sessionToken: string | null = null;
  private sessionExpiry: Date | null = null;

  constructor(
    private configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private logger: Logger,
  ) {
    this.client = axios.create({
      baseURL: configService.get('LOGO_BASE_URL'),
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Request interceptor — token ekle
    this.client.interceptors.request.use(async (config) => {
      const token = await this.getToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Response interceptor — hata loglama
    this.client.interceptors.response.use(
      (res) => res,
      (err) => {
        this.logger.error('LOGO API Hatası', {
          status: err.response?.status,
          data: err.response?.data,
          url: err.config?.url,
        });
        throw err;
      },
    );
  }

  // ─── Token yönetimi ───────────────────────────────────────────────────────
  private async getToken(): Promise<string> {
    if (this.sessionToken && this.sessionExpiry && this.sessionExpiry > new Date()) {
      return this.sessionToken;
    }
    return this.login();
  }

  private async login(): Promise<string> {
    const response = await axios.post(
      `${this.configService.get('LOGO_BASE_URL')}/auth/login`,
      {
        username: this.configService.get('LOGO_USERNAME'),
        password: this.configService.get('LOGO_PASSWORD'),
        firmNr: this.configService.get('LOGO_FIRM_NUMBER'),
        periodNr: this.configService.get('LOGO_PERIOD_NUMBER'),
      },
    );

    this.sessionToken = response.data.token;
    this.sessionExpiry = new Date(Date.now() + 55 * 60 * 1000); // 55 dakika
    return this.sessionToken;
  }

  // ─── Cari Kart işlemleri ─────────────────────────────────────────────────
  async getCariKart(code: string): Promise<LogoCariKart | null> {
    try {
      const response = await this.client.get(`/api/v1/arps/${code}`);
      return response.data;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  async createCariKart(data: LogoCariKart): Promise<{ ref: string }> {
    const response = await this.client.post('/api/v1/arps', data);
    return response.data;
  }

  async updateCariKart(ref: string, data: Partial<LogoCariKart>): Promise<void> {
    await this.client.put(`/api/v1/arps/${ref}`, data);
  }

  // ─── Fatura işlemleri ─────────────────────────────────────────────────────
  async createInvoice(data: LogoFatura): Promise<{ ref: string; ficheNo: string }> {
    const response = await this.client.post('/api/v1/salesInvoices', data);
    return { ref: response.data.INTERNAL_REFERENCE, ficheNo: response.data.FICHENO };
  }

  async getInvoice(ref: string): Promise<any> {
    const response = await this.client.get(`/api/v1/salesInvoices/${ref}`);
    return response.data;
  }

  // ─── Hizmet kartı ─────────────────────────────────────────────────────────
  async getServiceItem(code: string): Promise<any> {
    const response = await this.client.get(`/api/v1/items/${code}`);
    return response.data;
  }
}
