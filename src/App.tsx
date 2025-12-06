import { useMemo, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronDown,
  HelpCircle,
  Clock3,
  FileText,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import AppLayout from './components/layout/AppLayout';
import AuthGate from './components/auth/AuthGate';
import { AuthSession, signOut } from './lib/authService';
import { MembershipTier } from './types/membership';
import { useEffect } from 'react';
import { MusinsaOrderItem, ReviewFetchResult } from './types/review';
import type { MusinsaOrderSummary } from './types/orders';
import { supabase, isSupabaseConfigured } from './lib/supabaseClient';
import InventoryCheckView from './components/InventoryCheckView';
import { useTelegramToken } from './hooks/useTelegramToken';
import guide1 from './guide/1.jpg';
import guide2 from './guide/2.jpg';
import guide3 from './guide/3.jpg';
import guide4 from './guide/4.jpg';
import guide5 from './guide/5.jpg';
import guide6 from './guide/6.jpg';
import guide7 from './guide/7.jpg';

const cardBase =
  'rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg';

type ProgressState = {
  mode: 'review' | 'confirm';
  total: number;
  done: number;
  label: string;
  status: 'active' | 'done';
  summary?: string;
};

const kstFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const formatYMD = (d: Date) => kstFormatter.format(d);
const formatMoney = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : '0';
};
const parseISODate = (s: string) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};
const clampDate = (value: string, fallback: string) => {
  const parsed = parseISODate(value);
  return parsed ? formatYMD(parsed) : fallback;
};

const telegramGuideSteps = [
  { image: guide1, description: '우선 텔레그램을 스마트폰에 다운로드 받아줍니다.' },
  { image: guide2, description: '상단의 검색 버튼을 눌러줍니다.' },
  { image: guide3, description: "'@botfather' 검색후 상단에 공식마크가 달린 봇파더를 클릭해줍니다." },
  { image: guide4, description: "스크린샷과 같이 순서대로 진행해준뒤 '토큰'을 복사해줍니다." },
  { image: guide5, description: '아까 상단의 검색 버튼을 눌러 방금 생성한 봇 이름을 검색후 클릭합니다.' },
  { image: guide6, description: '채팅 시작을 누르고 아무 메시지나 1개 이상 전송해둡니다.' },
  {
    image: guide7,
    description:
      "아까 복사했던 토큰을 프로그램 토큰 입력칸에 붙여넣기하고 '자동불러오기' 버튼 클릭 -> 저장 클릭 -> 테스트 발송 클릭하여 자신의 텔레그램으로 알림이 정상적으로 오면 성공!",
  },
];

