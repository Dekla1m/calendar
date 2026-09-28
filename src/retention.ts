export function oneMonthAgo(now: Date): Date {
  const lastDayOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  return new Date(
    now.getFullYear(), now.getMonth() - 1,
    Math.min(now.getDate(), lastDayOfPreviousMonth),
    now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds(),
  );
}

export function retentionCutoff(now: Date): { date: string; time: string; includeMinute: boolean } {
  const cutoff = oneMonthAgo(now);
  return {
    date: `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`,
    time: `${String(cutoff.getHours()).padStart(2, '0')}:${String(cutoff.getMinutes()).padStart(2, '0')}`,
    includeMinute: cutoff.getSeconds() > 0 || cutoff.getMilliseconds() > 0,
  };
}

export function isExpired(event: { date: string; start: string; repeatEnd?: string | null }, now: Date): boolean {
  const cutoff = oneMonthAgo(now);
  const [year, month, day] = (event.repeatEnd ?? event.date).split('-').map(Number);
  const [hours, minutes] = event.start.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes).getTime() < cutoff.getTime();
}
