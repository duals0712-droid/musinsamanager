import { FormEvent, useMemo, useState } from 'react';

type InventoryOption = {
  name: string;
  optionItemNo: number;
  stock?: number | null;
  status?: 'ok' | 'out' | 'error' | 'pending';
  note?: string;
  shipping?: string;
};

type InventoryMeta = {
  brand: string;
  name: string;
  category: string;
  goodsNo?: string;
  imageUrl?: string;
};

type InventoryResult = {
  meta: InventoryMeta;
  options: InventoryOption[];
};

const normalizeSize = (name: string) => {
  const raw = (name || '').replace(/\s+/g, '').toUpperCase();
  if (/^XXXXL$/.test(raw)) return '4XL';
  if (/^XXXL$/.test(raw)) return '3XL';
  if (/^XXL$/.test(raw)) return '2XL';
  if (/^XL$/.test(raw)) return 'XL';
  if (/^XXXXS?$/.test(raw)) return '4XS';
  if (/^XXX[SP]$/.test(raw)) return '3XS';
  if (/^XX[SP]$/.test(raw)) return '2XS';
  if (/^XS$/.test(raw)) return 'XS';
  if (/^S$/.test(raw)) return 'S';
  if (/^M$/.test(raw)) return 'M';
  if (/^L$/.test(raw)) return 'L';
  return raw;
};

const sizeOrder: Record<string, number> = {
  '4XS': 0,
  '3XS': 1,
  '2XS': 2,
  XS: 3,
  S: 4,
  M: 5,
  L: 6,
  XL: 7,
  '2XL': 8,
  '3XL': 9,
  '4XL': 10,
};

const InventoryCheckView = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const goodsNoHint = useMemo(() => {
    const match = url.match(/\/(\d+)(?:[/?]|$)/);
    return match ? match[1] : '';
  }, [url]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    setResult(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError('상품 URL을 입력해 주세요.');
      return;
    }

    setLoading(true);
    try {
      if (!window.musinsaLogin?.checkInventory) {
        throw new Error('재고조회 기능이 아직 연결되지 않았습니다.');
      }
      const res = await window.musinsaLogin.checkInventory({ goodsUrl: trimmed });
      if (!res?.ok || !res?.data) {
        throw new Error(res?.reason || '재고 조회에 실패했습니다.');
      }
      setResult(res.data as InventoryResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '재고 조회에 실패했습니다.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const sortedOptions = useMemo(() => {
    if (!result) return [];
    return [...result.options].sort((a, b) => {
      const na = normalizeSize(a.name);
      const nb = normalizeSize(b.name);
      const ra = sizeOrder.hasOwnProperty(na) ? sizeOrder[na] : Number.POSITIVE_INFINITY;
      const rb = sizeOrder.hasOwnProperty(nb) ? sizeOrder[nb] : Number.POSITIVE_INFINITY;
      if (ra !== rb) return ra - rb;
      return String(a.name).localeCompare(String(b.name));
    });
  }, [result]);

  return (
    <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">상품 재고조회</h1>
          <p className="mt-2 text-sm text-gray-600">
            상품 URL을 입력하면 옵션별로 최대 주문 가능 수량을 추정해 보여줍니다.
          </p>
        </div>
        {goodsNoHint && (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
            상품번호 추정: {goodsNoHint}
          </span>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-xl border border-gray-900/20 bg-gray-900 p-4 shadow-inner md:flex-row md:items-end"
      >
        <div className="flex-1">
          <label className="text-xs font-semibold text-gray-200">상품 URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.musinsa.com/products/5367607"
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-400 transition focus:border-gray-500/80 focus:outline-none focus:ring-2 focus:ring-gray-500/50"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? '조회 중...' : '재고조회'}
          </button>
        </div>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <p className="font-semibold">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
          <span>옵션 재고를 확인하는 중입니다...</span>
        </div>
      )}

      {result ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-gray-50/80 p-4 md:flex-row">
            {result.meta.imageUrl ? (
              <button
                type="button"
                onClick={() => setPreview(result.meta.imageUrl || null)}
                className="flex-shrink-0 transition hover:scale-[1.02]"
              >
                <img
                  src={result.meta.imageUrl}
                  alt={result.meta.name || '상품 이미지'}
                  className="h-28 w-28 rounded-xl border border-gray-200 object-cover shadow-sm"
                />
              </button>
            ) : (
              <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-xs text-gray-400">
                이미지 없음
              </div>
            )}
            <div className="flex flex-1 flex-col justify-center gap-2">
              <p className="text-sm font-semibold text-gray-700">{result.meta.brand || '-'}</p>
              <h2 className="text-xl font-bold text-gray-900">{result.meta.name || '상품명'}</h2>
              <p className="text-sm text-gray-600">
                카테고리: {result.meta.category || '정보 없음'}
              </p>
              {result.meta.goodsNo && (
                <p className="text-xs text-gray-500">상품번호: {result.meta.goodsNo}</p>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 shadow-sm">
            <div className="grid grid-cols-[1fr,120px] items-center bg-gray-900 px-4 py-3 text-sm font-semibold text-white">
              <span>옵션명</span>
              <span className="text-right">예상 재고</span>
            </div>
            <div className="divide-y divide-gray-100 bg-white">
              {sortedOptions.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-600">옵션 정보를 찾을 수 없습니다.</div>
              ) : (
                sortedOptions.map((opt) => (
                  <div key={opt.optionItemNo} className="grid grid-cols-[1fr,120px] items-center px-4 py-3 text-sm text-gray-800">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{opt.name || '-'}</span>
                        {opt.shipping && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              opt.shipping === '무신사 직배송'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {opt.shipping}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right font-semibold">
                      {opt.status === 'out'
                        ? <span className="text-red-600">품절</span>
                        : Number.isFinite(opt.stock)
                          ? `${opt.stock}개`
                          : opt.status === 'pending'
                            ? '확인 중'
                            : '정보 없음'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        !loading &&
        !error && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-6 text-center text-sm text-gray-600">
            상품 URL을 입력하고 &ldquo;재고조회&rdquo;를 누르면 옵션별 재고 추정을 확인할 수 있습니다.
          </div>
        )
      )}

      {preview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4" onClick={() => setPreview(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <img
              src={preview}
              alt="preview"
              className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/10 shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-800 shadow-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryCheckView;
