import type { Pallet } from "./types";
export const total = (p: Pallet) =>
  p.items.reduce((sum, i) => sum + i.quantity, 0);
export const date = (s: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
export const number = (v: number) => v.toLocaleString("en-GB");
