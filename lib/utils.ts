// Pure utility functions shareable across routes and testable in isolation.

/**
 * Calculate the streak of consecutive days with a journal entry ending at today.
 * If today has no entry, the streak starts counting from yesterday backward.
 */
export function calculateStreak(
  dates: Array<{ entry_date: string }>,
  today: Date = new Date()
): number {
  const dateSet = new Set(dates.map((r) => r.entry_date));
  let streak = 0;

  for (let i = 0; i < 31; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    if (dateSet.has(key)) {
      streak++;
    } else if (i === 0) {
      // today missing, check if yesterday starts the streak
      continue;
    } else {
      break;
    }
  }

  return streak;
}
