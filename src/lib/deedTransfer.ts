/**
 * Ownership-transfer (سند) follow-up — shared by the API routes, the reminder
 * scheduler and the automated tests, so the business rule lives in exactly one
 * place.
 *
 * Two DIFFERENT facts are kept apart here, and conflating them is the bug this
 * module exists to prevent:
 *
 *   1. MANUAL DUE DATE (`deedTransferDueDate`) — the date the operator chose for
 *      operational follow-up. It is entered by hand, is allowed to be any date
 *      at all (including one far past the legal window, when that is the agreed
 *      follow-up date), and is NEVER calculated, overwritten or reset by this
 *      module.
 *
 *   2. CALCULATED EARLIEST ELIGIBLE DATE — previous ownership-transfer date plus
 *      the operator's waiting period. Advisory only: the UI surfaces it, warns
 *      when the manual date is earlier than it, and must never substitute it for
 *      the date the operator actually chose.
 *
 * The purchase date is a third fact and measures neither. It is used only as a
 * *flagged* fallback base for records that predate the previous-transfer field;
 * such records are marked as needing verification rather than being presented
 * as confirmed.
 */

export const MAX_DEED_TRANSFER_DAYS = 20;

/** One calendar day in UTC-ms; dates are compared as calendar days, not hours. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Status of the operator's *manual* follow-up date. */
export type DeedFollowStatus = 'NOT_SET' | 'WAITING' | 'DUE_TODAY' | 'OVERDUE' | 'COMPLETED';

/** Status of the *calculated* legal eligibility — advisory, never authoritative. */
export type DeedEligibilityStatus = 'WAITING' | 'ELIGIBLE' | 'OVERDUE' | 'COMPLETED' | 'UNKNOWN';

export type DeedBaseSource = 'PREVIOUS_TRANSFER' | 'PURCHASE_FALLBACK' | 'MISSING';

export interface DeedTransferInput {
  /** The relevant previous ownership-transfer date. Advisory base only. */
  previousTransferDate?: string | null;
  purchaseDate?: string | null;
  /** The operator's hand-chosen follow-up date. The authoritative due date. */
  deedTransferDueDate?: string | null;
  deedTransferCompletedAt?: string | null;
  deedTransferOverride?: boolean;
  deedTransferOverrideReason?: string | null;
  /** Whether the caller holds the admin/owner role needed to authorize an exception. */
  canOverride?: boolean;
}

export interface DeedTransferEligibility {
  /** Date the 20-day wait is measured from, or null when unknown. */
  baseDate: string | null;
  /** Which field supplied the base. PURCHASE_FALLBACK means "verify this record". */
  baseSource: DeedBaseSource;
  /** True when the base is unconfirmed — flagged, never guessed. */
  needsVerification: boolean;
  /** baseDate + 20 calendar days, or null when the base is unknown. */
  nextEligibleDate: string | null;
  /** Calendar days until eligibility; negative once past. Null when unknown. */
  remainingDays: number | null;
  status: DeedEligibilityStatus;
}

/** Result of a due-date check. A warning is not a rejection: the choice stands. */
export interface DeedDueDateCheck {
  ok: boolean;
  /** Whole calendar days the chosen due date sits past the measured base. */
  daysFromBase?: number;
  /** Whole calendar days between the due date and legal eligibility, if known. */
  daysBeforeEligibility?: number;
  /** Set when the chosen date is earlier than the known eligibility date. */
  warning?: string;
}

function parseDay(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!isFinite(ms)) return null;
  // Normalise to the UTC calendar day so timezones do not shift the day count.
  return Math.floor(ms / DAY_MS);
}

/** ISO timestamp at UTC midnight of (day + offset) — month/year safe. */
function dayToIso(day: number): string {
  return new Date(day * DAY_MS).toISOString();
}

function todayDay(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / DAY_MS);
}

/**
 * The CALCULATED earliest eligible transfer date and how far away it is.
 * Advisory: it describes the operator rule, it never writes anything.
 */
