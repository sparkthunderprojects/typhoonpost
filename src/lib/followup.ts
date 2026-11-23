export type FollowUpOption = 'today' | 'tomorrow' | 'this-week' | 'next-week';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (the form tasks use for a due date). */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The day a follow-up quick option points at, counted from `now` in local time. */
export function followUpDay(option: FollowUpOption, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = d.getDay(); // 0 Sunday … 6 Saturday
  if (option === 'tomorrow') d.setDate(d.getDate() + 1);
  else if (option === 'this-week') {
    // Friday of this week; on Friday or at the weekend it is the coming Friday.
    d.setDate(d.getDate() + (dow >= 5 ? 5 + 7 - dow : 5 - dow));
  } else if (option === 'next-week') {
    d.setDate(d.getDate() + (dow === 0 ? 1 : 8 - dow)); // the coming Monday
  }
  return ymd(d);
}

/** Stored on the message as a moment in time: 9 am local on that day. */
export function followUpTimestamp(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 9, 0, 0).toISOString();
}

export function followUpTaskTitle(subject: string): string {
  return `Follow up: ${subject}`;
}
