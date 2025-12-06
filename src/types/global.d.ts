import type { MusinsaOrderSummary } from './orders';

export {};

declare global {
  interface Window {
    musinsaLogin?: {
      onResult: (callback: (result: { status: string; reason?: string }) => void) => void;
      sendLogin: (payload: { loginId: string; password: string }) => Promise<any>;
      onUpdateStatus: (
        callback: (data: { status: string; version?: string; percent?: number; message?: string }) => void,
      ) => () => void;
      startUpdate: () => Promise<{ ok: boolean; reason?: string }>;
      loginSupabase: (payload: { loginId: string; password: string }) => Promise<
        | { ok: true; session: { userId: string; loginId: string; membership: string } }
        | { ok: false; message?: string }
      >;
      fetchReviewTargets: () => Promise<any>;
      fetchSessionStatus: () => Promise<any>;
      onSessionStatus: (callback: (result: { status: 'online' | 'offline'; checkedAt: number; reason?: string }) => void) => void;
      onSyncProgress: (callback: (data: { done: number; total: number; reset?: boolean }) => void) => () => void;
      logout: () => Promise<any>;
      confirmOrders: (items: { orderNo: string; orderOptionNo: number }[]) => Promise<any>;
      writeReviews: (items: any[]) => Promise<any>;
      writeReviewsDom: (items: any[]) => Promise<any>;
      syncOrdersRange: (payload: { startDate: string; endDate: string }) => Promise<
        | { ok: true; orders: MusinsaOrderSummary[] }
        | { ok: false; reason?: string }
      >;
      fetchGoodsDetail?: (payload: { goodsNo: string }) => Promise<{ ok: boolean; status?: number; data?: any; reason?: string }>;
      fetchProductPageState?: (payload: { goodsNo: string }) => Promise<{ ok: boolean; state?: any; reason?: string }>;
      fetchPointSummary?: () => Promise<{ ok: boolean; summary?: { availPoint?: number; totalPoint?: number }; status?: number; reason?: string }>;
      fetchCoupons?: (payload: { goodsNo: string; brand?: string; comId?: string; salePrice?: number }) => Promise<{
        ok: boolean;
        status?: number;
        data?: any;
        reason?: string;
      }>;
      saveOrderXlsxData: (
        orders: any[],
      ) => Promise<{ ok: boolean; path?: string; reason?: string }>;
      openPath: (path: string) => Promise<{ ok: boolean; reason?: string }>;
      showInFolder: (path: string) => Promise<{ ok: boolean; reason?: string }>;
      closeReviewWindow: () => Promise<any>;
      checkInventory?: (payload: { goodsUrl: string }) => Promise<
        | {
            ok: true;
            data: {
              meta: {
                brand: string;
                name: string;
                category: string;
                goodsNo?: string;
                imageUrl?: string;
              };
              options: Array<{ name: string; optionItemNo: number; stock?: number | null; status?: string }>;
            };
          }
        | { ok: false; reason?: string }
      >;
    };
    telegramHelper?: {
      getChatId: (payload: { token: string }) => Promise<{ ok: boolean; chatId?: string; reason?: string }>;
      sendTestMessage: (payload: { token: string; chatId: string; text?: string }) => Promise<{ ok: boolean; reason?: string }>;
    };
  }
}