const OrdersDownloadView = () => {
  const today = new Date();
  const defaultEnd = formatYMD(today);
  const defaultStart = formatYMD(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [rangeTag, setRangeTag] = useState<'7' | '30' | '90' | null>('7');
  const [syncing, setSyncing] = useState(false);
  const [orders, setOrders] = useState<MusinsaOrderSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<{ count: number; start: string; end: string } | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ status: 'idle' | 'active' | 'done'; label: string; percent: number }>({
    status: 'idle',
    label: '대기 중',
    percent: 0,
  });
  const [detailProgress, setDetailProgress] = useState<{ done: number; total: number } | null>(null);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [saveToast, setSaveToast] = useState<{ path: string; key: number } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchApplied, setSearchApplied] = useState(false);
  const [appliedSearch, setAppliedSearch] = useState('');
  const [listOpacity, setListOpacity] = useState(1);
  const listFadeTimer = useRef<NodeJS.Timeout | null>(null);
  const [orderLogs, setOrderLogs] = useState<string[]>([]);

  const addOrderLog = (msg: string) => {
    const now = new Date();
    const ts = now.toLocaleTimeString('ko-KR', { hour12: false });
    setOrderLogs((prev) => [`${ts} ${msg}`, ...prev].slice(0, 50));
  };

  const applyQuickRange = (days: number) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    setStartDate(formatYMD(start));
    setEndDate(formatYMD(end));
    setRangeTag(String(days) as '7' | '30' | '90' | null);
  };

  const handleDateChange = (which: 'start' | 'end', value: string) => {
    const clamped = clampDate(value, which === 'start' ? startDate : endDate);
    if (which === 'start') setStartDate(clamped);
    else setEndDate(clamped);
    setRangeTag(null);
  };

  const handleSync = async () => {
    setError(null);
    if (startDate > endDate) {
      setError('시작일이 종료일보다 늦을 수 없습니다.');
      return;
    }
    const syncOrdersRange = window.musinsaLogin?.syncOrdersRange;
    if (!syncOrdersRange) {
      setError('무신사 브라우저 창이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    setSyncing(true);
    setSyncProgress({ status: 'active', label: '주문 목록 수집 중', percent: 10 });
    setSyncSummary(null);
    setDetailProgress({ done: 0, total: 0 });
    addOrderLog(`동기화 시작 · ${startDate} ~ ${endDate}`);
    try {
      setSyncProgress({ status: 'active', label: '주문 목록/상세 수집 중', percent: 60 });
      const res = await syncOrdersRange({ startDate, endDate });
      if (!res?.ok) {
        const reason = res?.reason || 'sync_failed';
        let message = '주문 동기화에 실패했습니다.';
        if (reason === 'musinsa_window_missing') {
          message = '무신사 브라우저 창이 닫혀 있습니다. 앱을 재시작하거나 로그인 세션을 확인해주세요.';
        } else if (reason === 'invalid_range') {
          message = '날짜 범위가 올바르지 않습니다.';
        } else if (typeof reason === 'string' && (reason.startsWith('list_status_') || reason.startsWith('detail_status_'))) {
          const statusText = reason.split('_').pop();
          message = `무신사 API가 ${statusText} 응답을 반환했습니다. 로그인 상태를 확인해주세요.`;
        }
        throw new Error(message);
      }

      const fetchedOrders = Array.isArray(res.orders) ? res.orders : [];
      setOrders(fetchedOrders);
      setSearchApplied(false);
      setAppliedSearch('');
      setSearchTerm('');
      setSyncSummary({ count: fetchedOrders.length, start: startDate, end: endDate });
      setSyncProgress({
        status: 'done',
        label: fetchedOrders.length > 0 ? `${fetchedOrders.length}건 동기화 완료` : '동기화 완료 (데이터 없음)',
        percent: 100,
      });
      addOrderLog(`동기화 완료 · ${fetchedOrders.length}건`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '주문 동기화에 실패했습니다.';
      setError(msg);
      setSyncProgress({ status: 'done', label: '동기화 실패', percent: 0 });
      addOrderLog(`동기화 실패 · ${msg}`);
    } finally {
      setSyncing(false);
      setDetailProgress(null);
    }
  };

  useEffect(() => {
    const off = window.musinsaLogin?.onSyncProgress?.((data) => {
      if (data?.reset) {
        setDetailProgress(null);
        return;
      }
      const done = Number(data?.done) || 0;
      const total = Number(data?.total) || 0;
      setDetailProgress({ done, total });
      setSyncProgress((prev) => {
        const ratio = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
        const percent = total > 0 ? Math.max(10, Math.min(95, Math.round(ratio * 90) + 5)) : prev.percent;
        const label =
          total > 0 ? `${done}/${total}건 수집중` : prev.label || '수집 중';
        return { status: 'active', label, percent };
      });
    });
    return () => {
      off?.();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (listFadeTimer.current) clearTimeout(listFadeTimer.current);
    };
  }, []);
  const normalizedQuery = appliedSearch.trim().toLowerCase();
  const filteredOrders = useMemo(() => {
    if (!normalizedQuery) return orders.map((o) => ({ ...o, key: o.orderNo }));
    return orders
      .map((order) => {
        const items = order.items.filter((item) => {
          const brand = (item.brandName || '').toLowerCase();
          const name = (item.goodsName || '').toLowerCase();
          return brand.includes(normalizedQuery) || name.includes(normalizedQuery);
        });
        if (items.length === 0) return null;
        return { ...order, items, key: `${order.orderNo}-filtered` };
      })
      .filter(Boolean) as (MusinsaOrderSummary & { key: string })[];
  }, [orders, normalizedQuery]);
  const displayedOrders = filteredOrders;

  const downloadExcel = async () => {
    if (displayedOrders.length === 0) {
      setError('동기화된 주문이 없습니다.');
      return;
    }
    setError(null);
    setDownloadingExcel(true);
    try {
      const flat = displayedOrders.flatMap((order) =>
        order.items.map((item) => ({
          orderDate: order.orderDate,
          orderNo: order.orderNo,
          stateText: item.stateText || '',
          brandName: item.brandName || '',
          goodsName: item.goodsName || '',
          optionName: item.optionName || '',
          quantity: item.quantity ?? 0,
          receiveAmount: item.receiveAmount ?? 0,
          actualUnitCost: item.actualUnitCost ?? 0,
          payInfo: order.totals?.payInfo || '',
        })),
      );
      const res = await window.musinsaLogin?.saveOrderXlsxData?.(flat);
      if (!res?.ok) {
        setError(res?.reason === 'canceled' ? '엑셀 저장이 취소되었습니다.' : '엑셀 저장에 실패했습니다.');
      } else if (res.path) {
        const key = Date.now();
        setSaveToast({ path: res.path, key });
      }
    } catch (e) {
      console.error('excel_download_error', e);
      setError(e instanceof Error ? e.message : '엑셀 생성에 실패했습니다.');
    } finally {
      setDownloadingExcel(false);
    }
  };


  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">주문내역 관리</h1>
        <p className="text-sm text-gray-500">
          무신사 주문 데이터를 설정한 기간에 맞춰 동기화하고 세부 내역을 정리합니다.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex min-h-[140px] flex-col rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 shadow-lg ring-1 ring-white/10">
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                  <Activity size={18} className="text-white" />
                </div>
                <div>
                  <p className="text-xs text-slate-300">실시간 진행</p>
                  <p className="text-lg font-semibold text-white">
                    {syncProgress.status === 'active'
                      ? `${syncProgress.label}`
                      : syncProgress.status === 'done'
                        ? syncProgress.label
                        : '아직 실행 이력이 없습니다.'}
                  </p>
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  syncProgress.status === 'active'
                    ? 'bg-white/10 text-white'
                    : syncProgress.status === 'done'
                      ? 'bg-emerald-500/20 text-emerald-100'
                      : 'bg-white/10 text-white/70'
                }`}
              >
                {syncProgress.status === 'active' ? '동기화' : syncProgress.status === 'done' ? '완료' : '대기'}
              </span>
            </div>

            <div className="rounded-xl bg-white/10 p-3 shadow-inner">
              <div className="flex items-center justify-between text-[12px] text-white/80">
                <span>
                  {syncProgress.status === 'active'
                    ? '주문 데이터를 불러오는 중'
                    : syncProgress.status === 'done'
                      ? '동기화 완료'
                      : '준비 완료'}
                </span>
                <span>{syncProgress.status === 'active' ? `${syncProgress.percent}%` : syncProgress.status === 'done' ? '100%' : '0%'}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/20">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-300"
                  style={{ width: `${syncProgress.status === 'done' ? 100 : syncProgress.percent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-black/20 p-3 shadow-inner">
            <div className="flex items-center justify-between text-xs text-white/80">
              <span className="font-semibold">작업 로그</span>
              <span>{orderLogs.length}건</span>
            </div>
            <div className="mt-2 h-24 space-y-1 overflow-y-auto rounded-lg bg-black/20 p-3 text-xs text-white/80">
              {orderLogs.length === 0 ? (
                <p className="text-white/50">로그가 없습니다.</p>
              ) : (
                orderLogs.map((log, idx) => (
                  <p key={`${log}-${idx}`} className="whitespace-pre-wrap leading-snug">
                    {log}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900 p-5 shadow-lg ring-1 ring-white/10 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="text-white" size={22} />
              <div>
                <h3 className="text-lg font-semibold text-white">주문 동기화</h3>
                <p className="text-xs text-slate-300">시작일/종료일을 선택해 주문을 불러옵니다.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(['7', '30', '90'] as const).map((tag) => (
                <button
                  key={tag}
                  onClick={() => applyQuickRange(Number(tag))}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    rangeTag === tag
                      ? 'border-white bg-white text-slate-900 shadow-sm'
                      : 'border-white/20 text-white hover:bg-white/10'
                  }`}
                >
                  최근{tag}일
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200">시작일</label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => handleDateChange('start', e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50 shadow-sm focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <Calendar size={16} className="pointer-events-none absolute right-3 top-2.5 text-white/50" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-200">종료일</label>
              <div className="relative">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => handleDateChange('end', e.target.value)}
                  className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50 shadow-sm focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <Calendar size={16} className="pointer-events-none absolute right-3 top-2.5 text-white/50" />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncing ? '동기화 중...' : '동기화 시작'}
            </button>
            <button
              onClick={() => downloadExcel()}
              disabled={displayedOrders.length === 0 || downloadingExcel}
              className="w-full rounded-lg border border-white/30 bg-transparent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {downloadingExcel ? '엑셀 준비 중...' : '엑셀 다운로드'}
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
            <div className="flex-1">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="브랜드명 혹은 상품명을 검색하세요."
                className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/60 shadow-sm focus:border-white/60 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (!searchTerm.trim()) return;
                  setAppliedSearch(searchTerm.trim());
                  setSearchApplied(true);
                  if (listFadeTimer.current) clearTimeout(listFadeTimer.current);
                  setListOpacity(0);
                  listFadeTimer.current = setTimeout(() => setListOpacity(1), 180);
                }}
                disabled={orders.length === 0 || !searchTerm.trim()}
                className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                조회
              </button>
              <button
                onClick={() => {
                  setSearchApplied(false);
                  setAppliedSearch('');
                  setSearchTerm('');
                  if (listFadeTimer.current) clearTimeout(listFadeTimer.current);
                  setListOpacity(0);
                  listFadeTimer.current = setTimeout(() => setListOpacity(1), 180);
                }}
                disabled={orders.length === 0 && !searchApplied}
                className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                초기화
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      {orders.length === 0 && !syncing ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-600">
          아직 동기화된 주문이 없습니다. 기간을 선택하고 동기화를 시작하세요.
        </div>
      ) : displayedOrders.length === 0 && searchApplied ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-600">
          검색 결과가 없습니다. 검색어를 변경하거나 초기화해 주세요.
        </div>
      ) : (
        <div className="space-y-3 transition-opacity duration-200" style={{ opacity: listOpacity }}>
          {syncSummary && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2 text-xs text-gray-700">
              <span>
                동기화 완료 · {syncSummary.start} ~ {syncSummary.end}
              </span>
              <span className="font-semibold">
                주문서 {syncSummary.count}건 · 상품 수량{' '}
                {displayedOrders.reduce((acc, order) => acc + order.items.reduce((a, it) => a + (it.quantity || 0), 0), 0)}개
              </span>
            </div>
          )}
          <div className="space-y-3 transition-all duration-200">
          {displayedOrders.map((order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const totals = order.totals || ({} as MusinsaOrderSummary['totals']);
            const totalQty = items.reduce((acc, it) => acc + (it?.quantity || 0), 0);
            return (
              <div
                key={(order as any).key || order.orderNo}
                className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
                  <div className="text-left">
                    <p className="text-xs font-semibold text-gray-500">주문번호</p>
                    <p className="text-sm font-semibold text-gray-900">{order.orderNo}</p>
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-semibold text-gray-500">주문날짜</p>
                    <p className="text-sm font-semibold text-gray-900">{order.orderDate}</p>
                  </div>
                  <div className="text-left text-xs font-semibold text-gray-600">총 수량 {totalQty}개</div>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border border-gray-100">
                  <div className="grid grid-cols-[80px,90px,120px,1.7fr,110px,80px,120px,140px] bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600">
                    <span className="flex items-center justify-center">이미지</span>
                    <span className="flex items-center justify-center">구분</span>
                    <span className="flex items-center justify-center">브랜드</span>
                    <span className="flex items-center justify-center">상품명</span>
                    <span className="flex items-center justify-center">사이즈</span>
                    <span className="flex items-center justify-center">수량</span>
                    <span className="flex items-center justify-center">상품가격</span>
                    <span className="flex items-center justify-center">실제 개당 매입가</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map((item, idx) => (
                      <div
                        key={`${order.orderNo}-${idx}`}
                        className="grid grid-cols-[80px,90px,120px,1.7fr,110px,80px,120px,140px] items-center px-3 py-2 text-xs text-gray-800"
                      >
                        <div className="mx-auto flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.goodsName || ''}
                              className="h-full w-full cursor-zoom-in object-cover"
                              onClick={() => setPreviewImage(item.image || null)}
                            />
                          ) : (
                            <div className="h-full w-full bg-gray-200" />
                          )}
                        </div>
                        <span
                          className={`flex items-center justify-center truncate px-2 ${
                            item.stateText && /(반품|오류|취소)/.test(item.stateText) ? 'font-semibold text-red-600' : 'text-gray-700'
                          }`}
                        >
                          {item.stateText || '-'}
                        </span>
                        <span className="flex items-center justify-center truncate px-2">{item.brandName}</span>
                        <span className="flex items-center justify-center truncate px-2 text-center">{item.goodsName}</span>
                        <span className="flex items-center justify-center truncate px-2">{item.optionName}</span>
                        <span className="flex items-center justify-center">{item.quantity ?? 0}</span>
                        <span className="flex items-center justify-center">{formatMoney(item.receiveAmount)}원</span>
                        <span className="flex items-center justify-center font-semibold text-blue-600">{formatMoney(item.actualUnitCost)}원</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <div className="inline-block rounded-xl bg-gray-50 p-4 text-sm text-gray-800">
                    <div className="grid grid-cols-[200px,auto] gap-x-3 gap-y-1">
                      <span className="text-gray-600">할인전금액</span>
                      <span className="text-right font-semibold">{formatMoney(totals.normalPrice)}원</span>

                      <span className="text-gray-600">할인금액</span>
                      <span className="text-right font-semibold">{formatMoney(totals.totalSaleTotalAmt)}원</span>

                      <span className="text-gray-600">적립금 사용 총금액</span>
                      <span className="text-right font-semibold">{formatMoney(totals.pointUsed)}원</span>

                      <span className="col-start-2 text-right text-[11px] text-gray-500">
                        보유적립금 {formatMoney(totals.usePoint)}원 · 적립금 선할인 {formatMoney(totals.prePoint)}원
                      </span>

                      <span className="text-gray-600">결제 금액</span>
                      <span className="text-right font-semibold">{formatMoney(totals.recvAmt)}원</span>

                      <span className="text-gray-600">최종 결제 금액 (카드할인 포함)</span>
                      <span className="text-right font-semibold text-red-600">{formatMoney(totals.finalAmt)}원</span>

                      <span className="text-gray-600">결제수단</span>
                      <span className="text-right font-semibold">{totals.payInfo ? totals.payInfo : '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {previewImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setPreviewImage(null)}>
          <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs font-semibold text-white"
              onClick={() => setPreviewImage(null)}
            >
              닫기
            </button>
            <img src={previewImage} alt="미리보기" className="block max-h-[85vh] max-w-4xl object-contain" />
          </div>
        </div>
      )}
      {saveToast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-100">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 shadow-inner">
                <CheckCircle2 size={24} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">파일이 저장되었습니다.</p>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600">{saveToast.path}</p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button
                onClick={async () => {
                  setSaveToast(null);
                  const res = await window.musinsaLogin?.openPath?.(saveToast.path);
                  if (!res?.ok) {
                    setError(res?.reason || '파일을 열 수 없습니다.');
                  }
                }}
                className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-black"
              >
                파일 열기
              </button>
              <button
                onClick={async () => {
                  setSaveToast(null);
                  const res = await window.musinsaLogin?.showInFolder?.(saveToast.path);
                  if (!res?.ok) {
                    setError(res?.reason || '폴더를 열 수 없습니다.');
                  }
                }}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-50"
              >
                폴더 열기
              </button>
              <button
                onClick={() => setSaveToast(null)}
                className="w-full rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-100"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


type ReviewTemplate = {
  id?: number;
  productKey: string;
  brand?: string | null;
  product?: string | null;
  option_text?: string | null;
  product_type?: string | null;
  gender?: string | null;
  height?: string | null;
  weight?: string | null;
  general_content?: string | null;
  general_image_path?: string | null;
  style_content?: string | null;
  style_image_path?: string | null;
};

const AutoReviewView = ({ session }: { session: AuthSession }) => {
  const [reviewData, setReviewData] = useState<ReviewFetchResult | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [selectedConfirm, setSelectedConfirm] = useState<Record<string, boolean>>({});
  const [selectedReview, setSelectedReview] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [templateMap, setTemplateMap] = useState<Record<string, ReviewTemplate>>({});
  const [templateModal, setTemplateModal] = useState<{ open: boolean; key: string | null; item: MusinsaOrderItem | null }>({
    open: false,
    key: null,
    item: null,
  });
  const [templateDraft, setTemplateDraft] = useState<ReviewTemplate | null>(null);
  const [templateCategory, setTemplateCategory] = useState<'의류' | '신발' | '잡화'>('의류');
  const [templateSaving, setTemplateSaving] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalClosing, setModalClosing] = useState(false);
  const [modalInvalid, setModalInvalid] = useState(false);
  const [toast, setToast] = useState<{ message: string; key: number; leaving: boolean } | null>(null);

  const groupKey = (item: MusinsaOrderItem) => `${item.goodsNo}::${item.goodsName}::${item.brandName ?? ''}`;
  const optionKey = (item: MusinsaOrderItem) =>
    `${item.goodsNo}::${item.goodsName}::${item.brandName ?? ''}::${item.goodsOptionName ?? ''}`;

  const FancySelect = ({
    options,
    value,
    onChange,
    placeholder,
  }: {
    options: { value: string; label: string }[];
    value?: string | null;
    onChange: (v: string) => void;
    placeholder?: string;
  }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, []);
    const selected = options.find((o) => o.value === value);
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none"
        >
          <span className={selected ? '' : 'text-gray-400'}>{selected ? selected.label : placeholder || '선택'}</span>
          <ChevronDown size={16} className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <div
          className={`absolute left-0 right-0 z-10 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-200 ${
            open ? 'pointer-events-auto opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-1'
          }`}
        >
          <ul className="max-h-56 overflow-y-auto py-1 text-sm text-gray-800">
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left transition-colors duration-150 hover:bg-gray-50 ${
                    value === opt.value ? 'bg-gray-50 font-semibold text-gray-900' : ''
                  }`}
                >
                  <span>{opt.label}</span>
                  {value === opt.value && <span className="text-xs text-blue-600">선택됨</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const resolveTemplateForItem = (item: MusinsaOrderItem) => {
    const ok = optionKey(item);
    if (templateMap[ok]) return { key: ok, template: templateMap[ok] };
    const bk = groupKey(item);
    if (templateMap[bk]) return { key: bk, template: templateMap[bk] };
    return null;
  };

  const formatDate = (iso?: string | null) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toISOString().slice(0, 10);
  };

  const countValidChars = (text: string) => {
    let count = 0;
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      const isAsciiLetter = /[A-Za-z0-9]/.test(ch);
      const isHangulSyllable = code >= 0xac00 && code <= 0xd7a3;
      if (isAsciiLetter || isHangulSyllable) {
        count += 1;
      }
    }
    return count;
  };

  const openTemplateModal = (item: MusinsaOrderItem) => {
    const key = groupKey(item);
    const saved = templateMap[key];
    const productType = (saved?.product_type as '의류' | '신발' | '잡화' | undefined) ?? '의류';
    setTemplateCategory(productType);
    setTemplateDraft({
      productKey: key,
      brand: saved?.brand ?? item.brandName ?? item.brand ?? '',
      product: saved?.product ?? item.goodsName ?? '',
      option_text: saved?.option_text ?? item.goodsOptionName ?? '',
      product_type: productType,
      gender: saved?.gender ?? '여성',
      height: saved?.height ?? '',
      weight: saved?.weight ?? '',
      general_content: saved?.general_content ?? '',
      general_image_path: saved?.general_image_path ?? '',
      style_content: saved?.style_content ?? '',
      style_image_path: saved?.style_image_path ?? '',
      id: saved?.id,
    });
    setTemplateModal({ open: true, key, item });
    setModalInvalid(false);
  };

  const saveTemplate = async () => {
    if (!templateDraft) return;
    const generalCount = countValidChars(templateDraft.general_content || '');
    const styleCount = countValidChars(templateDraft.style_content || '');
    if (generalCount < 20 || styleCount < 20) {
      setModalInvalid(true);
      showToast(
        '무신사 후기내용은 20글자를 넘어야합니다.\n영어,숫자,한글로만 20글자를 넘어야되며\n자음,모음,특수문자,띄어쓰기 등은 글자수에 포함되지 않습니다.',
      );
      setTimeout(() => setModalInvalid(false), 1000);
      return;
    }
    if (templateCategory === '의류' && (!templateDraft.height || !templateDraft.weight)) {
      log('의류는 키/몸무게 입력이 필요합니다.');
      return;
    }
    setTemplateSaving(true);
    const payload = {
      product_key: templateDraft.productKey,
      brand: templateDraft.brand ?? '',
      product: templateDraft.product ?? '',
      option_text: templateDraft.option_text ?? '',
      product_type: templateCategory,
      gender: templateCategory === '의류' ? templateDraft.gender ?? '여성' : null,
      height: templateCategory === '의류' ? templateDraft.height ?? '' : null,
      weight: templateCategory === '의류' ? templateDraft.weight ?? '' : null,
      general_content: templateDraft.general_content ?? '',
      general_image_path: templateDraft.general_image_path ?? '',
      style_content: templateDraft.style_content ?? '',
      style_image_path: templateDraft.style_image_path ?? '',
    };
    try {
      if (isSupabaseConfigured) {
        const { data: existing } = await supabase!
          .from('review_templates')
          .select('id')
          .eq('user_id', session.userId)
          .eq('product_key', payload.product_key)
          .maybeSingle();
        if (existing?.id) {
          const { error } = await supabase!
            .from('review_templates')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
          if (error) throw error;
          setTemplateMap((prev) => ({
            ...prev,
            [payload.product_key]: { ...templateDraft, id: existing.id, product_type: templateCategory },
          }));
        } else {
          const { data, error } = await supabase!
            .from('review_templates')
            .insert([{ ...payload, user_id: session.userId }])
            .select('id')
            .maybeSingle();
          if (error) throw error;
          setTemplateMap((prev) => ({
            ...prev,
            [payload.product_key]: { ...templateDraft, id: data?.id, product_type: templateCategory },
          }));
        }
      } else {
        const raw = localStorage.getItem('mm_review_templates') || '{}';
        const parsed = JSON.parse(raw);
        parsed[payload.product_key] = { ...templateDraft, product_type: templateCategory };
        localStorage.setItem('mm_review_templates', JSON.stringify(parsed));
        setTemplateMap((prev) => ({
          ...prev,
          [payload.product_key]: { ...templateDraft, product_type: templateCategory },
        }));
      }
      log('정보가 저장되었습니다.');
      setTemplateModal({ open: false, key: null, item: null });
      setTemplateDraft(null);
    } catch (e) {
      log(e instanceof Error ? e.message : '저장 실패');
    } finally {
      setTemplateSaving(false);
    }
  };

  const log = (msg: string) => {
    const now = new Date();
    const ts = now.toLocaleTimeString('ko-KR', { hour12: false });
    setLogLines((prev) => [`${ts} ${msg}`, ...prev].slice(0, 120));
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mm_review_templates');
      if (raw) {
        const parsed = JSON.parse(raw);
        setTemplateMap(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (templateModal.open) {
      setModalClosing(false);
      setModalVisible(true);
    } else if (modalVisible) {
      setModalClosing(true);
      const t = setTimeout(() => setModalVisible(false), 200);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [templateModal.open, modalVisible]);

  const showToast = (message: string) => {
    const key = Date.now();
    setToast({ message, key, leaving: false });
    setTimeout(() => {
      setToast((prev) => (prev && prev.key === key ? { ...prev, leaving: true } : prev));
    }, 4800);
    setTimeout(() => {
      setToast((prev) => (prev && prev.key === key ? null : prev));
    }, 5000);
  };

  const handleFetch = async () => {
    if (!window.musinsaLogin?.fetchReviewTargets) {
      setReviewError('무신사 세션이 준비되지 않았습니다.');
      return;
    }
    setReviewError(null);
    setReviewLoading(true);
    log('후기/구매확정 대상 조회 시작');
    try {
      const res: ReviewFetchResult = await window.musinsaLogin.fetchReviewTargets();
      if (!res?.ok) {
        throw new Error(res?.reason ?? '조회에 실패했습니다.');
      }
      setReviewData(res);
      setSelectedConfirm({});
      setSelectedReview({});
      log(`조회 완료: 후기 대상 ${res.reviewTargets.length}건, 구매확정 대상 ${res.confirmTargets.length}건, 페이지 ${res.pagesFetched}개`);
      if (isSupabaseConfigured) {
        const keys = Array.from(
          new Set([
            ...res.reviewTargets.map((i) => groupKey(i)),
            ...res.confirmTargets.map((i) => groupKey(i)),
          ]),
        );
        if (keys.length > 0) {
          try {
            const { data, error } = await supabase!
              .from('review_templates')
              .select('*')
              .eq('user_id', session.userId)
              .in('product_key', keys);
            if (!error && Array.isArray(data)) {
              const map: Record<string, ReviewTemplate> = {};
              data.forEach((row: any) => {
                map[row.product_key] = {
                  id: row.id,
                  productKey: row.product_key,
                  brand: row.brand,
                  product: row.product,
                  option_text: row.option_text,
                  product_type: row.product_type,
                  gender: row.gender,
                  height: row.height,
                  weight: row.weight,
                  general_content: row.general_content,
                  general_image_path: row.general_image_path,
                  style_content: row.style_content,
                  style_image_path: row.style_image_path,
                };
              });
              setTemplateMap((prev) => ({ ...prev, ...map }));
            }
          } catch (err) {
            console.warn('[review] template fetch failed', err);
          }
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '조회에 실패했습니다.';
      setReviewError(message);
      log(`조회 실패: ${message}`);
    } finally {
      setReviewLoading(false);
    }
  };

  const groupItems = (items: MusinsaOrderItem[]) => {
    const map = new Map<
      string,
      {
        base: MusinsaOrderItem;
        count: number;
      }
    >();
    items.forEach((item) => {
      const key = `${item.goodsNo}::${item.goodsName}::${item.brandName ?? ''}`;
      const current = map.get(key);
      if (current) {
        current.count += 1;
      } else {
        map.set(key, { base: item, count: 1 });
      }
    });
    return Array.from(map.values());
  };

  const groupedConfirm = useMemo(() => groupItems(reviewData?.confirmTargets ?? []), [reviewData]);
  const groupedReview = useMemo(() => groupItems(reviewData?.reviewTargets ?? []), [reviewData]);
  const working = progress?.status === 'active';
  const bumpProgress = () =>
    setProgress((prev) => (prev ? { ...prev, done: Math.min(prev.done + 1, prev.total) } : prev));
  const progressPercent = progress
    ? progress.status === 'done'
      ? 100
      : Math.min(100, Math.round((progress.done / Math.max(progress.total, 1)) * 100))
    : 0;

  const toggleAll = (type: 'confirm' | 'review', value: boolean) => {
    const grouped = type === 'confirm' ? groupedConfirm : groupedReview;
    const setter = type === 'confirm' ? setSelectedConfirm : setSelectedReview;
    const next: Record<string, boolean> = {};
    grouped.forEach(({ base }) => {
      const key = groupKey(base);
      const tpl = resolveTemplateForItem(base);
      if (type === 'confirm') {
        next[key] = value;
      } else if (tpl) {
        next[key] = value;
      }
    });
    setter(next);
  };

  const toggleOne = (type: 'confirm' | 'review', key: string) => {
    const setter = type === 'confirm' ? setSelectedConfirm : setSelectedReview;
    const state = type === 'confirm' ? selectedConfirm : selectedReview;
    setter({ ...state, [key]: !state[key] });
  };

  const handleConfirmSelected = async () => {
    if (!window.musinsaLogin?.confirmOrders) {
      log('구매확정 IPC가 준비되지 않았습니다.');
      return;
    }
    const selectedGroups = new Set(Object.keys(selectedConfirm).filter((k) => selectedConfirm[k]));
    const payload = (reviewData?.confirmTargets ?? [])
      .filter((item) => selectedGroups.has(groupKey(item)))
      .map((item) => ({
        orderNo: item.orderNo,
        orderOptionNo: item.orderOptionNo,
      }));
    if (payload.length === 0) {
      log('구매확정 요청할 항목이 없습니다. 체크 상태를 확인하세요.');
      return;
    }
    setConfirming(true);
    log(`구매확정 ${payload.length}건 처리 시작`);
    setProgress({ mode: 'confirm', total: payload.length, done: 0, label: '구매확정', status: 'active' });
    const aggregated: any[] = [];
    try {
      for (const item of payload) {
        try {
          const res = await window.musinsaLogin.confirmOrders([item]);
          if (res?.ok && Array.isArray(res.results)) {
            aggregated.push(...res.results);
          } else {
            aggregated.push({ ok: false, ...item, reason: res?.reason || 'unknown' });
          }
        } catch (e) {
          aggregated.push({ ok: false, ...item, reason: e instanceof Error ? e.message : 'confirm_error' });
        } finally {
          bumpProgress();
        }
      }
      const failed = aggregated.filter((r: any) => !r.ok);
      const succeeded = aggregated.filter((r: any) => r.ok);
      log(`구매확정 완료: 성공 ${succeeded.length}건, 실패 ${failed.length}건`);
      if (failed.length > 0) {
        failed.slice(0, 3).forEach((f: any) =>
          log(`실패 - ${f.orderNo}/${f.orderOptionNo}: ${f.reason || 'unknown'}`),
        );
      }
      if (reviewData) {
        const confirmedSet = new Set(succeeded.map((r: any) => `${r.orderNo}::${r.orderOptionNo}`));
        const next = {
          ...reviewData,
          confirmTargets: reviewData.confirmTargets.map((item) =>
            confirmedSet.has(`${item.orderNo}::${item.orderOptionNo}`)
              ? {
                  ...item,
                  confirmed: true,
                  orderConfirmDate:
                    succeeded.find(
                      (r: any) =>
                        `${r.orderNo}::${r.orderOptionNo}` === `${item.orderNo}::${item.orderOptionNo}`,
                    )?.confirmedAt ?? item.orderConfirmDate,
                }
              : item,
          ),
        };
        setReviewData(next);
        setSelectedConfirm({});
        await handleFetch();
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '구매확정 처리 실패';
      log(message);
    } finally {
      const failedFinal = aggregated.filter((r: any) => !r.ok);
      const succeededFinal = aggregated.filter((r: any) => r.ok);
      setProgress({
        mode: 'confirm',
        total: payload.length,
        done: payload.length,
        label: '구매확정',
        status: 'done',
        summary: `구매확정 완료 · 성공 ${succeededFinal.length}건 / 실패 ${failedFinal.length}건`,
      });
      setConfirming(false);
    }
  };

  const handleReviewSelected = async () => {
    if (!window.musinsaLogin?.writeReviewsDom) {
      log('후기 작성 IPC가 준비되지 않았습니다.');
      return;
    }
    const selectedGroups = new Set(Object.keys(selectedReview).filter((k) => selectedReview[k]));
    const targets = (reviewData?.reviewTargets ?? []).filter((item) => selectedGroups.has(groupKey(item)));
    if (targets.length === 0) {
      log('후기 작성 대상이 없습니다. 체크 상태를 확인하세요.');
      return;
    }
    const payload: any[] = [];
    for (const item of targets) {
      const tplResolved = resolveTemplateForItem(item);
      if (!tplResolved) {
        log(`템플릿 없음: ${item.goodsName} (${item.goodsOptionName ?? ''})`);
        continue;
      }
      const tpl = tplResolved.template;
      payload.push({
        orderNo: item.orderNo,
        orderOptionNo: item.orderOptionNo,
        goodsNo: item.goodsNo,
        productKey: tplResolved.key,
        template: {
          product_type: tpl.product_type ?? '의류',
          gender: tpl.gender,
          height: tpl.height,
          weight: tpl.weight,
          general_content: tpl.general_content,
          general_image_path: tpl.general_image_path,
          style_content: tpl.style_content,
          style_image_path: tpl.style_image_path,
        },
      });
    }
    if (payload.length === 0) {
      log('템플릿이 없는 항목은 건너뜁니다.');
      return;
    }
    log(`후기 작성 ${payload.length}건 처리 시작`);
    setProgress({ mode: 'review', total: payload.length, done: 0, label: '후기작성', status: 'active' });
    const aggregated: any[] = [];
    try {
      for (const item of payload) {
        try {
          const res = await window.musinsaLogin.writeReviewsDom([item]);
          if (res?.ok && Array.isArray(res.results)) {
            aggregated.push(...res.results);
          } else {
            aggregated.push({ ok: false, ...item, reason: res?.reason || 'unknown' });
          }
        } catch (e) {
          aggregated.push({ ok: false, ...item, reason: e instanceof Error ? e.message : 'review_error' });
        } finally {
          bumpProgress();
        }
      }
      const failed = aggregated.filter((r: any) => !r.ok);
      const succeeded = aggregated.filter((r: any) => r.ok);
      log(`후기 작성 완료: 성공 ${succeeded.length}건, 실패 ${failed.length}건`);
      if (failed.length > 0) {
        failed.slice(0, 5).forEach((f: any) => {
          const baseMsg = `실패 - ${f.orderNo}/${f.orderOptionNo}:`;
          const reasons: string[] = [];
          if (f.reason) reasons.push(f.reason);
          if (f.general && f.general.ok === false) reasons.push(`일반:${f.general.reason || 'unknown'}`);
          if (f.style && f.style.ok === false) reasons.push(`스타일:${f.style.reason || 'unknown'}`);
          log(`${baseMsg} ${reasons.join(' / ') || 'unknown'}`);
        });
      }
      setSelectedReview({});
      await handleFetch();
    } catch (e) {
      const message = e instanceof Error ? e.message : '후기 작성 처리 실패';
      log(message);
    } finally {
      const failedFinal = aggregated.filter((r: any) => !r.ok);
      const succeededFinal = aggregated.filter((r: any) => r.ok);
      setProgress({
        mode: 'review',
        total: payload.length,
        done: payload.length,
        label: '후기작성',
        status: 'done',
        summary: `후기 작성 완료 · 성공 ${succeededFinal.length}건 / 실패 ${failedFinal.length}건`,
      });
      try {
        await window.musinsaLogin?.closeReviewWindow?.();
      } catch {
        /* ignore */
      }
    }
  };

  const renderList = (
    items: { base: MusinsaOrderItem; count: number }[],
    type: 'confirm' | 'review',
    actionLabel: string,
  ) => {
    if (!items.length) {
      return <p className="text-sm text-gray-500">대상이 없습니다.</p>;
    }
    const selections = type === 'confirm' ? selectedConfirm : selectedReview;
    const selectableItems =
      type === 'confirm' ? items : items.filter(({ base }) => Boolean(resolveTemplateForItem(base)));
    const allSelected =
      selectableItems.length > 0 &&
      selectableItems.every(({ base }) => selections[groupKey(base)]);
    const hasSelected =
      type === 'confirm'
        ? Object.keys(selectedConfirm).some((k) => selectedConfirm[k])
        : selectableItems.some(({ base }) => selectedReview[groupKey(base)]);

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleAll(type, !allSelected)}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
            <button
              onClick={() => {
                if (type === 'confirm') {
                  handleConfirmSelected();
                } else {
                  handleReviewSelected();
                }
              }}
              disabled={
                type === 'confirm'
                  ? confirming || reviewLoading || !hasSelected || working
                  : !hasSelected || working
              }
              className="rounded-lg bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-gray-900"
            >
              {type === 'confirm' && confirming ? '구매확정 중...' : actionLabel}
            </button>
          </div>
          <span className="text-xs text-gray-600">총 {items.length}개</span>
        </div>
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {items.map(({ base, count }) => {
            const key = groupKey(base);
            const checked = !!selections[key];
            const templateExists = !!resolveTemplateForItem(base);
            return (
              <div
                key={key}
                className="flex items-start gap-3 rounded-xl border border-gray-100 bg-white px-3 py-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                  checked={checked}
                  disabled={type === 'review' && !templateExists}
                  onChange={() => {
                    if (type === 'review' && !templateExists) return;
                    toggleOne(type, key);
                  }}
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-900">{base.goodsName}</p>
                      <p className="text-xs text-gray-600">{base.brandName ?? base.brand ?? '-'}</p>
                    </div>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold text-gray-700">
                      수량 {count}개
                    </span>
                    {type === 'review' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openTemplateModal(base);
                        }}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          templateExists
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-green-500 text-white hover:bg-green-600'
                        }`}
                      >
                        {templateExists ? '정보수정' : '정보작성'}
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
                    <span>주문일 {formatDate(base.orderDate)}</span>
                    <span>확정일 {formatDate(base.orderConfirmDate)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const templateModalNode =
    modalVisible &&
    createPortal(
      <div
        className={`fixed inset-0 z-[9999] flex items-center justify-center bg-black/55 px-4 modal-overlay-anim ${
          modalClosing ? 'opacity-0' : 'opacity-100'
        }`}
        style={{ animationDirection: modalClosing ? 'reverse' : 'normal' }}
      >
        <div
          className={`w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl modal-card-anim ${
            modalClosing ? 'opacity-0 translate-y-2 scale-95' : 'opacity-100'
          }`}
          style={{ animationDirection: modalClosing ? 'reverse' : 'normal' }}
        >
          <div className={`space-y-4 ${modalInvalid ? 'shake-soft' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {templateModal.item?.brandName} / {templateModal.item?.goodsName}
                </p>
                <p className="text-xs text-gray-500">옵션: {templateModal.item?.goodsOptionName}</p>
              </div>
              <button
                onClick={() => {
                  setTemplateModal({ open: false, key: null, item: null });
                  setTemplateDraft(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-800"
              >
                닫기
              </button>
            </div>

            {templateDraft ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-gray-700">카테고리</label>
                    <div className="mt-1">
                      <FancySelect
                        value={templateCategory}
                        onChange={(v) => {
                          const vv = v as '의류' | '신발' | '잡화';
                          setTemplateCategory(vv);
                          setTemplateDraft((prev) => (prev ? { ...prev, product_type: vv } : prev));
                        }}
                        options={[
                          { value: '의류', label: '의류' },
                          { value: '신발', label: '신발' },
                          { value: '잡화', label: '잡화' },
                        ]}
                        placeholder="카테고리 선택"
                      />
                    </div>
                  </div>
                </div>

                {templateCategory === '의류' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs font-semibold text-gray-700">성별</label>
                      <div className="mt-1">
                        <FancySelect
                          value={templateDraft.gender ?? '여성'}
                          onChange={(v) => setTemplateDraft((prev) => (prev ? { ...prev, gender: v } : prev))}
                          options={[
                            { value: '여성', label: '여성' },
                            { value: '남성', label: '남성' },
                          ]}
                          placeholder="성별 선택"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">키 (cm)</label>
                      <input
                        value={templateDraft.height ?? ''}
                        onChange={(e) => setTemplateDraft((prev) => (prev ? { ...prev, height: e.target.value } : prev))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="예: 172"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-700">몸무게 (kg)</label>
                      <input
                        value={templateDraft.weight ?? ''}
                        onChange={(e) => setTemplateDraft((prev) => (prev ? { ...prev, weight: e.target.value } : prev))}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="예: 65"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-lg border border-gray-100 p-3">
                    <p className="text-sm font-semibold text-gray-800">일반 후기 내용</p>
                    {(() => {
                      const generalCount = countValidChars(templateDraft.general_content || '');
                      const generalCountClass = generalCount < 20 ? 'text-red-500' : 'text-blue-600';
                      return (
                        <>
                          <div className="relative">
                            <textarea
                              value={templateDraft.general_content ?? ''}
                              onChange={(e) =>
                                setTemplateDraft((prev) => (prev ? { ...prev, general_content: e.target.value } : prev))
                              }
                              rows={4}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-12 text-sm resize-none"
                            />
                            <span className={`absolute bottom-2 right-3 text-[11px] ${generalCountClass}`}>
                              {`${generalCount}/500`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={templateDraft.general_image_path ?? ''}
                              onChange={(e) =>
                                setTemplateDraft((prev) => (prev ? { ...prev, general_image_path: e.target.value } : prev))
                              }
                              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                              placeholder="이미지 경로"
                            />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id="general-image-input"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  // @ts-ignore
                                  const filePath = (file as any).path || file.name;
                                  setTemplateDraft((prev) => (prev ? { ...prev, general_image_path: filePath } : prev));
                                }
                              }}
                            />
                            <label
                              htmlFor="general-image-input"
                              className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              찾기
                            </label>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="space-y-3 rounded-lg border border-gray-100 p-3">
                    <p className="text-sm font-semibold text-gray-800">스타일 후기 내용</p>
                    {(() => {
                      const styleCount = countValidChars(templateDraft.style_content || '');
                      const styleCountClass = styleCount < 20 ? 'text-red-500' : 'text-blue-600';
                      return (
                        <>
                          <div className="relative">
                            <textarea
                              value={templateDraft.style_content ?? ''}
                              onChange={(e) =>
                                setTemplateDraft((prev) => (prev ? { ...prev, style_content: e.target.value } : prev))
                              }
                              rows={4}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-12 text-sm resize-none"
                            />
                            <span className={`absolute bottom-2 right-3 text-[11px] ${styleCountClass}`}>
                              {`${styleCount}/500`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={templateDraft.style_image_path ?? ''}
                              onChange={(e) =>
                                setTemplateDraft((prev) => (prev ? { ...prev, style_image_path: e.target.value } : prev))
                              }
                              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                              placeholder="이미지 경로"
                            />
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id="style-image-input"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  // @ts-ignore
                                  const filePath = (file as any).path || file.name;
                                  setTemplateDraft((prev) => (prev ? { ...prev, style_image_path: filePath } : prev));
                                }
                              }}
                            />
                            <label
                              htmlFor="style-image-input"
                              className="shrink-0 cursor-pointer whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              찾기
                            </label>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => {
                      setTemplateModal({ open: false, key: null, item: null });
                      setTemplateDraft(null);
                    }}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    disabled={templateSaving}
                  >
                    취소
                  </button>
                  <button
                    onClick={saveTemplate}
                    disabled={templateSaving}
                    className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white shadow hover:bg-gray-900 disabled:opacity-60"
                  >
                    {templateSaving ? '저장 중...' : '정보 저장'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">정보를 불러오지 못했습니다.</div>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );

  const toastNode =
    toast &&
    createPortal(
      <div
        className={`fixed top-4 right-4 z-[10000] flex max-w-sm items-start gap-3 rounded-xl bg-gray-900/95 px-4 py-3 text-sm text-white shadow-2xl shadow-black/30 ring-1 ring-white/10 ${
          toast.leaving ? 'toast-leave' : 'toast-enter'
        }`}
      >
        <div className="mt-1 h-2 w-2 rounded-full bg-red-400" />
        <div className="flex-1 whitespace-pre-line">{toast.message}</div>
      </div>,
      document.body,
    );

  return (
    <>
      <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">자동 후기작성</h1>
            <p className="text-sm text-gray-500">
              주문 데이터를 가져온 뒤 구매확정,후기작성을 자동화 처리 합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleFetch}
              disabled={reviewLoading || working}
              className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-0.5 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Sparkles size={16} />
              {reviewLoading ? '불러오는 중...' : '주문 데이터 가져오기'}
            </button>
          </div>
        </div>
        {reviewError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{reviewError}</div>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-5 shadow-lg ring-1 ring-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <Activity size={18} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-300">실시간 진행</p>
                <p className="text-lg font-semibold text-white">
                  {progress
                    ? progress.status === 'done'
                      ? progress.summary || `${progress.label} 완료`
                      : `${progress.label} 진행 중`
                    : reviewLoading
                      ? '데이터 동기화 중'
                      : '아직 실행 이력이 없습니다.'}
                </p>
              </div>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                progress
                  ? 'bg-white/10 text-white'
                  : reviewLoading
                    ? 'bg-white/10 text-white/80'
                    : 'bg-white/10 text-white/70'
              }`}
            >
              {progress
                ? progress.status === 'done'
                  ? '완료'
                  : progress.mode === 'review'
                    ? '후기작성'
                    : '구매확정'
                : reviewLoading
                  ? '동기화'
                  : '대기'}
            </span>
          </div>

          <div className="mt-4 rounded-xl bg-white/10 p-3 shadow-inner">
            <div className="flex items-center justify-between text-[12px] text-white/80">
              <span>
                {progress
                  ? progress.status === 'done'
                    ? `${progress.total}건 완료`
                    : `${progress.done}/${progress.total} 건 작업 중`
                  : reviewLoading
                    ? '무신사 데이터 새로고침 중'
                    : '준비 완료'}
              </span>
              <span>{progressPercent}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white/20">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900 p-4 shadow-lg ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
              <FileText size={16} className="text-white" />
            </div>
            <p className="text-sm font-semibold text-white">작업 로그</p>
          </div>
          <div className="mt-3 h-28 overflow-y-auto rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-100">
            {logLines.length === 0 ? (
              <p className="text-white/60">로그가 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {logLines.map((line, idx) => (
                  <li key={`${line}-${idx}`}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {reviewData && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">구매 확정 대상</h3>
              <span className="text-sm text-gray-600">{groupedConfirm.length}개</span>
            </div>
            {renderList(groupedConfirm, 'confirm', '구매 확정')}
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white/70 p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">후기 작성 대상</h3>
              <span className="text-sm text-gray-600">{groupedReview.length}개</span>
            </div>
            {renderList(groupedReview, 'review', '후기 작성')}
          </div>
        </div>
      )}
      </div>
      {templateModalNode}
      {toastNode}
    </>
  );
};

const PriceTrackingView = ({ session, activeMenu }: { session: AuthSession; activeMenu: string }) => {
  const [showTokenGuide, setShowTokenGuide] = useState(false);
  const { token, chatId, setToken, setChatId, save, loading, saving, error, hasSaved } = useTelegramToken({
    userId: session?.userId,
    loginId: session?.loginId,
  });
  const [showLogs, setShowLogs] = useState(false);
  const [logsMonth, setLogsMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsData, setLogsData] = useState<{
    dates: string[];
    products: string[];
    priceMap: Record<string, number | undefined>;
  }>({ dates: [], products: [], priceMap: {} });
  const [showCalendar, setShowCalendar] = useState(false);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  type PriceItem = {
    id?: number;
    goodsNo?: string;
    goodsUrl: string;
    brandName?: string;
    goodsName?: string;
    thumbnailUrl?: string;
    normalPrice?: number;
    salePrice?: number;
    gradeDiscount?: number;
    lastPrice?: number;
    couponName?: string;
    couponAmount?: number;
    pointSpend?: number;
    prePointDiscount?: number;
    targetPrice?: number | null;
    enabled?: boolean;
    calcParams?: {
      basePrice: number;
      gradeDiscount: number;
      allowPoint: boolean;
      maxPointRate: number;
      isPrePoint: boolean;
      prePointRate: number;
      memberPoint: number;
    };
  };

  const darkCard =
    'rounded-2xl border border-slate-800 bg-slate-900 text-white p-6 shadow-lg shadow-slate-900/40 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl';

  const [productUrl, setProductUrl] = useState('');
  const [items, setItems] = useState<PriceItem[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [chatIdLoading, setChatIdLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [selectedAll, setSelectedAll] = useState(false);
  const [selectedMap, setSelectedMap] = useState<Record<string, boolean>>({});
  const [trackingLog, setTrackingLog] = useState<string | null>(null);
  const trackingTimer = useRef<NodeJS.Timeout | null>(null);
  const trackingTargetsRef = useRef<PriceItem[]>([]);
  const [trackingBusy, setTrackingBusy] = useState(false);
  const itemsRef = useRef<PriceItem[]>([]);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [availPoint, setAvailPoint] = useState<number | null>(null);
  const [assumeMaxPoint, setAssumeMaxPoint] = useState(() => {
    const stored = localStorage.getItem('mm_assume_max_point');
    return stored === 'true';
  });
  const [couponTooltip, setCouponTooltip] = useState<string | null>(null);
  const [priceToast, setPriceToast] = useState<{ message: string; key: number; leaving: boolean } | null>(null);

  const tokenDisabled = loading || saving;
  const hasCredentials = hasSaved && !!token && !!chatId;

  useEffect(() => {
    const close = () => setCouponTooltip(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    localStorage.setItem('mm_assume_max_point', assumeMaxPoint ? 'true' : 'false');
  }, [assumeMaxPoint]);

  const showPriceToast = (message: string) => {
    const key = Date.now();
    setPriceToast({ message, key, leaving: false });
    setTimeout(() => {
      setPriceToast((prev) => (prev && prev.key === key ? { ...prev, leaving: true } : prev));
    }, 2400);
    setTimeout(() => {
      setPriceToast((prev) => (prev && prev.key === key ? null : prev));
    }, 2600);
  };

  useEffect(() => {
    if (!showCalendar) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar]);

  useEffect(() => {
    let cancelled = false;
    const fetchSupabaseUser = async () => {
      if (!isSupabaseConfigured || !supabase) return;
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (!sessionError) {
          const uid = data?.session?.user?.id;
          if (uid && !cancelled) setSupabaseUserId(uid);
        }
      } catch {
        // ignore
      }
    };
    fetchSupabaseUser();
    return () => {
      cancelled = true;
    };
  }, []);
  const parseGoodsNo = (url: string) => {
    const match = url.match(/\/(\d+)(?:[/?]|$)/);
    return match ? match[1] : '';
  };

  const fetchPointSummary = useCallback(async () => {
    if (!window.musinsaLogin?.fetchPointSummary) return;
    try {
      const res = await window.musinsaLogin.fetchPointSummary();
      if (res?.ok && res.summary) {
        const ap = Number(res.summary.availPoint ?? res.summary.totalPoint ?? 0);
        if (Number.isFinite(ap)) setAvailPoint(ap);
      }
    } catch (e) {
      console.warn('[point] fetch failed', e);
    }
  }, []);

  const normalizeThumb = (thumb?: string | null) => {
    if (!thumb) return '';
    if (/^https?:\/\//i.test(thumb)) return thumb;
    if (thumb.startsWith('//')) return `https:${thumb}`;
    if (thumb.startsWith('/')) return `https://image.msscdn.net${thumb}`;
    return thumb;
  };

  const calcMaxBenefitPrice = (
    data: any,
    opts?: { availPoint?: number; forceMaxPoint?: boolean },
  ): { price: number; pointSpend: number; prePointDiscount: number; gradeDiscount: number; params: PriceItem['calcParams'] } => {
    const goodsPrice = data?.goodsPrice || {};
    const couponAllowed = !!goodsPrice?.couponDiscount;
    const base =
      (couponAllowed ? goodsPrice?.couponPrice : null) ??
      goodsPrice?.salePrice ??
      goodsPrice?.price ??
      goodsPrice?.normalPrice ??
      0;

    // 등급 할인은 isLimitedDc 가 false 일 때만 적용
    const gradeRate = !data?.isLimitedDc ? Number(goodsPrice?.memberDiscountRate) || 0 : 0;
    const gradeDiscountRaw = gradeRate > 0 ? base * (gradeRate / 100) : 0;
    const gradeDiscount = gradeDiscountRaw > 0 ? Math.floor(gradeDiscountRaw / 10) * 10 : 0;
    const afterGrade = base - gradeDiscount;

    // 적립금 사용 가능 여부와 한도 (상품별 최대 사용률, 보유 포인트)
    const allowPoint = !data?.isRestictedUsePoint && !data?.isLimitedPoint;
    const maxPointRate = Number(data?.maxUsePointRate) || 0;
    const maxPointUsable = allowPoint ? Math.floor(afterGrade * maxPointRate) : 0;
    const availPoint = Number(opts?.availPoint ?? data?.point?.memberPoint ?? 0);
    // 최대 적립금 보기 옵션(forceMaxPoint) 시 보유 적립금과 무관하게 상품별 최대 사용 가능 적립금(7% 등)을 적용
    const pointBudget = opts?.forceMaxPoint ? maxPointUsable : availPoint;
    const pointSpend = allowPoint ? Math.min(pointBudget, maxPointUsable) : 0;
    const afterPoint = afterGrade - pointSpend;

    // 선할인 가능(isPrePoint) 시 적립 예정 포인트(memberSavePointRate)를 추가 할인으로 적용
    const prePointRate = data?.isPrePoint ? Number(goodsPrice?.memberSavePointRate) || 0 : 0;
    const prePointRaw = prePointRate > 0 ? afterPoint * (prePointRate / 100) : 0;
    // 적립금 선할인은 10원 단위로 절사(반내림)
    const prePointDiscount = prePointRaw > 0 ? Math.floor(prePointRaw / 10) * 10 : 0;

    const finalPrice = Math.max(0, Math.round(afterPoint - prePointDiscount));
    const params: PriceItem['calcParams'] = {
      basePrice: base,
      gradeDiscount,
      allowPoint,
      maxPointRate,
      isPrePoint: !!data?.isPrePoint,
      prePointRate,
      memberPoint: Number(data?.point?.memberPoint ?? 0),
    };
    return { price: finalPrice, pointSpend, prePointDiscount, gradeDiscount, params };
  };

  const fetchProductStateFallback = async (goodsNo: string) => {
    const extractState = (html: string) => {
      const patterns = [
        /window\.__MSS_FE__\.product\.state\s*=\s*(\{[\s\S]*?\});/,
        /window\.__MSS__\.product\.state\s*=\s*(\{[\s\S]*?\});/,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m?.[1]) {
          try {
            return JSON.parse(m[1].replace(/;$/, ''));
          } catch {
            // keep trying other patterns
          }
        }
      }
      const nextMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (nextMatch?.[1]) {
        try {
          const nextData = JSON.parse(nextMatch[1]);
          return nextData?.props?.pageProps?.meta?.data || null;
        } catch {
          return null;
        }
      }
      return null;
    };

    try {
      const res = await fetch(`https://www.musinsa.com/products/${goodsNo}`, {
        credentials: 'include',
        headers: { accept: 'text/html' },
      });
      if (!res.ok) return null;
      const html = await res.text();
      return extractState(html);
    } catch {
      return null;
    }
  };

  const fetchCouponInfo = async (goodsNo: string, brand: string, comId: string, salePrice: number) => {
    try {
      if (window.musinsaLogin?.fetchCoupons) {
        const res = await window.musinsaLogin.fetchCoupons({ goodsNo, brand, comId, salePrice });
        if (res?.ok) {
          const first = res.data?.list?.[0];
          if (first) {
            return { name: first.couponName || '', amount: Number(first.salePrice) || 0 };
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const fetchGoodsMeta = async (goodsNo: string, opts?: { availPoint?: number; forceMaxPoint?: boolean }) => {
    // 반드시 무신사 보조 윈도우 세션을 통해 요청 (CORS 회피)
    if (!window.musinsaLogin?.fetchGoodsDetail) {
      throw new Error('무신사 창이 준비되지 않았습니다. 앱을 재시작하거나 무신사 로그인 창을 열어주세요.');
    }
    const res = await window.musinsaLogin.fetchGoodsDetail({ goodsNo });
    if (!res?.ok || !res.data) {
      throw new Error(res?.reason || '상품 정보를 불러올 수 없습니다.');
    }
    let data = res.data;
    if (!data.point?.memberPoint && window.musinsaLogin?.fetchProductPageState) {
      const fallback = await window.musinsaLogin.fetchProductPageState({ goodsNo });
      if (fallback?.ok && fallback.state) {
        data = {
          ...data,
          ...fallback.state,
          goodsPrice: fallback.state.goodsPrice || data.goodsPrice || {},
          point: fallback.state.point || data.point || {},
        };
      }
    }
    const brand = data.brand || data.brandInfo?.brand || '';
    const comId = data.comId || '';
    const salePrice =
      data.goodsPrice?.salePrice || data.goodsPrice?.normalPrice || data.goodsPrice?.price || data.goodsPrice?.couponPrice || 0;
    const couponInfo = await fetchCouponInfo(goodsNo, brand, comId, salePrice);
    const goodsPricePatched =
      couponInfo && salePrice
        ? {
            ...data.goodsPrice,
            couponDiscount: true,
            couponPrice: Math.max(0, salePrice - couponInfo.amount),
          }
        : data.goodsPrice;

    const mapped = await mapGoodsData(goodsNo, { ...data, goodsPrice: goodsPricePatched }, opts);
    if (couponInfo) {
      mapped.couponName = couponInfo.name;
      mapped.couponAmount = couponInfo.amount;
    }
    return mapped;
  };

  const mapGoodsData = (goodsNo: string, data: any, opts?: { availPoint?: number; forceMaxPoint?: boolean }) => {
    const goodsPrice = data.goodsPrice || {};
    const couponAllowed = !!goodsPrice?.couponDiscount;
    const basePrice =
      (couponAllowed ? goodsPrice?.couponPrice : null) ??
      goodsPrice?.salePrice ??
      goodsPrice?.price ??
      goodsPrice?.normalPrice ??
      0;
    const maxBenefit = calcMaxBenefitPrice(data, opts);
    return {
      goodsNo,
      brandName: data.brandInfo?.brandName || data.brand || '',
      goodsName: data.goodsNm || '',
      thumbnailUrl: normalizeThumb(data.thumbnailImageUrl),
      normalPrice: goodsPrice?.normalPrice ?? undefined,
      salePrice: goodsPrice?.salePrice ?? undefined,
      gradeDiscount: maxBenefit.gradeDiscount,
      couponName: '',
      couponAmount: 0,
      pointSpend: maxBenefit.pointSpend,
      prePointDiscount: maxBenefit.prePointDiscount,
      lastPrice: maxBenefit.price || basePrice || 0,
      calcParams: maxBenefit.params,
    };
  };

  const loadItems = useCallback(async () => {
    if (!supabaseUserId) return;
    if (!isSupabaseConfigured || !supabase) return;
    setTableLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('price_tracking_items')
        .select('*')
        .eq('user_id', supabaseUserId)
        .order('created_at', { ascending: false });
      if (fetchError) throw new Error(fetchError.message);
          const mapped =
            data?.map((row: any) => ({
              id: row.id,
              goodsNo: row.goods_no ?? '',
              goodsUrl: row.goods_url,
              brandName: row.brand_name ?? '',
              goodsName: row.goods_name ?? '',
              thumbnailUrl: row.thumbnail_url ?? '',
              normalPrice: row.normal_price ?? undefined,
              salePrice: row.sale_price ?? undefined,
              gradeDiscount: undefined,
              lastPrice: row.last_price ?? undefined,
              couponName: row.coupon_name ?? '',
              couponAmount: row.coupon_amount ?? undefined,
              pointSpend: row.point_spend ?? undefined,
              prePointDiscount: row.pre_point_discount ?? undefined,
              targetPrice: row.target_price ?? null,
              enabled: row.enabled ?? true,
              calcParams: undefined,
            })) || [];
      setItems(mapped);
    } catch (e) {
      console.warn('[price-tracking] load error', e);
    } finally {
      setTableLoading(false);
    }
  }, [supabaseUserId]);

  useEffect(() => {
    loadItems();
    fetchPointSummary();
  }, [loadItems, fetchPointSummary]);

  useEffect(() => {
    // 새로 로드된 목록에 따라 전체 선택 상태 동기화
    itemsRef.current = items;
    if (items.length === 0) {
      if (selectedAll) setSelectedAll(false);
      if (Object.keys(selectedMap).length > 0) setSelectedMap({});
      return;
    }
    const allSelected = items.every((item) => selectedMap[item.goodsUrl]);
    if (allSelected !== selectedAll) {
      setSelectedAll(allSelected);
    }
  }, [items, selectedMap, selectedAll]);

  const handleAdd = async () => {
    setAddError(null);
    const url = productUrl.trim();
    const goodsNo = parseGoodsNo(url);
    if (!url || !goodsNo) {
      setAddError('올바른 무신사 상품 URL을 입력해주세요.');
      return;
    }
    setAdding(true);
    try {
      const meta = await fetchGoodsMeta(goodsNo, { availPoint: assumeMaxPoint ? undefined : availPoint ?? undefined, forceMaxPoint: assumeMaxPoint });
      const newItem = {
        goodsNo,
        goodsUrl: url,
        brandName: meta.brandName,
        goodsName: meta.goodsName,
        thumbnailUrl: meta.thumbnailUrl,
        couponName: meta.couponName,
        couponAmount: meta.couponAmount,
        pointSpend: meta.pointSpend,
        prePointDiscount: meta.prePointDiscount,
        normalPrice: meta.normalPrice,
        salePrice: meta.salePrice,
        gradeDiscount: meta.gradeDiscount,
        lastPrice: meta.lastPrice,
        targetPrice: null,
        enabled: true,
        calcParams: meta.calcParams,
      };

      if (isSupabaseConfigured && supabase && supabaseUserId) {
        const { error: upsertError, data } = await supabase
                  .from('price_tracking_items')
                  .upsert(
                    {
                      user_id: supabaseUserId,
                      goods_no: goodsNo,
                      goods_url: url,
                      brand_name: newItem.brandName,
                      goods_name: newItem.goodsName,
                      thumbnail_url: newItem.thumbnailUrl,
                      last_price: newItem.lastPrice,
                      target_price: newItem.targetPrice,
                      enabled: true,
                      coupon_name: newItem.couponName,
                      coupon_amount: newItem.couponAmount,
                      point_spend: newItem.pointSpend,
                      pre_point_discount: newItem.prePointDiscount,
                    },
                    { onConflict: 'user_id,goods_url' },
                  )
          .select()
          .maybeSingle();
        if (upsertError) throw new Error(upsertError.message);
        if (data) {
          setItems((prev) => {
            const filtered = prev.filter((p) => p.goodsUrl !== url);
            return [{ ...newItem, id: data.id }, ...filtered];
          });
        }
      } else {
        setItems((prev) => {
          const filtered = prev.filter((p) => p.goodsUrl !== url);
          return [{ ...newItem, id: Date.now() }, ...filtered];
        });
      }
      setProductUrl('');
      setSelectedMap((prev) => ({ ...prev, [url]: true }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '상품을 추가하는 중 오류가 발생했습니다.';
      setAddError(msg);
    } finally {
      setAdding(false);
    }
  };

  const getKstDateString = () => {
    const now = Date.now();
    const kst = new Date(now + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
  };

  const recordPriceLog = useCallback(
    async (meta: PriceItem & { goodsNo?: string; lastPrice?: number }) => {
      if (!isSupabaseConfigured || !supabase || !supabaseUserId) return;
      if (!meta.goodsNo || meta.lastPrice == null) return;
      const logDate = getKstDateString();
      try {
        await supabase
          .from('price_tracking_logs')
          .upsert(
            {
              user_id: supabaseUserId,
              goods_no: meta.goodsNo,
              goods_name: meta.goodsName,
              brand_name: meta.brandName,
              thumbnail_url: meta.thumbnailUrl,
              log_date: logDate,
              max_benefit: meta.lastPrice,
            },
            { onConflict: 'user_id,goods_no,log_date', ignoreDuplicates: true },
          );
      } catch (e) {
        console.warn('[price-log] upsert error', e);
      }
    },
    [supabaseUserId],
  );

  const updateTargetPrice = async (id: number | undefined, goodsUrl: string, targetPrice: number | null) => {
    setItems((prev) => prev.map((p) => (p.goodsUrl === goodsUrl ? { ...p, targetPrice } : p)));
    if (!id || !isSupabaseConfigured || !supabase || !supabaseUserId) return;
    try {
      await supabase
        .from('price_tracking_items')
        .update({ target_price: targetPrice })
        .eq('id', id)
        .eq('user_id', supabaseUserId);
    } catch (e) {
      console.warn('[price-tracking] target price update error', e);
    }
  };

  const toggleSelectAll = () => {
    setSelectedAll((prev) => {
      const next = !prev;
      if (next) {
        const map: Record<string, boolean> = {};
        items.forEach((item) => {
          map[item.goodsUrl] = true;
        });
        setSelectedMap(map);
      } else {
        setSelectedMap({});
      }
      return next;
    });
  };

  const toggleSelectOne = (goodsUrl: string) => {
    setSelectedMap((prev) => {
      const next = { ...prev, [goodsUrl]: !prev[goodsUrl] };
      const allSelected = items.length > 0 && items.every((item) => next[item.goodsUrl]);
      setSelectedAll(allSelected);
      return next;
    });
  };

  const refreshAllPrices = useCallback(
    async (opts?: { withPoints?: boolean }) => {
      const source = itemsRef.current;
      if (!source || source.length === 0) return;
      if (opts?.withPoints) {
        await fetchPointSummary();
      }
      setTableLoading(true);
      try {
        const updated: PriceItem[] = [];
        for (const item of source) {
          const goodsNo = item.goodsNo || parseGoodsNo(item.goodsUrl);
          if (!goodsNo) continue;
          try {
            const meta = await fetchGoodsMeta(goodsNo, {
              availPoint: assumeMaxPoint ? undefined : availPoint ?? undefined,
              forceMaxPoint: assumeMaxPoint,
            });
            updated.push({ ...item, ...meta });
            if (isSupabaseConfigured && supabaseUserId && item.id && supabase) {
              await supabase
                .from('price_tracking_items')
                .update({
              last_price: meta.lastPrice,
              last_checked_at: new Date().toISOString(),
              coupon_name: meta.couponName,
              coupon_amount: meta.couponAmount,
              point_spend: meta.pointSpend,
              pre_point_discount: meta.prePointDiscount,
            })
                .eq('id', item.id)
                .eq('user_id', supabaseUserId);
            }
            await recordPriceLog({ ...item, ...meta });
          } catch (e) {
            console.warn('[price-tracking] refresh meta error', e);
          }
        }
        if (updated.length > 0) {
          setItems((prev) =>
            prev.map((p) => {
              const next = updated.find((u) => u.goodsUrl === p.goodsUrl);
              return next ? { ...p, ...next } : p;
            }),
          );
        }
      } finally {
        setTableLoading(false);
      }
    },
    [assumeMaxPoint, availPoint, supabaseUserId, fetchPointSummary],
  );

  const recomputeFromParams = useCallback(
    (overrideAssume?: boolean, overrideAvail?: number | null) => {
      const useAssume = typeof overrideAssume === 'boolean' ? overrideAssume : assumeMaxPoint;
      const useAvail = typeof overrideAvail === 'number' ? overrideAvail : availPoint;
      setItems((prev) =>
        prev.map((item) => {
          if (!item.calcParams) return item;
          const params = item.calcParams;
          const afterGrade = params.basePrice - (params.gradeDiscount || 0);
          const maxPointUsable = params.allowPoint ? Math.floor(afterGrade * params.maxPointRate) : 0;
          const avail = Number.isFinite(useAvail ?? undefined) ? Number(useAvail) : params.memberPoint ?? 0;
          const pointBudget = useAssume ? maxPointUsable : avail;
          const pointSpend = params.allowPoint ? Math.min(pointBudget, maxPointUsable) : 0;
          const afterPoint = afterGrade - pointSpend;
          const prePointRate = params.isPrePoint ? params.prePointRate : 0;
          const prePointRaw = prePointRate > 0 ? afterPoint * (prePointRate / 100) : 0;
          const prePointDiscount = prePointRaw > 0 ? Math.floor(prePointRaw / 10) * 10 : 0;
        const price = Math.max(0, Math.round(afterPoint - prePointDiscount));
          return {
            ...item,
            pointSpend,
            prePointDiscount,
            lastPrice: price,
            gradeDiscount: params.gradeDiscount,
          };
        }),
      );
    },
    [assumeMaxPoint, availPoint],
  );

  useEffect(() => {
    if (items.length === 0) return;
    recomputeFromParams();
  }, [assumeMaxPoint, availPoint, recomputeFromParams, items.length]);

  useEffect(() => {
    if (activeMenu === '상품 가격 추적') {
      fetchPointSummary();
      // 메뉴 진입 시에만 전체 새로고침 (토글 등으로 재호출되지 않도록 별도 분리)
      refreshAllPrices({ withPoints: true });
    }
    // refreshAllPrices는 의존성에서 제외해 토글 때 재호출되지 않도록 고정
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, fetchPointSummary]);

  const loadLogs = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !supabaseUserId) return;
    setLogsLoading(true);
    try {
      const start = new Date(Date.UTC(logsMonth.year, logsMonth.month, 1));
      const end = new Date(Date.UTC(logsMonth.year, logsMonth.month + 1, 0));
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('price_tracking_logs')
        .select('*')
        .eq('user_id', supabaseUserId)
        .gte('log_date', startStr)
        .lte('log_date', endStr)
        .order('log_date', { ascending: true });
      if (error) throw new Error(error.message);
      const products = Array.from(new Set((data || []).map((d) => d.goods_name || d.goods_no))).filter(Boolean) as string[];
      const dates: string[] = [];
      for (let d = 1; d <= end.getUTCDate(); d++) {
        dates.push(`${logsMonth.year}-${String(logsMonth.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
      const priceMap: Record<string, number | undefined> = {};
      (data || []).forEach((row: any) => {
        const key = `${row.log_date}::${row.goods_name || row.goods_no}`;
        if (priceMap[key] === undefined) {
          priceMap[key] = row.max_benefit ?? undefined;
        }
      });
      setLogsData({ dates, products, priceMap });
    } catch (e) {
      console.warn('[logs] fetch error', e);
    } finally {
      setLogsLoading(false);
    }
  }, [logsMonth, supabaseUserId]);

  useEffect(() => {
    if (showLogs) {
      loadLogs();
    }
  }, [showLogs, loadLogs]);

  const removeSelected = async () => {
    const targets = items.filter((item) => selectedMap[item.goodsUrl]);
    if (targets.length === 0) return;
    setItems((prev) => prev.filter((item) => !selectedMap[item.goodsUrl]));
    setSelectedMap({});
    setSelectedAll(false);
    if (!isSupabaseConfigured || !supabase || !supabaseUserId) return;
    try {
      const goodsUrls = targets.map((t) => t.goodsUrl);
      await supabase.from('price_tracking_items').delete().eq('user_id', supabaseUserId).in('goods_url', goodsUrls);
    } catch (e) {
      console.warn('[price-tracking] delete error', e);
    }
  };

  const selectedItems = items.filter((item) => selectedMap[item.goodsUrl]);
  const selectableTargetItems = selectedItems.filter((item) => typeof item.targetPrice === 'number');
  const invalidSelectionExists = selectedItems.some((item) => typeof item.targetPrice !== 'number');

  const handleToggleTracking = () => {
    if (tracking) {
      setTracking(false);
      setTrackingLog('추적이 중지되었습니다.');
      trackingTargetsRef.current = [];
      if (trackingTimer.current) {
        clearTimeout(trackingTimer.current);
        trackingTimer.current = null;
      }
      return;
    }
    if (selectableTargetItems.length === 0 || invalidSelectionExists) {
      showPriceToast('추적희망가를 입력하세요');
      return;
    }
    setAddError(null);
    trackingTargetsRef.current = selectableTargetItems;
    setTracking(true);
    setTrackingLog('추적을 시작합니다.');
    runTrackingOnce(selectableTargetItems);
    scheduleNextTick();
  };

  const scheduleNextTick = () => {
    if (trackingTimer.current) clearTimeout(trackingTimer.current);
    const delay = getDelayToNextHourKST();
    trackingTimer.current = setTimeout(async () => {
      await runTrackingOnce(trackingTargetsRef.current);
      scheduleNextTick();
    }, delay);
  };

  const getDelayToNextHourKST = () => {
    const now = Date.now();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kst = now + kstOffset;
    const date = new Date(kst);
    date.setMinutes(0, 0, 0);
    date.setHours(date.getHours() + 1); // 다음 정시
    const diff = date.getTime() - kst;
    return diff <= 0 ? 60 * 1000 : diff;
  };

  const sendTelegram = async (text: string, photoUrl?: string) => {
    if (!token) return;
    const chat = chatId || (import.meta as any).env?.VITE_TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_CHAT_ID || '';
    if (!chat) {
      console.warn('[telegram] chat id가 설정되어 있지 않아 전송을 건너뜁니다.');
      return;
    }
    try {
      if (photoUrl) {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, photo: photoUrl, caption: text, parse_mode: 'Markdown' }),
        });
        if (!res.ok) throw new Error('sendPhoto failed');
      } else {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, text }),
        });
      }
    } catch (e) {
      console.warn('[telegram] send error', e);
      // photo 실패 시 텍스트만 재시도
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chat, text }),
        });
      } catch {
        // ignore
      }
    }
  };

  const runTrackingOnce = async (targets: PriceItem[]) => {
    if (!targets || targets.length === 0) return;
    if (trackingBusy) return;
    setTrackingBusy(true);
    try {
      const updated: PriceItem[] = [];
      for (const item of targets) {
        const goodsNo = item.goodsNo || parseGoodsNo(item.goodsUrl);
        if (!goodsNo) continue;
        try {
          const meta = await fetchGoodsMeta(goodsNo, { availPoint: assumeMaxPoint ? undefined : availPoint ?? undefined, forceMaxPoint: assumeMaxPoint });
          const price = typeof meta.lastPrice === 'number' ? meta.lastPrice : 0;
          const shouldNotify =
            typeof item.targetPrice === 'number' && Number.isFinite(item.targetPrice) && price <= (item.targetPrice as number);
          if (shouldNotify) {
            const photo = meta.thumbnailUrl || item.thumbnailUrl;
            sendTelegram(
              `[가격알림] ${meta.brandName || ''} ${meta.goodsName || goodsNo}\n현재가: ${formatMoney(price)}원\n희망가: ${formatMoney(item.targetPrice)}원`,
              photo,
            );
          }
          updated.push({ ...item, ...meta, lastPrice: price });

          if (isSupabaseConfigured && supabase && supabaseUserId && item.id) {
            await supabase
              .from('price_tracking_items')
              .update({
                last_price: price,
                last_checked_at: new Date().toISOString(),
                coupon_name: meta.couponName,
                coupon_amount: meta.couponAmount,
                point_spend: meta.pointSpend,
                pre_point_discount: meta.prePointDiscount,
              })
              .eq('id', item.id)
              .eq('user_id', supabaseUserId);
          }
          await recordPriceLog({ ...item, ...meta, lastPrice: price });
        } catch (e) {
          console.warn('[price-tracking] fetch error', e);
        }
      }
      if (updated.length > 0) {
        setItems((prev) =>
          prev.map((p) => {
            const next = updated.find((u) => u.goodsUrl === p.goodsUrl);
            return next ? { ...p, ...next } : p;
          }),
        );
        const ts = new Date();
        const kst = new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        }).format(ts);
        setTrackingLog(`마지막 체크: ${kst} (총 ${updated.length}건)`);
      }
    } finally {
      setTrackingBusy(false);
    }
  };

  useEffect(() => {
    return () => {
      if (trackingTimer.current) clearTimeout(trackingTimer.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      {priceToast && (
        <div
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 transform transition-all duration-300 ${
            priceToast.leaving ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'
          }`}
        >
          <div className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-gray-900/50">
            {priceToast.message}
          </div>
        </div>
      )}
      <style>{`
        @keyframes tracking-blink {
          0% { background-color: #e0f2fe; }
          50% { background-color: #a5d8ff; color: #0f172a; }
          100% { background-color: #e0f2fe; }
        }
        .tracking-blink {
          animation: tracking-blink 3s ease-in-out infinite;
        }
        .tracking-blink td {
          animation: tracking-blink 3s ease-in-out infinite;
        }
        @keyframes fade-in-row {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in {
          animation: fade-in-row 0.25s ease-out;
        }
      `}</style>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-gray-900">상품 가격 추적</h1>
        <p className="text-sm text-gray-500">텔레그램 알림을 위해 토큰을 저장한 뒤 상품을 추가하세요.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className={darkCard}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Sparkles className="text-cyan-300" size={22} />
              <div>
                <h3 className="text-lg font-semibold text-white">텔레그램 토큰 입력</h3>
                <p className="text-sm text-slate-200/80">계정별로 한 번만 저장해두면 자동으로 불러옵니다.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowTokenGuide(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              <HelpCircle size={18} className="text-cyan-200" />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            <label className="text-xs font-semibold text-slate-200">텔레그램 봇 토큰</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="예: 123456789:ABCdefGhIJklmnOpQRstuVWxyz"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 transition focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
              disabled={tokenDisabled}
            />
            <label className="text-xs font-semibold text-slate-200">Chat ID</label>
            <div className="flex gap-2">
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="예: 123456789 (또는 @채널명)"
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 transition focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
                disabled={tokenDisabled}
              />
              <button
                type="button"
                onClick={async () => {
                  if (!token) {
                    setTokenStatus('토큰을 먼저 입력해주세요.');
                    return;
                  }
                  setTokenStatus(null);
                  setChatIdLoading(true);
                  try {
                    const res = await window.telegramHelper?.getChatId?.({ token });
                    if (res?.ok && res.chatId) {
                      setChatId(res.chatId);
                      setTokenStatus('채팅 ID를 자동으로 불러왔습니다.');
                    } else {
                      setTokenStatus('채팅 ID를 찾지 못했습니다. 봇에게 메시지를 먼저 보내주세요.');
                    }
                  } catch (e) {
                    setTokenStatus('채팅 ID를 불러오는 중 오류가 발생했습니다.');
                  } finally {
                    setChatIdLoading(false);
                  }
                }}
                disabled={tokenDisabled || chatIdLoading}
                className="whitespace-nowrap rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {chatIdLoading ? '불러오는 중...' : '자동 불러오기'}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setTokenStatus(null);
                  save();
                }}
                disabled={tokenDisabled}
                className="flex-1 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? '저장 중...' : hasSaved ? '다시 저장' : '저장'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setTokenStatus(null);
                  if (!token || !chatId) {
                    setTokenStatus('토큰과 Chat ID를 모두 입력 후 저장해주세요.');
                    return;
                  }
                  setTestSending(true);
                  try {
                    const res = await window.telegramHelper?.sendTestMessage?.({
                      token,
                      chatId,
                      text: '테스트 메시지 입니다!',
                    });
                    if (res?.ok) {
                      setTokenStatus('테스트 메시지를 보냈습니다.');
                    } else {
                      setTokenStatus(res?.reason || '테스트 발송에 실패했습니다.');
                    }
                  } catch (e) {
                    setTokenStatus('테스트 발송 중 오류가 발생했습니다.');
                  } finally {
                    setTestSending(false);
                  }
                }}
                disabled={!hasCredentials || saving || loading || testSending}
                className="whitespace-nowrap rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testSending ? '발송 중...' : '테스트 발송'}
              </button>
            </div>
            {error && <p className="text-xs font-semibold text-red-300">{error}</p>}
            {tokenStatus && !error && <p className="text-xs font-semibold text-cyan-200">{tokenStatus}</p>}
            {hasCredentials && !error && !tokenStatus && (
              <p className="text-xs text-green-200">토큰/Chat ID가 저장되었습니다. 자동으로 불러옵니다.</p>
            )}
          </div>
        </div>

        <div
          className={`${darkCard} ${
            hasCredentials ? '' : 'pointer-events-none opacity-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <TrendingUp className="text-cyan-300" size={22} />
            <div>
              <h3 className="text-lg font-semibold text-white">상품 추가</h3>
              <p className="text-sm text-slate-200/80">
                토큰 저장 후 상품을 추가하면 추적 목록에 표시됩니다.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <label className="text-xs font-semibold text-slate-200">상품 URL</label>
            <input
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://www.musinsa.com/products/5367607"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-400 transition focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/30"
              disabled={!hasCredentials || adding}
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!hasCredentials || !productUrl.trim() || adding}
              className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {adding ? '추가 중...' : '상품 추가'}
            </button>
            {addError && <p className="text-xs font-semibold text-red-300">{addError}</p>}
            <button
              type="button"
              onClick={() => setShowLogs(true)}
              className="w-full rounded-lg border border-cyan-300 px-4 py-3 text-base font-semibold text-cyan-100 transition hover:-translate-y-0.5 hover:bg-slate-800 hover:text-white"
            >
              날짜별 상품 추적 로그
            </button>
          </div>
        </div>
      </div>

      {!showLogs ? (
        <>
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-gray-100 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-base font-semibold text-gray-900">추적 목록</p>
                <p className="text-xs text-gray-500">상품을 추가하면 아래 목록에 표시됩니다.</p>
              </div>
              <div className="flex flex-1 flex-wrap items-center justify-between gap-3 md:justify-end">
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                  <span>
                    현재 보유 적립금:{' '}
                    <span className="font-semibold text-gray-900">
                      {availPoint != null ? `${formatMoney(availPoint)}원` : '-'}
                    </span>
                  </span>
                  <label className="flex cursor-pointer select-none items-center gap-1">
                    <input
                      type="checkbox"
                      checked={assumeMaxPoint}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setAssumeMaxPoint(checked);
                        recomputeFromParams(checked, availPoint);
                      }}
                    />
                    최대 적립금(7%) 적용 가격으로 보기
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => refreshAllPrices({ withPoints: true })}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:bg-gray-50"
                    >
                      새로고침
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={removeSelected}
                    disabled={selectedItems.length === 0 || tracking}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    선택 삭제
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleTracking}
                    disabled={items.length === 0}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${
                      tracking
                        ? 'bg-red-600 hover:-translate-y-0.5 hover:bg-red-700'
                        : 'bg-black hover:-translate-y-0.5 hover:bg-gray-900'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {tracking ? '추적 중지' : '추적 시작'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-auto">
            {tableLoading && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-600" />
              </div>
            )}
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">
                    <input type="checkbox" checked={selectedAll} onChange={toggleSelectAll} disabled={tracking} />
                  </th>
                  <th className="px-3 py-2 text-left">이미지</th>
                  <th className="px-3 py-2 text-left">브랜드</th>
                  <th className="px-3 py-2 text-left">상품명</th>
                  <th className="px-3 py-2 text-right">정상가</th>
                  <th className="px-3 py-2 text-right">할인가</th>
                  <th className="px-3 py-2 text-right">등급할인</th>
                  <th className="px-3 py-2 text-right">쿠폰할인</th>
                  <th className="px-3 py-2 text-right">보유적립금</th>
                  <th className="px-3 py-2 text-right">적립금선할인</th>
                  <th className="px-3 py-2 text-right">최대혜택가</th>
                  <th className="px-3 py-2 text-right">추적희망가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-6 text-center text-gray-500">
                      추가된 상품이 없습니다.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => {
                    const isSelected = !!selectedMap[item.goodsUrl];
                    const hoverClass = tracking || isSelected ? '' : 'hover:bg-gray-100';
                    const rowClasses = [
                      'transition',
                      hoverClass,
                      tracking ? 'cursor-not-allowed' : 'cursor-pointer',
                      isSelected ? 'bg-sky-50' : '',
                      tracking && isSelected ? 'tracking-blink' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <tr
                        key={item.goodsUrl}
                        className={`${rowClasses} fade-in`}
                        onClick={() => {
                          if (tracking) return;
                          toggleSelectOne(item.goodsUrl);
                        }}
                      >
                        <td className="px-3 py-2 align-middle">
                          <input
                            type="checkbox"
                            checked={!!selectedMap[item.goodsUrl]}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelectOne(item.goodsUrl);
                            }}
                            disabled={tracking}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.goodsName || '상품 이미지'}
                              className="h-12 w-12 rounded-lg border border-gray-100 object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-gray-200 text-[11px] text-gray-400">
                              없음
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-gray-800">{item.brandName || '-'}</td>
                        <td className="px-3 py-2 align-middle text-gray-900">
                          <div className="max-w-[360px] break-words">{item.goodsName || item.goodsUrl}</div>
                          <a
                            href={item.goodsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-blue-600 underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            바로가기
                          </a>
                        </td>
                        <td className="px-3 py-2 align-middle text-right text-gray-800">
                          {typeof item.normalPrice === 'number' ? `${formatMoney(item.normalPrice)}원` : '-'}
                        </td>
                        <td className="px-3 py-2 align-middle text-right text-gray-800">
                          {typeof item.salePrice === 'number' ? `${formatMoney(item.salePrice)}원` : '-'}
                        </td>
                        <td className="px-3 py-2 align-middle text-right text-gray-800">
                          {typeof item.gradeDiscount === 'number' ? `${formatMoney(item.gradeDiscount)}원` : '-'}
                        </td>
                        <td className="px-3 py-2 align-middle text-right text-gray-800">
                          {item.couponName ? (
                            <div className="relative flex items-center justify-end gap-1">
                              <span className="font-semibold text-gray-900">{formatMoney(item.couponAmount || 0)}원</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCouponTooltip((prev) => (prev === item.goodsUrl ? null : item.goodsUrl));
                                }}
                                className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[10px] text-gray-700 hover:bg-gray-100"
                              >
                                ?
                              </button>
                              {couponTooltip === item.goodsUrl && (
                                <div
                                  className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg bg-gray-900 p-2 text-left text-[11px] text-white shadow-lg"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {item.couponName}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-right text-gray-800">
                          {typeof item.pointSpend === 'number' ? `${formatMoney(item.pointSpend)}원` : '-'}
                        </td>
                        <td className="px-3 py-2 align-middle text-right text-gray-800">
                          {typeof item.prePointDiscount === 'number' ? `${formatMoney(item.prePointDiscount)}원` : '-'}
                        </td>
                        <td className="px-3 py-2 align-middle text-right font-semibold text-red-600">
                          {typeof item.lastPrice === 'number' ? `${formatMoney(item.lastPrice)}원` : '-'}
                        </td>
                        <td className="px-3 py-2 align-middle text-right">
                          <input
                            type="text"
                            value={item.targetPrice == null ? '' : Number(item.targetPrice).toLocaleString()}
                            onChange={(e) => {
                              e.stopPropagation();
                              const digits = e.target.value.replace(/[^\d]/g, '');
                              const num = digits ? Number(digits) : null;
                              updateTargetPrice(item.id, item.goodsUrl, Number.isFinite(num as number) ? num : null);
                            }}
                            disabled={tracking}
                            placeholder="희망가"
                            className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black/10 disabled:bg-gray-50"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {trackingLog && (
            <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-700">{trackingLog}</div>
          )}
        </>
      ) : (
        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-black bg-black px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-900"
                onClick={() => setShowLogs(false)}
              >
                ← 돌아가기
              </button>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <button
                type="button"
                className="rounded-md border border-gray-200 px-2 py-1 text-xs"
                onClick={() =>
                  setLogsMonth((prev) => {
                    const m = prev.month - 1;
                    if (m < 0) return { year: prev.year - 1, month: 11 };
                    return { year: prev.year, month: m };
                  })
                }
              >
                이전달
              </button>
              <div className="relative" ref={calendarRef}>
                <button
                  type="button"
                  onClick={() => setShowCalendar((v) => !v)}
                  className="rounded-md border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-800 hover:-translate-y-0.5 hover:bg-gray-50"
                >
                  {logsMonth.year}년 {logsMonth.month + 1}월
                </button>
                {showCalendar && (
                  <div className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
                    <div className="mb-3 flex items-center justify-between text-xs font-semibold text-gray-800">
                      <button
                        type="button"
                        className="rounded-md border border-gray-200 px-2 py-1"
                        onClick={() => setLogsMonth((prev) => ({ year: prev.year - 1, month: prev.month }))}
                      >
                        ‹
                      </button>
                      <span>{logsMonth.year}년</span>
                      <button
                        type="button"
                        className="rounded-md border border-gray-200 px-2 py-1"
                        onClick={() => setLogsMonth((prev) => ({ year: prev.year + 1, month: prev.month }))}
                      >
                        ›
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                      {[...Array(12)].map((_, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`rounded-md px-2 py-2 text-center transition ${
                            idx === logsMonth.month
                              ? 'bg-black text-white'
                              : 'text-gray-800 hover:-translate-y-0.5 hover:bg-gray-100'
                          }`}
                          onClick={() => {
                            setLogsMonth({ year: logsMonth.year, month: idx });
                            setShowCalendar(false);
                          }}
                        >
                          {idx + 1}월
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="rounded-md border border-gray-200 px-2 py-1 text-xs"
                onClick={() =>
                  setLogsMonth((prev) => {
                    const m = prev.month + 1;
                    if (m > 11) return { year: prev.year + 1, month: 0 };
                    return { year: prev.year, month: m };
                  })
                }
              >
                다음달
              </button>
            </div>
          </div>
          {logsLoading && (
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-600" />
          )}
          <div className="max-h-[70vh] overflow-auto rounded-xl border border-gray-200">
            <table className="min-w-[1200px] border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-30 bg-gray-50">
                <tr>
                  <th className="sticky left-0 bg-gray-50 px-2 py-2 text-left text-gray-600">날짜</th>
                  {logsData.products.map((p) => (
                    <th key={p} className="bg-gray-50 px-2 py-2 text-left text-gray-700">
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logsData.dates.map((d) => (
                  <tr key={d} className="odd:bg-white even:bg-gray-50">
                    <td className="sticky left-0 bg-white px-2 py-2 font-semibold text-gray-700">{d.slice(-2)}일</td>
                    {logsData.products.map((p) => {
                      const price = logsData.priceMap[`${d}::${p}`];
                      return (
                        <td key={`${d}-${p}`} className="px-2 py-2 text-right text-gray-800">
                          {price != null ? `${formatMoney(price)}원` : '-'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {logsData.dates.length === 0 && (
                  <tr>
                    <td colSpan={logsData.products.length + 1} className="px-3 py-6 text-center text-gray-500">
                      기록이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {showTokenGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex max-h-[85vh] flex-col">
              <div className="flex items-start gap-3 border-b border-gray-100 px-5 py-4">
                <div className="flex items-center gap-2">
                  <HelpCircle size={18} className="text-gray-800" />
                  <p className="text-base font-semibold text-gray-900">텔레그램 토큰 가이드</p>
                </div>
                <button
                  onClick={() => setShowTokenGuide(false)}
                  className="ml-auto rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-5">
                <div className="mt-4 space-y-2 text-sm text-gray-800">
                  <p className="font-semibold text-gray-900">텔레그램을 다운로드 받는 이유?</p>
                  <div className="rounded-xl bg-cyan-50 px-4 py-3 leading-relaxed text-gray-800">
                    <p>상품의 가격이 희망추적가에 도달하면</p>
                    <p>스마트폰 텔레그램으로 바로 알림을 보내줍니다!</p>
                  </div>
                </div>
                <div className="mt-6 space-y-4">
                  {telegramGuideSteps.map((step, idx) => (
                    <div key={step.description} className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
                      <div className="flex items-start gap-3 bg-gray-50 px-4 py-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 text-sm font-semibold text-white">
                          {idx + 1}
                        </span>
                        <p className="text-sm font-semibold text-gray-900">{step.description}</p>
                      </div>
                      <div className="bg-black/90">
                        <img
                          src={step.image}
                          alt={`텔레그램 가이드 ${idx + 1}단계`}
                          className="mx-auto block max-h-[520px] w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end border-t border-gray-100 px-5 py-4">
                <button
                  onClick={() => setShowTokenGuide(false)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:-translate-y-0.5 hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [activeMenu, setActiveMenu] = useState<string>('주문내역 관리');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [musinsaSession, setMusinsaSession] = useState<'online' | 'offline' | 'unknown'>('unknown');
  const [musinsaActivity, setMusinsaActivity] = useState<'idle' | 'login' | 'logout'>('idle');
  const [musinsaModal, setMusinsaModal] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [dirtyKey, setDirtyKey] = useState(0);
  const [updateState, setUpdateState] = useState<{
    status: 'idle' | 'available' | 'downloading' | 'installing' | 'error';
    version?: string;
    percent?: number;
    message?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    if (window.musinsaLogin?.onResult) {
      window.musinsaLogin.onResult((res: { status: string; reason?: string }) => {
        if (res.status === 'success') {
          setMusinsaSession('online');
          setMusinsaActivity('idle');
          setMusinsaModal(null);
        } else if (res.status === 'alert') {
          setMusinsaActivity('idle');
          if (res.reason && /로봇/i.test(res.reason)) {
            setMusinsaModal({ type: 'error', message: '로봇 감지가 확인되었습니다. 브라우저에서 인증을 완료해주세요.' });
          } else {
            setMusinsaModal({ type: 'error', message: '로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요.' });
          }
          setMusinsaSession('offline');
        } else if (res.status === 'error') {
          setMusinsaActivity('idle');
          setMusinsaModal({ type: 'error', message: '로그인에 실패했습니다. 다시 시도해주세요.' });
          setMusinsaSession('offline');
        }
      });
    }
    if (window.musinsaLogin?.onSessionStatus) {
      window.musinsaLogin.onSessionStatus((res) => {
        setMusinsaSession(res.status);
      });
    }
    if (window.musinsaLogin?.fetchSessionStatus) {
      window.musinsaLogin.fetchSessionStatus().then((res) => {
        if (res?.status === 'online' || res?.status === 'offline') {
          setMusinsaSession(res.status);
        }
      });
    }
  }, []);

  useEffect(() => {
    const offUpdate = window.musinsaLogin?.onUpdateStatus?.((data) => {
      if (!data) return;
      if (data.status === 'available') {
        setUpdateState({ status: 'available', version: data.version });
      } else if (data.status === 'downloading') {
        setUpdateState({ status: 'downloading', version: data.version, percent: data.percent });
      } else if (data.status === 'downloaded') {
        setUpdateState({ status: 'installing', version: data.version });
      } else if (data.status === 'error') {
        setUpdateState({ status: 'idle' });
      } else if (data.status === 'idle') {
        setUpdateState({ status: 'idle' });
      }
      console.log('[update] status', data);
    });
    return () => {
      offUpdate?.();
    };
  }, []);

  const triggerUpdate = async () => {
    try {
      setUpdateState((prev) => ({ ...prev, status: 'downloading' }));
      const res = await window.musinsaLogin?.startUpdate?.();
      if (!res?.ok) {
        setUpdateState({ status: 'error', message: res?.reason || '업데이트를 시작할 수 없습니다.' });
      }
    } catch (e) {
      setUpdateState({ status: 'error', message: e instanceof Error ? e.message : '업데이트를 시작할 수 없습니다.' });
    }
  };

  const renderUpdateOverlay = () =>
    updateState.status !== 'idle' ? (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
          <p className="text-lg font-semibold text-gray-900">새로운 업데이트가 있습니다.</p>
          {updateState.version && <p className="mt-1 text-sm text-gray-600">버전 {updateState.version}</p>}
          {updateState.status === 'downloading' && (
            <p className="mt-2 text-sm text-gray-700">
              다운로드 중... {updateState.percent ? `${updateState.percent.toFixed(0)}%` : ''}
            </p>
          )}
          {updateState.status === 'installing' && (
            <p className="mt-2 text-sm text-gray-700">업데이트를 설치하는 중입니다. 잠시만 기다려주세요.</p>
          )}
          {updateState.status === 'error' && (
            <p className="mt-2 text-sm text-red-600">{updateState.message || '업데이트 중 오류가 발생했습니다.'}</p>
          )}
          <div className="mt-5">
            <button
              onClick={triggerUpdate}
              disabled={updateState.status === 'downloading' || updateState.status === 'installing'}
              className="w-full rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {updateState.status === 'downloading'
                ? '다운로드 중...'
                : updateState.status === 'installing'
                  ? '설치 중...'
                  : '업데이트'}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  if (!session) {
    return (
      <>
        <AuthGate onAuthenticated={setSession} musinsaSession={musinsaSession} />
        {renderUpdateOverlay()}
      </>
    );
  }

  const isTrial = session.membership === 'trial';

  return (
    <AppLayout
      activeMenu={activeMenu}
      onChangeMenu={(menu) => {
        setActiveMenu(menu);
      }}
      userLoginId={session.loginId}
      membership={session.membership as MembershipTier}
      onLogout={async () => {
        await signOut();
        setSession(null);
        setActiveMenu('자동 후기작성');
        setDirtyKey((k) => k + 1);
      }}
      onRequestMusinsaLogin={async (cred) => {
        if (window.musinsaLogin) {
          setMusinsaActivity('login');
          setMusinsaModal(null);
          const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('login_timeout')), 10000));
          try {
            const res = await Promise.race([window.musinsaLogin.sendLogin(cred), timeout]);
            if (res?.status === 'success') {
              setMusinsaSession('online');
              setMusinsaModal(null);
            } else if (res?.status === 'alert' && res?.reason && /로봇/i.test(res.reason)) {
              setMusinsaSession('offline');
              setMusinsaModal({ type: 'error', message: '로봇 감지가 확인되었습니다. 브라우저에서 인증을 완료해주세요.' });
            } else {
              setMusinsaSession('offline');
              setMusinsaModal({ type: 'error', message: '로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요.' });
            }
          } catch {
            setMusinsaSession('offline');
            setMusinsaModal({ type: 'error', message: '로그인에 실패했습니다. 아이디/비밀번호를 확인해주세요.' });
          } finally {
            setMusinsaActivity('idle');
          }
        }
      }}
      onRequestMusinsaLogout={async () => {
        if (window.musinsaLogin?.logout) {
          setMusinsaActivity('logout');
          try {
            await window.musinsaLogin.logout();
            setMusinsaSession('offline');
            setActiveMenu('자동 후기작성');
            setDirtyKey((k) => k + 1);
          } finally {
            setMusinsaActivity('idle');
          }
        }
      }}
      musinsaSession={musinsaSession}
      musinsaBusy={musinsaActivity}
    >
      <div className="relative">
          <div className={musinsaSession !== 'online' || isTrial ? 'pointer-events-none opacity-60' : ''}>
            <div className={activeMenu === '주문내역 관리' ? 'block fade-slide' : 'hidden'}>
              <OrdersDownloadView />
            </div>
            <div className={activeMenu === '자동 후기작성' ? 'block fade-slide' : 'hidden'}>
              <AutoReviewView key={`auto-review-${dirtyKey}`} session={session} />
            </div>
            <div className={activeMenu === '상품 재고조회' ? 'block fade-slide' : 'hidden'}>
              <InventoryCheckView />
            </div>
            <div className={activeMenu === '상품 가격 추적' ? 'block fade-slide' : 'hidden'}>
              <PriceTrackingView session={session} activeMenu={activeMenu} />
            </div>
          </div>
        {musinsaSession !== 'online' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-center shadow-lg shadow-red-300/30 backdrop-blur">
              <p className="text-sm font-semibold text-red-800">무신사에 로그인 해야 이용가능한 기능입니다.</p>
            </div>
          </div>
        )}
        {isTrial && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-2xl border border-gray-200 bg-white/95 px-6 py-4 text-center shadow-lg shadow-gray-400/10 backdrop-blur">
              <p className="text-sm font-semibold text-gray-900">트라이얼 등급은 기능 사용이 제한됩니다.</p>
              <p className="mt-1 text-xs text-gray-600">무니저 이상 등급으로 업그레이드 후 이용해주세요.</p>
            </div>
          </div>
        )}
      </div>
      {musinsaActivity !== 'idle' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-2xl">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
            <p className="text-sm font-semibold text-gray-800">
              {musinsaActivity === 'logout' ? '무신사 로그아웃 중...' : '무신사 로그인 중...'}
            </p>
          </div>
        </div>
      )}
      {musinsaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <p
              className={`text-sm font-semibold ${
                musinsaModal.type === 'success' ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {musinsaModal.message}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setMusinsaModal(null)}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-900"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      {renderUpdateOverlay()}
    </AppLayout>
  );
};

export default App;
