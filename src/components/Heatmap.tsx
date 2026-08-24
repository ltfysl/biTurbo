import clsx from "clsx";

const DAY = 24 * 3600 * 1000;
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export function Heatmap({
  values,
  onCellClick,
}: {
  values: number[];
  onCellClick?: (dayTimestamp: number) => void;
}) {
  // (#180) Align grid to week boundaries (Monday), show M..S row labels and month markers.
  const now = Date.now();
  const days = values.length;
  const endDay = Math.floor(now / DAY);
  const startDayTs = (endDay - (days - 1)) * DAY;
  const startDay = new Date(startDayTs).getDay(); // 0=Sun..6=Sat
  const leading = (startDay + 6) % 7; // pad back to Monday
  const gridStartTs = startDayTs - leading * DAY;
  const padded = [...Array(leading).fill(0), ...values];
  const total = padded.length;
  const weeks = Math.ceil(total / 7);
  const max = Math.max(1, ...padded);

  const months: (string | null)[] = [];
  let lastMonthIndex = -1;
  for (let w = 0; w < weeks; w++) {
    const wStart = new Date(gridStartTs + w * 7 * DAY);
    const firstOfMonth = Array.from({ length: 7 }, (_, d) =>
      new Date(wStart.getTime() + d * DAY)
    ).find((d) => d.getDate() === 1);
    if (firstOfMonth) {
      const mIdx = firstOfMonth.getMonth();
      if (mIdx !== lastMonthIndex) {
        months.push(firstOfMonth.toLocaleDateString(undefined, { month: "short" }));
        lastMonthIndex = mIdx;
        continue;
      }
    }
    months.push(null);
  }

  return (
    <div className="flex items-start gap-1">
      <div className="flex flex-col gap-1">
        {WEEKDAYS.map((d, i) => (
          <div
            key={i}
            className="flex h-3 w-3 items-center justify-center text-[10px] leading-none text-text-dim"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: weeks }).map((_, week) => (
            <div key={week} className="flex flex-col gap-1">
              {Array.from({ length: 7 }).map((_, day) => {
                const idx = week * 7 + day;
                if (idx >= total) return null;
                const v = padded[idx] || 0;
                const intensity = v / max;
                const daysAgo = total - 1 - idx;
                const dayTs = (endDay - daysAgo) * DAY;
                const cellDate = new Date(dayTs);
                const label =
                  daysAgo === 0
                    ? `Today · ${v} actions`
                    : `${cellDate.toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })} · ${v} actions`;
                // (#181) Tooltip includes the formatted date; click filters the activity feed to this day.
                return (
                  <button
                    key={day}
                    type="button"
                    title={label}
                    onClick={() => onCellClick?.(dayTs)}
                    className={clsx(
                      "h-3 w-3 rounded-sm transition hover:ring-1 hover:ring-accent",
                      onCellClick ? "cursor-pointer" : "cursor-default",
                      v === 0
                        ? "bg-surface-2"
                        : intensity < 0.25
                          ? "bg-accent/20"
                          : intensity < 0.5
                            ? "bg-accent/40"
                            : intensity < 0.75
                              ? "bg-accent/60"
                              : "bg-accent"
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div
          className="mt-1 grid gap-1"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {months.map((m, i) => (
            <div key={i} className="text-center text-[10px] text-text-dim">
              {m ?? ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
