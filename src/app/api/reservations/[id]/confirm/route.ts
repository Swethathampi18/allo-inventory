// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = await redis.get(`idem:confirm:${idempotencyKey}`);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { status: 200 });
    }
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { product: true, warehouse: true },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }

  if (reservation.status === "CONFIRMED") {
    return NextResponse.json({ error: "Already confirmed" }, { status: 200 });
  }

  if (reservation.status === "RELEASED") {
    return NextResponse.json({ error: "Reservation was already released" }, { status: 410 });
  }

  if (reservation.expiresAt < new Date()) {
    await prisma.$transaction([
      prisma.stockLevel.update({
        where: {
          productId_warehouseId: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
        },
        data: { reserved: { decrement: reservation.quantity } },
      }),
      prisma.reservation.update({
        where: { id },
        data: { status: "RELEASED" },
      }),
    ]);
    return NextResponse.json(
      { error: "Reservation has expired. Please start a new checkout." },
      { status: 410 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.stockLevel.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: {
        total: { decrement: reservation.quantity },
        reserved: { decrement: reservation.quantity },
      },
    });
    return tx.reservation.update({
      where: { id },
      data: { status: "CONFIRMED" },
      include: { product: true, warehouse: true },
    });
  });

  const responseBody = {
    id: updated.id,
    status: updated.status,
    productName: updated.product.name,
    warehouseName: updated.warehouse.name,
    quantity: updated.quantity,
    confirmedAt: updated.updatedAt.toISOString(),
  };

  if (idempotencyKey) {
    await redis.set(
      `idem:confirm:${idempotencyKey}`,
      JSON.stringify(responseBody),
      "EX",
      86400
    );
  }

  return NextResponse.json(responseBody);
}