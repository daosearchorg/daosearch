import { NextResponse } from "next/server";
import { openApiSpec } from "@/lib/openapi";

export async function GET() {
  return NextResponse.json(openApiSpec);
}
