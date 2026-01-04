import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const formData = await req.formData();

  const file = formData.get("file");

  // 🔎 HARD DEBUG
  if (!file) {
    console.error("❌ NO FILE RECEIVED");
    return NextResponse.json(
      { error: "No file uploaded" },
      { status: 400 }
    );
  }

  if (!(file instanceof File)) {
    console.error("❌ FILE IS NOT INSTANCE OF File", file);
    return NextResponse.json(
      { error: "Invalid file object" },
      { status: 400 }
    );
  }

  console.log("✅ FILE RECEIVED:", {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  return NextResponse.json({
    success: true,
    filename: file.name,
    size: file.size,
    type: file.type,
  });
}
