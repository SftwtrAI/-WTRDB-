import { db } from "./db";
import { globalSettings } from "@wtrops/shared";
import { sql } from "drizzle-orm";

const SEO_SETTINGS_SEED_DATA = [
  // ============================================
  // BASIC META TAGS
  // ============================================
  {
    key: "seo_site_title",
    value: "Wtrops.ai - AI-Powered Bulk Calling Platform",
    description: "Default site title for SEO",
  },
  {
    key: "seo_site_description",
    value:
      "Automate your outbound communication with AI-powered voice agents. Wtrops.ai helps businesses scale their calling campaigns with intelligent automation, lead qualification, and real-time analytics.",
    description: "Default meta description for SEO",
  },
  {
    key: "seo_site_keywords",
    value:
      "AI calling, bulk calling, voice AI, automated calls, lead qualification, outbound automation, AI agents, conversational AI, sales automation, customer service automation",
    description: "Default meta keywords for SEO",
  },
  {
    key: "seo_site_author",
    value: "Wtrops.ai",
    description: "Site author for meta tags",
  },

  // ============================================
  // OPEN GRAPH TAGS
  // ============================================
  {
    key: "seo_og_title",
    value: "Wtrops.ai - Scale Your Outreach with AI Voice Agents",
    description: "Open Graph title for social sharing",
  },
  {
    key: "seo_og_description",
    value:
      "Launch AI-powered calling campaigns that qualify leads, book appointments, and engage customers automatically. Start your free trial today.",
    description: "Open Graph description for social sharing",
  },
  {
    key: "seo_og_image",
    value: "",
    description: "Open Graph image URL (1200x630 recommended)",
  },
  {
    key: "seo_og_type",
    value: "website",
    description: "Open Graph type (website, article, product)",
  },
  {
    key: "seo_og_site_name",
    value: "Wtrops.ai",
    description: "Open Graph site name",
  },

  // ============================================
  // TWITTER CARD TAGS
  // ============================================
  {
    key: "seo_twitter_card",
    value: "summary_large_image",
    description: "Twitter card type (summary, summary_large_image)",
  },
  {
    key: "seo_twitter_site",
    value: "",
    description: "Twitter @username for the website",
  },
  {
    key: "seo_twitter_creator",
    value: "",
    description: "Twitter @username for content creator",
  },
  {
    key: "seo_twitter_title",
    value: "Wtrops.ai - AI-Powered Bulk Calling Platform",
    description: "Twitter card title",
  },
  {
    key: "seo_twitter_description",
    value:
      "Automate your calling campaigns with AI voice agents. Qualify leads, book appointments, and engage customers 24/7.",
    description: "Twitter card description",
  },
  {
    key: "seo_twitter_image",
    value: "",
    description: "Twitter card image URL",
  },

  // ============================================
  // ROBOTS & INDEXING
  // ============================================
  {
    key: "seo_robots_index",
    value: true,
    description: "Allow search engines to index the site",
  },
  {
    key: "seo_robots_follow",
    value: true,
    description: "Allow search engines to follow links",
  },
  {
    key: "seo_robots_txt",
    value: `User-agent: *
Allow: /
Disallow: /app/
Disallow: /admin/
Disallow: /api/

Sitemap: {{site_url}}/sitemap.xml`,
    description: "Custom robots.txt content",
  },
  {
    key: "seo_sitemap_enabled",
    value: true,
    description: "Enable automatic sitemap generation",
  },
  {
    key: "seo_sitemap_change_frequency",
    value: "weekly",
    description: "Sitemap change frequency (daily, weekly, monthly)",
  },
  {
    key: "seo_sitemap_priority",
    value: "0.8",
    description: "Default sitemap priority (0.0 to 1.0)",
  },

  // ============================================
  // STRUCTURED DATA
  // ============================================
  {
    key: "seo_schema_organization",
    value: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Wtrops.ai",
      description: "AI-Powered Bulk Calling Platform",
      url: "{{site_url}}",
      logo: "{{logo_url}}",
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        email: "{{support_email}}",
      },
      sameAs: [],
    },
    description: "Organization schema.org structured data",
  },
  {
    key: "seo_schema_software",
    value: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Wtrops.ai",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "150",
      },
    },
    description: "SoftwareApplication schema.org structured data",
  },

  // ============================================
  // ANALYTICS & TRACKING
  // ============================================
  {
    key: "seo_google_analytics_id",
    value: "",
    description: "Google Analytics tracking ID (GA4)",
  },
  {
    key: "seo_google_tag_manager_id",
    value: "",
    description: "Google Tag Manager container ID",
  },
  {
    key: "seo_google_search_console_verification",
    value: "",
    description: "Google Search Console verification meta tag",
  },
  {
    key: "seo_bing_webmaster_verification",
    value: "",
    description: "Bing Webmaster verification meta tag",
  },
  {
    key: "seo_facebook_pixel_id",
    value: "",
    description: "Facebook Pixel ID for conversion tracking",
  },

  // ============================================
  // CANONICAL & LANGUAGE
  // ============================================
  {
    key: "seo_canonical_url",
    value: "",
    description: "Canonical URL base (e.g., https://wtrops.io)",
  },
  {
    key: "seo_default_language",
    value: "en",
    description: "Default content language",
  },
  {
    key: "seo_hreflang_enabled",
    value: false,
    description: "Enable hreflang tags for multilingual SEO",
  },
  {
    key: "seo_available_languages",
    value: ["en"],
    description: "Available languages for hreflang",
  },

  // ============================================
  // PAGE-SPECIFIC SEO
  // ============================================
  {
    key: "seo_home_title",
    value:
      "Wtrops.ai - AI-Powered Bulk Calling Platform | Automate Your Outreach",
    description: "Homepage specific title",
  },
  {
    key: "seo_home_description",
    value:
      "Transform your outbound communication with AI voice agents. Wtrops.ai helps you automate calls, qualify leads, and scale your sales operations effortlessly.",
    description: "Homepage specific description",
  },
  {
    key: "seo_pricing_title",
    value: "Pricing - Wtrops.ai | Flexible Plans for Every Business",
    description: "Pricing page specific title",
  },
  {
    key: "seo_pricing_description",
    value:
      "Choose the perfect plan for your calling needs. Start free with 50 credits or upgrade to Pro for advanced features and higher limits.",
    description: "Pricing page specific description",
  },
  {
    key: "seo_login_title",
    value: "Sign In - Wtrops.ai",
    description: "Login page specific title",
  },
  {
    key: "seo_register_title",
    value: "Create Account - Wtrops.ai | Start Your Free Trial",
    description: "Registration page specific title",
  },
];

