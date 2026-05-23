"use client";
// src/app/checkout/[id]/page.tsx

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type ReservationDetail = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  quantity: number;
  expiresAt: string;
  createdAt: string;
  product: {
    id: string;
    name: string;
    price: number;
    imageUrl: string | null;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
};

function formatPrice(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

function useCountdown(expiresAt: string | null) {
  const [ms, setMs] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setMs(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAt]);

  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const expired = ms === 0;
  const urgent = totalSec <= 60 && !expired;

  return {
    display: `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`,
    expired,
    urgent,
    ms,
  };
}

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [reservation, setReservation] = useState<ReservationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalState, setFinalState] = useState<"confirmed" | "cancelled" | null>(null);
  const idempotencyRef = useRef(crypto.randomUUID());

  const { display, expired, urgent } = useCountdown(
    reservation?.status === "PENDING" ? reservation.expiresAt : null
  );

  const fetchReservation = useCallback(async () => {
    const res = await fetch(`/api/reservations/${id}`);
    if (!res.ok) {
      setError("Reservation not found.");
      setLoading(false);
      return;
    }
    const data: ReservationDetail = await res.json();
    setReservation(data);
    if (data.status === "CONFIRMED") setFinalState("confirmed");
    if (data.status === "RELEASED") setFinalState("cancelled");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchReservation();
  }, [fetchReservation]);

  async function handleConfirm() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyRef.current },
      });

      if (res.status === 410) {
        const data = await res.json();
        setError(data.error);
        setFinalState("cancelled");
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to confirm. Try again.");
        return;
      }

      await fetchReservation();
      setFinalState("confirmed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${id}/release`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to cancel.");
        return;
      }

      await fetchReservation();
      setFinalState("cancelled");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-stone-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error && !reservation) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-stone-600">{error}</p>
        <button onClick={() => router.push("/")} className="mt-4 text-sm text-stone-500 underline">
          Back to products
        </button>
      </div>
    );
  }

  if (!reservation) return null;

  // ── Final states ──────────────────────────────────────────────────────────
  if (finalState === "confirmed") {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-1">Order confirmed!</h2>
          <p className="text-stone-500 text-sm mb-6">
            Your purchase of <strong>{reservation.product.name}</strong> has been confirmed.
            <br />
            <span className="text-xs font-mono text-stone-400 mt-1 block">
              Reservation #{id.slice(-8)}
            </span>
          </p>
          <button
            onClick={() => router.push("/")}
            className="bg-stone-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-stone-700 transition-colors"
          >
            Continue shopping
          </button>
        </div>
      </div>
    );
  }

  if (finalState === "cancelled") {
    return (
      <div className="max-w-md mx-auto mt-12">
        <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold mb-1">Reservation released</h2>
          <p className="text-stone-500 text-sm mb-2">
            {error
              ? error
              : "Your hold has been released and the stock is available again."}
          </p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 bg-stone-900 text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-stone-700 transition-colors"
          >
            Back to products
          </button>
        </div>
      </div>
    );
  }

  // ── Active reservation ────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto mt-6">
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-800 mb-6 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
        {/* Countdown bar */}
        <div
          className={`px-6 py-3 flex items-center justify-between border-b ${
            expired
              ? "bg-red-50 border-red-200"
              : urgent
              ? "bg-amber-50 border-amber-200"
              : "bg-stone-50 border-stone-100"
          }`}
        >
          <span
            className={`text-xs font-medium ${
              expired ? "text-red-600" : urgent ? "text-amber-700" : "text-stone-500"
            }`}
          >
            {expired ? "Reservation expired" : "Hold expires in"}
          </span>
          <span
            className={`font-mono text-lg font-semibold tracking-wider ${
              expired
                ? "text-red-600"
                : urgent
                ? "text-amber-600 countdown-urgent"
                : "text-stone-800"
            }`}
          >
            {expired ? "00:00" : display}
          </span>
        </div>

        <div className="p-6">
          {/* Product info */}
          <div className="flex gap-4 mb-6">
            {reservation.product.imageUrl && (
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-stone-100 shrink-0">
                <img
                  src={reservation.product.imageUrl}
                  alt={reservation.product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base leading-snug">{reservation.product.name}</h2>
              <p className="text-sm text-stone-500 mt-0.5">{reservation.warehouse.name}</p>
              <p className="text-xs text-stone-400">{reservation.warehouse.location}</p>
            </div>
          </div>

          {/* Order summary */}
          <div className="bg-stone-50 rounded-xl p-4 space-y-2 mb-6 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">Quantity</span>
              <span className="font-medium">{reservation.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Unit price</span>
              <span className="font-medium">{formatPrice(reservation.product.price)}</span>
            </div>
            <div className="border-t border-stone-200 pt-2 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-semibold">
                {formatPrice(reservation.product.price * reservation.quantity)}
              </span>
            </div>
          </div>

          {/* Reservation meta */}
          <div className="mb-6 text-xs text-stone-400 font-mono">
            Reservation ID: {id}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Expired warning */}
          {expired && !finalState && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              This reservation has expired. The stock has been released.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={actionLoading || expired}
              className={`
                flex-1 font-medium text-sm py-2.5 rounded-lg transition-all
                ${expired || actionLoading
                  ? "bg-stone-200 text-stone-400 cursor-not-allowed"
                  : "bg-stone-900 text-white hover:bg-stone-700 active:scale-[0.98]"
                }
              `}
            >
              {actionLoading ? "Processing…" : "Confirm purchase"}
            </button>

            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="flex-1 font-medium text-sm py-2.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 hover:border-stone-300 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
