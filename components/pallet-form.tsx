"use client";
import { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import type { Product, Pallet, Submit } from "@/lib/types";
import { validatePalletForm } from "@/lib/pallet-form";
import ProductInput from "./product-input";
export default function PalletForm({
  products,
  initialName,
  disabled,
  submit,
  pallet,
}: {
  products: Product[];
  initialName: string;
  disabled: boolean;
  submit: Submit;
  pallet?: Pallet;
}) {
  const [identifier, setIdentifier] = useState(initialName),
    [lines, setLines] = useState(
      pallet?.items.map((i) => ({
        name: i.name,
        brand: i.brand,
        quantity: String(i.quantity),
      })) ?? [{ name: "", brand: "", quantity: "" }],
    );
  const [localError, setLocalError] = useState("");
  function update(index: number, values: Partial<(typeof lines)[number]>) {
    setLines((current) =>
      current.map((l, i) => (i === index ? { ...l, ...values } : l)),
    );
    setLocalError("");
  }
  async function save(draft: boolean) {
    setLocalError("");
    const validated = validatePalletForm(identifier, lines);
    if (validated.errors.length) {
      setLocalError(validated.errors.join(" "));
      return;
    }
    const payload = {
      action: pallet ? "draft" : "create",
      ...(pallet ? { palletId: pallet.id, version: pallet.version } : {}),
      identifier,
      lines: validated.lines,
      draft,
    };
    await submit(payload);
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE SPACE FOR WHAT’S NEXT</div>
          <h1>
            {pallet ? "Edit draft" : "Create a pallet"}
            <span className="heading-dot">.</span>
          </h1>
          <p>Only record the stock that is going into overflow.</p>
        </div>
      </div>
      <div className="form-card">
        <div className="section-number">
          01<span>Pallet details</span>
        </div>
        <label htmlFor="identifier">Pallet identifier</label>
        <input
          id="identifier"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setLocalError("");
          }}
          maxLength={160}
          required
        />
        <p className="small">
          Use the name on your physical pallet. Rack locations aren’t required.
        </p>
        <div className="section-number">
          02<span>Leftover products</span>
        </div>
        <div className="draft-lines">
          {lines.map((l, i) => (
            <div className="draft-line" key={i}>
              <label>
                Product name
                <ProductInput
                  products={products}
                  value={l.name}
                  onChange={(name, brand) =>
                    update(i, {
                      name,
                      ...(brand !== undefined ? { brand } : {}),
                    })
                  }
                />
              </label>
              <label>
                Brand <span className="optional">(optional)</span>
                <input
                  value={l.brand}
                  maxLength={80}
                  onChange={(e) => update(i, { brand: e.target.value })}
                />
              </label>
              <label>
                Overflow units
                <input
                  aria-label={`Quantity for product ${i + 1}`}
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="1000000"
                  step="1"
                  value={l.quantity}
                  onChange={(e) => update(i, { quantity: e.target.value })}
                />
              </label>
              <button
                className="icon-button"
                aria-label={`Remove product ${i + 1}`}
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, n) => n !== i))}
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="outline"
          disabled={lines.length >= 100}
          onClick={() =>
            setLines([...lines, { name: "", brand: "", quantity: "" }])
          }
        >
          <Plus size={18} />
          Add another product
        </button>
        <p className="small">
          Unused blank rows are ignored. Finish partially entered rows or remove
          them.
        </p>
        {localError && (
          <p className="error" role="alert">
            {localError}
          </p>
        )}
        <div className="form-actions">
          <p>Drafts stay off the master board until you finish.</p>
          <button
            className="outline"
            disabled={disabled}
            onClick={() => void save(true)}
          >
            Save draft
          </button>
          {!pallet && (
            <button
              className="primary"
              disabled={disabled}
              onClick={() => void save(false)}
            >
              Finish &amp; Add to Overflow
              <Check size={18} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
