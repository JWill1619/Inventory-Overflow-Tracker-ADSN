export type Item = {
  productId: string;
  stockCode?: string | null;
  name: string;
  brand: string;
  quantity: number;
};
export type Pallet = {
  id: string;
  pallet_identifier: string;
  status: "DRAFT" | "ACTIVE" | "EMPTY" | "ARCHIVED";
  version: number;
  created_at: string;
  updated_at: string;
  items: Item[];
};
export type Product = {
  id: string;
  name: string;
  brand: string;
  stockCode?: string | null;
};
export type Movement = {
  id: string;
  action_type: string;
  product: string | null;
  stockCode?: string | null;
  source: string | null;
  destination: string | null;
  quantity: number;
  quantity_before: number | null;
  quantity_after: number | null;
  notes: string | null;
  created_at: string;
  movement_group_id: string;
};
export type Snapshot = {
  pallets: Pallet[];
  products: Product[];
  history: Movement[];
};

export type Submit = (payload: Record<string, unknown>) => Promise<boolean>;
