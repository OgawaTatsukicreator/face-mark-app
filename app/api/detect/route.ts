import { handleDetect } from "@/lib/detect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleDetect(request);
}
