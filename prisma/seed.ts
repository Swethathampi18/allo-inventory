// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean up
  await prisma.reservation.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create warehouses
  const mumbai = await prisma.warehouse.create({
    data: { name: "Mumbai Central", location: "Mumbai, Maharashtra" },
  });
  const delhi = await prisma.warehouse.create({
    data: { name: "Delhi Hub", location: "Delhi, NCR" },
  });
  const bangalore = await prisma.warehouse.create({
    data: { name: "Bangalore South", location: "Bangalore, Karnataka" },
  });

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Sony WH-1000XM5 Headphones",
        description: "Industry-leading noise canceling with Auto NC Optimizer",
        price: 2999900,
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Apple AirPods Pro (2nd Gen)",
        description: "Active Noise Cancellation, Adaptive Transparency",
        price: 2499900,
        imageUrl: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Samsung Galaxy Watch 6",
        description: "Advanced health monitoring, sleep coaching",
        price: 3499900,
        imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Kindle Paperwhite (2023)",
        description: "300 ppi glare-free display, 3 months battery life",
        price: 1399900,
        imageUrl: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400",
      },
    }),
  ]);

  // Create stock levels
  const stockData = [
    // Sony Headphones — low stock to demo race condition
    { productId: products[0].id, warehouseId: mumbai.id, total: 2, reserved: 0 },
    { productId: products[0].id, warehouseId: delhi.id, total: 5, reserved: 0 },
    { productId: products[0].id, warehouseId: bangalore.id, total: 1, reserved: 0 },

    // AirPods Pro
    { productId: products[1].id, warehouseId: mumbai.id, total: 8, reserved: 0 },
    { productId: products[1].id, warehouseId: delhi.id, total: 3, reserved: 0 },
    { productId: products[1].id, warehouseId: bangalore.id, total: 0, reserved: 0 },

    // Galaxy Watch
    { productId: products[2].id, warehouseId: mumbai.id, total: 4, reserved: 0 },
    { productId: products[2].id, warehouseId: bangalore.id, total: 6, reserved: 0 },

    // Kindle
    { productId: products[3].id, warehouseId: delhi.id, total: 12, reserved: 0 },
    { productId: products[3].id, warehouseId: bangalore.id, total: 1, reserved: 0 },
  ];

  for (const s of stockData) {
    await prisma.stockLevel.create({ data: s });
  }

  console.log("✅ Seeded:");
  console.log(`   ${products.length} products`);
  console.log(`   3 warehouses`);
  console.log(`   ${stockData.length} stock levels`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
