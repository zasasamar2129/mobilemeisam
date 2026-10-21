import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Attachment, User, ChatConversation, ConversationType, ChatMessageReaction } from '../../types';
import { useTranslation } from '../../lib/i18n';
import { formatPersianDate } from '../../lib/dateUtils';
import { storage } from '../../services/storage';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { AttachmentPreviewModal } from '../ui/AttachmentPreviewModal';
import { AttachDocumentModal } from './AttachDocumentModal';
import { DeleteMessageModal } from './DeleteMessageModal';
import { ChatComposer } from '../ui/ChatComposer';
import { VoiceRecorder } from './VoiceRecorder';
import { uploadManager } from '../../lib/uploadManager';
import { EmojiPicker } from '../ui/EmojiPicker';
import {
  Send, Users, MoreVertical, Edit2, Trash2,
  X, Check, AlertCircle, FileText, Pin, Info, Paperclip,
  CheckCheck, Smile, Mic, ArrowRight
} from 'lucide-react';

export interface ChatThreadProps {
  conversation: ChatConversation;
  conversationTitle: string;
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (body: string, attachments?: { attachment_id: string; attachment_name: string; attachment_file_size?: number; attachment_file_type?: string }[], replyToMessageId?: string) => void;
  onEditMessage: (messageId: string, newBody: string) => void;
  onDeleteMessage: (messageId: string, reason: string) => void;
  onAttachDocument: (messageId: string, documentId: string) => void;
  onMarkRead: () => void;
  onOpenGroupInfo?: () => void;
  onTogglePin?: () => void;
  isPinned?: boolean;
  attachments: Attachment[];
  users?: User[];
  isAdmin?: boolean;
  onReact?: (messageId: string, emoji: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  conversation,
  conversationTitle,
  messages = [],
  currentUserId,
  onSend,
  onEditMessage,
  onDeleteMessage,
  onAttachDocument,
  onMarkRead,
  onOpenGroupInfo,
  onTogglePin,
  isPinned = false,
  attachments = [],
  users = [],
  isAdmin = false,
  onReact,
  onTypingChange,
}) => {
  const { isRtl } = useTranslation();
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);
  const [isAttachModalOpen, setIsAttachModalOpen] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [reactingTo, setReactingTo] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [showVoiceRecorder, setShowShowVoiceRecorder] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const isGroup = conversation.type === ConversationType.GROUP || conversation.type === 'GROUP';

  // Typing members (excluding me) — re-read on every conversation change since the
  // flag lives on the member record and arrives via the 3.5s sync.
  const typingUserIds = storage.getTypingUserIds(conversation.id, currentUserId);

  const peerId = !isGroup
    ? (conversation.member_ids || []).find((id: string) => id !== currentUserId)
    : undefined;
  const peer = peerId ? users.find((u) => u.id === peerId) : undefined;
  const peerOnline = peerId ? storage.isUserOnline(peerId) : false;
  const onlineMemberCount = isGroup
    ? (conversation.member_ids || []).filter((id: string) => id !== currentUserId && storage.isUserOnline(id)).length
    : 0;

  // Report local typing upward; the parent debounces it into the API call.
  const handleDraftChange = (v: string) => {
    setDraft(v);
    onTypingChange?.(v.trim().length > 0);
  };

  useEffect(() => {
    return () => {
      // Leaving the thread or switching conversations must not leave a stuck flag.
      onTypingChange?.(false);
    };
  }, [conversation.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, conversationTitle]);

  const send = () => {
    const trimmed = draft.trim();
    if (!trimmed && pendingAttachments.length === 0) return;

    const attPayload = pendingAttachments.map((a) => ({
      attachment_id: a.id,
      attachment_name: a.fileName,
      attachment_file_size: a.fileSize,
      attachment_file_type: a.fileType,
    }));

    onSend(trimmed, attPayload.length > 0 ? attPayload : undefined, replyingTo?.id);
    setDraft('');
    setPendingAttachments([]);
    setReplyingTo(null);
    composerRef.current?.focus();
  };

  const handleStartEdit = (m: ChatMessage) => {
    setEditingMessage(m);
    setEditDraft(m.body || '');
  };

  const handleSaveEdit = () => {
    if (!editingMessage || !editDraft.trim()) return;
    onEditMessage(editingMessage.id, editDraft.trim());
    setEditingMessage(null);
    setEditDraft('');
  };

  const resolveAtt = (ref: { attachment_id?: string; attachmentId?: string; attachment_name?: string; attachmentName?: string }) => {
    const id = ref.attachment_id || ref.attachmentId || '';
    return attachments.find((a) => a.id === id);
  };

  const senderInfo = (m: ChatMessage): User | undefined => {
    const sid = m.sender_user_id || m.senderUserId || '';
    return users.find((u) => u.id === sid);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-slate-900">
      {/* Header */}
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900/80 shadow-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs ${
            isGroup ? 'bg-gradient-to-tr from-emerald-600 to-teal-500' : 'bg-gradient-to-tr from-indigo-600 to-sky-500'
          }`}>
            {isGroup ? <Users className="w-5 h-5" /> : conversationTitle.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate">
                {conversationTitle}
              </h3>
              {conversation.priority === 'VERY_IMPORTANT' && (
                <Badge variant="danger" size="sm">{isRtl ? 'بسیار مهم' : 'Critical'}</Badge>
              )}
              {conversation.priority === 'IMPORTANT' && (
                <Badge variant="warning" size="sm">{isRtl ? 'مهم' : 'Important'}</Badge>
              )}
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
              {isGroup ? (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      onlineMemberCount > 0 ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                    aria-hidden
                  />
                  <span>
                    {onlineMemberCount > 0
                      ? isRtl
                        ? `${onlineMemberCount} نفر آنلاین`
                        : `${onlineMemberCount} online`
                      : isRtl
                      ? 'همه آفلاین'
                      : 'All offline'}
                    {' · '}
                    {(conversation.member_ids || []).length} {isRtl ? 'عضو' : 'members'}
                  </span>
                </>
              ) : (
                <>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      peerOnline ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                    aria-hidden
                  />
                  <span>
                    {peerOnline
                      ? isRtl
                        ? 'آنلاین'
                        : 'Online'
                      : isRtl
                      ? 'آفلاین'
                      : 'Offline'}
                  </span>
                </>
              )}
              <span className="opacity-60">
                {' • '}
                {(messages || []).length} {isRtl ? 'پیام' : 'messages'}
              </span>
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onTogglePin && (
            <button
              type="button"
              onClick={onTogglePin}
              title={isPinned ? (isRtl ? 'برداشتن پین' : 'Unpin') : (isRtl ? 'پین کردن گفتگو' : 'Pin')}
              className={`p-1.5 rounded-lg border transition-all ${
                isPinned
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 text-amber-600 dark:text-amber-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Pin className="w-4 h-4" />
            </button>
          )}

          {isGroup && onOpenGroupInfo && (
            <Button
              variant="outline"
              size="xs"
              onClick={onOpenGroupInfo}
              leftIcon={<Info className="w-3.5 h-3.5" />}
            >
              {isRtl ? 'اطلاعات گروه' : 'Group Info'}
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 min-h-0 bg-slate-50/60 dark:bg-slate-950/40">
        {(messages || []).length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-xs text-slate-400 space-y-1">
            <Users className="w-8 h-8 text-slate-300 dark:text-slate-600" />
            <p>{isRtl ? 'هنوز پیامی در این گفتگو ارسال نشده است.' : 'No messages yet.'}</p>
          </div>
        )}

        {(messages || []).map((m) => {
          const mine = m.sender_user_id === currentUserId || m.senderUserId === currentUserId;
          const sender = senderInfo(m);
          const isDeleted = Boolean(m.is_deleted || m.isDeleted);
          const isEdited = Boolean(m.is_edited || m.isEdited);
          const canDelete = mine || isAdmin;
          const canEdit = mine && !isDeleted;

          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'} gap-2 group/msg`}>
              {!mine && (
                <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 ring-2 ring-white dark:ring-slate-800 shadow-xs mt-0.5">
                  {sender?.avatar ? (
                    <img src={sender.avatar} alt={sender.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-sky-500 text-white flex items-center justify-center text-[10px] font-bold">
                      {(m.sender_user_name || '?').charAt(0)}
                    </div>
                  )}
                </div>
              )}

              <div className="relative max-w-[82%] sm:max-w-[70%]">
                <div className="absolute top-0 opacity-0 group-hover/msg:opacity-100 transition-opacity -right-10 flex gap-1">
                  <button
                    onClick={() => setReplyingTo(m)}
                    className="p-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 shadow-xs"
                    title={isRtl ? 'پاسخ به این پیام' : 'Reply'}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Message Bubble */}
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed shadow-xs transition-all ${
                    isDeleted
                      ? 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-400 italic'
                      : mine
                      ? 'bg-indigo-600 text-white rounded-br-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-bl-xs border border-slate-200/80 dark:border-slate-700/60'
                  }`}
                >
                  {/* Sender Name for group chats */}
                  {!mine && isGroup && (m.sender_user_name || m.senderUserName) && (
                    <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 mb-1">
                      {m.sender_user_name || m.senderUserName}
                    </p>
                  )}

                  {/* Body */}
                  {isDeleted ? (
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {isRtl ? 'این پیام حذف شده است' : 'This message was deleted'}
                        {m.deletion_reason && ` (${m.deletion_reason})`}
                      </span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  )}

                  {/* Attachments */}
                  {!isDeleted && (m.attachments || []).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {(m.attachments || []).map((ref, i) => {
                        const att = resolveAtt(ref);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => att && setPreviewAtt(att)}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[10px] transition-all text-right ${
                              mine
                                ? 'bg-white/15 border-white/25 text-white hover:bg-white/20'
                                : 'bg-slate-50 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate flex-1 font-medium">
                              {ref.attachment_name || ref.attachmentName || (att?.fileName || 'Document')}
                            </span>
                            <span className="text-[9px] opacity-70 font-mono">
                              {(ref.attachment_file_size ? (ref.attachment_file_size / 1024).toFixed(0) + ' KB' : '')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer (timestamp, edited, delivery status) */}
                  <div className={`flex items-center gap-1.5 mt-1.5 text-[9px] ${mine ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                    <span>{formatPersianDate(m.created_at || m.createdAt, true).split(' - ').pop()}</span>
                    {isEdited && !isDeleted && (
                      <span className="font-medium">({isRtl ? 'ویرایش‌شده' : 'edited'})</span>
                    )}
                    {mine && !isDeleted && (
                      <span
                        className="inline-flex items-center"
                        title={
                          String(m.status) === 'READ'
                            ? isRtl
                              ? 'خوانده شد'
                              : 'Read'
                            : isRtl
                            ? 'ارسال شد'
                            : 'Sent'
                        }
                      >
                        {String(m.status) === 'READ' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-sky-300" strokeWidth={2.5} />
                        ) : (
                          <Check className="w-3.5 h-3.5 opacity-70" strokeWidth={2.5} />
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Reaction chips */}
                {!isDeleted && (m.reactions || []).length > 0 && (
                  <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-start' : 'justify-end'}`}>
                    {(m.reactions || []).reduce((acc: { emoji: string; users: ChatMessageReaction[] }[], r) => {
                      const hit = acc.find((a) => a.emoji === r.emoji);
                      if (hit) hit.users.push(r);
                      else acc.push({ emoji: r.emoji, users: [r] });
                      return acc;
                    }, []).map((grp) => {
                      const mineReacted = grp.users.some(
                        (r) => r.user_id === currentUserId || r.userId === currentUserId
                      );
                      return (
                        <button
                          key={grp.emoji}
                          type="button"
                          onClick={() => onReact?.(m.id, grp.emoji)}
                          title={grp.users.map((u) => u.user_name || u.userName).filter(Boolean).join('، ')}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                            mineReacted
                              ? 'bg-violet-100 dark:bg-violet-500/20 border-violet-300 dark:border-violet-400/50 text-violet-800 dark:text-violet-200'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <span>{grp.emoji}</span>
                          <span className="tabular-nums">{grp.users.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Emoji picker popover for this message */}
                {reactingTo === m.id && (
                  <div
                    className={`absolute z-30 bottom-full mb-1 ${mine ? 'start-0' : 'end-0'}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EmojiPicker
                      compact
                      onSelect={(emoji) => {
                        onReact?.(m.id, emoji);
                        setReactingTo(null);
                      }}
                      onClose={() => setReactingTo(null)}
                    />
                  </div>
                )}

                {/* Hover Action Menu */}
                {!isDeleted && (canEdit || canDelete || onReact) && (
                  <div className={`absolute top-0 -translate-y-1/2 opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-slate-800 shadow-md border border-slate-200 dark:border-slate-700 ${
                    mine ? '-start-16' : '-end-16'
                  }`}>
                    {onReact && (
                      <button
                        type="button"
                        onClick={() => setReactingTo(reactingTo === m.id ? null : m.id)}
                        title={isRtl ? 'واکنش' : 'React'}
                        className="p-1 rounded hover:bg-violet-50 dark:hover:bg-violet-500/20 text-violet-600 dark:text-violet-300"
                      >
                        <Smile className="w-3 h-3" />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m)}
                        title={isRtl ? 'ویرایش پیام' : 'Edit message'}
                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setDeletingMessageId(m.id)}
                        title={isRtl ? 'حذف پیام' : 'Delete message'}
                        className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {/* Typing indicator — shown while other members are composing */}
        {typingUserIds.length > 0 && (
          <div className="flex items-center gap-2 px-3 pb-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-0.5" aria-hidden>
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            <span className="truncate">
              {typingUserIds.length === 1
                ? (() => {
                    const u = users.find((x) => x.id === typingUserIds[0]);
                    const name = u?.name || (isRtl ? 'یک نفر' : 'Someone');
                    return isRtl ? `${name} در حال نوشتن…` : `${name} is typing…`;
                  })()
                : isRtl
                ? `${typingUserIds.length} نفر در حال نوشتن…`
                : `${typingUserIds.length} people are typing…`}
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Editing State Banner */}
      {editingMessage && (
        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200 dark:border-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-amber-800 dark:amber-200">
            <Edit2 className="w-3.5 h-3.5" />
            <span>{isRtl ? 'در حال ویرایش پیام:' : 'Editing message:'}</span>
            <span className="truncate max-w-xs font-semibold">{editingMessage.body}</span>
          </div>
          <button
            type="button"
            onClick={() => setEditingMessage(null)}
            className="p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Attachments preview */}
      {pendingAttachments.length > 0 && (
        <div className="p-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex flex-wrap gap-2">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs shadow-xs"
            >
              <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
              <span className="truncate max-w-[150px]">{att.fileName}</span>
              <button
                type="button"
                onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                className="text-slate-400 hover:text-rose-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer — standardized ChatComposer (§16: text + emoji + attachment) */}
      {showVoiceRecorder && (
        <VoiceRecorder
          onSendVoice={async (blob, duration) => {
            const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
            const sha256 = 'voice-sha-' + Date.now();
            const key = 'voice-' + Date.now();
            const reader = new FileReader();
            reader.onload = async () => {
              const dataUrl = reader.result as string;
              const res = await uploadManager.upload({
                file,
                fileName: file.name,
                fileSize: file.size,
                fileType: 'audio/webm',
                mimeType: 'audio/webm',
                sha256,
                key,
                dataUrl,
                uploadedByUserId: currentUserId,
                uploadedByUserName: users.find(u => u.id === currentUserId)?.name || 'User',
              });
              if (res.ok && res.id) {
                onSend('', [{
                  attachment_id: res.id,
                  attachment_name: file.name,
                  attachment_file_size: file.size,
                  attachment_file_type: 'audio/webm',
                }], replyingTo?.id);
                setReplyingTo(null);
              }
            };
            reader.readAsDataURL(file);
            setShowShowVoiceRecorder(false);
          }}
          onCancel={() => setShowShowVoiceRecorder(false)}
        />
      )}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {replyingTo && (
          <div className="flex items-center justify-between gap-2 p-2 mb-2 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-100 dark:border-indigo-900/60 text-xs text-indigo-900 dark:text-indigo-200">
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold shrink-0">{isRtl ? 'پاسخ به:' : 'Replying to:'}</span>
              <span className="truncate">{replyingTo.body}</span>
            </div>
            <button type="button" onClick={() => setReplyingTo(null)} className="p-0.5 text-indigo-500 hover:text-indigo-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {editingMessage ? (
            <div className="flex-1 flex items-center gap-2">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                rows={1}
                className="flex-1 text-xs px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-indigo-500 text-slate-900 dark:text-slate-100 focus:outline-none resize-none max-h-32"
              />
              <Button variant="primary" size="sm" onClick={handleSaveEdit} leftIcon={<Check className="w-3.5 h-3.5" />}>
                {isRtl ? 'ذخیره' : 'Save'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditingMessage(null)}>
                {isRtl ? 'انصراف' : 'Cancel'}
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="outline"
                size="md"
                onClick={() => setShowShowVoiceRecorder((prev) => !prev)}
                leftIcon={<Mic className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                title={isRtl ? 'ضبط پیام صوتی' : 'Record voice message'}
              />
              <ChatComposer
                composerRef={composerRef}
                value={draft}
                onChange={handleDraftChange}
                onSend={send}
                onAttach={() => setIsAttachModalOpen(true)}
                placeholder={isRtl ? 'پیام خود را بنویسید... (Enter ارسال)' : 'Type a message... (Enter to send)'}
                maxLength={3000}
                className="flex-1 min-w-0"
                autoFocus={false}
              />
            </>
          )}

          {!editingMessage && (
            <Button
              variant="primary"
              size="md"
              onClick={send}
              disabled={!draft.trim() && pendingAttachments.length === 0}
              leftIcon={<Send className="w-4 h-4" />}
            >
              {isRtl ? 'ارسال' : 'Send'}
            </Button>
          )}
        </div>
      </div>

      {/* Document Attachment Picker Modal */}
      <AttachDocumentModal
        isOpen={isAttachModalOpen}
        onClose={() => setIsAttachModalOpen(false)}
        attachments={attachments}
        onSelectAttachment={(att) => {
          setPendingAttachments((prev) => [...prev, att]);
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteMessageModal
        isOpen={Boolean(deletingMessageId)}
        onClose={() => setDeletingMessageId(null)}
        onConfirm={(reason) => {
          if (deletingMessageId) {
            onDeleteMessage(deletingMessageId, reason);
            setDeletingMessageId(null);
          }
        }}
      />

      {/* Attachment Preview Modal */}
      <AttachmentPreviewModal
        isOpen={Boolean(previewAtt)}
        onClose={() => setPreviewAtt(null)}
        attachment={previewAtt}
      />
    </div>
  );
};
