import { supabase } from './supabaseClient';
import { MembershipTier } from '../types/membership';

export type AuthSession = {
  userId: string;
  loginId: string;
  membership: MembershipTier;
};

const toEmail = (loginId: string) => `${loginId}@local.fake`;

const fallbackSession = (loginId: string): AuthSession => ({
  userId: 'local-fake-user',
  loginId,
  membership: 'trial',
});

export const loginWithPassword = async (loginId: string, password: string): Promise<AuthSession> => {
  if (!loginId || !password) {
    throw new Error('아이디와 비밀번호를 입력하세요.');
  }

  if (window.musinsaLogin?.loginSupabase) {
    const res = await window.musinsaLogin.loginSupabase({ loginId, password });
    if (!res?.ok || !('session' in res)) {
      throw new Error(res?.message || '로그인에 실패했습니다.');
    }
    return res.session as AuthSession;
  }

  if (!supabase) {
    throw new Error('Supabase 클라이언트가 초기화되지 않았습니다.');
  }

  const email = toEmail(loginId);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      throw new Error(error?.message ?? '로그인에 실패했습니다.');
    }

    const userId = data.user.id;
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('login_id, membership_tier')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      // 로그인은 계속 진행하지만 프로필 조회 실패를 알려줌
      console.warn('[auth] profile fetch error', profileError.message);
    }

    const membership = (profile?.membership_tier as MembershipTier | null) ?? 'trial';
    const normalizedLoginId = profile?.login_id ?? loginId;

    return {
      userId,
      loginId: normalizedLoginId,
      membership,
    };
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('Unexpected token') || msg.toLowerCase().includes('json')) {
      throw new Error('Supabase 응답이 유효하지 않습니다. 네트워크 연결과 Supabase URL/키 설정을 확인하세요.');
    }
    throw e;
  }
};

export const signUpWithLoginId = async (
  loginId: string,
  password: string,
): Promise<AuthSession> => {
  if (!loginId || !password) {
    throw new Error('아이디와 비밀번호를 입력하세요.');
  }

  if (!supabase) {
    return fallbackSession(loginId);
  }

  const email = toEmail(loginId);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: undefined,
      data: {
        login_id: loginId,
      },
    },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? '회원가입에 실패했습니다.');
  }

  const userId = data.user.id;

  const { error: upsertError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      login_id: loginId,
      membership_tier: 'trial',
    },
    { onConflict: 'id' },
  );

  if (upsertError) {
    console.warn('[auth] profile upsert error', upsertError.message);
  }

  return {
    userId,
    loginId,
    membership: 'trial',
  };
};

export const checkLoginIdDuplication = async (loginId: string): Promise<boolean> => {
  if (!supabase) {
    // 로컬 모드에서는 항상 사용 가능으로 처리
    return true;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('login_id', loginId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw new Error(error.message);
  }

  return !data;
};

export const signOut = async () => {
  if (supabase) {
    await supabase.auth.signOut();
  }
};
