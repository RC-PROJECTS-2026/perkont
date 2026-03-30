import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Iyzipay from 'iyzipay';

@Injectable()
export class IyzicoClient {
  private iyzipay: any;

  constructor(private configService: ConfigService) {
    this.iyzipay = new Iyzipay({
      apiKey: configService.get('IYZICO_API_KEY', 'sandbox-api-key'),
      secretKey: configService.get('IYZICO_SECRET_KEY', 'sandbox-secret-key'),
      uri: configService.get('IYZICO_BASE_URL', 'https://sandbox-api.iyzipay.com'),
    });
  }

  // ─── Checkout Form (3D Secure) ─────────────────────────────────────────────
  async createCheckoutForm(params: {
    conversationId: string;
    price: string;
    paidPrice: string;
    currency: string;
    installment: number;
    basketId: string;
    callbackUrl: string;
    buyer: {
      id: string;
      name: string;
      surname: string;
      email: string;
      gsmNumber: string;
      identityNumber: string;
      registrationAddress: string;
      ip: string;
      city: string;
      country: string;
    };
    shippingAddress: {
      contactName: string;
      city: string;
      country: string;
      address: string;
    };
    billingAddress: {
      contactName: string;
      city: string;
      country: string;
      address: string;
    };
    basketItems: Array<{
      id: string;
      name: string;
      category1: string;
      itemType: string;
      price: string;
    }>;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = {
        locale: 'tr',
        conversationId: params.conversationId,
        price: params.price,
        paidPrice: params.paidPrice,
        currency: params.currency === 'TRY' ? Iyzipay.CURRENCY.TRY : params.currency,
        installment: String(params.installment),
        basketId: params.basketId,
        paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
        paymentGroup: Iyzipay.PAYMENT_GROUP.SERVICE,
        callbackUrl: params.callbackUrl,
        enabledInstallments: [1, 2, 3, 6, 9, 12],
        buyer: {
          id: params.buyer.id,
          name: params.buyer.name,
          surname: params.buyer.surname,
          gsmNumber: params.buyer.gsmNumber,
          email: params.buyer.email,
          identityNumber: params.buyer.identityNumber,
          registrationAddress: params.buyer.registrationAddress,
          ip: params.buyer.ip,
          city: params.buyer.city,
          country: params.buyer.country,
        },
        shippingAddress: params.shippingAddress,
        billingAddress: params.billingAddress,
        basketItems: params.basketItems.map(item => ({
          id: item.id,
          name: item.name,
          category1: item.category1,
          itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
          price: item.price,
        })),
      };

      this.iyzipay.checkoutFormInitialize.create(request, (err: any, result: any) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // ─── Checkout Form sonucu al ───────────────────────────────────────────────
  async retrieveCheckoutForm(token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.iyzipay.checkoutForm.retrieve(
        { locale: 'tr', token },
        (err: any, result: any) => {
          if (err) return reject(err);
          resolve(result);
        },
      );
    });
  }

  // ─── Dogrudan odeme (3D Secure olmadan) ────────────────────────────────────
  async createPayment(params: {
    conversationId: string;
    price: string;
    paidPrice: string;
    currency: string;
    installment: number;
    paymentCard: {
      cardHolderName: string;
      cardNumber: string;
      expireMonth: string;
      expireYear: string;
      cvc: string;
    };
    buyer: any;
    shippingAddress: any;
    billingAddress: any;
    basketItems: any[];
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = {
        locale: 'tr',
        conversationId: params.conversationId,
        price: params.price,
        paidPrice: params.paidPrice,
        currency: params.currency === 'TRY' ? Iyzipay.CURRENCY.TRY : params.currency,
        installment: String(params.installment),
        paymentChannel: Iyzipay.PAYMENT_CHANNEL.WEB,
        paymentGroup: Iyzipay.PAYMENT_GROUP.SERVICE,
        paymentCard: {
          cardHolderName: params.paymentCard.cardHolderName,
          cardNumber: params.paymentCard.cardNumber,
          expireMonth: params.paymentCard.expireMonth,
          expireYear: params.paymentCard.expireYear,
          cvc: params.paymentCard.cvc,
          registerCard: '0',
        },
        buyer: params.buyer,
        shippingAddress: params.shippingAddress,
        billingAddress: params.billingAddress,
        basketItems: params.basketItems.map(item => ({
          ...item,
          itemType: Iyzipay.BASKET_ITEM_TYPE.VIRTUAL,
        })),
      };

      this.iyzipay.payment.create(request, (err: any, result: any) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // ─── Iade ──────────────────────────────────────────────────────────────────
  async refund(params: {
    paymentTransactionId: string;
    conversationId: string;
    price: string;
    currency: string;
    ip: string;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = {
        locale: 'tr',
        conversationId: params.conversationId,
        paymentTransactionId: params.paymentTransactionId,
        price: params.price,
        currency: params.currency === 'TRY' ? Iyzipay.CURRENCY.TRY : params.currency,
        ip: params.ip,
      };

      this.iyzipay.refund.create(request, (err: any, result: any) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
  }

  // ─── Taksit sorgulama ──────────────────────────────────────────────────────
  async getInstallments(params: {
    binNumber: string;
    price: string;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      this.iyzipay.installmentInfo.retrieve(
        {
          locale: 'tr',
          binNumber: params.binNumber,
          price: params.price,
        },
        (err: any, result: any) => {
          if (err) return reject(err);
          resolve(result);
        },
      );
    });
  }
}
