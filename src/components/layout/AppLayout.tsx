import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { MembershipTier } from '../../types/membership';

type AppLayoutProps = {
  activeMenu: string;
  onChangeMenu: (menu: string) => void;
  userLoginId?: string;
  membership?: MembershipTier;
  onLogout?: () => void;
  onRequestMusinsaLogin?: (payload: { loginId: string; password: string }) => void;
  onRequestMusinsaLogout?: () => void;
  musinsaSession?: 'online' | 'offline' | 'unknown';
  musinsaBusy?: 'idle' | 'login' | 'logout';
  children: ReactNode;
};

const AppLayout = ({
  activeMenu,
  onChangeMenu,
  userLoginId,
  membership,
  onLogout,
  onRequestMusinsaLogin,
  onRequestMusinsaLogout,
  musinsaSession,
  musinsaBusy = 'idle',
  children,
}: AppLayoutProps) => {
  return (
    <div className="flex min-h-screen bg-gray-100 text-gray-900">
      <div className="sticky top-0 h-screen">
        <Sidebar
          activeMenu={activeMenu}
          onChangeMenu={onChangeMenu}
          onRequestMusinsaLogin={onRequestMusinsaLogin}
          onRequestMusinsaLogout={onRequestMusinsaLogout}
          musinsaSession={musinsaSession}
          musinsaBusy={musinsaBusy}
        />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="sticky top-0 z-20 bg-gray-100/95 backdrop-blur">
          <TopBar title={activeMenu} userLoginId={userLoginId} membership={membership} onLogout={onLogout} />
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-screen-2xl px-8 py-10">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
