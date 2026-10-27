/**
 * Twilio Countries Seed Data
 *
 * This file contains all countries supported by Twilio for phone number purchasing.
 * Countries are sorted by popularity/usage (US, UK, Canada first) then alphabetically.
 *
 * @license See LICENSE.md for full terms
 */

import { db } from "./db";
import { twilioCountries } from "@wtrops/shared";

export const TWILIO_COUNTRIES_SEED_DATA = [
  // ============================================
  // MOST POPULAR COUNTRIES (sortOrder 1-10)
  // ============================================
  {
    code: "US",
    name: "United States",
    dialCode: "+1",
    isActive: true,
    sortOrder: 1,
  },
  {
    code: "GB",
    name: "United Kingdom",
    dialCode: "+44",
    isActive: true,
    sortOrder: 2,
  },
  {
    code: "CA",
    name: "Canada",
    dialCode: "+1",
    isActive: true,
    sortOrder: 3,
  },
  {
    code: "AU",
    name: "Australia",
    dialCode: "+61",
    isActive: true,
    sortOrder: 4,
  },
  {
    code: "DE",
    name: "Germany",
    dialCode: "+49",
    isActive: true,
    sortOrder: 5,
  },
  {
    code: "FR",
    name: "France",
    dialCode: "+33",
    isActive: true,
    sortOrder: 6,
  },
  {
    code: "ES",
    name: "Spain",
    dialCode: "+34",
    isActive: true,
    sortOrder: 7,
  },
  {
    code: "IT",
    name: "Italy",
    dialCode: "+39",
    isActive: true,
    sortOrder: 8,
  },
  {
    code: "NL",
    name: "Netherlands",
    dialCode: "+31",
    isActive: true,
    sortOrder: 9,
  },
  {
    code: "BR",
    name: "Brazil",
    dialCode: "+55",
    isActive: true,
    sortOrder: 10,
  },

  // ============================================
  // OTHER TWILIO-SUPPORTED COUNTRIES (sortOrder 100)
  // Alphabetically ordered
  // ============================================
  {
    code: "AR",
    name: "Argentina",
    dialCode: "+54",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "AT",
    name: "Austria",
    dialCode: "+43",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "BE",
    name: "Belgium",
    dialCode: "+32",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "BG",
    name: "Bulgaria",
    dialCode: "+359",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "CH",
    name: "Switzerland",
    dialCode: "+41",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "CL",
    name: "Chile",
    dialCode: "+56",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "CO",
    name: "Colombia",
    dialCode: "+57",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "CY",
    name: "Cyprus",
    dialCode: "+357",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "CZ",
    name: "Czech Republic",
    dialCode: "+420",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "DK",
    name: "Denmark",
    dialCode: "+45",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "EE",
    name: "Estonia",
    dialCode: "+372",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "FI",
    name: "Finland",
    dialCode: "+358",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "GH",
    name: "Ghana",
    dialCode: "+233",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "GR",
    name: "Greece",
    dialCode: "+30",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "HK",
    name: "Hong Kong",
    dialCode: "+852",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "HR",
    name: "Croatia",
    dialCode: "+385",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "HU",
    name: "Hungary",
    dialCode: "+36",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "ID",
    name: "Indonesia",
    dialCode: "+62",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "IE",
    name: "Ireland",
    dialCode: "+353",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "IL",
    name: "Israel",
    dialCode: "+972",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "IN",
    name: "India",
    dialCode: "+91",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "JP",
    name: "Japan",
    dialCode: "+81",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "KE",
    name: "Kenya",
    dialCode: "+254",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "KR",
    name: "South Korea",
    dialCode: "+82",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "LT",
    name: "Lithuania",
    dialCode: "+370",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "LU",
    name: "Luxembourg",
    dialCode: "+352",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "LV",
    name: "Latvia",
    dialCode: "+371",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "MT",
    name: "Malta",
    dialCode: "+356",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "MX",
    name: "Mexico",
    dialCode: "+52",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "MY",
    name: "Malaysia",
    dialCode: "+60",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "NG",
    name: "Nigeria",
    dialCode: "+234",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "NO",
    name: "Norway",
    dialCode: "+47",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "NZ",
    name: "New Zealand",
    dialCode: "+64",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "PE",
    name: "Peru",
    dialCode: "+51",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "PH",
    name: "Philippines",
    dialCode: "+63",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "PK",
    name: "Pakistan",
    dialCode: "+92",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "PL",
    name: "Poland",
    dialCode: "+48",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "PT",
    name: "Portugal",
    dialCode: "+351",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "RO",
    name: "Romania",
    dialCode: "+40",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "SE",
    name: "Sweden",
    dialCode: "+46",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "SG",
    name: "Singapore",
    dialCode: "+65",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "SI",
    name: "Slovenia",
    dialCode: "+386",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "SK",
    name: "Slovakia",
    dialCode: "+421",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "TH",
    name: "Thailand",
    dialCode: "+66",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "TR",
    name: "Turkey",
    dialCode: "+90",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "UA",
    name: "Ukraine",
    dialCode: "+380",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "VN",
    name: "Vietnam",
    dialCode: "+84",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "ZA",
    name: "South Africa",
    dialCode: "+27",
    isActive: true,
    sortOrder: 100,
  },

  // ============================================
  // ADDITIONAL TWILIO-SUPPORTED REGIONS
  // ============================================
  {
    code: "AE",
    name: "United Arab Emirates",
    dialCode: "+971",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    dialCode: "+966",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "PR",
    name: "Puerto Rico",
    dialCode: "+1",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "DO",
    name: "Dominican Republic",
    dialCode: "+1",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "JM",
    name: "Jamaica",
    dialCode: "+1",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "TT",
    name: "Trinidad and Tobago",
    dialCode: "+1",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "PA",
    name: "Panama",
    dialCode: "+507",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "CR",
    name: "Costa Rica",
    dialCode: "+506",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "EC",
    name: "Ecuador",
    dialCode: "+593",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "VE",
    name: "Venezuela",
    dialCode: "+58",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "UY",
    name: "Uruguay",
    dialCode: "+598",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "IS",
    name: "Iceland",
    dialCode: "+354",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "RS",
    name: "Serbia",
    dialCode: "+381",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "BA",
    name: "Bosnia and Herzegovina",
    dialCode: "+387",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "MK",
    name: "North Macedonia",
    dialCode: "+389",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "AL",
    name: "Albania",
    dialCode: "+355",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "ME",
    name: "Montenegro",
    dialCode: "+382",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "TW",
    name: "Taiwan",
    dialCode: "+886",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "BD",
    name: "Bangladesh",
    dialCode: "+880",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "LK",
    name: "Sri Lanka",
    dialCode: "+94",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "NP",
    name: "Nepal",
    dialCode: "+977",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "EG",
    name: "Egypt",
    dialCode: "+20",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "MA",
    name: "Morocco",
    dialCode: "+212",
    isActive: true,
    sortOrder: 100,
  },
  {
    code: "TN",
    name: "Tunisia",
    dialCode: "+216",
    isActive: true,
    sortOrder: 100,
  },
];

export async function seedTwilioCountries() {
  console.log("🌍 Seeding Twilio Countries...");

  try {
    // Check if countries already exist
    const existing = await db.select().from(twilioCountries).limit(1);

    if (existing.length > 0) {
      console.log("   ℹ️  Twilio Countries already seeded, skipping...");
      return;
    }

    // Insert all countries
    await db.insert(twilioCountries).values(TWILIO_COUNTRIES_SEED_DATA);

    console.log(
      `   ✅ Seeded ${TWILIO_COUNTRIES_SEED_DATA.length} Twilio Countries`,
    );
    console.log(
      `   - Popular countries (sortOrder 1-10): ${TWILIO_COUNTRIES_SEED_DATA.filter((c) => c.sortOrder <= 10).length}`,
    );
    console.log(
      `   - Other countries: ${TWILIO_COUNTRIES_SEED_DATA.filter((c) => c.sortOrder > 10).length}`,
    );
  } catch (error) {
    console.error("❌ Error seeding Twilio Countries:", error);
    throw error;
  }
}

// Allow running standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTwilioCountries()
    .then(() => {
      console.log("✅ Twilio Countries seeding complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Twilio Countries seeding failed:", error);
      process.exit(1);
    });
}
