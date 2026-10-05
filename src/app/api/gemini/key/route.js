import { PUT as handlePut, DELETE as handleDelete } from "@/app/api/settings/gemini-key/route";

/**
 * Backward compatibility route
 * Delegates to /api/settings/gemini-key
 */
export async function POST(request) {
  return handlePut(request);
}

export async function PUT(request) {
  return handlePut(request);
}

export async function DELETE(request) {
  return handleDelete(request);
}
