"use client";
import { useState } from "react";
import { History, ArrowRightLeft } from "lucide-react";
import type { Snapshot } from "@/lib/types";
import { normalize } from "@/lib/validation";
import { date } from "@/lib/display";
export default function HistoryView({ data }: { data: Snapshot }) {
  const [q, setQ] = useState(""),
    [action, setAction] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const events = data.history.filter(
    (m) =>
      normalize(
        `${m.product ?? ""} ${m.source ?? ""} ${m.destination ?? ""}`,
      ).includes(normalize(q)) &&
      (!action || m.action_type === action) &&
      (!from || m.created_at.slice(0, 10) >= from) &&
      (!to || m.created_at.slice(0, 10) <= to),
  );
  return (
    <section>
      <div className="page-heading">
        <div className="eyebrow">EVERY CHANGE, RECORDED</div>
        <h1>
          Inventory history<span className="heading-dot">.</span>
        </h1>
        <p>A shared record of stock movements. Corrections add a new entry.</p>
      </div>
      <div className="form-card">
        <div className="history-filters">
          <label>
            Product or pallet
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search history…"
            />
          </label>
          <label>
            Action
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {[
                "PALLET_CREATED",
                "PALLET_ACTIVATED",
                "STOCK_ADDED",
                "STOCK_REPLENISHED",
                "STOCK_ADJUSTED",
                "STOCK_TRANSFERRED",
                "PALLET_CLOSED",
                "PALLET_EDITED",
              ].map((a) => (
                <option key={a} value={a}>
                  {a.toLowerCase().replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            From (UTC)
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            To (UTC)
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <p className="small">
          {events.length} events · Times shown in your device timezone
        </p>
        <div className="history-list">
          {events.map((m) => (
            <article key={m.id}>
              <span className="history-icon">
                {m.action_type === "STOCK_TRANSFERRED" ? (
                  <ArrowRightLeft size={19} />
                ) : (
                  <History size={19} />
                )}
              </span>
              <div>
                <strong>
                  {m.action_type.toLowerCase().replaceAll("_", " ")}
                </strong>
                <p>
                  {m.product ?? m.source}
                  {m.product && ` · ${m.source}`}
                  {m.destination && ` → ${m.destination}`}
                </p>
                {m.notes && <p className="small">{m.notes}</p>}
              </div>
              <div className="history-numbers">
                {m.product && (
                  <strong>
                    {m.quantity > 0 ? "+" : ""}
                    {m.quantity} units
                  </strong>
                )}
                {m.quantity_before !== null && (
                  <small>
                    {m.quantity_before} → {m.quantity_after}
                  </small>
                )}
                <time>{date(m.created_at)}</time>
              </div>
            </article>
          ))}
        </div>
        {!events.length && (
          <div className="empty">
            <History />
            <h3>No movements found</h3>
            <p>Stock changes will appear here as they happen.</p>
          </div>
        )}
      </div>
    </section>
  );
}