async function seedSeoSettings() {
  try {
    console.log("🔍 Starting SEO Settings seed...");

    const existingSettings = await db.select().from(globalSettings);
    const existingKeys = existingSettings.map((s) => s.key);

    const settingsToInsert = SEO_SETTINGS_SEED_DATA.filter(
      (setting) => !existingKeys.includes(setting.key),
    );

    if (settingsToInsert.length === 0) {
      console.log(
        `⚠️  All ${SEO_SETTINGS_SEED_DATA.length} SEO settings already exist. Skipping.`,
      );
      return;
    }

    console.log(`📦 Inserting ${settingsToInsert.length} SEO settings...`);

    for (const setting of settingsToInsert) {
      await db.execute(sql`
        INSERT INTO global_settings (id, key, value, description, updated_at)
        VALUES (gen_random_uuid(), ${setting.key}, ${JSON.stringify(setting.value)}::jsonb, ${setting.description}, NOW())
        ON CONFLICT (key) DO NOTHING
      `);
    }

    console.log("✅ Successfully seeded SEO Settings!");

    const categories = {
      "Meta Tags": settingsToInsert.filter(
        (s) =>
          s.key.includes("_title") ||
          s.key.includes("_description") ||
          s.key.includes("_keywords"),
      ).length,
      "Open Graph": settingsToInsert.filter((s) => s.key.includes("_og_"))
        .length,
      "Twitter Cards": settingsToInsert.filter((s) =>
        s.key.includes("_twitter_"),
      ).length,
      "Robots & Sitemap": settingsToInsert.filter(
        (s) => s.key.includes("_robots") || s.key.includes("_sitemap"),
      ).length,
      "Structured Data": settingsToInsert.filter((s) =>
        s.key.includes("_schema_"),
      ).length,
      Analytics: settingsToInsert.filter(
        (s) =>
          s.key.includes("_google_") ||
          s.key.includes("_bing_") ||
          s.key.includes("_facebook_"),
      ).length,
      Language: settingsToInsert.filter(
        (s) =>
          s.key.includes("_language") ||
          s.key.includes("_hreflang") ||
          s.key.includes("_canonical"),
      ).length,
    };

    Object.entries(categories).forEach(([category, count]) => {
      if (count > 0) {
        console.log(`   - ${category}: ${count} settings`);
      }
    });
  } catch (error) {
    console.error("❌ Error seeding SEO Settings:", error);
    throw error;
  }
}

export { seedSeoSettings, SEO_SETTINGS_SEED_DATA };
