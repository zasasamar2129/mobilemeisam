import React, { useState, useMemo } from 'react';
import { Task, TaskPriority, TaskStatus, Customer, User } from '../../types';
import {
  CheckSquare, Search, Plus, Calendar, Clock,
  User as UserIcon, CheckCircle2, AlertCircle, Edit3, Trash2,
  Share2, Users, Lock, ShieldCheck, Mic, Volume2, Eye, Layers
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Checkbox } from '../ui/Checkbox';
import { AudioPlayer } from '../ui/AudioPlayer';
import { ExportExcelButton } from '../ui/ExportExcelButton';
import { RTLNumber } from '../ui/RTLNumber';
import { exportTasksToExcel } from '../../lib/exportToExcel';
import { storage } from '../../services/storage';
import { useToast } from '../ui/Toast';
import { useTranslation } from '../../lib/i18n';
import { formatPersianDate, getRelativeTimeFa, isOverdue } from '../../lib/dateUtils';
import { canViewTask, canExecuteTask, canShareTask, canViewAllTasks, isAdmin } from '../../lib/permissions';
import {
  UNASSIGNED_GROUP,
  applyTaskAssigneeScope,
  buildTaskGroups,
  eligibleTaskAssignees,
  historicalTaskAssignees,
  type TaskGroupDimension,
} from '../../lib/taskGrouping';
import { TaskShareModal } from './TaskShareModal';
import { HorizontalScrollContainer } from '../ui/HorizontalScrollContainer';
import { ListViewControls, usePersistentViewMode } from '../ui/ListViewControls';

export interface TaskListProps {
  tasks: Task[];
  customers: Customer[];
  users?: User[];
  allUsers?: User[];
  currentUser?: User;
  onAddNewTask: () => void;
  onEditTask: (task: Task) => void;
  onRefreshTasks: () => void;
  onSelectCustomer?: (customerId: string) => void;
}

/** The synthetic group key for tasks with no assignee. */
const UNASSIGNED = UNASSIGNED_GROUP;

