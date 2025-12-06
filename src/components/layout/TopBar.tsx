import { Bell, LogOut, Plus, Trash2, UserCircle2, X, Pencil } from 'lucide-react';
import { MembershipTier } from '../../types/membership';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import packageJson from '../../../package.json';
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient';

type TopBarProps = {
  title: string;
  userLoginId?: string;
  membership?: MembershipTier;
  onLogout?: () => void;
};

type Announcement = {
  id: number;
  title: string;
  content: string;
  created_at?: string;
};

type AnnouncementRead = {
  announcement_id: number;
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
  const [panelOpen, setPanelOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [selected, setSelected] = useState<Announcement | null>(null);
  const [loadingNotice, setLoadingNotice] = useState(false);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [unreadIds, setUnreadIds] = useState<Set<number>>(new Set());
  const [filterUnread, setFilterUnread] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [createMode, setCreateMode] = useState(false);
  const isAdmin = membership === 'admin';
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

  useEffect(() => {
    if (!userLoginId) return;
    // 로그인 시점에 한 번 공지/읽음 상태를 미리 로드해 알림 상태 반영
    if (announcements.length === 0 && !loadingNotice) {
      loadAnnouncements();
    } else {
      // 읽음 정보만 갱신
      if (!isSupabaseConfigured || announcements.length === 0) return;
      (async () => {
        try {
          const { data: reads } = await supabase
            .from('announcement_reads')
            .select('announcement_id')
            .eq('user_login_id', userLoginId);
          const ids = new Set<number>();
          (reads as AnnouncementRead[] | null)?.forEach((r) => ids.add(Number(r.announcement_id)));
          setUnreadIds(new Set(announcements.map((a) => a.id).filter((id) => !ids.has(id))));
        } catch (e) {
          // ignore
        }
      })();
    }
  }, [userLoginId]);

  const loadAnnouncements = async () => {
    if (!isSupabaseConfigured) {
      setNoticeError('Supabase 설정이 없어 공지를 불러올 수 없습니다.');
      return;
    }
    setLoadingNotice(true);
    setNoticeError(null);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const list = Array.isArray(data) ? (data as Announcement[]) : [];
      setAnnouncements(list);
      if (!selected && list.length > 0) {
        setSelected(list[0]);
      }
      if (userLoginId) {
        const { data: reads } = await supabase
          .from('announcement_reads')
          .select('announcement_id')
          .eq('user_login_id', userLoginId);
        const ids = new Set<number>();
        (reads as AnnouncementRead[] | null)?.forEach((r) => ids.add(Number(r.announcement_id)));
        setUnreadIds(new Set(list.map((a) => a.id).filter((id) => !ids.has(id))));
      } else {
        setUnreadIds(new Set());
      }
      setPage(1);
    } catch (e: any) {
      setNoticeError(e?.message || '공지 불러오기 실패');
    } finally {
      setLoadingNotice(false);
    }
  };

  const togglePanel = () => {
    const next = !panelOpen;
    setPanelOpen(next);
    if (next && announcements.length === 0 && !loadingNotice) {
      loadAnnouncements();
    }
  };

  const openModalWith = (item: Announcement) => {
    setSelected(item);
    setModalOpen(true);
    setEditing(false);
    markRead(item.id);
  };

  const openModalForCreate = () => {
    setPanelOpen(false);
    setModalOpen(true);
    setEditing(false);
    setNoticeError(null);
  };

  const handleSave = async () => {
    if (!isAdmin) return;
    if (!draftTitle.trim() || !draftContent.trim()) {
      setNoticeError('제목과 내용을 입력하세요.');
      return;
    }
    if (!isSupabaseConfigured) {
      setNoticeError('Supabase 설정이 없어 공지를 저장할 수 없습니다.');
      return;
    }
    setSaving(true);
    setNoticeError(null);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          title: draftTitle.trim(),
          content: draftContent.trim(),
          author_login_id: userLoginId ?? 'admin',
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const newList = [data as Announcement, ...announcements];
        setAnnouncements(newList);
        setSelected(data as Announcement);
        setDraftTitle('');
        setDraftContent('');
        setModalOpen(true);
      }
    } catch (e: any) {
      setNoticeError(e?.message || '공지 저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const markRead = async (announcementId: number) => {
    if (!userLoginId || !isSupabaseConfigured) return;
    if (unreadIds.has(announcementId)) {
      const next = new Set(unreadIds);
      next.delete(announcementId);
      setUnreadIds(next);
    }
    try {
      await supabase
        .from('announcement_reads')
        .upsert({ announcement_id: announcementId, user_login_id: userLoginId }, { onConflict: 'announcement_id,user_login_id' });
    } catch (e) {
      // ignore
    }
  };

  const markAllRead = async () => {
    if (!userLoginId || !isSupabaseConfigured || announcements.length === 0) return;
    const ids = announcements.map((a) => a.id);
    const rows = ids.map((id) => ({ announcement_id: id, user_login_id: userLoginId }));
    setUnreadIds(new Set());
    try {
      await supabase.from('announcement_reads').upsert(rows, { onConflict: 'announcement_id,user_login_id' });
    } catch (e) {
      // ignore
    }
  };

  const handleUpdate = async () => {
    if (!isAdmin || !selected) return;
    if (!editTitle.trim() || !editContent.trim()) {
      setNoticeError('제목과 내용을 입력하세요.');
      return;
    }
    if (!isSupabaseConfigured) {
      setNoticeError('Supabase 설정이 없어 공지를 수정할 수 없습니다.');
      return;
    }
    setSaving(true);
    setNoticeError(null);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .update({ title: editTitle.trim(), content: editContent.trim() })
        .eq('id', selected.id)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const updated = data as Announcement;
        const newList = announcements.map((a) => (a.id === updated.id ? updated : a));
        setAnnouncements(newList);
        setSelected(updated);
        setEditing(false);
      }
    } catch (e: any) {
      setNoticeError(e?.message || '공지 수정 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isAdmin || !selected) return;
    if (!isSupabaseConfigured) {
      setNoticeError('Supabase 설정이 없어 공지를 삭제할 수 없습니다.');
      return;
    }
    if (!confirm('삭제하시겠습니까?')) return;
    setSaving(true);
    setNoticeError(null);
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', selected.id);
      if (error) throw error;
      const newList = announcements.filter((a) => a.id !== selected.id);
      setAnnouncements(newList);
      setSelected(newList[0] || null);
      setEditing(false);
    } catch (e: any) {
      setNoticeError(e?.message || '공지 삭제 실패');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (selected && editing) {
      setEditTitle(selected.title);
      setEditContent(selected.content);
    }
  }, [selected, editing]);

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const filtered = filterUnread ? announcements.filter((a) => unreadIds.has(a.id)) : announcements;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

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

        <button
          className={`rounded-full p-2 transition-all duration-150 hover:scale-105 hover:bg-gray-100 ${
            unreadIds.size > 0 && !isAdmin ? 'text-red-600 animate-bounce' : 'text-gray-600'
          }`}
          onClick={togglePanel}
        >
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

      {/* 알림 패널 */}
      {createPortal(
        <div
          className="fixed inset-0 z-40"
          onClick={() => setPanelOpen(false)}
          style={{ pointerEvents: panelOpen ? 'auto' : 'none' }}
        >
          <div
            className={`absolute right-4 top-16 w-[380px] transform overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl transition duration-150 ${
              panelOpen ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">공지사항</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setFilterUnread((v) => !v);
                    setPage(1);
                  }}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-800 transition hover:bg-gray-50"
                >
                  {filterUnread ? '초기화' : '안읽은 공지 보기'}
                </button>
                <button
                  onClick={markAllRead}
                  className="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-800 transition hover:bg-gray-50"
                >
                  전체 읽음
                </button>
                {isAdmin && (
                  <button
                    onClick={openModalForCreate}
                    className="flex items-center gap-1 rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-900"
                  >
                    <Plus size={12} />
                    새 공지
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[480px]">
              {loadingNotice ? (
                <div className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
                  불러오는 중...
                </div>
              ) : noticeError ? (
                <div className="px-4 py-3 text-sm text-red-600">{noticeError}</div>
              ) : filtered.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-600">등록된 공지가 없습니다.</div>
              ) : (
                <>
                  {pageItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => openModalWith(item)}
                      className="block w-full rounded-none border-b border-gray-100 px-4 py-3 text-left transition hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-semibold text-gray-900">{item.title}</p>
                        {unreadIds.has(item.id) && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500" />}
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{formatDate(item.created_at)}</p>
                    </button>
                  ))}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 px-4 py-3">
                      {Array.from({ length: totalPages }).map((_, idx) => {
                        const num = idx + 1;
                        return (
                          <button
                            key={num}
                            onClick={() => setPage(num)}
                            className={`h-7 w-7 rounded-full text-xs font-semibold transition ${
                              num === page ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {num}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 공지 모달 */}
      {createPortal(
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 transition duration-200 ${
            modalOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setModalOpen(false)}
        >
        <div
          className={`w-full max-w-5xl transform rounded-2xl bg-white shadow-2xl transition duration-200 ${
            modalOpen ? 'scale-100 translate-y-0' : 'scale-95 -translate-y-2'
          }`}
          style={{ minHeight: '70vh' }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <p className="text-base font-semibold text-gray-900">공지사항</p>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <div className="flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
                    ADMIN 전용
                    <button
                      onClick={() => {
                        setCreateMode(true);
                        setEditing(false);
                        setDraftTitle('');
                        setDraftContent('');
                        setNoticeError(null);
                      }}
                      className="flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[11px] font-bold text-white shadow-sm transition hover:scale-105"
                    >
                      <Plus size={12} />
                      새 공지
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-[220px,1fr] gap-0 border-b border-gray-100" style={{ minHeight: '60vh' }}>
              <div className="max-h-[60vh] overflow-y-auto border-r border-gray-100">
                {announcements.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-600">등록된 공지가 없습니다.</div>
                ) : (
                  announcements.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelected(item)}
                      className={`block w-full border-b border-gray-100 px-4 py-3 text-left text-sm transition ${
                        selected?.id === item.id ? 'bg-gray-100 font-semibold text-gray-900' : 'hover:bg-gray-50'
                      }`}
                    >
                      <p className="line-clamp-2">{item.title}</p>
                      <p className="mt-1 text-[11px] text-gray-500">{formatDate(item.created_at)}</p>
                    </button>
                  ))
                )}
              </div>
              <div className="flex flex-col gap-3 p-6">
                {createMode ? (
                  <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-inner">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">새 공지 작성</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCreateMode(false);
                            setNoticeError(null);
                            setDraftTitle('');
                            setDraftContent('');
                          }}
                          className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className="flex items-center gap-1 rounded-lg bg-black px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Plus size={14} />
                          {saving ? '저장 중...' : '저장'}
                        </button>
                      </div>
                    </div>
                    <input
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      placeholder="제목"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/60 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                    <textarea
                      value={draftContent}
                      onChange={(e) => setDraftContent(e.target.value)}
                      placeholder="내용을 입력하세요"
                      rows={6}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/60 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                    />
                    {noticeError && <div className="text-sm font-semibold text-red-600">{noticeError}</div>}
                  </div>
                ) : selected ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-gray-500">작성자: ADMIN</p>
                        <p className="text-[11px] text-gray-500">{formatDate(selected.created_at)}</p>
                      </div>
                      {isAdmin && !editing && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditing(true);
                              setEditTitle(selected.title);
                              setEditContent(selected.content);
                              setNoticeError(null);
                            }}
                            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-800 transition hover:bg-gray-50"
                          >
                            <Pencil size={14} />
                            수정
                          </button>
                          <button
                            onClick={handleDelete}
                            disabled={saving}
                            className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-60"
                          >
                            <Trash2 size={14} />
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                    {editing ? (
                      <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-inner">
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/60 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                          placeholder="제목"
                        />
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={5}
                          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 transition focus:border-gray-900/60 focus:outline-none focus:ring-2 focus:ring-gray-900/20"
                          placeholder="내용"
                        />
                        <div className="flex items-center justify-end gap-2 text-xs">
                          {noticeError && <span className="mr-auto font-semibold text-red-600">{noticeError}</span>}
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(false);
                              setNoticeError(null);
                            }}
                            className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 transition hover:bg-gray-50"
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            onClick={handleUpdate}
                            disabled={saving}
                            className="flex items-center gap-1 rounded-lg bg-black px-3 py-2 font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {saving ? '저장 중...' : '수정 저장'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <h2 className="text-xl font-bold text-gray-900">{selected.title}</h2>
                        <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                          {selected.content}
                        </div>
                      </>
                    )}
                  </>
                  ) : (
                    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-6 text-center text-sm text-gray-600">
                      공지를 선택하세요.
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </header>
  );
};

export default TopBar;