export function computeDeedTransferEligibility(
  input: DeedTransferInput,
  nowMs: number = Date.now()
): DeedTransferEligibility {
  const previousDay = parseDay(input.previousTransferDate);
  const purchaseDay = parseDay(input.purchaseDate);

  let baseDate: string | null = null;
  let baseSource: DeedBaseSource = 'MISSING';
  let baseDay: number | null = null;

  if (previousDay !== null) {
    baseDay = previousDay;
    baseDate = dayToIso(previousDay);
    baseSource = 'PREVIOUS_TRANSFER';
  } else if (purchaseDay !== null) {
    // Legacy record: keep it measurable, but say out loud that the base is a
    // substitute so nobody mistakes this for a confirmed previous transfer.
    baseDay = purchaseDay;
    baseDate = dayToIso(purchaseDay);
    baseSource = 'PURCHASE_FALLBACK';
  }

  const needsVerification = baseSource !== 'PREVIOUS_TRANSFER';
  const nextEligibleDate = baseDay === null ? null : dayToIso(baseDay + MAX_DEED_TRANSFER_DAYS);
  const remainingDays = baseDay === null ? null : baseDay + MAX_DEED_TRANSFER_DAYS - todayDay(nowMs);

  let status: DeedEligibilityStatus;
  if (baseDay === null) status = 'UNKNOWN';
  else if (remainingDays! > 0) status = 'WAITING';
  else if (remainingDays! === 0) status = 'ELIGIBLE';
  else status = 'OVERDUE';

  // A recorded completion is an operational fact that outranks the clock: the
  // transfer happened, so the eligibility question is settled regardless of
  // where the 20-day window currently sits.
  if (input.deedTransferCompletedAt) status = 'COMPLETED';

  return { baseDate, baseSource, needsVerification, nextEligibleDate, remainingDays, status };
}

/**
 * Status of the operator's manual due date, which is what the UI labels and the
 * reminder scheduler both follow. Pure and now-parameterised so tests can pin
 * the calendar day instead of racing midnight.
 */
export function computeDeedFollowStatus(
  input: DeedTransferInput,
  nowMs: number = Date.now()
): { status: DeedFollowStatus; remainingDays: number | null } {
  if (input.deedTransferCompletedAt) return { status: 'COMPLETED', remainingDays: null };

  const dueDay = parseDay(input.deedTransferDueDate);
  if (dueDay === null) return { status: 'NOT_SET', remainingDays: null };

  const remainingDays = dueDay - todayDay(nowMs);
  if (remainingDays > 0) return { status: 'WAITING', remainingDays };
  if (remainingDays === 0) return { status: 'DUE_TODAY', remainingDays: 0 };
  return { status: 'OVERDUE', remainingDays };
}

/** Persian label for the manual follow-up status. */
export function deedFollowStatusLabelFa(status: DeedFollowStatus): string {
  switch (status) {
    case 'WAITING':
      return 'در انتظار سررسید';
    case 'DUE_TODAY':
      return 'سررسید امروز / آماده پیگیری';
    case 'OVERDUE':
      return 'سررسید گذشته';
    case 'COMPLETED':
      return 'انتقال انجام شد';
    default:
      return 'تاریخ سررسید ثبت نشده';
  }
}

/** Persian label for the *calculated* eligibility status — advisory wording. */
export function deedEligibilityStatusLabelFa(status: DeedEligibilityStatus): string {
  switch (status) {
    case 'WAITING':
      return 'هنوز مجاز نیست';
    case 'ELIGIBLE':
      return 'مجاز شد';
    case 'OVERDUE':
      return 'موعد مجاز گذشته';
    case 'UNKNOWN':
      return 'نیازمند بررسی';
    default:
      return 'نامشخص';
  }
}

/** "۱۵ روز دیگر" / "امروز" / "۹ روز گذشته" — never a negative countdown. */
export function deedRemainingLabelFa(remainingDays: number | null): string {
  if (remainingDays === null) return 'نامشخص';
  if (remainingDays > 0) return `${remainingDays} روز دیگر`;
  if (remainingDays === 0) return 'امروز';
  return `${-remainingDays} روز گذشته`;
}

/**
 * Checks a hand-chosen follow-up date against the calculated legal window.
 *
 * The date the operator picked is NEVER rejected for being outside that window
 * and is NEVER rewritten — operational due dates legitimately differ per SIM and
 * may sit well past the earliest legal date. The only thing worth flagging is
 * the opposite case: a due date earlier than a *known* eligibility date would
 * otherwise let the record read as legally eligible when it is not. That is a
 * warning the caller surfaces, not a refusal, and no eligibility date is
 * invented when the base is unknown.
 */
