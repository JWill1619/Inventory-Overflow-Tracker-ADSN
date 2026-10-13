"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, ArrowRightLeft, Check } from "lucide-react";
import type { Product, Pallet, Item, Submit } from "@/lib/types";
import { total, date, number } from "@/lib/display";
import ProductInput from "./product-input";
import PalletForm from "./pallet-form";
export default function PalletDetail({
  pallet: p,
  pallets,
  products,
  disabled,
  submit,
  back,
}: {
  pallet: Pallet;
  pallets: Pallet[];
  products: Product[];
  disabled: boolean;
  submit: Submit;
  back: () => void;
}) {
  const catalog = products.some((p) => p.stockCode);
  const [selectedProduct, setSelectedProduct] = useState<Product | undefined>();
  const [operationVersion, setOperationVersion] = useState(p.version);
  const [mode, setMode] = useState<
      "take" | "add" | "correct" | "transfer" | "rename" | "link" | null
    >(null),
    [item, setItem] = useState<Item | null>(null),
    [quantity, setQuantity] = useState(""),
    [name, setName] = useState(""),
    [brand, setBrand] = useState(""),
    [reason, setReason] = useState(""),
    [destination, setDestination] = useState(""),
    [amounts, setAmounts] = useState<Record<string, string>>({}),
    [confirm, setConfirm] = useState(false);
  const operationHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!mode) return;
    operationHeading.current?.focus({ preventScroll: true });
    operationHeading.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }, [mode, item]);
  const begin = (m: typeof mode, i?: Item) => {
    setOperationVersion(p.version);
    setMode(m);
    setItem(i ?? null);
    setQuantity("");
    setName(m === "rename" ? p.pallet_identifier : "");
    setBrand("");
    setSelectedProduct(undefined);
    setReason("");
    setConfirm(false);
    setAmounts({});
    setDestination("");
  };
  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (
      (mode === "take" ||
        mode === "correct" ||
        mode === "transfer" ||
        mode === "link") &&
      !confirm
    ) {
      setConfirm(true);
      return;
    }
    const payload: Record<string, unknown> = {
      action: mode,
      palletId: p.id,
      version: operationVersion,
    };
    if (mode === "rename") payload.identifier = name;
    else if (mode === "link") {
      payload.productId = item?.productId;
      payload.officialProductId = selectedProduct?.id;
    } else if (mode === "transfer") {
      payload.destinationId = destination;
      payload.lines = p.items
        .filter((i) => Number(amounts[i.productId]) > 0)
        .map((i) => ({
          productId: i.productId,
          quantity: Number(amounts[i.productId]),
        }));
    } else {
      payload.quantity = Number(quantity);
      if (mode === "add") {
        if (catalog && !selectedProduct?.stockCode) return;
        payload.productId = selectedProduct?.id;
        payload.name = name;
        payload.brand = brand;
      } else payload.productId = item?.productId;
      if (mode === "correct") payload.reason = reason;
    }
    if (await submit(payload)) setMode(null);
    else setConfirm(false);
  }
  return (
    <section>
      <button className="back" onClick={back}>
        <ArrowLeft size={17} />
        Back to pallets
      </button>
      <div className="page-heading">
        <div className="eyebrow">PALLET DETAILS</div>
        <h1>{p.pallet_identifier}</h1>
        <p>
          {p.status === "DRAFT"
            ? "Draft · Not included in confirmed overflow"
            : `${number(total(p))} units · ${p.items.length} products · Updated ${date(p.updated_at)}`}
        </p>
      </div>
      {p.status === "DRAFT" ? (
        <>
          <PalletForm
            key={p.version}
            pallet={p}
            products={products}
            initialName={p.pallet_identifier}
            disabled={disabled}
            submit={submit}
          />
          <button
            className="primary"
            disabled={disabled}
            onClick={() =>
              void submit({
                action: "activate",
                palletId: p.id,
                version: p.version,
              })
            }
          >
            Finish &amp; Add to Overflow
            <Check size={18} />
          </button>
        </>
      ) : (
        <>
          <div className="detail-actions">
            <button
              className="primary"
              disabled={disabled}
              onClick={() => begin("add")}
            >
              <Plus size={18} />
              Add stock
            </button>
            {p.status === "ACTIVE" && (
              <>
                <button
                  className="outline"
                  disabled={disabled}
                  aria-expanded={mode === "transfer"}
                  aria-controls="pallet-operation"
                  onClick={() => begin("transfer")}
                >
                  <ArrowRightLeft size={18} />
                  Move / merge
                </button>
                <button
                  className="quiet"
                  disabled={disabled}
                  onClick={() => begin("rename")}
                >
                  Edit name
                </button>
              </>
            )}
          </div>
          <div className="detail-items">
            {p.items.map((i) => (
              <article key={i.productId}>
                <div>
                  <span className="eyebrow">
                    {i.brand || "OVERFLOW PRODUCT"}
                  </span>
                  <h3>{i.name}</h3>
                  <p className="stock-code">
                    {i.stockCode
                      ? `Stock code: ${i.stockCode}`
                      : "Unlinked legacy item"}
                  </p>
                </div>
                <strong>
                  {number(i.quantity)}
                  <small> units</small>
                </strong>
                {catalog && !i.stockCode && (
                  <button
                    className="outline"
                    disabled={disabled}
                    onClick={() => begin("link", i)}
                  >
                    Match to master list
                  </button>
                )}
                <button
                  className="primary"
                  disabled={disabled}
                  onClick={() => begin("take", i)}
                >
                  Move to shelves
                </button>
                <button
                  className="quiet"
                  disabled={disabled}
                  onClick={() => begin("correct", i)}
                >
                  Correct balance
                </button>
              </article>
            ))}
            {!p.items.length && (
              <div className="empty">
                <Check size={28} />
                <h3>This pallet is empty.</h3>
                <p>
                  Its full movement history is preserved. Add stock to reopen
                  it.
                </p>
              </div>
            )}
          </div>
        </>
      )}
      {mode && (
        <div
          className="operation"
          id="pallet-operation"
          aria-labelledby="operation-heading"
        >
          <form onSubmit={run}>
            <div className="board-top">
              <h2 id="operation-heading" ref={operationHeading} tabIndex={-1}>
                {
                  {
                    take: "Move to shelves",
                    add: "Add stock",
                    correct: "Correct balance",
                    transfer: "Move / merge stock",
                    rename: "Edit pallet name",
                    link: "Match to master list",
                  }[mode]
                }
              </h2>
              <button
                type="button"
                className="quiet"
                onClick={() => setMode(null)}
              >
                Cancel
              </button>
            </div>
            {mode === "transfer" &&
              !pallets.some((candidate) => candidate.id !== p.id) && (
                <p className="warning" role="status">
                  There is no other active pallet to move stock into. Create or
                  activate a second pallet, then return here to merge.
                </p>
              )}
            {item && (
              <p>
                <strong>{item.name}</strong> · Current balance:{" "}
                {p.items.find((i) => i.productId === item.productId)
                  ?.quantity ?? 0}{" "}
                units
              </p>
            )}
            {mode === "link" ? (
              <>
                <label>
                  Official product match
                  <ProductInput
                    products={products}
                    value={name}
                    selectedId={selectedProduct?.id}
                    onChange={(value, _brand, product) => {
                      setName(value);
                      setSelectedProduct(product);
                      setConfirm(false);
                    }}
                  />
                </label>
                <p>
                  Check the exact item and size. Matching combines this pallet’s
                  existing quantity with the official product and records an
                  identity correction in history.
                </p>
                {confirm && (
                  <p className="warning">
                    Confirm matching {item?.quantity} units of “{item?.name}” to{" "}
                    {selectedProduct?.stockCode} — {selectedProduct?.name}. The
                    pallet’s total units will stay the same.
                  </p>
                )}
              </>
            ) : mode === "rename" ? (
              <label>
                Pallet identifier
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={160}
                />
              </label>
            ) : mode === "transfer" ? (
              <>
                <label>
                  Destination pallet
                  <select
                    required
                    value={destination}
                    disabled={confirm}
                    onChange={(e) => setDestination(e.target.value)}
                  >
                    <option value="">Choose a destination</option>
                    {pallets
                      .filter((a) => a.id !== p.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.pallet_identifier}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="quiet"
                  disabled={confirm}
                  onClick={() =>
                    setAmounts(
                      Object.fromEntries(
                        p.items.map((i) => [i.productId, String(i.quantity)]),
                      ),
                    )
                  }
                >
                  Select all remaining stock
                </button>
                {p.items.map((i) => (
                  <label className="transfer-line" key={i.productId}>
                    {i.name}
                    {i.stockCode ? ` · ${i.stockCode}` : " · Unlinked"}
                    <span>{i.quantity} available</span>
                    <input
                      aria-label={`Move ${i.name}`}
                      type="number"
                      min="0"
                      max={i.quantity}
                      step="1"
                      inputMode="numeric"
                      disabled={confirm}
                      value={amounts[i.productId] ?? ""}
                      onChange={(e) =>
                        setAmounts({
                          ...amounts,
                          [i.productId]: e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
                {confirm && (
                  <div className="warning">
                    Confirm moving{" "}
                    {Object.values(amounts).reduce(
                      (s, v) => s + Number(v || 0),
                      0,
                    )}{" "}
                    units from {p.pallet_identifier} to{" "}
                    {
                      pallets.find((a) => a.id === destination)
                        ?.pallet_identifier
                    }
                    . Both balances will change together.
                  </div>
                )}
              </>
            ) : (
              <>
                {mode === "add" && (
                  <>
                    <label>
                      Product name
                      <ProductInput
                        products={products}
                        value={name}
                        selectedId={selectedProduct?.id}
                        onChange={(n, b, product) => {
                          setSelectedProduct(product);
                          setName(n);
                          if (b !== undefined) setBrand(b);
                        }}
                      />
                    </label>
                    {!catalog && (
                      <label>
                        Brand (optional)
                        <input
                          value={brand}
                          onChange={(e) => setBrand(e.target.value)}
                          maxLength={80}
                        />
                      </label>
                    )}
                    {catalog && !selectedProduct?.stockCode && (
                      <p className="small">
                        Select an official item from the suggestions before
                        adding stock.
                      </p>
                    )}
                  </>
                )}
                <label>
                  {mode === "correct"
                    ? "Actual physically counted units"
                    : mode === "take"
                      ? "Units to put onto shelves"
                      : "Additional units"}
                  <input
                    autoFocus
                    type="number"
                    inputMode="numeric"
                    min={mode === "correct" ? 0 : 1}
                    max={
                      mode === "take"
                        ? (p.items.find((i) => i.productId === item?.productId)
                            ?.quantity ?? 0)
                        : 1000000
                    }
                    step="1"
                    required
                    disabled={confirm}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </label>
                {mode === "take" && (
                  <p className={confirm ? "warning" : "small"}>
                    {confirm
                      ? `Confirm moving ${quantity} units from ${p.pallet_identifier} to shelves. `
                      : ""}
                    This reduces overflow and records the same quantity on the
                    Shelves page. Sales are tracked separately.
                  </p>
                )}
                {mode === "correct" && (
                  <>
                    <label>
                      Correction reason
                      <textarea
                        required
                        minLength={3}
                        maxLength={300}
                        disabled={confirm}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    {confirm && (
                      <div className="warning">
                        Confirm the balance of {quantity} units. This correction
                        and your reason will be recorded in history.
                      </div>
                    )}
                  </>
                )}
              </>
            )}
            {confirm && (
              <button
                type="button"
                className="quiet"
                onClick={() => setConfirm(false)}
              >
                Edit details
              </button>
            )}
            <button
              className="primary"
              disabled={
                disabled ||
                (((mode === "add" && catalog) || mode === "link") &&
                  !selectedProduct?.stockCode) ||
                (mode === "transfer" &&
                  !Object.values(amounts).some((a) => Number(a) > 0))
              }
            >
              {disabled
                ? "Saving…"
                : confirm
                  ? "Confirm change"
                  : mode === "take" ||
                      mode === "transfer" ||
                      mode === "correct" ||
                      mode === "link"
                    ? "Review change"
                    : "Confirm"}
              <Check size={18} />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
