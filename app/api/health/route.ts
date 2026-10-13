import { json } from "@/lib/http";
export function GET() {
  return json({ online: true });
}
