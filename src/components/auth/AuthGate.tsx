import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, KeyRound, Lock, LogIn, Mail, UserPlus } from 'lucide-react';
import {
  AuthSession,
  checkLoginIdDuplication,
  loginWithPassword,
  signUpWithLoginId,
} from '../../lib/authService';
import { normalizePassword } from '../../utils/hangulKeyboard';
import { isValidLoginId, sanitizeLoginId } from '../../utils/validation';
import { MembershipTier } from '../../types/membership';

type AuthGateProps = {
  onAuthenticated: (session: AuthSession) => void;
  musinsaSession?: 'online' | 'offline' | 'unknown';
};

type Mode = 'login' | 'signup';

const storageKey = 'mm_login_cred';

const tierLabel: Record<MembershipTier, string> = {
  trial: '트라이얼',
  moonager: '무니저',
  vip: 'VIP',
  admin: 'ADMIN',
};

const AuthGate = ({ onAuthenticated, musinsaSession = 'unknown' }: AuthGateProps) => {
  const [mode, setMode] = useState<Mode>('login');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [signupId, setSignupId] = useState('');
  const [signupPw, setSignupPw] = useState('');
  const [signupPwConfirm, setSignupPwConfirm] = useState('');
  const [dupChecked, setDupChecked] = useState(false);
  const [dupLoading, setDupLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { loginId: string; password: string };
        setLoginId(parsed.loginId);
        setPassword(parsed.password);
        setRemember(true);
      } catch (e) {
        console.warn('failed to parse saved credentials', e);
      }
    }
  }, []);

  const handleLogin = async () => {
    setError(null);
    setInfo(null);

    const normalizedId = sanitizeLoginId(loginId);
    if (!isValidLoginId(normalizedId)) {
      setError('아이디는 영문 또는 영문+숫자 조합이어야 하며 숫자로만 구성할 수 없습니다.');
      return;
    }
    const normalizedPw = normalizePassword(password);
    setPassword(normalizedPw);

    try {
      setLoading(true);
      const session = await loginWithPassword(normalizedId, normalizedPw);

      if (remember) {
        localStorage.setItem(storageKey, JSON.stringify({ loginId: normalizedId, password: normalizedPw }));
      } else {
        localStorage.removeItem(storageKey);
      }

      onAuthenticated(session);
      setInfo(`"${session.loginId}"로 로그인되었습니다. 등급: ${tierLabel[session.membership]}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : '로그인에 실패했습니다.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    setError(null);
    setInfo(null);

    const normalizedId = sanitizeLoginId(signupId);
    if (!isValidLoginId(normalizedId)) {
      setError('아이디는 영문 또는 영문+숫자 조합이어야 하며 숫자로만 구성할 수 없습니다.');
      return;
    }
    if (!dupChecked) {
      setError('아이디 중복체크를 먼저 진행해주세요.');
      return;
    }
    const normalizedPw = normalizePassword(signupPw);
    const normalizedConfirm = normalizePassword(signupPwConfirm);
    setSignupPw(normalizedPw);
    setSignupPwConfirm(normalizedConfirm);

    if (!normalizedPw || normalizedPw !== normalizedConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    try {
      setLoading(true);
      const session = await signUpWithLoginId(normalizedId, normalizedPw);
      setInfo(`회원가입 완료. "${session.loginId}"로 자동 로그인되었습니다.`);
      onAuthenticated(session);
    } catch (e) {
      const message = e instanceof Error ? e.message : '회원가입에 실패했습니다.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleDupCheck = async () => {
    setError(null);
    setInfo(null);
    const normalizedId = sanitizeLoginId(signupId);
    setSignupId(normalizedId);
    if (!isValidLoginId(normalizedId)) {
      setError('아이디는 영문 또는 영문+숫자 조합이어야 하며 숫자로만 구성할 수 없습니다.');
      return;
    }
    try {
      setDupLoading(true);
      const available = await checkLoginIdDuplication(normalizedId);
      setDupChecked(available);
      if (available) {
        setInfo('사용 가능한 아이디입니다.');
      } else {
        setError('이미 사용 중인 아이디입니다.');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '중복 체크 중 오류가 발생했습니다.';
      setError(message);
    } finally {
      setDupLoading(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    if (next === 'signup') {
      setDupChecked(false);
    }
  };

  const cardTitle = useMemo(() => (mode === 'login' ? '무신사 매니저 로그인' : '무신사 매니저 회원가입'), [mode]);
  const cardSubtitle = useMemo(
    () =>
      mode === 'login'
        ? '아이디와 비밀번호를 입력하세요.'
        : '영문 또는 영문+숫자 아이디만 사용 가능합니다.',
    [mode],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 px-4 py-10">
      <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-gray-100 bg-white/90 shadow-2xl shadow-gray-500/10 backdrop-blur lg:grid-cols-2">
        <div className="relative hidden h-full bg-gray-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm">
              <Lock size={18} />
              로그인하세요
            </div>
            <h2 className="text-3xl font-semibold leading-tight">Musinsa Manager</h2>
            <p className="text-sm text-gray-300">
              무신사 매니저는 무신사를 이용하시는 셀러분들께 보다 쾌적환 관리환경을 제공하기 위해 노력하고 있습니다
            </p>
          </div>
          <div className="space-y-3 rounded-2xl bg-white/5 p-4">
            <div className="flex items-center gap-3 text-sm text-gray-200">
              <CheckCircle2 className="text-green-400" size={18} />
              로그인 정보 저장 시 다음 번에 자동 입력됩니다.
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-200">
              <KeyRound className="text-blue-300" size={18} />
              회원가입한 계정과 비밀번호는 철저히 암호화됩니다.
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-200">
              <Mail className="text-gray-100" size={18} />
              문의는 개발자에게 말씀해주세요.
            </div>
          </div>
        </div>

        <div className="relative flex flex-col justify-center bg-white px-8 py-10">
          <div className="absolute inset-0 bg-gradient-to-b from-gray-50 via-white to-gray-50" />
          <div className="relative z-10 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-900 text-white shadow-sm">
                  <LogIn size={22} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Musinsa Manager</p>
                  <h1 className="text-xl font-semibold text-gray-900">{cardTitle}</h1>
                  <p className="text-sm text-gray-600">{cardSubtitle}</p>
                </div>
              </div>
            </div>

            <div
              key={mode}
              className={`space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 ease-out fade-slide`}
            >
              {mode === 'login' ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-800">아이디</label>
                    <input
                      value={loginId}
                      onChange={(e) => setLoginId(sanitizeLoginId(e.target.value))}
                      placeholder="영문 또는 영문+숫자"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/70 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-800">비밀번호</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(normalizePassword(e.target.value))}
                      placeholder="비밀번호를 입력하세요"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/70 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                      />
                      로그인 정보 저장
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('signup')}
                      className="text-sm font-semibold text-gray-900 underline-offset-4 transition hover:text-black hover:underline"
                    >
                      회원가입
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogin}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-gray-900 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? '로그인 중...' : '로그인'}
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-800">아이디</label>
                    <div className="flex gap-2">
                      <input
                        value={signupId}
                        onChange={(e) => {
                          setSignupId(sanitizeLoginId(e.target.value));
                          setDupChecked(false);
                        }}
                        placeholder="영문 또는 영문+숫자"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/70 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                      />
                      <button
                        type="button"
                        onClick={handleDupCheck}
                        disabled={dupLoading}
                        className="whitespace-nowrap rounded-xl border border-gray-300 px-3 py-2.5 text-sm font-semibold text-gray-800 transition-all hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {dupLoading ? '확인 중...' : '중복체크'}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-800">비밀번호</label>
                    <input
                      type="password"
                      value={signupPw}
                      onChange={(e) => setSignupPw(normalizePassword(e.target.value))}
                      placeholder="비밀번호를 입력하세요"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/70 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-gray-800">비밀번호 확인</label>
                    <input
                      type="password"
                      value={signupPwConfirm}
                      onChange={(e) => setSignupPwConfirm(normalizePassword(e.target.value))}
                      placeholder="비밀번호를 다시 입력하세요"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/70 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">이미 계정이 있으신가요?</span>
                    <button
                      type="button"
                      onClick={() => switchMode('login')}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-800 transition-all duration-150 hover:-translate-y-0.5 hover:bg-gray-50"
                    >
                      로그인 화면으로
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignup}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-gray-900 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? '가입 중...' : '회원가입'}
                    <UserPlus size={16} />
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <Lock size={16} />
                {error}
              </div>
            )}
            {info && (
              <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                <CheckCircle2 size={16} />
                {info}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthGate;
