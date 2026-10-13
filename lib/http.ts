import { NextResponse } from "next/server";
import { AppError } from "./validation";
import { ZodError } from "zod";
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private", Vary: "Cookie" },
  });
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json({ error: error.issues.map((i) => i.message).join(" ") }, 400);
  const code = (error as { code?: string })?.code;
  if (code === "23505")
    return json(
      {
        error:
          "This pallet identifier or product already exists. Choose another.",
      },
      409,
    );
  if (code === "23514" || code === "22003")
    return json({ error: "Quantity is outside the permitted range." }, 400);
  if (code === "40001" || code === "40P01")
    return json(
      { error: "Stock changed on another device. Refresh and try again." },
      409,
    );
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "UnknownError",
    code ?? "",
  );
  return json(
    {
      error:
        "The server is unavailable or has not been configured. Please contact your supervisor.",
    },
    503,
  );
}

/** Read bounded JSON before parsing, including requests with no Content-Length. */
export async function readJson(
  request: Request,
  maxBytes = 64000,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "A request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError(413, "Request too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "Invalid JSON request.");
  }
}
