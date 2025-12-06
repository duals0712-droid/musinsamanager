import { useCallback, useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

type UseTelegramTokenOptions = {
  userId?: string;
  loginId?: string;
};

type UseTelegramTokenResult = {
  token: string;
  chatId: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  hasSaved: boolean;
  setToken: (value: string) => void;
  setChatId: (value: string) => void;
  save: (value?: string) => Promise<void>;
};

/**
 * 사용자별 텔레그램 토큰을 불러오고 저장한다.
 * - Supabase가 설정되어 있으면 user_id 기준으로 저장/조회한다.
 * - Supabase 미설정 시 로컬스토리지(loginId 키) 폴백.
 */
export const useTelegramToken = ({ userId, loginId }: UseTelegramTokenOptions): UseTelegramTokenResult => {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const effectiveUserId = supabaseUserId || userId || null;
  const storageKey = loginId ? `telegram_token_${loginId}` : 'telegram_token';

  useEffect(() => {
    let cancelled = false;
    const fetchUser = async () => {
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
    fetchUser();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isSupabaseConfigured && supabase && supabaseUserId) {
        const { data, error: fetchError } = await supabase
          .from('telegram_tokens')
          .select('token, chat_id')
          .eq('user_id', supabaseUserId)
          .maybeSingle();
        if (fetchError) {
          throw new Error(fetchError.message);
        }
        if (data?.token) {
          setToken(data.token);
          setChatId(data.chat_id || '');
          setHasSaved(true);
          return;
        }
      }
      // fallback: localStorage (or Supabase 미로그인 시)
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            setToken(parsed.token || raw || '');
            setChatId(parsed.chatId || '');
          } catch {
            setToken(raw);
            setChatId('');
          }
          setHasSaved(true);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '토큰을 불러오는 중 오류가 발생했습니다.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [storageKey, supabaseUserId]);

  const save = useCallback(
    async (value?: string) => {
      const targetToken = typeof value === 'string' ? value : token;
      const targetChatId = chatId.trim();
      if (!targetToken || !targetChatId) {
        setError('토큰과 Chat ID를 모두 입력해주세요.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        if (isSupabaseConfigured && supabase && supabaseUserId) {
          const { error: upsertError } = await supabase.from('telegram_tokens').upsert(
            { user_id: supabaseUserId, token: targetToken, chat_id: targetChatId },
            { onConflict: 'user_id' },
          );
          if (upsertError) {
            throw new Error(upsertError.message);
          }
        } else if (typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, JSON.stringify({ token: targetToken, chatId: targetChatId }));
        }
        setToken(targetToken);
        setHasSaved(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '토큰을 저장하는 중 오류가 발생했습니다.';
        setError(msg);
      } finally {
        setSaving(false);
      }
    },
    [storageKey, token, chatId, supabaseUserId],
  );

  useEffect(() => {
    load();
  }, [load]);

  return {
    token,
    chatId,
    loading,
    saving,
    error,
    hasSaved,
    setToken,
    setChatId,
    save,
  };
};
