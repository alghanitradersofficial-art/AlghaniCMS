import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export type DateRangeValue = {
  preset: "today" | "week" | "month" | "year" | "all" | "custom";
  from?: Date;
  to?: Date;
};

const PRESETS: { key: DateRangeValue["preset"]; label: string }[] = [
  { key: "today", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
  { key: "all", label: "All Time" },
];

/**
 * Shared date-range control used at the top of every list/report page and
 * the dashboard (Today / Week / Month / Year / All Time + custom range,
 * including old dates from previous years). Backend endpoints read this via
 * `range`/`from`/`to` query params — see resolveRange() in dashboard.ts and
 * the equivalent pattern in general-ledger.ts / calendar.ts.
 */
export function DateRangeSelector({
  value,
  onChange,
  className,
}: {
  value: DateRangeValue;
  onChange: (v: DateRangeValue) => void;
  className?: string;
}) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState<Date | undefined>(value.from);
  const [draftTo, setDraftTo] = useState<Date | undefined>(value.to);

  const label =
    value.preset === "custom" && value.from && value.to
      ? `${format(value.from, "d MMM yyyy")} – ${format(value.to, "d MMM yyyy")}`
      : PRESETS.find((p) => p.key === value.preset)?.label ?? "All Time";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-muted p-1">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={value.preset === p.key ? "default" : "ghost"}
            className="h-7 px-3 text-xs"
            onClick={() => onChange({ preset: p.key, from: undefined, to: undefined })}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <Popover open={customOpen} onOpenChange={setCustomOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={value.preset === "custom" ? "default" : "outline"}
            className="h-7 gap-1.5 text-xs"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            {value.preset === "custom" ? label : "Custom Range"}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col sm:flex-row">
            <div className="border-b p-3 sm:border-b-0 sm:border-r">
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">From</p>
              <Calendar
                mode="single"
                selected={draftFrom}
                onSelect={setDraftFrom}
                captionLayout="dropdown"
                startMonth={new Date(2015, 0)}
                endMonth={new Date(new Date().getFullYear() + 1, 11)}
              />
            </div>
            <div className="p-3">
              <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">To</p>
              <Calendar
                mode="single"
                selected={draftTo}
                onSelect={setDraftTo}
                captionLayout="dropdown"
                startMonth={new Date(2015, 0)}
                endMonth={new Date(new Date().getFullYear() + 1, 11)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t p-3">
            <Button size="sm" variant="ghost" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!draftFrom || !draftTo}
              onClick={() => {
                if (draftFrom && draftTo) {
                  onChange({ preset: "custom", from: draftFrom, to: draftTo });
                  setCustomOpen(false);
                }
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Converts a DateRangeValue into the query params the backend expects. */
export function dateRangeToParams(value: DateRangeValue): URLSearchParams {
  const params = new URLSearchParams();
  params.set("range", value.preset);
  if (value.preset === "custom" && value.from && value.to) {
    params.set("from", format(value.from, "yyyy-MM-dd"));
    params.set("to", format(value.to, "yyyy-MM-dd"));
  }
  return params;
}
