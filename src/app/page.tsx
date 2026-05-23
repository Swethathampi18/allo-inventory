"use client";
// src/app/page.tsx

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type StockEntry = {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  total: number;
  reserved: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  stock: StockEntry[];
};

function formatPrice(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState<string | null>(null); // `${productId}-${warehouseId}`
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then(setProducts)
      .finally(() => setLoading(false));
  }, []);

  async function handleReserve(productId: string, warehouseId: string) {
    const key = `${productId}-${warehouseId}`;
    setReserving(key);
    setErrors((prev) => ({ ...prev, [key]: "" }));

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      });

      if (res.status === 409) {
        const data = await res.json();
        setErrors((prev) => ({ ...prev, [key]: data.error }));
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setErrors((prev) => ({ ...prev, [key]: data.error || "Something went wrong" }));
        return;
      }

      const reservation = await res.json();
      router.push(`/checkout/${reservation.id}`);
    } finally {
      setReserving(null);
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

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <p className="text-stone-500 text-sm mt-1">
          Reserve a unit to hold it for 10 minutes while you complete checkout.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-2">
        {products.map((product) => {
          const totalAvailable = product.stock.reduce((s, sl) => s + sl.available, 0);

          return (
            <div
              key={product.id}
              className="bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col"
            >
              {product.imageUrl && (
                <div className="aspect-[16/7] overflow-hidden bg-stone-100">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-base leading-snug">{product.name}</h2>
                    {product.description && (
                      <p className="text-stone-500 text-sm mt-0.5 leading-snug">
                        {product.description}
                      </p>
                    )}
                  </div>
                  <span className="text-base font-semibold text-stone-900 whitespace-nowrap">
                    {formatPrice(product.price)}
                  </span>
                </div>

                {/* Stock by warehouse */}
                <div className="mt-4 space-y-2">
                  {product.stock.map((s) => {
                    const key = `${product.id}-${s.warehouseId}`;
                    const isLoading = reserving === key;
                    const err = errors[key];

                    return (
                      <div
                        key={s.warehouseId}
                        className="flex items-center justify-between gap-3 p-3 rounded-lg bg-stone-50 border border-stone-100"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{s.warehouseName}</span>
                            <StockBadge available={s.available} />
                          </div>
                          <span className="text-xs text-stone-400">{s.warehouseLocation}</span>
                          {err && (
                            <p className="text-xs text-red-600 mt-1 font-medium">{err}</p>
                          )}
                        </div>

                        <button
                          onClick={() => handleReserve(product.id, s.warehouseId)}
                          disabled={s.available === 0 || isLoading}
                          className={`
                            shrink-0 text-sm font-medium px-3.5 py-1.5 rounded-lg transition-all
                            ${s.available === 0
                              ? "bg-stone-100 text-stone-400 cursor-not-allowed"
                              : isLoading
                              ? "bg-stone-900 text-white opacity-60 cursor-wait"
                              : "bg-stone-900 text-white hover:bg-stone-700 active:scale-95"
                            }
                          `}
                        >
                          {isLoading ? "Reserving…" : s.available === 0 ? "Out of stock" : "Reserve"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {totalAvailable === 0 && (
                  <p className="text-xs text-red-500 font-medium mt-3 text-center">
                    No stock available across all warehouses
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StockBadge({ available }: { available: number }) {
  if (available === 0) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium">
        Sold out
      </span>
    );
  }
  if (available <= 2) {
    return (
      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
        {available} left
      </span>
    );
  }
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">
      {available} avail.
    </span>
  );
}
