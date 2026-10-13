import { cookies } from "next/headers";
import { z } from "zod";
import { authenticate, cookieName, csrf, digest, login } from "@/lib/security";
import { db } from "@/lib/db";
import { failure, json, readJson } from "@/lib/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    await authenticate((await cookies()).get(cookieName)?.value);
    return json({ authenticated: true });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    csrf(request);
    const { password } = z
      .object({ password: z.string().min(1).max(256) })
      .parse(await readJson(request, 2048));
    const token = await login(
      password,
      (await cookies()).get(cookieName)?.value,
    );
    const response = json({ authenticated: true });
    response.cookies.set(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 43200,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request) {
  try {
    csrf(request);
    const token = (await cookies()).get(cookieName)?.value;
    await authenticate(token);
    await db().query("delete from adsn.sessions where token_hash=$1", [
      digest(token!),
    ]);
    const response = json({ authenticated: false });
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (e) {
    return failure(e);
  }
}
