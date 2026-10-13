import { cookies } from "next/headers";
import { authenticate, cookieName, csrf } from "@/lib/security";
import { mutate, snapshot } from "@/lib/inventory";
import { json, failure, readJson } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    return json(await snapshot((await cookies()).get(cookieName)?.value));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    csrf(request);
    const token = (await cookies()).get(cookieName)?.value;
    await authenticate(token);
    return json(await mutate(token, await readJson(request)));
  } catch (e) {
    return failure(e);
  }
}
