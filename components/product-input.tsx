"use client";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { normalize } from "@/lib/validation";
export default function ProductInput({
  products,
  value,
  onChange,
}: {
  products: Product[];
  value: string;
  onChange: (value: string, brand?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const matches = products
    .filter((p) => normalize(p.name + " " + p.brand).includes(normalize(value)))
    .slice(0, 8);
  return (
    <div className="autocomplete">
      <input
        aria-label="Product name"
        placeholder="Start typing a product name"
        value={value}
        maxLength={160}
        required
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && value && (
        <div className="suggestions">
          {matches.map((p) => (
            <button
              type="button"
              key={p.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(p.name, p.brand);
                setOpen(false);
              }}
            >
              {p.name}
              <small>{p.brand}</small>
            </button>
          ))}
          {!matches.length && (
            <p>New product — check the name, size and brand before saving.</p>
          )}
        </div>
      )}
    </div>
  );
}
