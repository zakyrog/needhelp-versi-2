import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { sanitizeString, validatePost } from "../../../lib/validation.js";

function getPostsFromDisk() {
  const filePath = path.join(process.cwd(), "public", "data", "posts.json");
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  }
  return [];
}

export async function GET() {
  try {
    const posts = getPostsFromDisk();
    return NextResponse.json(posts, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Gagal membaca data postingan.", details: err.message },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Payload harus berupa objek postingan." },
        { status: 400 },
      );
    }

    const cleanBody = {
      ...body,
      title: sanitizeString(body.title),
      description: typeof body.description === "string" ? body.description.trim() : "",
      address: sanitizeString(body.address),
      destination: sanitizeString(body.destination),
      compensationNote: sanitizeString(body.compensationNote),
    };
    const fields = validatePost(cleanBody);

    if (Object.keys(fields).length > 0) {
      return NextResponse.json(
        { error: "Data postingan belum valid.", fields },
        { status: 422 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        persisted: false,
        message: "Data valid. Endpoint demo ini belum menyimpan postingan; aplikasi utama menyimpan melalui Supabase.",
        data: cleanBody,
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Payload tidak valid.", details: err.message },
      { status: 400 },
    );
  }
}
