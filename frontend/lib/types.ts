export type User = { id: number; email: string; display_name: string; account_id: string };
export type Zone = {
  id: string;
  name: string;
  description: string;
  zone_type: "public" | "private";
  vpc_region?: string;
  vpc_id?: string;
  record_count: number;
  created_at: string;
  updated_at: string;
};
export type RecordSet = {
  id: string;
  zone_id: string;
  name: string;
  type: string;
  value: string;
  ttl: number;
  routing_policy: string;
  evaluate_target_health: number;
};
export type Page<T> = { items: T[]; total: number; page: number; page_size: number };
