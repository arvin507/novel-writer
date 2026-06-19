import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = await prisma.exportFile.findUnique({ where: { id } });
  if (!file) {
    return NextResponse.json({ error: "导出文件不存在" }, { status: 404 });
  }

  const data = await fs.readFile(file.path);
  return new NextResponse(data, {
    headers: {
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Content-Type": file.fileName.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "text/plain; charset=utf-8",
    },
  });
}
