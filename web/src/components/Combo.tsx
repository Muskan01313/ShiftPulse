import { useMemo, useRef, useState } from "react";

/** A dropdown you can search: type a few letters, then pick with a click or the arrow keys and Enter. */
export function Combo({
  label,
  value,
  options,
  onChange,
  onEnter,
  emptyText = "No choices yet",
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  /** Called after Enter, e.g. to move to the next field. */
  onEnter?: (input: HTMLInputElement) => void;
  /** Shown when there are no choices at all (as opposed to none matching the search). */
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const q = (text ?? "").trim().toLowerCase();
    if (!q) return options;
    // Names that start with what you typed come first, then names that contain it.
    const starts = options.filter((o) => o.toLowerCase().startsWith(q));
    const has = options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q));
    return [...starts, ...has];
  }, [options, text]);

  const pick = (o: string) => {
    setText(null);
    setOpen(false);
    if (o !== value) onChange(o);
  };
  const move = (i: number) => {
    setHi(i);
    listRef.current?.children[i]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="combo">
      <input
        className={"f" + (value || text ? "" : " empty")}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search…"
        value={text ?? value}
        onFocus={(e) => {
          e.target.select();
          setOpen(true);
          setHi(Math.max(0, options.indexOf(value)));
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) setOpen(true);
            else move(Math.min(hi + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            move(Math.max(hi - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && items[hi] !== undefined) pick(items[hi]);
            onEnter?.(e.currentTarget);
          } else if (e.key === "Escape") {
            setText(null);
            setOpen(false);
          }
        }}
        onBlur={() => {
          setOpen(false);
          if (text === null) return;
          const typed = text.trim();
          setText(null);
          // Only a real choice is kept; anything else goes back to the previous value.
          if (!typed) onChange("");
          else {
            const exact = options.find((o) => o.toLowerCase() === typed.toLowerCase());
            if (exact && exact !== value) onChange(exact);
          }
        }}
      />
      {open && (
        <div className="combo-list" role="listbox" ref={listRef}>
          {items.length === 0 && <div className="combo-none" style={{ whiteSpace: "normal", maxWidth: 260 }}>{options.length === 0 ? emptyText : "No match"}</div>}
          {items.map((o, i) => (
            <div
              key={o}
              role="option"
              aria-selected={i === hi}
              className={"combo-opt" + (i === hi ? " hi" : "")}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