export const TaskList: React.FC<TaskListProps> = ({
  tasks = [],
  customers = [],
  users = [],
  allUsers = [],
  onAddNewTask,
  onEditTask,
  onRefreshTasks,
  onSelectCustomer,
}) => {
  const { success, error } = useToast();
  const { t, isRtl, formatNumber } = useTranslation();
  const currentUser = storage.getCurrentUser();
  const isCurrentUserAdmin = isAdmin(currentUser);
  const canManageAll = canViewAllTasks(currentUser);
  const syncStatus = storage.getSyncStatus();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE'); // ACTIVE, ALL, COMPLETED, HAS_VOICE
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [viewFilter, setViewFilter] = useState<'ALL_ALLOWED' | 'MINE' | 'SHARED' | 'CREATED'>('ALL_ALLOWED');
  const [sharingTask, setSharingTask] = useState<Task | null>(null);

  // Grouping dimension. Priority grouping stays available and is never removed —
  // employee grouping is an additional option, not a replacement.
  const [groupBy, setGroupBy] = useState<TaskGroupDimension>('NONE');
  // Optional narrowing to one employee, independent of whether groups are shown.
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');

  // View Mode & Pagination
  const [viewMode, setViewMode] = usePersistentViewMode('tasks', 'list');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filter tasks based on strict access control rules
  const visibleTasks = useMemo(() => {
    return (tasks || []).filter((t) => canViewTask(currentUser, t));
  }, [tasks, currentUser]);

  const filteredTasks = useMemo(() => {
    return visibleTasks
      .filter((t) => {
        // Tab / View scope filter
        if (viewFilter === 'MINE' && t.assignedUserId !== currentUser.id) return false;
        if (viewFilter === 'SHARED' && (!t.sharedWithUserIds || !t.sharedWithUserIds.includes(currentUser.id))) return false;
        if (viewFilter === 'CREATED' && t.creatorUserId !== currentUser.id) return false;

        // Status & Priority filters
        if (statusFilter === 'ACTIVE' && (t.status === TaskStatus.COMPLETED || t.status === TaskStatus.CANCELLED)) return false;
        if (statusFilter === 'COMPLETED' && t.status !== TaskStatus.COMPLETED) return false;
        if (statusFilter === 'HAS_VOICE' && !t.voiceNoteAudioUrl) return false;
        if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;

        // Search
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        return (
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.customerName && t.customerName.toLowerCase().includes(q)) ||
          (t.assignedUserName && t.assignedUserName.toLowerCase().includes(q)) ||
          (t.creatorUserName && t.creatorUserName.toLowerCase().includes(q)) ||
          (t.voiceNoteTranscript && t.voiceNoteTranscript.toLowerCase().includes(q)) ||
          (t.sharedWithUserNames && t.sharedWithUserNames.some((n) => n.toLowerCase().includes(q)))
        );
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [visibleTasks, viewFilter, searchQuery, statusFilter, priorityFilter, currentUser]);

  // Employee filter narrows the same permission-filtered dataset the tabs and
  // the counts already use, so a count can never describe rows the user cannot
  // actually open. Applied after `canViewTask`, never instead of it.
  const scopedTasks = useMemo(
    () => applyTaskAssigneeScope(filteredTasks, assigneeFilter),
    [filteredTasks, assigneeFilter]
  );

  const totalPages = Math.ceil(scopedTasks.length / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return scopedTasks.slice(start, start + pageSize);
  }, [scopedTasks, currentPage, pageSize]);

  /**
   * The employee options, taken from the real MMBA user list — never hardcoded.
   * Managers see every active colleague; ordinary employees see only themselves,
   * so the control cannot become a staff directory. A task assigned to someone
   * no longer in the active roster still appears under that person's name (see
   * `historicalAssignees`), so nothing is silently erased.
   */
  const assigneeOptions = useMemo(
    () => eligibleTaskAssignees(allUsers.length ? allUsers : users || [], canManageAll, currentUser.id),
    [allUsers, users, canManageAll, currentUser.id]
  );

  /** Assignees present on tasks but absent from the active roster (or the caller's list). */
  const historicalAssignees = useMemo(
    () => historicalTaskAssignees(scopedTasks, assigneeOptions),
    [scopedTasks, assigneeOptions]
  );

  const unassignedCount = useMemo(() => scopedTasks.filter((t) => !t.assignedUserId).length, [scopedTasks]);

  /** Sections for the active grouping dimension, each with its exact row count. */
  const groupedTasks = useMemo(
    () =>
      buildTaskGroups(groupBy, scopedTasks, assigneeOptions, historicalAssignees, {
        URGENT: t('tasks.priorityUrgent'),
        HIGH: t('tasks.priorityHigh'),
        MEDIUM: t('tasks.priorityMedium'),
        LOW: t('tasks.priorityLow'),
      }),
    [groupBy, scopedTasks, assigneeOptions, historicalAssignees, t]
  );

  const handleToggleStatus = (task: Task) => {
    if (!canExecuteTask(currentUser, task)) {
      error('شما دسترسی لازم برای تغییر وضعیت این وظیفه را ندارید. این کار مختص مسئول یا ادمین است.');
      return;
    }

    const isNowCompleted = task.status !== TaskStatus.COMPLETED;
    const updated: Task = {
      ...task,
      status: isNowCompleted ? TaskStatus.COMPLETED : TaskStatus.IN_PROGRESS,
      completedAt: isNowCompleted ? new Date().toISOString() : undefined,
    };
    storage.saveTask(updated);
    success(isNowCompleted ? 'وظیفه به عنوان تکمیل شده علامت خورد' : 'وظیفه مجدداً فعال شد');
    onRefreshTasks();
  };

  const handleDelete = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCurrentUserAdmin && task.creatorUserId !== currentUser.id) {
      error('فقط ایجادکننده یا ادمین سیستم می‌تواند وظیفه را حذف کند');
      return;
    }

    if (window.confirm('آیا از حذف این وظیفه اطمینان دارید؟')) {
      storage.deleteTask(task.id);
      success('وظیفه حذف شد');
      onRefreshTasks();
    }
  };

  const handleOpenShare = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canShareTask(currentUser, task)) {
      error('فقط مسئول انجام، ایجادکننده یا ادمین مجاز به اشتراک‌گذاری یا واگذاری این وظیفه هستند');
      return;
    }
    setSharingTask(task);
  };

  const getPriorityBadge = (priority: TaskPriority | string) => {
    switch (priority) {
      case TaskPriority.URGENT:
        return <Badge variant="danger" size="sm">{t('tasks.priorityUrgent')}</Badge>;
      case TaskPriority.HIGH:
        return <Badge variant="warning" size="sm">{t('tasks.priorityHigh')}</Badge>;
      case TaskPriority.MEDIUM:
        return <Badge variant="info" size="sm">{t('tasks.priorityMedium')}</Badge>;
      case TaskPriority.LOW:
      default:
        return <Badge variant="default" size="sm">{t('tasks.priorityLow')}</Badge>;
    }
  };

  /**
   * Renders one task as a table row. Extracted so the flat list and each grouped
   * section share exactly one implementation — a group can never render a row
   * differently from the ungrouped view.
   */
  const renderRow = (t: Task) => {
    const overdue = isOverdue(t.dueDate) && t.status !== TaskStatus.COMPLETED;
    const isCompleted = t.status === TaskStatus.COMPLETED;
    const isAssignee = t.assignedUserId === currentUser.id;
    const isTaskCreator = t.creatorUserId === currentUser.id;
    const canEdit = isCurrentUserAdmin || isTaskCreator || isAssignee;
    const canShare = isCurrentUserAdmin || isTaskCreator || isAssignee;

    return (
      <tr
        key={t.id}
        onClick={() => onEditTask(t)}
        className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
          isCompleted ? 'opacity-60 bg-slate-50/40 dark:bg-slate-900/40' : overdue ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''
        }`}
      >
        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isCompleted}
            onChange={() => handleToggleStatus(t)}
            size="md"
            colorScheme="emerald"
            disabled={!canExecuteTask(currentUser, t)}
          />
        </td>

        <td className="p-3">
          <div className="flex items-center gap-2">
            <span className={`font-bold ${isCompleted ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
              {t.title}
            </span>
            {t.voiceNoteAudioUrl && (
              <span className="p-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400" title="دارای ویس صوتی">
                <Mic className="w-3 h-3" />
              </span>
            )}
          </div>
          {t.description && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md mt-0.5">
              {t.description}
            </div>
          )}
        </td>

        <td className="p-3 whitespace-nowrap">{getPriorityBadge(t.priority)}</td>

        <td className="p-3 whitespace-nowrap text-slate-800 dark:text-slate-200">
          <div className="flex items-center gap-1 font-medium">
            <UserIcon className="w-3 h-3 text-slate-400" />
            <span>{t.assignedUserName || 'بدون مسئول'}</span>
          </div>
        </td>

        <td className="p-3 whitespace-nowrap">
          {t.customerId && t.customerName ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectCustomer(t.customerId!);
              }}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              {t.customerName}
            </button>
          ) : (
            <span className="text-slate-400">-</span>
          )}
        </td>

        <td className="p-3 whitespace-nowrap">
          <span className={`font-mono text-[11px] ${overdue ? 'text-rose-600 font-bold' : 'text-slate-600 dark:text-slate-400'}`} dir="ltr">
            {formatPersianDate(t.dueDate, true)}
          </span>
        </td>

        <td className="p-3 text-left whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-1.5">
            {canShare && (
              <button
                type="button"
                onClick={(e) => handleOpenShare(t, e)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="اشتراک‌گذاری و واگذاری"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTask(t);
                }}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="ویرایش"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}

            {(isCurrentUserAdmin || isTaskCreator) && (
              <button
                type="button"
                onClick={(e) => handleDelete(t, e)}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="حذف"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  /** Renders one task as a card. Same sharing rationale as `renderRow`. */
  const renderCard = (t: Task) => {
    const overdue = isOverdue(t.dueDate) && t.status !== TaskStatus.COMPLETED;
    const isCompleted = t.status === TaskStatus.COMPLETED;
    const isAssignee = t.assignedUserId === currentUser.id;
    const isShared = t.sharedWithUserIds && t.sharedWithUserIds.includes(currentUser.id);
    const isTaskCreator = t.creatorUserId === currentUser.id;
    const canEdit = isCurrentUserAdmin || isTaskCreator || isAssignee;
    const canShare = isCurrentUserAdmin || isTaskCreator || isAssignee;

    return (
      <div
        key={t.id}
        onClick={() => onEditTask(t)}
        className={`p-4 rounded-2xl liquid-glass-card border transition-all cursor-pointer text-right space-y-3 bg-white dark:bg-slate-900 ${
          isCompleted
            ? 'border-slate-200 dark:border-slate-800/60 opacity-60 bg-slate-100/50 dark:bg-slate-950/40'
            : overdue
            ? 'border-rose-500/40 bg-rose-50 dark:bg-rose-950/10 hover:border-rose-500/60'
            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              onClick={(e) => {
                e.stopPropagation();
                handleToggleStatus(t);
              }}
              className="mt-0.5"
              title={canExecuteTask(currentUser, t) ? 'تغییر وضعیت انجام' : 'عدم دسترسی تغییر وضعیت'}
            >
              <Checkbox
                checked={isCompleted}
                onChange={() => {}}
                size="md"
                colorScheme="emerald"
                disabled={!canExecuteTask(currentUser, t)}
              />
            </div>

            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-sm font-bold ${
                    isCompleted
                      ? 'line-through text-slate-400 dark:text-slate-500'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {t.title}
                </span>
                {getPriorityBadge(t.priority)}

                {t.voiceNoteAudioUrl && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium">
                    <Volume2 className="w-3 h-3" />
                    دارای صوت
                  </span>
                )}

                {isAssignee && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                    مسئول: من
                  </span>
                )}

                {isShared && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold flex items-center gap-1">
                    <Share2 className="w-2.5 h-2.5" />
                    اشتراک با من
                  </span>
                )}
              </div>

              {t.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                  {t.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {canShare && (
              <button
                type="button"
                onClick={(e) => handleOpenShare(t, e)}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="واگذاری یا اشتراک‌گذاری وظیفه با دیگران"
              >
                <Share2 className="w-4 h-4" />
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTask(t);
                }}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="ویرایش وظیفه"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}

            {(isCurrentUserAdmin || isTaskCreator) && (
              <button
                type="button"
                onClick={(e) => handleDelete(t, e)}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="حذف وظیفه"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {t.voiceNoteAudioUrl && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80" onClick={(e) => e.stopPropagation()}>
            <AudioPlayer src={t.voiceNoteAudioUrl} />
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              <span>مسئول: {t.assignedUserName || 'بدون مسئول'}</span>
            </span>

            {t.customerId && t.customerName && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectCustomer(t.customerId!);
                }}
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                مشتری: {t.customerName}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className={overdue ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
              سررسید: {formatPersianDate(t.dueDate, true)} ({getRelativeTimeFa(t.dueDate)})
            </span>
          </div>
        </div>
      </div>
    );
  };

  /**
   * The sections actually rendered.
   *
   * Grouped mode renders every group IN FULL and does not paginate: slicing a
   * page across groups would show a header count that does not match the rows
   * beneath it, which is exactly the misleading group count the spec forbids.
   * Flat mode keeps the existing pagination untouched.
   */
  const sections = useMemo(() => {
    if (!groupedTasks) return [{ key: '__all__', title: null as string | null, tasks: paginatedTasks }];
    return groupedTasks.map((g) => ({ key: g.key, title: g.title, tasks: g.tasks }));
  }, [groupedTasks, paginatedTasks]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>{t('tasks.title')}</span>
            </h1>
            <Badge variant="purple" size="sm">
              <RTLNumber value={filteredTasks.length} type="count" suffix={t('tasks.countSuffix')} />
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('tasks.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <ExportExcelButton
            onExport={() => exportTasksToExcel(filteredTasks)}
            filename="tasks_list"
            size="sm"
          />

          <Button
            variant="primary"
            size="sm"
            onClick={onAddNewTask}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            تعریف وظیفه جدید
          </Button>
        </div>
      </div>

      {/* Scope and Filter Tabs */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-slate-900 liquid-glass-card border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
        {/* User Scope Segment */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => {
              setViewFilter('ALL_ALLOWED');
              setCurrentPage(1);
            }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
              viewFilter === 'ALL_ALLOWED'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {canViewAllTasks(currentUser) ? 'همه وظایف مجاز (دید مدیریتی)' : 'کل کارتابل من'} ({visibleTasks.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setViewFilter('MINE');
              setCurrentPage(1);
            }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
              viewFilter === 'MINE'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            وظایف مستقیم من ({visibleTasks.filter((t) => t.assignedUserId === currentUser.id).length})
          </button>

          <button
            type="button"
            onClick={() => {
              setViewFilter('SHARED');
              setCurrentPage(1);
            }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
              viewFilter === 'SHARED'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            به اشتراک‌گذاشته با من ({visibleTasks.filter((t) => t.sharedWithUserIds?.includes(currentUser.id)).length})
          </button>

          <button
            type="button"
            onClick={() => {
              setViewFilter('CREATED');
              setCurrentPage(1);
            }}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
              viewFilter === 'CREATED'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            ایجاد شده توسط من ({visibleTasks.filter((t) => t.creatorUserId === currentUser.id).length})
          </button>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:flex-1">
            <Input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="جستجو در عنوان وظیفه، مشتری، توضیحات، پیام‌های صوتی یا مسئول..."
              rightIcon={<Search className="w-4 h-4 text-slate-400" />}
            />
          </div>
        </div>

        {/* Status and Priority */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/60">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">وضعیت:</span>
            {[
              { key: 'ACTIVE', label: 'کارهای جاری و باز' },
              { key: 'ALL', label: 'همه کارها' },
              { key: 'COMPLETED', label: 'انجام شده‌ها' },
              { key: 'HAS_VOICE', label: 'دارای وویس صوتی' },
            ].map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => {
                  setStatusFilter(st.key);
                  setCurrentPage(1);
                }}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  statusFilter === st.key
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">اولویت:</span>
            {['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((pr) => (
              <button
                key={pr}
                type="button"
                onClick={() => {
                  setPriorityFilter(pr);
                  setCurrentPage(1);
                }}
                className={`text-xs px-2 py-0.5 rounded-md transition-all ${
                  priorityFilter === pr
                    ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {pr === 'ALL' ? 'همه' : pr === 'URGENT' ? 'فوری' : pr === 'HIGH' ? 'بالا' : pr === 'MEDIUM' ? 'متوسط' : 'پایین'}
              </button>
            ))}
          </div>
        </div>

        {/* Grouping & employee filter. Priority grouping is preserved as an
            option — employee grouping is added alongside it, never in place of it.
            The employee control is a management-view tool, so it is shown only to
            a caller whose scope already covers other people's tasks. */}
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2 border-t border-slate-200 dark:border-slate-800/60"
          data-testid="task-grouping-controls"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              <span>گروه‌بندی:</span>
            </span>
            {[
              { key: 'NONE', label: 'بدون گروه‌بندی' },
              { key: 'PRIORITY', label: 'بر اساس اولویت' },
              ...(canManageAll ? [{ key: 'EMPLOYEE', label: 'بر اساس نیرو' }] : []),
            ].map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => {
                  setGroupBy(g.key as typeof groupBy);
                  setCurrentPage(1);
                }}
                className={`text-xs px-2.5 py-1 rounded-lg transition-all ${
                  groupBy === g.key
                    ? 'bg-indigo-600 text-white font-semibold shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          {canManageAll && (
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor="task-assignee-filter"
                className="text-xs text-slate-600 dark:text-slate-400 font-medium"
              >
                فیلتر بر اساس کارمند:
              </label>

              <select
                id="task-assignee-filter"
                data-testid="task-assignee-filter"
                value={assigneeFilter}
                onChange={(e) => {
                  setAssigneeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-8 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500 font-medium"
              >
                <option value="ALL">همه کارکنان</option>
                {assigneeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                {historicalAssignees.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} (غیرفعال)
                  </option>
                ))}
                {unassignedCount > 0 && <option value={UNASSIGNED}>بدون مسئول</option>}
              </select>
            </div>
          )}
        </div>

        {/* Distinct non-empty states: an unloaded roster is not the same thing as
            "no employees", and an offline client must not be read as "no data". */}
        {canManageAll && assigneeOptions.length === 0 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 pt-1" data-testid="task-assignee-unavailable">
            فهرست کارکنان در دسترس نیست؛ گروه‌بندی بر اساس نیرو تا بارگذاری مجدد اطلاعات کاربران غیرفعال است.
          </p>
        )}
        {!syncStatus.isConnected && (
          <p className="text-[11px] text-rose-500 pt-1" data-testid="task-offline-notice">
            ارتباط با سرور برقرار نیست؛ وظایف نمایش‌داده‌شده از آخرین نسخه ذخیره‌شده محلی هستند.
          </p>
        )}
      </div>

      {/* Standard ListViewControls with View Toggle (Card vs Row/List) & Pagination */}
      <ListViewControls
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={scopedTasks.length}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50, 100]}
      />

      {/* Main Content: Empty State, Table View, or Card View */}
      {scopedTasks.length === 0 ? (
        <div className="p-12 text-center text-slate-500 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-xs">
          <CheckSquare className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-600" />
          <h3 className="text-base font-bold text-slate-800 dark:text-slate-300">هیچ وظیفه‌ای در این دسته‌بندی وجود ندارد</h3>
          <p className="text-xs text-slate-500">وظایف فقط برای مسئول مربوطه، ایجادکننده و افراد دارای اشتراک نمایش داده می‌شوند.</p>
          <Button variant="primary" size="sm" onClick={onAddNewTask}>
            ایجاد اولین وظیفه
          </Button>
        </div>
      ) : (
        /* SECTIONED VIEW — one section per group, or a single unnamed section
           when grouping is off. `renderRow` / `renderCard` are shared with the
           flat view, so a grouped row is byte-for-byte the same as an ungrouped one. */
        <div className="space-y-5" data-testid="task-sections">
          {sections.map((section) => (
            <div key={section.key} data-testid={`task-group-${section.key}`}>
              {section.title && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{section.title}</span>
                  </span>
                  <Badge variant="default" size="sm">
                    <RTLNumber value={section.tasks.length} type="count" suffix={t('tasks.countSuffix')} />
                  </Badge>
                </div>
              )}

              {section.tasks.length === 0 ? (
                <p className="p-4 text-center text-xs text-slate-500 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  وظیفه‌ای در این گروه نیست.
                </p>
              ) : viewMode === 'list' ? (
                <HorizontalScrollContainer className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3 w-10 text-center">وضعیت</th>
                        <th className="p-3">عنوان و شرح وظیفه</th>
                        <th className="p-3 w-28">اولویت</th>
                        <th className="p-3 w-36">مسئول انجام</th>
                        <th className="p-3 w-32">مشتری مرتبط</th>
                        <th className="p-3 w-36">مهلت انجام (سررسید)</th>
                        <th className="p-3 text-left w-36">عملیات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {section.tasks.map(renderRow)}
                    </tbody>
                  </table>
                </HorizontalScrollContainer>
              ) : (
                <div className="space-y-3">{section.tasks.map(renderCard)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Share / Delegate Modal */}
      {sharingTask && (
        <TaskShareModal
          isOpen={!!sharingTask}
          onClose={() => setSharingTask(null)}
          task={sharingTask}
          currentUser={currentUser}
          allUsers={users}
          onTaskUpdated={(updated) => {
            onRefreshTasks();
          }}
        />
      )}
    </div>
  );
};
