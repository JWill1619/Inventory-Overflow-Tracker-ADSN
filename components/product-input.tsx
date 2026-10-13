"use client";
import { useId, useState } from "react";
import type { Product } from "@/lib/types";
import { normalize } from "@/lib/validation";
export default function ProductInput({
  products,
  value,
  onChange,
  selectedId,
}: {
  products: Product[];
  value: string;
  selectedId?: string;
  onChange: (value: string, brand?: string, product?: Product) => void;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const listId = useId();
  const catalog = products.some((p) => p.stockCode);
  const tokens = normalize(value).split(" ").filter(Boolean);
  const matches = products
    .filter(
      (p) =>
        (!catalog || p.stockCode) &&
        tokens.every((t) =>
          normalize(`${p.stockCode ?? ""} ${p.name} ${p.brand}`).includes(t),
        ),
    )
    .sort(
      (a, b) =>
        Number(normalize(b.stockCode ?? "") === normalize(value)) -
        Number(normalize(a.stockCode ?? "") === normalize(value)),
    )
    .slice(0, 12);
  const selected = products.find((p) => p.id === selectedId);
  function choose(p: Product) {
    onChange(p.name, p.brand, p);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div className="autocomplete">
      <input
        aria-label="Product name"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={
          catalog
            ? "Search stock code or product description"
            : "Start typing a product name"
        }
        value={value}
        maxLength={160}
        required
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((n) => Math.min(n + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((n) => Math.max(n - 1, 0));
          } else if (
            e.key === "Enter" &&
            open &&
            active >= 0 &&
            matches[active]
          ) {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {selected?.stockCode && (
        <span className="selected-code">
          Stock code: <strong>{selected.stockCode}</strong> · Official item
          selected
        </span>
      )}
      {open && (
        <div
          className="suggestions"
          id={listId}
          role="listbox"
          aria-label="Matching products"
        >
          {matches.map((p, index) => (
            <button
              type="button"
              role="option"
              aria-selected={active === index}
              id={`${listId}-${index}`}
              key={p.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
            >
              {p.stockCode && (
                <strong className="stock-code">{p.stockCode} · </strong>
              )}
              {p.name}
              {p.brand && <small>{p.brand}</small>}
            </button>
          ))}
          {!matches.length && (
            <p>
              {catalog
                ? "No matching master-list item. Check the stock code or ask your supervisor to update the directory."
                : "New product — check the name, size and brand before saving."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
