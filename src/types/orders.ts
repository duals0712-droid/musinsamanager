export type MusinsaOrderItemSummary = {
  image?: string;
  brandName?: string;
  goodsName?: string;
  optionName?: string;
  quantity: number;
  receiveAmount: number;
  actualUnitCost: number;
  stateText?: string;
};

export type MusinsaOrderTotals = {
  normalPrice: number;
  totalSaleTotalAmt: number;
  pointUsed: number;
  usePoint: number;
  prePoint: number;
  recvAmt: number;
  finalAmt: number;
  gap: number;
  payInfo?: string;
};

export type MusinsaOrderSummary = {
  orderNo: string;
  orderDate: string;
  brandName?: string;
  items: MusinsaOrderItemSummary[];
  totals: MusinsaOrderTotals;
};

export type MusinsaSyncOrdersResult =
  | { ok: true; orders: MusinsaOrderSummary[] }
  | { ok: false; reason?: string };
