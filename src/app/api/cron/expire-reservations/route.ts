// src/app/api/cron/expire-reservations/route.ts
// Called by Vercel Cron every minute (see vercel.json)
// Protected by CRON_SECRET env var

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  // Verify this is called by Vercel Cron
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all expired pending reservations
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

  // Release them all in parallel
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

  console.log(`[cron] Released ${expired.length} expired reservation(s)`);
  return NextResponse.json({ released: expired.length });
}
