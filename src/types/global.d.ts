import type { MusinsaOrderSummary } from './orders';

export {};

declare global {
  interface Window {
    musinsaLogin?: {
      onResult: (callback: (result: { status: string; reason?: string }) => void) => void;
      sendLogin: (payload: { loginId: string; password: string }) => Promise<any>;
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
      saveOrderXlsxData: (
        orders: any[],
      ) => Promise<{ ok: boolean; path?: string; reason?: string }>;
      openPath: (path: string) => Promise<{ ok: boolean; reason?: string }>;
      showInFolder: (path: string) => Promise<{ ok: boolean; reason?: string }>;
      closeReviewWindow: () => Promise<any>;
    };
  }
}
