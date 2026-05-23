export const dynamic = 'force-dynamic';

// src/app/api/reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis, acquireLock, releaseLock } from "@/lib/redis";
import { CreateReservationSchema, RESERVATION_TTL_MS } from "@/lib/schemas";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const parsed = CreateReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { productId, warehouseId, quantity } = parsed.data;

  // ── Idempotency (bonus) ──────────────────────────────────────────────────
  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = await redis.get(`idem:${idempotencyKey}`);
    if (cached) {
      return NextResponse.json(JSON.parse(cached), { status: 200 });
    }
  }

  // ── Distributed lock ─────────────────────────────────────────────────────
  // Lock key is scoped to the specific product+warehouse so other
  // product/warehouse combos can proceed in parallel.
  const lockKey = `stock:${productId}:${warehouseId}`;
  const lockToken = await acquireLock(lockKey, 5000);

  if (!lockToken) {
    return NextResponse.json(
      { error: "Another reservation is being processed. Please retry in a moment." },
      { status: 503 }
    );
  }

  try {
    // ── Atomic stock check + decrement (inside lock) ─────────────────────
    // We use a Prisma transaction to ensure the read + write are atomic at the
    // DB level too (defense-in-depth: lock handles distributed concurrency,
    // transaction handles any DB-level races).
    const reservation = await prisma.$transaction(async (tx) => {
      const stock = await tx.stockLevel.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
      });

      if (!stock) {
        throw { code: "NOT_FOUND", message: "Stock not found for this product/warehouse" };
      }

      const available = stock.total - stock.reserved;
      if (available < quantity) {
        throw {
          code: "INSUFFICIENT_STOCK",
          message: `Only ${available} unit(s) available, but ${quantity} requested.`,
          available,
        };
      }

      // Increment reserved count
      await tx.stockLevel.update({
        where: { productId_warehouseId: { productId, warehouseId } },
        data: { reserved: { increment: quantity } },
      });

      // Create reservation
      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);
      return tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt,
          idempotencyKey: idempotencyKey ?? undefined,
        },
        include: { product: true, warehouse: true },
      });
    });

    const responseBody = {
      id: reservation.id,
      productId: reservation.productId,
      productName: reservation.product.name,
      warehouseId: reservation.warehouseId,
      warehouseName: reservation.warehouse.name,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      createdAt: reservation.createdAt.toISOString(),
    };

    // Store idempotency result (TTL matches reservation TTL)
    if (idempotencyKey) {
      await redis.set(
        `idem:${idempotencyKey}`,
        JSON.stringify(responseBody),
        "PX",
        RESERVATION_TTL_MS
      );
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; available?: number };
    if (e.code === "INSUFFICIENT_STOCK") {
      return NextResponse.json(
        { error: e.message, available: e.available },
        { status: 409 }
      );
    }
    if (e.code === "NOT_FOUND") {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    console.error("Reservation error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    await releaseLock(lockKey, lockToken);
  }
}

