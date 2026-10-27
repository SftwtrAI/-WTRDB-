import { db } from "./db";
import { creditPackages } from "@wtrops/shared";
import { sql } from "drizzle-orm";

const CREDIT_PACKAGES_SEED_DATA = [
  {
    name: "Starter Pack",
    description: "1,000 credits — Perfect for small campaigns",
    credits: 1000,
    price: "9.99",
    razorpayPrice: "799.00",
    isActive: true,
  },
  {
    name: "Growth Pack",
    description: "5,000 credits — Best value for growing teams",
    credits: 5000,
    price: "44.99",
    razorpayPrice: "3599.00",
    isActive: true,
  },
  {
    name: "Business Pack",
    description: "10,000 credits — Ideal for regular campaigns",
    credits: 10000,
    price: "84.99",
    razorpayPrice: "6799.00",
    isActive: true,
  },
  {
    name: "Professional Pack",
    description: "25,000 credits — For power users",
    credits: 25000,
    price: "199.99",
    razorpayPrice: "15999.00",
    isActive: true,
  },
  {
    name: "Enterprise Pack",
    description: "50,000 credits — High-volume needs",
    credits: 50000,
    price: "374.99",
    razorpayPrice: "29999.00",
    isActive: true,
  },
  {
    name: "Mega Pack",
    description: "100,000 credits — Best enterprise value",
    credits: 100000,
    price: "699.99",
    razorpayPrice: "55999.00",
    isActive: true,
  },
];

async function seedCreditPackages() {
  try {
    console.log("🌱 Starting Credit Packages seed...");

    // Delete existing packages and re-insert with updated values
    const existingPackages = await db.select().from(creditPackages);
    if (existingPackages.length > 0) {
      console.log(
        `🔄 Replacing ${existingPackages.length} existing credit packages with updated values...`,
      );
      await db.execute(sql`DELETE FROM credit_packages`);
    }

    console.log(
      `📦 Inserting ${CREDIT_PACKAGES_SEED_DATA.length} credit packages...`,
    );
    await db.insert(creditPackages).values(CREDIT_PACKAGES_SEED_DATA);

    console.log("✅ Successfully seeded Credit Packages!");
    CREDIT_PACKAGES_SEED_DATA.forEach((pkg) => {
      const pricePerCredit = (parseFloat(pkg.price) / pkg.credits).toFixed(4);
      console.log(
        `   - ${pkg.name}: ${pkg.credits} credits @ $${pkg.price} ($${pricePerCredit}/credit)`,
      );
    });
  } catch (error) {
    console.error("❌ Error seeding Credit Packages:", error);
    throw error;
  }
}

export { seedCreditPackages, CREDIT_PACKAGES_SEED_DATA };
