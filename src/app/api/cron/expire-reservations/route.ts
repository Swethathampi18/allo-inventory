import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      productId: true,
      warehouseId: true,
      quantity: true,
    },
  });

  if (expired.length === 0) {
    return NextResponse.json({ released: 0 });
  }

  await Promise.all(
    expired.map((r) =>
      prisma.$transaction([
        prisma.stockLevel.update({
          where: {
            productId_warehouseId: {
              productId: r.productId,
              warehouseId: r.warehouseId,
            },
          },
          data: { reserved: { decrement: r.quantity } },
        }),
        prisma.reservation.update({
          where: { id: r.id },
          data: { status: "RELEASED" },
        }),
      ])
    )
  );

  return NextResponse.json({ released: expired.length });
}
