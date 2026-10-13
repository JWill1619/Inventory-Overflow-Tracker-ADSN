import { cookies } from "next/headers";
import { z } from "zod";
import { changePassword, cookieName, csrf } from "@/lib/security";
import { failure, json, readJson } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    csrf(request);
    const input = z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z.string().max(256),
        confirmation: z.string().max(256),
      })
      .strict()
      .parse(await readJson(request, 4096));
    await changePassword(
      (await cookies()).get(cookieName)?.value,
      input.currentPassword,
      input.newPassword,
      input.confirmation,
    );
    const response = json({
      message:
        "Company password changed. Everyone has been signed out. Sign in with the new password.",
    });
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
