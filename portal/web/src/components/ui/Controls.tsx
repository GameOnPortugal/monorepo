/**
 * The filter vocabulary every list page shares (M11).
 *
 * Before this, Marketplace and Screenshots each rendered a row of bare
 * `<select>`s — which meant the two pages looked unrelated, and neither told
 * you what was currently filtering the results without re-reading every
 * dropdown. These controls are one set, used by both, and they always show
 * their own state: a segment is visibly chosen, a select that is not on
 * "all" is highlighted, and `ActiveFilters` summarises the lot with a way
 * back out.
 *
 * Native `<select>` is kept underneath the styled shell rather than replaced
 * with a custom listbox: it is keyboard- and screen-reader-correct for free,
 * and on a phone it opens the platform picker, which is the right control in
 * the Discord in-app browser this site is mostly opened from.
 */

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; accent?: string }>;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex rounded-lg border border-surface-border bg-surface p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`focus-glow rounded-md px-3 py-1.5 font-mono text-xs tracking-wider uppercase transition-colors ${
              active ? "text-background" : "text-white/55 hover:text-white"
            }`}
            style={active ? { backgroundColor: option.accent ?? "var(--color-foreground)" } : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  label,
  allLabel,
}: {
  value: T | "all";
  onChange: (value: T | "all") => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label: string;
  allLabel: string;
}) {
  const isFiltering = value !== "all";

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T | "all")}
        className={`focus-glow appearance-none rounded-lg border bg-surface py-2 pr-8 pl-3 font-mono text-xs tracking-wide text-white transition-colors ${
          isFiltering ? "border-accent-mint/60" : "border-surface-border hover:border-white/25"
        }`}
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
            {option.count !== undefined ? ` (${option.count})` : ""}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute right-3 text-white/40">
        ▾
      </span>
    </label>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="relative inline-flex min-w-0 flex-1 items-center sm:max-w-xs">
      <span className="sr-only">{label}</span>
      <span aria-hidden className="pointer-events-none absolute left-3 text-white/35">
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`focus-glow w-full rounded-lg border bg-surface py-2 pr-3 pl-8 text-sm text-white placeholder:text-white/30 ${
          value ? "border-accent-mint/60" : "border-surface-border hover:border-white/25"
        }`}
      />
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`focus-glow inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs tracking-wide transition-colors ${
        checked
          ? "border-accent-mint/60 text-white"
          : "border-surface-border text-white/55 hover:border-white/25 hover:text-white"
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${checked ? "bg-accent-mint" : "bg-white/25"}`}
      />
      {children}
    </button>
  );
}

/**
 * The summary line: what is filtering right now, each removable, plus the
 * result count. Rendered even with no filters active so the count never
 * jumps around as chips appear — an empty chip row still reports "N de M".
 */
export function ActiveFilters({
  chips,
  onClearAll,
  resultCount,
  totalCount,
  noun,
}: {
  chips: Array<{ key: string; label: string; onRemove: () => void }>;
  onClearAll: () => void;
  resultCount: number;
  totalCount: number;
  noun: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-surface-border pt-4">
      <span className="font-mono text-xs text-white/45">
        <span className="tabular text-white">{resultCount.toLocaleString("pt-PT")}</span>
        {resultCount !== totalCount && <> de {totalCount.toLocaleString("pt-PT")}</>} {noun}
      </span>

      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="focus-glow inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-surface py-1 pr-2 pl-3 font-mono text-xs text-white/75 transition-colors hover:border-white/30 hover:text-white"
        >
          {chip.label}
          <span aria-hidden className="text-white/40">
            ✕
          </span>
          <span className="sr-only">(remover filtro)</span>
        </button>
      ))}

      {chips.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="focus-glow font-mono text-xs text-accent-mint hover:underline"
        >
          limpar tudo
        </button>
      )}
    </div>
  );
}
