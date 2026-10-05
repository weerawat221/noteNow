import { NextResponse } from "next/server";
import { GET as getStatus } from "@/app/api/settings/gemini-key/route";

/**
 * Backward compatibility route
 * Delegates to /api/settings/gemini-key
 */
export async function GET(request) {
  return getStatus(request);
}