export function validateDeedTransferDueDate(
  input: DeedTransferInput,
  nowMs: number = Date.now()
): DeedDueDateCheck {
  const dueRaw = (input.deedTransferDueDate || '').trim();
  if (!dueRaw) return { ok: true };

  const dueDay = parseDay(dueRaw);
  if (dueDay === null) {
    return { ok: false, warning: 'تاریخ سررسید انتقال سند نامعتبر است.' };
  }

  const eligible = computeDeedTransferEligibility(input, nowMs);
  // No confirmed base → nothing to warn about. Do not invent an eligibility
  // date, and never refuse a date the operator chose by hand.
  if (!eligible.nextEligibleDate) return { ok: true, daysFromBase: null };

  const baseDay = parseDay(eligible.baseDate)!;
  const daysFromBase = dueDay - baseDay;

  const eligibleDay = parseDay(eligible.nextEligibleDate)!;
  const daysBeforeEligibility = eligibleDay - dueDay;

  // A documented, authorized exception waives the advisory warning. The date
  // is still stored exactly as chosen — nothing is refused or rewritten — but
  // the record is no longer flagged as operating outside the legal window.
  const authorized =
    Boolean(input.deedTransferOverride) &&
    Boolean((input.deedTransferOverrideReason || '').trim()) &&
    Boolean(input.canOverride);
  if (authorized || daysBeforeEligibility <= 0) {
    return { ok: true, daysFromBase, daysBeforeEligibility: Math.max(0, daysBeforeEligibility) };
  }

  return {
    ok: true,
    daysFromBase,
    daysBeforeEligibility,
    warning:
      `تاریخ سررسید انتخابی ${daysBeforeEligibility} روز پیش از تاریخ مجاز انتقال ` +
      `(${deedRemainingLabelFa(eligible.remainingDays)} دیگر) است. تاریخ انتخابی شما حفظ می‌شود، ` +
      `اما تا رسیدن به تاریخ مجاز (${MAX_DEED_TRANSFER_DAYS} روز پس از انتقال سند قبلی)، ` +
      'این انتقال از نظر عملیاتی قابل انجام نیست.',
  };
}

/**
 * Checks a recorded completion date against the calculated eligibility.
 *
 * Completion is an operational fact: recording it is never blocked, because the
 * operator may legitimately have completed a transfer under an arrangement this
 * module does not know about. What matters is that the record must not be
 * presented as legally eligible on its own terms, so this surfaces a warning for
 * the caller to show.
 */
export function validateDeedTransferCompletion(
  input: DeedTransferInput,
  nowMs: number = Date.now()
): DeedDueDateCheck {
  const completedDay = parseDay(input.deedTransferCompletedAt);
  if (completedDay === null) return { ok: true };

  const eligible = computeDeedTransferEligibility(input, nowMs);
  if (!eligible.nextEligibleDate) return { ok: true };

  const eligibleDay = parseDay(eligible.nextEligibleDate)!;
  if (completedDay >= eligibleDay) return { ok: true, daysBeforeEligibility: 0 };

  // A documented, authorized exception waives the advisory warning. Recording
  // the completion is never blocked — the warning is what keeps the record from
  // reading as legally eligible on its own terms.
  const authorized =
    Boolean(input.deedTransferOverride) &&
    Boolean((input.deedTransferOverrideReason || '').trim()) &&
    Boolean(input.canOverride);
  if (authorized) return { ok: true, daysBeforeEligibility: eligibleDay - completedDay };

  return {
    ok: true,
    daysBeforeEligibility: eligibleDay - completedDay,
    warning:
      `انتقال سند ${eligibleDay - completedDay} روز پیش از تاریخ مجاز ثبت شده است. ` +
      'تاریخ تکمیل حفظ می‌شود؛ در صورت نیاز، توافق‌نامه مرتبط را در پرونده ثبت کنید.',
  };
}

/**
 * Deterministic id for the "eligibility base is unconfirmed" verification notice.
 *
 * A SIM whose previous ownership-transfer date is unknown has no calculated
 * eligibility date to schedule against, so it gets a single, stable
 * verification nudge instead of a reminder that would pretend a deadline
 * exists. The id depends only on the SIM, so retries and restarts can never
 * create a duplicate.
 */
export function deedVerificationReminderId(simId: string): string {
  return `notif-sim-deed-${simId}-verify-base`;
}

/** Deterministic reminder key so scheduler retries can never duplicate a notice. */
export function deedReminderId(
  simId: string,
  dateIso: string,
  kind: 'day-before' | 'on-due-date' | 'due-overdue'
): string {
  const day = parseDay(dateIso) ?? 0;
  return `notif-sim-deed-${simId}-${kind}-d${day}`;
}
