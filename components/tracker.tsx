"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutGrid,
  Layers3,
  Plus,
  History,
  Search,
  ArrowUpRight,
  Package,
  Boxes,
  Check,
  LogOut,
  ShieldCheck,
  Download,
  WifiOff,
  ChevronRight,
} from "lucide-react";
import Brand from "./brand";
import type { Snapshot } from "@/lib/types";
import { normalize } from "@/lib/validation";

type Page = "Overview" | "Create Pallet" | "Pallets" | "History";
import { total, date, number } from "@/lib/display";
import Stat from "./stat";
import PalletForm from "./pallet-form";
import PalletDetail from "./pallet-detail";
import HistoryView from "./history-view";
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, {
    method,
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
    headers: { "Content-Type": "application/json", "x-adsn-request": "1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(result.error ?? "Request failed."), {
      status: r.status,
    });
  return result;
}
export default function Tracker() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [password, setPassword] = useState(""),
    [data, setData] = useState<Snapshot | null>(null),
    [page, setPage] = useState<Page>("Overview"),
    [view, setView] = useState("pallets"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("number"),
    [status, setStatus] = useState("ACTIVE"),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [offline, setOffline] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const retry = useRef<{ serialized: string; key: string } | null>(null);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const result = await api("/api/inventory");
      if (sequence !== refreshSequence.current) return;
      setData(result);
      setAuth(true);
      setOffline(false);
    } catch (e) {
      if (sequence !== refreshSequence.current) return;
      if ((e as { status?: number }).status === 401) {
        setAuth(false);
        setData(null);
      } else {
        setOffline(true);
        setError((e as Error).message);
      }
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    const timer = setInterval(() => void refresh(), 5000);
    const back = () => void refresh();
    const lost = () => setOffline(true);
    window.addEventListener("online", back);
    window.addEventListener("offline", lost);
    window.addEventListener("focus", back);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("online", back);
      window.removeEventListener("offline", lost);
      window.removeEventListener("focus", back);
    };
  }, [refresh]);
  async function submit(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    const serialized = JSON.stringify(payload);
    if (retry.current?.serialized !== serialized)
      retry.current = { serialized, key: crypto.randomUUID() };
    try {
      const r = await api("/api/inventory", "POST", {
        ...payload,
        key: retry.current.key,
      });
      retry.current = null;
      await refresh();
      setNotice(r.message);
      return true;
    } catch (e) {
      const code = (e as { status?: number }).status;
      if (code && code < 500) retry.current = null;
      setError((e as Error).message);
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  const navigate = (p: Page) => {
    setPage(p);
    setSelected(null);
    setQuery("");
    setError("");
    setNotice("");
  };
  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/session", "POST", { password });
      setPassword("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (auth !== true)
    return (
      <main className="login">
        <div className="login-brand">
          <Brand />
          <span>WAREHOUSE OPERATIONS</span>
        </div>
        <section className="login-card">
          <div className="eyebrow">YOUR OVERFLOW, IN ORDER</div>
          <h1>
            A clearer view
            <br />
            of your stock.
          </h1>
          <p>
            One shared board for every overflow pallet.
            <br />
            Ready when your shelves need it.
          </p>
          <div className="login-rule" />
          <h2>Company sign in</h2>
          <p className="small">Use your ADSN Solutions company password.</p>
          <form onSubmit={signIn}>
            <label htmlFor="password">Company password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to overflow"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <div className="login-security">
            <ShieldCheck size={18} />
            Company access · No individual accounts
          </div>
        </section>
        <p className="login-footer">ADSN SOLUTIONS / OVERFLOW PALLET TRACKER</p>
      </main>
    );
  const active = data?.pallets.filter((p) => p.status === "ACTIVE") ?? [],
    all = data?.pallets ?? [],
    products = data?.products ?? [],
    current = all.find((p) => p.id === selected);
  const productIds = new Set(
    active.flatMap((p) => p.items.map((i) => i.productId)),
  );
  const match = (s: string) => normalize(s).includes(normalize(query));
  const filtered = (
    page === "Pallets" ? all.filter((p) => p.status === status) : active
  )
    .filter(
      (p) =>
        match(p.pallet_identifier) ||
        p.items.some(
          (i) => match(i.name) || match(i.brand) || match(i.stockCode ?? ""),
        ),
    )
    .sort((a, b) =>
      sort === "number"
        ? a.pallet_identifier.localeCompare(b.pallet_identifier, undefined, {
            numeric: true,
          })
        : sort === "oldest"
          ? a.created_at.localeCompare(b.created_at)
          : sort === "newest"
            ? b.created_at.localeCompare(a.created_at)
            : b.updated_at.localeCompare(a.updated_at),
    );
  const groups = products
    .map((p) => ({
      ...p,
      locations: active
        .filter((a) => a.items.some((i) => i.productId === p.id))
        .map((a) => ({
          pallet: a,
          quantity: a.items.find((i) => i.productId === p.id)!.quantity,
        })),
    }))
    .filter(
      (p) =>
        p.locations.length &&
        (match(p.stockCode ?? "") ||
          match(p.name) ||
          match(p.brand) ||
          p.locations.some((l) => match(l.pallet.pallet_identifier))),
    );
  const nextName = () => {
    let n = 1;
    while (
      all.some(
        (p) =>
          ["ACTIVE", "DRAFT"].includes(p.status) &&
          normalize(p.pallet_identifier) ===
            normalize(`Pallet ${String(n).padStart(2, "0")}`),
      )
    )
      n++;
    return `Pallet ${String(n).padStart(2, "0")}`;
  };
  async function exportData() {
    try {
      const fresh: Snapshot = await api("/api/inventory");
      const safe = (s: string) =>
        '"' +
        (/^[=+\-@\t\r]/.test(s) ? "'" : "") +
        s.replaceAll('"', '""') +
        '"';
      const rows = [
        ["Pallet", "Stock code", "Product", "Brand", "Remaining units"],
        ...fresh.pallets
          .filter((p) => p.status === "ACTIVE")
          .flatMap((p) =>
            p.items.map((i) => [
              p.pallet_identifier,
              i.stockCode ?? "UNLINKED",
              i.name,
              i.brand,
              String(i.quantity),
            ]),
          ),
      ];
      const url = URL.createObjectURL(
        new Blob([rows.map((r) => r.map(safe).join(",")).join("\r\n")], {
          type: "text/csv",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "adsn-overflow.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">WAREHOUSE WORKSPACE</div>
        <nav aria-label="Main navigation">
          {(
            [
              { name: "Overview", icon: LayoutGrid },
              { name: "Create Pallet", icon: Plus },
              { name: "Pallets", icon: Layers3 },
              { name: "History", icon: History },
            ] as const
          ).map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? "nav active" : "nav"}
              onClick={() => navigate(name)}
            >
              <Icon size={20} />
              <span>{name}</span>
              {page === name && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <ShieldCheck size={19} />
            <div>
              <strong>Company workspace</strong>
              <span>Shared overflow inventory</span>
            </div>
          </div>
          <button
            className="signout"
            onClick={async () => {
              try {
                await api("/api/session", "DELETE");
                refreshSequence.current++;
                setAuth(false);
                setData(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <span>
            Operations <ChevronRight size={14} />
            <strong>Overflow stock</strong>
          </span>
          <button
            className="mobile-signout"
            aria-label="Sign out"
            onClick={async () => {
              try {
                await api("/api/session", "DELETE");
                refreshSequence.current++;
                setAuth(false);
                setData(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={16} />
          </button>
          <span className={offline ? "connection disconnected" : "connection"}>
            <i />
            {offline ? "Connection interrupted" : "Connected"}
            <span className="desktop"> · Synced every 5 sec</span>
          </span>
        </header>
        <main className="content">
          {offline && (
            <div className="warning" role="status">
              <WifiOff size={18} />
              Server connection unavailable. Stock changes are disabled;
              displayed balances may be outdated.
              <button onClick={() => void refresh()}>Retry</button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              <Check size={18} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {current ? (
            <PalletDetail
              key={current.id}
              pallet={current}
              pallets={active}
              products={products}
              disabled={busy || offline}
              submit={submit}
              back={() => setSelected(null)}
            />
          ) : page === "Create Pallet" ? (
            <PalletForm
              products={products}
              initialName={nextName()}
              disabled={busy || offline}
              submit={async (p) => {
                const ok = await submit(p);
                if (ok) navigate("Overview");
                return ok;
              }}
            />
          ) : page === "History" ? (
            <HistoryView data={data!} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">THE WAREHOUSE MASTER BOARD</div>
                  <h1>
                    {page === "Overview" ? "Overflow overview" : "Your pallets"}
                    <span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {page === "Overview"
                      ? "Everything in overflow. Exactly where you left it."
                      : "Manage active stock, finish drafts, and revisit closed pallets."}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => navigate("Create Pallet")}
                >
                  <Plus size={19} />
                  Create pallet
                </button>
              </div>
              <div className="stats">
                <Stat
                  icon={<Layers3 />}
                  value={active.length}
                  label="Active pallets"
                  hint="Ready for replenishment"
                />
                <Stat
                  icon={<Package />}
                  value={productIds.size}
                  label="Products in overflow"
                  hint="Unique products across pallets"
                />
                <Stat
                  icon={<Boxes />}
                  value={active.reduce((s, p) => s + total(p), 0)}
                  label="Remaining units"
                  hint="Individual units, ready to pick"
                />
              </div>
              <section className="board">
                {products.some((p) => p.stockCode) &&
                  active.some((p) => p.items.some((i) => !i.stockCode)) && (
                    <div className="warning">
                      Some existing items have no stock code. Their quantities
                      are shown separately until their product identity is
                      reviewed.
                    </div>
                  )}
                <div className="board-top">
                  <div>
                    <h2>
                      {page === "Overview"
                        ? "Your overflow stock"
                        : "Pallet directory"}
                    </h2>
                    <p>A little more space. A lot more clarity.</p>
                  </div>
                  <button
                    className="quiet"
                    disabled={offline}
                    onClick={() => void exportData()}
                  >
                    <Download size={16} />
                    Export
                  </button>
                </div>
                <div className="toolbar">
                  <div className="tabs">
                    {page === "Overview" ? (
                      <>
                        <button
                          className={view === "pallets" ? "chosen" : ""}
                          onClick={() => setView("pallets")}
                        >
                          <LayoutGrid size={16} />
                          All pallets
                        </button>
                        <button
                          className={view === "products" ? "chosen" : ""}
                          onClick={() => setView("products")}
                        >
                          <Package size={16} />
                          All products
                        </button>
                      </>
                    ) : (
                      <select
                        aria-label="Pallet status"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="ACTIVE">Active pallets</option>
                        <option value="DRAFT">Draft pallets</option>
                        <option value="EMPTY">Closed pallets</option>
                      </select>
                    )}
                  </div>
                  <div className="tools">
                    <label className="search">
                      <Search size={18} />
                      <input
                        aria-label="Search overflow"
                        placeholder="Search stock code, product or pallet…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {query && (
                        <button
                          aria-label="Clear search"
                          onClick={() => setQuery("")}
                        >
                          ×
                        </button>
                      )}
                    </label>
                    <select
                      aria-label="Sort pallets"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="number">Pallet number</option>
                      <option value="newest">Newest pallet</option>
                      <option value="oldest">Oldest pallet</option>
                      <option value="updated">Recently updated</option>
                    </select>
                  </div>
                </div>
                <div className="result-line">
                  <span>
                    {page === "Overview" && view === "products"
                      ? groups.length
                      : filtered.length}{" "}
                    {page === "Overview" && view === "products"
                      ? "products"
                      : "pallets"}
                    {query
                      ? ` matching “${query}”`
                      : page === "Overview"
                        ? " in active overflow"
                        : ""}
                  </span>
                  <span>
                    <i className="tiny-dot" />
                    Confirmed stock only
                  </span>
                </div>
                {page === "Overview" && view === "products" ? (
                  <div className="product-grid">
                    {groups.map((p) => (
                      <article className="product-card" key={p.id}>
                        <div className="eyebrow">
                          {p.brand || "OVERFLOW PRODUCT"}
                        </div>
                        <h3>
                          {p.name}
                          {normalize(query) === normalize(p.name) && (
                            <span className="badge">Exact match</span>
                          )}
                        </h3>
                        <p className="stock-code">
                          {p.stockCode
                            ? `Stock code: ${p.stockCode}`
                            : "Unlinked legacy item"}
                        </p>
                        <strong className="product-total">
                          {number(
                            p.locations.reduce((s, l) => s + l.quantity, 0),
                          )}
                          <small> units total</small>
                        </strong>
                        {p.locations.map((l) => (
                          <button
                            key={l.pallet.id}
                            onClick={() => setSelected(l.pallet.id)}
                            className="location"
                          >
                            {l.pallet.pallet_identifier}
                            <span>
                              {number(l.quantity)} units{" "}
                              <ArrowUpRight size={15} />
                            </span>
                          </button>
                        ))}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="pallet-grid">
                    {filtered.map((p) => (
                      <article className="pallet-card" key={p.id}>
                        <div className="pallet-title">
                          <span className="pallet-icon">
                            <Layers3 size={21} />
                          </span>
                          <button onClick={() => setSelected(p.id)}>
                            <h3>{p.pallet_identifier}</h3>
                            <span>{p.items.length} products</span>
                          </button>
                          <span
                            className={
                              "badge " +
                              (p.status === "ACTIVE" ? "" : "neutral")
                            }
                          >
                            {p.status === "ACTIVE"
                              ? "Active"
                              : p.status === "DRAFT"
                                ? "Draft"
                                : "Closed"}
                          </span>
                        </div>
                        <div className="table-label">
                          <span>PRODUCT</span>
                          <span>UNITS</span>
                        </div>
                        <div className="pallet-lines">
                          {p.items.map((i) => (
                            <div
                              className={
                                query && match(i.name)
                                  ? "pallet-line matched"
                                  : "pallet-line"
                              }
                              key={i.productId}
                            >
                              <span>
                                {i.name}
                                <small className="stock-code">
                                  {i.stockCode ?? "Unlinked legacy item"}
                                </small>
                                {normalize(query) === normalize(i.name) && (
                                  <small>Exact match</small>
                                )}
                              </span>
                              <strong>{number(i.quantity)}</strong>
                            </div>
                          ))}
                          {!p.items.length && (
                            <p className="small">No stock remaining.</p>
                          )}
                        </div>
                        <div className="pallet-total">
                          <span>Total remaining</span>
                          <strong>
                            {number(total(p))}
                            <small> units</small>
                          </strong>
                        </div>
                        <footer>
                          <span>Updated {date(p.updated_at)}</span>
                          <button
                            aria-label={`Open ${p.pallet_identifier}`}
                            onClick={() => setSelected(p.id)}
                          >
                            <ArrowUpRight size={20} />
                          </button>
                        </footer>
                      </article>
                    ))}
                  </div>
                )}
                {!(page === "Overview" && view === "products"
                  ? groups.length
                  : filtered.length) && (
                  <div className="empty">
                    <Layers3 size={38} />
                    <h3>
                      {query
                        ? "No matching stock"
                        : "A clear board. Ready for your first pallet."}
                    </h3>
                    <p>
                      {query
                        ? "Try a different product name, brand, or pallet identifier."
                        : "Create a pallet to record what is actually left in overflow."}
                    </p>
                    {!query && (
                      <button
                        className="primary"
                        onClick={() => navigate("Create Pallet")}
                      >
                        <Plus size={18} />
                        Create pallet
                      </button>
                    )}
                  </div>
                )}
              </section>
              <div className="board-foot">
                <ShieldCheck size={15} />
                One shared source of truth for your overflow stock.
                <span>ADSN SOLUTIONS</span>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
