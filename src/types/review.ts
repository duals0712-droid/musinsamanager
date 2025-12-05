export type MusinsaWriteItem = {
  reviewType: string;
  reviewTypeName?: string | null;
  reviewSubType?: string | null;
  reviewSubTypeName?: string | null;
  expectedPoint?: number | null;
  startAvailableDate?: string | null;
  endAvailableDate?: string | null;
  wrote: boolean;
};

export type MusinsaOrderItem = {
  orderNo: string;
  orderOptionNo: number;
  channelSource?: string;
  channelSourceName?: string;
  orderStateCode: number;
  orderStateName: string;
  orderDate: string;
  orderConfirmDate?: string | null;
  goodsNo: number;
  goodsName: string;
  goodsImage?: string;
  goodsOptionName?: string;
  brand?: string;
  brandName?: string;
  writeItemList?: MusinsaWriteItem[];
  confirmed: boolean;
};

export type ReviewFetchResult = {
  ok: boolean;
  reviewTargets: MusinsaOrderItem[];
  confirmTargets: MusinsaOrderItem[];
  pagesFetched: number;
  totalFetched: number;
  searchFromYmd?: string;
  searchToYmd?: string;
  errors?: { page: number; message: string }[];
  reason?: string;
};
