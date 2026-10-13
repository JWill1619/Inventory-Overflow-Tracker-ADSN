"use client";
import { useState } from "react";
import { Plus, Rows3 } from "lucide-react";
import type { Product, Snapshot, Submit } from "@/lib/types";
import { shelfReport } from "@/lib/shelves";
import { date, number } from "@/lib/display";
import ProductInput from "./product-input";

export default function ShelvesView({
  data,
  disabled,
  submit,
  openPallet,
}: {
  data: Snapshot;
  disabled: boolean;
  submit: Submit;
  openPallet: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Product>();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reference, setReference] = useState("");
  const [confirm, setConfirm] = useState(false);
  const invalidDates = Boolean(from && to && from > to);
  const { products, events } = shelfReport(data, query, from, to);
  const units = events.reduce((s, e) => s + e.quantity, 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || !selected?.stockCode) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    if (
      await submit({
        action: "shelfDelivery",
        productId: selected.id,
        quantity: Number(quantity),
        reference,
      })
    ) {
      setAdding(false);
      setConfirm(false);
      setName("");
      setSelected(undefined);
      setQuantity("");
      setReference("");
    }
  }
  return (
    <section>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FROM DELIVERY TO SHELVES</div>
          <h1>
            Shelves<span className="heading-dot">.</span>
          </h1>
          <p>A record of the units put onto shelves, by stock code.</p>
        </div>
        <button
          className="primary"
          disabled={disabled || adding}
          onClick={() => setAdding(true)}
        >
          <Plus size={18} /> Record direct delivery
        </button>
      </div>
      <div className="shelf-explainer">
        <Rows3 size={24} />
        <div>
          <strong>Replenishment history · Not a current shelf balance</strong>
          <p>
            Sales are recorded in your existing system. Use this record
            alongside it when checking stock. To put away pallet stock, open its
            pallet and choose “Move to shelves”.
          </p>
        </div>
      </div>
      {adding && (
        <form className="form-card" onSubmit={save}>
          <div className="board-top">
            <h2>Direct delivery to shelves</h2>
            <button
              className="quiet"
              type="button"
              disabled={disabled}
              onClick={() => {
                setAdding(false);
                setConfirm(false);
              }}
            >
              Cancel
            </button>
          </div>
          <p className="directory-note">
            Only record units delivered straight to shelves. Stock already on a
            pallet should be moved from that pallet instead.
          </p>
          <fieldset
            disabled={disabled || confirm}
            className="shelf-entry-fields"
          >
            <label>
              Product name / stock code
              <ProductInput
                products={data.products}
                value={name}
                selectedId={selected?.id}
                onChange={(value, _brand, product) => {
                  setName(value);
                  setSelected(product);
                }}
              />
            </label>
            <label>
              Units put onto shelves
              <input
                type="number"
                inputMode="numeric"
                required
                min="1"
                max="1000000"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <label>
              Delivery reference or note
              <input
                required
                maxLength={160}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="For example: Tuesday delivery, note 1042"
              />
            </label>
          </fieldset>
          <p className="small">
            Recorded at the time you save. Existing overflow quantities stay the
            same.
          </p>
          {confirm && (
            <p className="warning" role="status">
              Record {quantity} units of {selected?.stockCode} ·{" "}
              {selected?.name} as a direct-to-shelf delivery? Reference:{" "}
              {reference}.
            </p>
          )}
          <div className="shelf-form-actions">
            {confirm && (
              <button
                className="quiet"
                type="button"
                disabled={disabled}
                onClick={() => setConfirm(false)}
              >
                Edit details
              </button>
            )}
            <button
              className="primary"
              disabled={disabled || !selected?.stockCode || !reference.trim()}
            >
              {disabled
                ? "Saving…"
                : confirm
                  ? "Confirm delivery"
                  : "Review delivery"}
            </button>
          </div>
        </form>
      )}
      <div className="form-card">
        <div className="shelf-filters">
          <label>
            Search stock code or product
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an item…"
            />
          </label>
          <label>
            From (UTC)
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To (UTC)
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button
            className="quiet"
            onClick={() => {
              setQuery("");
              setFrom("");
              setTo("");
            }}
          >
            Clear filters
          </button>
        </div>
        {invalidDates ? (
          <p className="error" role="alert">
            The end date must be on or after the start date.
          </p>
        ) : (
          <>
            <div className="shelf-summary">
              <strong>{number(units)} units put onto shelves</strong>
              <span>
                {from || to
                  ? "In the selected date range"
                  : "Across all recorded dates"}{" "}
                · {events.length} entries
              </span>
            </div>
            <p className="small">
              Date filters apply to shelf entries. Overflow figures always show
              the current active pallet stock. These figures do not represent
              total deliveries received.
            </p>
            <div className="shelf-products">
              {products.map((p) => (
                <article className="shelf-product" key={p.id}>
                  <div>
                    <span className="stock-code">
                      {p.stockCode ?? "Unlinked legacy item"}
                    </span>
                    <h3>{p.name}</h3>
                  </div>
                  <dl>
                    <div>
                      <dt>Put onto shelves</dt>
                      <dd>{number(p.fromPallets + p.direct)}</dd>
                      <small>
                        {number(p.fromPallets)} from pallets ·{" "}
                        {number(p.direct)} direct
                      </small>
                    </div>
                    <div>
                      <dt>In overflow now</dt>
                      <dd>{number(p.overflow)}</dd>
                      <small>Current active pallets</small>
                    </div>
                  </dl>
                  {p.locations.length > 0 && (
                    <div className="shelf-locations">
                      {p.locations.map((l) => (
                        <button
                          className="quiet"
                          key={l.palletId}
                          onClick={() => openPallet(l.palletId)}
                        >
                          {l.name} · {number(l.quantity)} units →
                        </button>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            {!products.length && (
              <div className="empty">
                <Rows3 />
                <h3>No matching shelf records</h3>
                <p>
                  Move stock from a pallet to shelves, or record a direct
                  delivery.
                </p>
              </div>
            )}
            <h2 className="shelf-history-heading">Shelf entries</h2>
            <p className="small">
              Newest first · Times shown in your device timezone
            </p>
            <div className="shelf-entries">
              {events.map((e) => (
                <article key={e.id}>
                  <div>
                    <strong>
                      {e.stockCode ? `${e.stockCode} · ` : ""}
                      {e.product}
                    </strong>
                    <p>
                      {e.action_type === "SHELF_DELIVERY"
                        ? "Direct delivery → Shelves"
                        : `${e.source} → Shelves`}
                    </p>
                    {e.notes && <p className="small">{e.notes}</p>}
                  </div>
                  <div>
                    <strong>{number(e.quantity)} units</strong>
                    <time dateTime={e.created_at}>{date(e.created_at)}</time>
                  </div>
                </article>
              ))}
            </div>
            {!events.length && (
              <p className="small">No shelf entries in this date range.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
