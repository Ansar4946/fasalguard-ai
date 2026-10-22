import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const id = z.uuid().safeParse((await context.params).id);
  if (!id.success)
    return NextResponse.json(
      { error: { message: "Conversation was not found." } },
      { status: 404 },
    );
  const { response, body } = await authenticatedJson(
    `/assistant/conversations/${id.data}`,
  );
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, {
    headers: { "cache-control": "no-store, private" },
  });
}
