import { Bell, LogOut, UserCircle2 } from 'lucide-react';
import { MembershipTier } from '../../types/membership';
import { useState, useRef, useEffect } from 'react';
import packageJson from '../../../package.json';

type TopBarProps = {
  title: string;
  userLoginId?: string;
  membership?: MembershipTier;
  onLogout?: () => void;
};

const membershipLabel: Record<MembershipTier, string> = {
  trial: '트라이얼',
  moonager: '무니저',
  vip: 'VIP',
  admin: 'ADMIN',
};

const membershipTone: Record<MembershipTier, string> = {
  trial: 'bg-gray-100 text-gray-700 border-gray-200',
  moonager: 'bg-gray-900 text-white border-gray-900',
  vip: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  admin: 'bg-blue-100 text-blue-800 border-blue-200',
};

const lampColor: Record<MembershipTier, string> = {
  trial: 'bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.25)]',
  moonager: 'bg-green-500 shadow-[0_0_0_4px_rgba(34,197,94,0.25)]',
  vip: 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.3)]',
  admin: 'bg-black shadow-[0_0_0_4px_rgba(0,0,0,0.2)]',
};

const TopBar = ({ title, userLoginId, membership = 'moonager', onLogout }: TopBarProps) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const appVersion = packageJson.version;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
    };
  }, []);

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-8">
      <div className="flex items-center gap-2">
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm">
          Musinsa Manager <span className="text-gray-500">v{appVersion}</span>
        </div>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <span className={`h-2.5 w-2.5 rounded-full ${lampColor[membership]}`} />
          <span className="font-semibold text-gray-800">{`등급 ${membershipLabel[membership]}`}</span>
        </div>

        <button className="rounded-full p-2 text-gray-600 transition-all duration-150 hover:scale-105 hover:bg-gray-100">
          <Bell size={18} />
        </button>
        <div className="relative" ref={wrapperRef}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-gray-50"
          >
            <UserCircle2 size={22} className="text-gray-600" />
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-semibold text-gray-800">{userLoginId ?? '매니저'}</span>
            </div>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className={`absolute left-0 right-0 top-full mt-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-red-500/30 transition-all duration-150 ${
              open ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <LogOut size={14} />
              로그아웃
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
