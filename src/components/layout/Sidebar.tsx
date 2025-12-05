import { ElementType, useEffect, useState } from 'react';
import { Download, Info, LogIn, Settings, Sparkles, TrendingUp } from 'lucide-react';

type SidebarProps = {
  activeMenu: string;
  onChangeMenu: (menu: string) => void;
  onRequestMusinsaLogin?: (payload: { loginId: string; password: string }) => void;
  onRequestMusinsaLogout?: () => void;
  musinsaSession?: 'online' | 'offline' | 'unknown';
  musinsaBusy?: 'idle' | 'login' | 'logout';
};

type MenuItem = {
  label: string;
  icon: ElementType;
};

const menus: MenuItem[] = [
  { label: '주문내역 관리', icon: Download },
  { label: '자동 후기작성', icon: Sparkles },
  { label: '상품 가격 추적', icon: TrendingUp },
];

const Sidebar = ({
  activeMenu,
  onChangeMenu,
  onRequestMusinsaLogin,
  onRequestMusinsaLogout,
  musinsaSession = 'unknown',
  musinsaBusy = 'idle',
}: SidebarProps) => {
  const [loginId, setLoginId] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [saveLogin, setSaveLogin] = useState(false);
  const STORAGE_KEY = 'musinsaLoginSaved';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setLoginId(parsed?.loginId ?? '');
      setLoginPw(parsed?.password ?? '');
      setSaveLogin(Boolean(parsed?.save));
    } catch (e) {
      // ignore parsing errors
    }
  }, []);

  const handleLogin = () => {
    // 더미 로그인 핸들러
    console.log('로그인 시도', { loginId, loginPw });
    onRequestMusinsaLogin?.({ loginId, password: loginPw });
    try {
      if (saveLogin) {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ loginId, password: loginPw, save: true }),
        );
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      // ignore storage errors
    }
  };

  const sessionTone =
    musinsaSession === 'online'
      ? 'border-green-200 bg-green-50 text-green-700'
      : musinsaSession === 'offline'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-gray-200 bg-gray-50 text-gray-600';

  const lampTone =
    musinsaSession === 'online'
      ? 'bg-green-500 shadow-[0_0_0_4px_rgba(34,197,94,0.2)]'
      : musinsaSession === 'offline'
        ? 'bg-red-500 shadow-[0_0_0_4px_rgba(248,113,113,0.2)]'
        : 'bg-gray-300 shadow-[0_0_0_4px_rgba(209,213,219,0.4)]';

  return (
    <aside className="flex h-screen w-72 flex-col justify-between border-r border-gray-900/70 bg-gray-950 px-5 py-6">
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2 transition-all duration-200 hover:scale-[1.01] hover:bg-white/5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-gray-900 shadow-sm transition duration-150 hover:shadow-md">
            <Sparkles size={22} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-400">Musinsa</span>
            <span className="text-lg font-semibold text-white">Musinsa Manager</span>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 text-gray-900 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">무신사 계정</h3>
              <p className="text-xs text-gray-500">
                {musinsaSession === 'online' ? '로그인 유지 중' : musinsaSession === 'offline' ? '로그아웃 상태' : '상태 확인 중'}
              </p>
            </div>
            <span className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sessionTone}`}>
              <span className={`h-2.5 w-2.5 rounded-full ${lampTone}`} />
              {musinsaSession === 'online' ? 'ONLINE' : musinsaSession === 'offline' ? 'OFFLINE' : 'CHECK'}
            </span>
          </div>
          <div className="space-y-2">
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="아이디"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/60 focus:outline-none focus:ring-2 focus:ring-gray-900/30 disabled:bg-gray-50"
              disabled={musinsaSession === 'online' || musinsaBusy !== 'idle'}
            />
            <input
              type="password"
              value={loginPw}
              onChange={(e) => setLoginPw(e.target.value)}
              placeholder="비밀번호"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/60 focus:outline-none focus:ring-2 focus:ring-gray-900/30 disabled:bg-gray-50"
              disabled={musinsaSession === 'online' || musinsaBusy !== 'idle'}
            />
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={saveLogin}
                onChange={(e) => setSaveLogin(e.target.checked)}
                disabled={musinsaSession === 'online' || musinsaBusy !== 'idle'}
                className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
              />
              로그인 정보 저장
            </label>
          </div>
          {musinsaSession === 'online' ? (
            <button
              type="button"
              onClick={onRequestMusinsaLogout}
              disabled={musinsaBusy !== 'idle'}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-gray-100 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn size={16} />
              {musinsaBusy === 'logout' ? '로그아웃 중...' : '로그아웃'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              disabled={musinsaBusy !== 'idle'}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-gray-900 hover:shadow-md hover:shadow-gray-900/20 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {musinsaBusy !== 'idle' ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-white" />
                  {musinsaBusy === 'logout' ? '로그아웃 중...' : '로그인 중...'}
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  로그인
                </>
              )}
            </button>
          )}
        </div>

        <nav className="space-y-1">
          {menus.map((item) => {
            const Icon = item.icon;
            const isActive = activeMenu === item.label;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onChangeMenu(item.label)}
                className={`group relative flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-gray-900 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)]'
                    : 'text-gray-200 hover:bg-gray-800/80 hover:text-white'
                }`}
              >
                <span
                  className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-lg bg-white transition-all duration-200 ${
                    isActive ? 'opacity-100' : 'w-0 opacity-0 group-hover:w-1 group-hover:opacity-60'
                  }`}
                />
                <Icon
                  size={18}
                  className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2 border-t border-gray-900/70 pt-4 text-sm text-gray-300">
        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-gray-800/80 hover:text-white">
          <Settings size={16} />
          설정
        </button>
        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-150 hover:bg-gray-800/80 hover:text-white">
          <Info size={16} />
          버전 정보
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
