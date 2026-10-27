"use strict";

import { Router, Request, Response } from "express";
import { RouteContext, AuthRequest } from "./common";
import { sql, eq } from "drizzle-orm";
import { users } from "@wtrops/shared";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { runAllSeedsForInstaller } from "../seed-all";

/**
 * Creates public routes for unauthenticated endpoints.
 * Includes installer, health, branding, SEO, public stats, contact form, and more.
 */
export function createPublicRoutes(ctx: RouteContext): Router {
  const router = Router();
  const { db, storage, authenticateToken, requireRole, emailService } = ctx;

  /**
   * Check if installation is complete by checking for any users in the database.
   */
  async function isInstalled(): Promise<boolean> {
    try {
      const userCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users);
      return userCount[0]?.count > 0;
    } catch {
      return false;
    }
  }

  // ============================================
  // INSTALLER ROUTES
  // ============================================

  router.get("/api/installer/status", async (_req: Request, res: Response) => {
    try {
      const installed = await isInstalled();
      res.json({ installed });
    } catch (error: any) {
      res.status(500).json({
        message: "Failed to check installation status",
        error: error.message,
      });
    }
  });

  router.get("/api/installer/check", async (_req: Request, res: Response) => {
    try {
      const installed = await isInstalled();
      if (installed) {
        return res
          .status(403)
          .json({ message: "Application is already installed" });
      }

      const checks = [];

      const nodeVersion = process.version;
      const majorVersion = parseInt(nodeVersion.slice(1).split(".")[0], 10);
      checks.push({
        name: "Node.js Version",
        status: majorVersion >= 18 ? "success" : "error",
        message:
          majorVersion >= 18
            ? `Node.js ${nodeVersion} (Required: 18+)`
            : `Node.js ${nodeVersion} is too old. Upgrade to 18+`,
      });

      try {
        await db.execute(sql`SELECT 1`);
        checks.push({
          name: "Database Connection",
          status: "success",
          message: "PostgreSQL connection successful",
        });
      } catch (error: any) {
        checks.push({
          name: "Database Connection",
          status: "error",
          message: `Database connection failed: ${error.message}`,
        });
      }

      const requiredEnvVars = ["DATABASE_URL", "SESSION_SECRET"];
      const missingEnvVars = requiredEnvVars.filter((v) => !process.env[v]);
      checks.push({
        name: "Environment Variables",
        status: missingEnvVars.length === 0 ? "success" : "error",
        message:
          missingEnvVars.length === 0
            ? "Required variables set"
            : `Missing: ${missingEnvVars.join(", ")}`,
      });

      const optionalKeys = [
        { name: "STRIPE_SECRET_KEY", label: "Stripe" },
        { name: "TWILIO_ACCOUNT_SID", label: "Twilio" },
      ];
      const missingOptional = optionalKeys.filter((k) => !process.env[k.name]);
      checks.push({
        name: "API Keys",
        status: missingOptional.length === 0 ? "success" : "warning",
        message:
          missingOptional.length === 0
            ? "All optional API keys configured"
            : `Configure later in Settings: ${missingOptional.map((k) => k.label).join(", ")}`,
      });

      const hasErrors = checks.some((c) => c.status === "error");
      res.json({ checks, canInstall: !hasErrors });
    } catch (error: any) {
      res
        .status(500)
        .json({ message: "Failed to run system checks", error: error.message });
    }
  });

  router.post("/api/installer/install", async (req: Request, res: Response) => {
    try {
      const installed = await isInstalled();
      if (installed) {
        return res
          .status(403)
          .json({ message: "Application is already installed" });
      }

      const { adminEmail, adminPassword, companyName } = req.body;

      if (!adminEmail || !adminPassword || !companyName) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      if (adminPassword.length < 8) {
        return res
          .status(400)
          .json({ message: "Password must be at least 8 characters" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(adminEmail)) {
        return res.status(400).json({ message: "Invalid email address" });
      }

      console.log(
        "╔════════════════════════════════════════════════════════════╗",
      );
      console.log(
        "║           🚀 Installing Wtrops.ai                          ║",
      );
      console.log(
        "╚════════════════════════════════════════════════════════════╝",
      );

      console.log("\n📦 Step 1: Seeding database with required data...");
      const seedResult = await runAllSeedsForInstaller();

      if (!seedResult.success) {
        console.error("❌ Seeding failed:", seedResult.error);
        return res.status(500).json({
          message: "Installation failed during database seeding",
          error: seedResult.error,
        });
      }

      console.log("✅ Database seeding complete!");
      console.log(
        `   Seeded: ${Object.entries(seedResult.summary)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}`,
      );

      console.log("\n👤 Step 2: Creating admin account...");
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      const [admin] = await db
        .insert(users)
        .values({
          email: adminEmail,
          password: hashedPassword,
          name: companyName + " Admin",
          role: "admin",
          planType: "pro",
          credits: 10000,
          isActive: true,
        })
        .returning();

      console.log(`✅ Admin created: ${admin.email}`);
      console.log(`   Role: ${admin.role}`);
      console.log(`   Plan: ${admin.planType}`);
      console.log(`   Credits: ${admin.credits}`);

      console.log("\n⚙️  Step 3: Configuring platform settings...");
      const settingsToCreate = [
        {
          key: "company_name",
          value: companyName,
          description: "Company name displayed across the platform",
        },
        {
          key: "support_email",
          value: adminEmail,
          description: "Support email for customer inquiries",
        },
      ];

      for (const setting of settingsToCreate) {
        try {
          await db.execute(sql`
            INSERT INTO global_settings (key, value, description, updated_at)
            VALUES (${setting.key}, ${JSON.stringify(setting.value)}::jsonb, ${setting.description}, NOW())
            ON CONFLICT (key) DO UPDATE 
            SET value = EXCLUDED.value, updated_at = NOW()
          `);
          console.log(`   ✅ Set ${setting.key}`);
        } catch (error: any) {
          console.warn(`   ⚠️ Failed to set ${setting.key}: ${error.message}`);
        }
      }
      console.log("✅ Platform settings configured!");

      console.log(
        "\n╔════════════════════════════════════════════════════════════╗",
      );
      console.log(
        "║           🎉 Installation Complete!                        ║",
      );
      console.log(
        "╚════════════════════════════════════════════════════════════╝",
      );
      console.log(`\n📋 Installation Summary:`);
      console.log(`   Admin Email: ${admin.email}`);
      console.log(`   Company: ${companyName}`);
      console.log(
        `   Database Seeds: ${Object.keys(seedResult.summary).length} categories`,
      );
      console.log(`   Ready to use!\n`);

      res.json({
        success: true,
        message: "Wtrops.ai installed successfully!",
        admin: {
          email: admin.email,
          password: adminPassword,
          id: admin.id,
        },
        seeds: seedResult.summary,
      });
    } catch (error: any) {
      console.error("Installation error:", error);
      res
        .status(500)
        .json({ message: "Installation failed", error: error.message });
    }
  });

  // ============================================
  // HEALTH/DIAGNOSTIC ROUTES
  // ============================================

  router.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // ============================================
  // VERSION ROUTE
  // ============================================

  router.get("/api/system/version", (_req: Request, res: Response) => {
    try {
      const versionFile = path.join(process.cwd(), "VERSION");
      let version = "1.0.0";

      if (fs.existsSync(versionFile)) {
        version = fs.readFileSync(versionFile, "utf-8").trim();
      }

      res.json({ version });
    } catch (error: any) {
      console.error("Failed to read version:", error.message);
      res.json({ version: "1.0.0" });
    }
  });

  router.get(
    "/api/diagnostic",
    authenticateToken,
    requireRole("admin"),
    async (req: AuthRequest, res: Response) => {
      try {
        const requestingUser = await storage.getUser(req.userId!);
        if (requestingUser?.role !== "admin") {
          return res.status(403).json({ error: "Admin access required" });
        }

        const allUsers = await db.select().from(users);
        const admins = allUsers.filter((u) => u.role === "admin");
        const allCalls = await db.select().from(calls);
        const allCampaigns = await db.select().from(campaigns);

        res.json({
          environment: process.env.NODE_ENV || "development",
          database: {
            totalUsers: allUsers.length,
            admins: admins.length,
            totalCalls: allCalls.length,
            totalCampaigns: allCampaigns.length,
          },
          secrets: {
            twilio_sid: !!process.env.TWILIO_ACCOUNT_SID,
            twilio_token: !!process.env.TWILIO_AUTH_TOKEN,
            stripe: !!process.env.STRIPE_SECRET_KEY,
          },
          message: "System operational",
        });
      } catch (error: any) {
        console.error("Diagnostic error:", error);
        res
          .status(500)
          .json({ error: "Diagnostic failed", details: error.message });
      }
    },
  );

  router.post(
    "/api/diagnostic/grant-admin",
    async (req: Request, res: Response) => {
      try {
        const { users: usersTable } = await import("@wtrops/shared");
        const existingAdmins = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.role, "admin"));

        if (existingAdmins.length > 0) {
          console.warn(
            "[Security] Attempted to use grant-admin endpoint while admins exist",
          );
          return res.status(403).json({
            error: "This endpoint is disabled when admin accounts exist",
            message: "Contact an existing admin to grant access",
          });
        }

        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({
            error: "Email and password required",
            usage: "POST /api/diagnostic/grant-admin with { email, password }",
          });
        }

        const user = await storage.getUserByEmail(email);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
          return res.status(401).json({ error: "Invalid password" });
        }

        await db
          .update(usersTable)
          .set({
            role: "admin",
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, user.id));

        console.log(
          `[Diagnostic] Granted admin access to user: ${user.email} (recovery mode - no existing admins)`,
        );

        res.json({
          success: true,
          message: `Admin access granted to ${user.email}`,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: "admin",
          },
        });
      } catch (error: any) {
        console.error("Grant admin error:", error);
        res.status(500).json({
          error: "Failed to grant admin access",
          details: error.message,
        });
      }
    },
  );

  // ============================================
  // PUBLIC SETTINGS ROUTES
  // ============================================

  router.get("/api/settings/public", async (_req: Request, res: Response) => {
    try {
      const [
        phoneMonthlyCredits,
        lowCreditsThreshold,
        creditsPerMinute,
        otpExpiryMinutes,
        currencyDefault,
        currencySymbol,
      ] = await Promise.all([
        storage.getGlobalSetting("phone_number_monthly_credits"),
        storage.getGlobalSetting("low_credits_threshold"),
        storage.getGlobalSetting("credits_per_minute"),
        storage.getGlobalSetting("otp_expiry_minutes"),
        storage.getGlobalSetting("currency_default"),
        storage.getGlobalSetting("currency_symbol"),
      ]);

      res.json({
        phone_number_monthly_credits:
          typeof phoneMonthlyCredits?.value === "number"
            ? phoneMonthlyCredits.value
            : 50,
        low_credits_threshold:
          typeof lowCreditsThreshold?.value === "number"
            ? lowCreditsThreshold.value
            : 50,
        credits_per_minute:
          typeof creditsPerMinute?.value === "number"
            ? creditsPerMinute.value
            : 1,
        otp_expiry_minutes:
          typeof otpExpiryMinutes?.value === "number"
            ? otpExpiryMinutes.value
            : 5,
        currency_default: (currencyDefault?.value as string) || "USD",
        currency_symbol: (currencySymbol?.value as string) || "$",
      });
    } catch (error) {
      console.error("Error fetching public settings:", error);
      res.json({
        phone_number_monthly_credits: 50,
        low_credits_threshold: 50,
        credits_per_minute: 1,
        otp_expiry_minutes: 5,
        currency_default: "USD",
        currency_symbol: "$",
      });
    }
  });

  router.get(
    "/api/settings/llm-margin",
    async (_req: Request, res: Response) => {
      try {
        const setting = await storage.getGlobalSetting("llm_pricing_margin");
        const marginPercentage = setting?.value || 15;
        res.json({
          llm_margin_percentage: parseFloat(marginPercentage as any),
        });
      } catch (error) {
        console.error("Error fetching LLM margin:", error);
        res.json({ llm_margin_percentage: 15 });
      }
    },
  );

  router.get(
    "/api/settings/voice-engine",
    async (_req: Request, res: Response) => {
      try {
        const toBool = (value: any): boolean => {
          if (value === true || value === "true") return true;
          if (value === false || value === "false") return false;
          return Boolean(value);
        };

        const plivoEngineEnabled = await storage.getGlobalSetting(
          "plivo_openai_engine_enabled",
        );
        const twilioOpenaiEngineEnabled = await storage.getGlobalSetting(
          "twilio_openai_engine_enabled",
        );
        const twilioKycRequired = await storage.getGlobalSetting(
          "twilio_kyc_required",
        );
        const plivoKycRequired =
          await storage.getGlobalSetting("plivo_kyc_required");

        res.json({
          plivo_openai_engine_enabled:
            toBool(plivoEngineEnabled?.value) || false,
          twilio_openai_engine_enabled:
            toBool(twilioOpenaiEngineEnabled?.value) || false,
          twilio_kyc_required: toBool(twilioKycRequired?.value) ?? true,
          plivo_kyc_required: toBool(plivoKycRequired?.value) ?? true,
        });
      } catch (error) {
        console.error("Error fetching voice engine settings:", error);
        res.json({
          plivo_openai_engine_enabled: false,
          twilio_openai_engine_enabled: false,
          twilio_kyc_required: true,
          plivo_kyc_required: true,
        });
      }
    },
  );

  router.get(
    "/api/settings/payment-gateway",
    async (_req: Request, res: Response) => {
      try {
        const toBool = (value: any): boolean => {
          if (value === true || value === "true") return true;
          if (value === false || value === "false") return false;
          return Boolean(value);
        };

        const currencySymbols: Record<string, string> = {
          USD: "$",
          EUR: "€",
          GBP: "£",
          CAD: "C$",
          AUD: "A$",
          JPY: "¥",
          INR: "₹",
          BRL: "R$",
          MXN: "$",
          CHF: "CHF",
          NGN: "₦",
          GHS: "₵",
          ZAR: "R",
          KES: "KSh",
          ARS: "$",
          CLP: "$",
          COP: "$",
          PEN: "S/",
          UYU: "$",
        };

        const dbStripeSecretKey =
          await storage.getGlobalSetting("stripe_secret_key");
        const dbStripePublishableKey = await storage.getGlobalSetting(
          "stripe_publishable_key",
        );
        const envStripeSecretKey = process.env.STRIPE_SECRET_KEY;
        const envStripePublishableKey = process.env.VITE_STRIPE_PUBLIC_KEY;
        const stripeConfigured = !!(
          (dbStripeSecretKey?.value && dbStripePublishableKey?.value) ||
          (envStripeSecretKey && envStripePublishableKey)
        );

        const dbRazorpayKeyId =
          await storage.getGlobalSetting("razorpay_key_id");
        const dbRazorpayKeySecret = await storage.getGlobalSetting(
          "razorpay_key_secret",
        );
        const razorpayConfigured = !!(
          dbRazorpayKeyId?.value && dbRazorpayKeySecret?.value
        );

        const dbPaypalClientId =
          await storage.getGlobalSetting("paypal_client_id");
        const dbPaypalClientSecret = await storage.getGlobalSetting(
          "paypal_client_secret",
        );
        const paypalConfigured = !!(
          dbPaypalClientId?.value && dbPaypalClientSecret?.value
        );

        const dbPaystackPublicKey = await storage.getGlobalSetting(
          "paystack_public_key",
        );
        const dbPaystackSecretKey = await storage.getGlobalSetting(
          "paystack_secret_key",
        );
        const paystackConfigured = !!(
          dbPaystackPublicKey?.value && dbPaystackSecretKey?.value
        );

        const dbMercadopagoAccessToken = await storage.getGlobalSetting(
          "mercadopago_access_token",
        );
        const dbMercadopagoPublicKey = await storage.getGlobalSetting(
          "mercadopago_public_key",
        );
        const mercadopagoConfigured = !!dbMercadopagoAccessToken?.value;

        const stripeEnabledSetting =
          await storage.getGlobalSetting("stripe_enabled");
        const razorpayEnabledSetting =
          await storage.getGlobalSetting("razorpay_enabled");
        const paypalEnabledSetting =
          await storage.getGlobalSetting("paypal_enabled");
        const paystackEnabledSetting =
          await storage.getGlobalSetting("paystack_enabled");
        const mercadopagoEnabledSetting = await storage.getGlobalSetting(
          "mercadopago_enabled",
        );

        const stripeEnabledValue = stripeEnabledSetting?.value;
        const stripeEnabled =
          stripeConfigured &&
          (stripeEnabledValue === undefined ||
            stripeEnabledValue === null ||
            toBool(stripeEnabledValue) === true);

        const razorpayEnabled =
          razorpayConfigured && toBool(razorpayEnabledSetting?.value) === true;
        const paypalEnabled =
          paypalConfigured && toBool(paypalEnabledSetting?.value) === true;
        const paystackEnabled =
          paystackConfigured && toBool(paystackEnabledSetting?.value) === true;
        const mercadopagoEnabled =
          mercadopagoConfigured &&
          toBool(mercadopagoEnabledSetting?.value) === true;

        const result: any = {
          stripeEnabled,
          razorpayEnabled,
          paypalEnabled,
          paystackEnabled,
          mercadopagoEnabled,
        };

        if (stripeEnabled) {
          result.stripePublicKey =
            dbStripePublishableKey?.value ||
            process.env.VITE_STRIPE_PUBLIC_KEY ||
            null;

          const stripeCurrencySetting =
            await storage.getGlobalSetting("stripe_currency");
          const stripeCurrencyLockedSetting = await storage.getGlobalSetting(
            "stripe_currency_locked",
          );
          const stripeCurrency =
            (stripeCurrencySetting?.value as string) || "USD";
          const stripeCurrencyLocked = toBool(
            stripeCurrencyLockedSetting?.value,
          );

          result.stripeCurrency = stripeCurrency.toUpperCase();
          result.stripeCurrencySymbol =
            currencySymbols[stripeCurrency.toUpperCase()] || "$";
          result.stripeCurrencyLocked = stripeCurrencyLocked;
        }

        if (razorpayEnabled) {
          result.razorpayKeyId = dbRazorpayKeyId?.value || null;
          result.razorpayCurrency = "INR";
          result.razorpayCurrencySymbol = "₹";
        }

        if (paypalEnabled) {
          result.paypalClientId = dbPaypalClientId?.value || null;
          const paypalCurrencySetting =
            await storage.getGlobalSetting("paypal_currency");
          const paypalModeSetting =
            await storage.getGlobalSetting("paypal_mode");
          const paypalCurrency =
            (paypalCurrencySetting?.value as string) || "USD";
          result.paypalCurrency = paypalCurrency.toUpperCase();
          result.paypalCurrencySymbol =
            currencySymbols[paypalCurrency.toUpperCase()] || "$";
          result.paypalMode = (paypalModeSetting?.value as string) || "sandbox";
        }

        if (paystackEnabled) {
          result.paystackPublicKey = dbPaystackPublicKey?.value || null;
          const paystackCurrencySetting =
            await storage.getGlobalSetting("paystack_currency");
          const paystackCurrency =
            (paystackCurrencySetting?.value as string) || "NGN";
          result.paystackCurrency = paystackCurrency.toUpperCase();
          result.paystackCurrencySymbol =
            currencySymbols[paystackCurrency.toUpperCase()] || "₦";
          result.paystackCurrencies = ["NGN", "GHS", "ZAR", "KES"];
          result.paystackDefaultCurrency = "NGN";
        }

        if (mercadopagoEnabled) {
          result.mercadopagoPublicKey = dbMercadopagoPublicKey?.value || null;
          const mercadopagoCurrencySetting = await storage.getGlobalSetting(
            "mercadopago_currency",
          );
          const mercadopagoCurrency =
            (mercadopagoCurrencySetting?.value as string) || "BRL";
          result.mercadopagoCurrency = mercadopagoCurrency.toUpperCase();
          result.mercadopagoCurrencySymbol =
            currencySymbols[mercadopagoCurrency.toUpperCase()] || "R$";
          result.mercadopagoCurrencies = [
            "BRL",
            "MXN",
            "ARS",
            "CLP",
            "COP",
            "PEN",
            "UYU",
          ];
        }

        res.json(result);
      } catch (error) {
        console.error("Error fetching payment gateway config:", error);
        res.json({
          stripeEnabled: false,
          razorpayEnabled: false,
          paypalEnabled: false,
          paystackEnabled: false,
          mercadopagoEnabled: false,
          stripePublicKey: null,
        });
      }
    },
  );

  // ============================================
  // BRANDING ROUTE
  // ============================================

  router.get("/api/branding", async (_req: Request, res: Response) => {
    try {
      const brandingKeys = [
        "app_name",
        "app_tagline",
        "logo_url",
        "logo_url_light",
        "logo_url_dark",
        "favicon_url",
        "branding_updated_at",
        "admin_email",
        "social_twitter_url",
        "social_linkedin_url",
        "social_github_url",
      ];
      const branding: Record<string, any> = {
        app_name: "Wtrops.ai",
        app_tagline:
          "AI Voice Calling Agents & Lead Intelligence SaaS Platform",
        logo_url: null,
        logo_url_light: null,
        logo_url_dark: null,
        favicon_url: null,
        branding_updated_at: null,
        admin_email: null,
        social_twitter_url: null,
        social_linkedin_url: null,
        social_github_url: null,
      };

      for (const key of brandingKeys) {
        const setting = await storage.getGlobalSetting(key);
        if (setting) {
          branding[key] = setting.value;
        }
      }

      res.setHeader("Cache-Control", "public, no-cache, must-revalidate");
      res.json(branding);
    } catch (error) {
      console.error("Error fetching branding:", error);
      res.json({
        app_name: "Wtrops.ai",
        app_tagline:
          "AI Voice Calling Agents & Lead Intelligence SaaS Platform",
        logo_url: null,
        favicon_url: null,
        social_twitter_url: null,
        social_linkedin_url: null,
        social_github_url: null,
      });
    }
  });

  // ============================================
  // SEO ROUTES
  // ============================================

  router.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      const seoSettings = await storage.getSeoSettings();

      const protocol = req.protocol || "https";
      const host = req.get("host") || "";
      const baseUrl = seoSettings?.canonicalBaseUrl || `${protocol}://${host}`;

      const defaultUrls: Array<{
        url: string;
        changefreq: string;
        priority: number;
        lastmod?: string;
      }> = [
        { url: "/", changefreq: "weekly", priority: 1.0 },
        { url: "/pricing", changefreq: "weekly", priority: 0.9 },
        { url: "/features", changefreq: "weekly", priority: 0.9 },
        { url: "/use-cases", changefreq: "weekly", priority: 0.8 },
        { url: "/integrations", changefreq: "weekly", priority: 0.8 },
        { url: "/blog", changefreq: "daily", priority: 0.7 },
        { url: "/contact", changefreq: "monthly", priority: 0.6 },
      ];

      const customUrls = (seoSettings?.sitemapUrls as any[]) || [];

      const allUrls = [...defaultUrls];
      for (const customUrl of customUrls) {
        const existingIndex = allUrls.findIndex((u) => u.url === customUrl.url);
        if (existingIndex >= 0) {
          allUrls[existingIndex] = customUrl;
        } else {
          allUrls.push(customUrl);
        }
      }

      const today = new Date().toISOString().split("T")[0];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls
  .map(
    (u) => `  <url>
    <loc>${baseUrl}${u.url}</loc>
    <lastmod>${u.lastmod || today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (error) {
      console.error("Error generating sitemap:", error);
      res.status(500).send("Error generating sitemap");
    }
  });

  router.get("/robots.txt", async (req: Request, res: Response) => {
    try {
      const seoSettings = await storage.getSeoSettings();

      const protocol = req.protocol || "https";
      const host = req.get("host") || "";
      const baseUrl = seoSettings?.canonicalBaseUrl || `${protocol}://${host}`;

      const defaultRules = [
        {
          userAgent: "*",
          allow: [
            "/",
            "/pricing",
            "/features",
            "/use-cases",
            "/integrations",
            "/blog",
            "/contact",
          ],
          disallow: ["/app/", "/admin/", "/api/"],
        },
      ];

      const rules = (seoSettings?.robotsRules as any[]) || defaultRules;
      const crawlDelay = seoSettings?.robotsCrawlDelay || 0;

      let content = "";
      for (const rule of rules) {
        content += `User-agent: ${rule.userAgent}\n`;
        for (const allow of rule.allow || []) {
          content += `Allow: ${allow}\n`;
        }
        for (const disallow of rule.disallow || []) {
          content += `Disallow: ${disallow}\n`;
        }
        if (crawlDelay > 0) {
          content += `Crawl-delay: ${crawlDelay}\n`;
        }
        content += "\n";
      }

      content += `Sitemap: ${baseUrl}/sitemap.xml\n`;

      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(content);
    } catch (error) {
      console.error("Error generating robots.txt:", error);
      res.setHeader("Content-Type", "text/plain");
      res.send(
        `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /admin/\nDisallow: /api/\n`,
      );
    }
  });

  // ============================================
  // PUBLIC STATS/DEMO ROUTES
  // ============================================

  router.get("/api/public/stats", async (_req: Request, res: Response) => {
    try {
      const allUsers = await db.select().from(users);
      const allCalls = await db.select().from(calls);
      const allCampaigns = await db.select().from(campaigns);

      const totalUsers = allUsers.length;
      const totalCalls = allCalls.length;
      const completedCalls = allCalls.filter(
        (c) => c.status === "completed",
      ).length;
      const completedCampaigns = allCampaigns.filter(
        (c) => c.status === "completed",
      ).length;
      const qualifiedLeads = allCalls.filter(
        (c) => c.classification === "hot" || c.classification === "warm",
      ).length;

      const avgCallDuration = 2.5;
      const timeSavedHours = Math.round(
        (completedCalls * avgCallDuration) / 60,
      );
      const profitMultiplier = 45;
      const estimatedProfit = qualifiedLeads * profitMultiplier;

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json({
        totalUsers,
        totalCalls,
        completedCampaigns,
        qualifiedLeads,
        timeSavedHours,
        estimatedProfit,
      });
    } catch (error) {
      console.error("Error fetching public stats:", error);
      res.json({
        totalUsers: 2500,
        totalCalls: 125000,
        completedCampaigns: 8500,
        qualifiedLeads: 45000,
        timeSavedHours: 12500,
        estimatedProfit: 2025000,
      });
    }
  });

  // ============================================
  // PUBLIC SEO/ANALYTICS ROUTES
  // ============================================

  router.get("/api/public/seo", async (_req: Request, res: Response) => {
    try {
      const seoSettings = await storage.getSeoSettings();

      if (!seoSettings) {
        return res.json({
          defaultTitle: null,
          defaultDescription: null,
          defaultKeywords: [],
          defaultOgImage: null,
          canonicalBaseUrl: null,
          twitterHandle: null,
          facebookAppId: null,
          googleVerification: null,
          bingVerification: null,
          structuredDataOrg: null,
          structuredDataFaq: null,
          structuredDataProduct: null,
        });
      }

      const structuredData = seoSettings.structuredData;
      let structuredDataOrg = null;

      if (structuredData && seoSettings.structuredDataEnabled) {
        structuredDataOrg = {
          name: structuredData.organizationName || null,
          url: structuredData.organizationUrl || null,
          logo: structuredData.organizationLogo || null,
          description: structuredData.organizationDescription || null,
          contactPoint:
            structuredData.contactEmail || structuredData.contactPhone
              ? {
                  email: structuredData.contactEmail || undefined,
                  telephone: structuredData.contactPhone || undefined,
                  contactType: "customer service",
                }
              : undefined,
          sameAs: structuredData.socialProfiles || [],
        };
      }

      let structuredDataFaq = null;
      const faqData = seoSettings.structuredDataFaq as any[];
      if (
        faqData &&
        faqData.length > 0 &&
        seoSettings.structuredDataFaqEnabled
      ) {
        structuredDataFaq = faqData.map((item: any) => ({
          question: item.question,
          answer: item.answer,
        }));
      }

      let structuredDataProduct = null;
      const productData = seoSettings.structuredDataProduct as any;
      if (productData && seoSettings.structuredDataProductEnabled) {
        structuredDataProduct = {
          name: productData.name || null,
          description: productData.description || null,
          image: productData.image || null,
          brand: productData.brand || null,
          sku: productData.sku || null,
          price: productData.price || null,
          priceCurrency: productData.priceCurrency || "USD",
          availability: productData.availability || "InStock",
          url: productData.url || null,
          ratingValue: productData.ratingValue || null,
          ratingCount: productData.ratingCount || null,
        };
      }

      res.setHeader("Cache-Control", "public, max-age=300");
      res.json({
        defaultTitle: seoSettings.defaultTitle,
        defaultDescription: seoSettings.defaultDescription,
        defaultKeywords: seoSettings.defaultKeywords || [],
        defaultOgImage: seoSettings.defaultOgImage,
        canonicalBaseUrl: seoSettings.canonicalBaseUrl,
        twitterHandle: seoSettings.twitterHandle,
        facebookAppId: seoSettings.facebookAppId,
        googleVerification: seoSettings.googleVerification,
        bingVerification: seoSettings.bingVerification,
        structuredDataOrg: structuredDataOrg,
        structuredDataFaq: structuredDataFaq,
        structuredDataProduct: structuredDataProduct,
      });
    } catch (error) {
      console.error("Error fetching public SEO settings:", error);
      res.status(500).json({ error: "Failed to fetch SEO settings" });
    }
  });

  router.get(
    "/api/public/analytics-scripts",
    async (_req: Request, res: Response) => {
      try {
        const scripts = await storage.getEnabledAnalyticsScripts();

        const sortedScripts = scripts
          .sort((a, b) => (b.loadPriority || 0) - (a.loadPriority || 0))
          .map((script) => ({
            id: script.id,
            name: script.name,
            type: script.type,
            code: script.code,
            placement: script.placement,
            async: script.async,
            defer: script.defer,
          }));

        res.setHeader("Cache-Control", "public, max-age=300");
        res.json(sortedScripts);
      } catch (error) {
        console.error("Error fetching public analytics scripts:", error);
        res.status(500).json({ error: "Failed to fetch analytics scripts" });
      }
    },
  );

  // ============================================
  // CONTACT FORM ROUTE
  // ============================================

  router.post("/api/contact", async (req: Request, res: Response) => {
    try {
      const { z } = await import("zod");

      const contactSchema = z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
        email: z.string().email("Invalid email address"),
        company: z.string().optional(),
        phone: z.string().optional(),
        message: z.string().min(10, "Message must be at least 10 characters"),
      });

      const validationResult = contactSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          error:
            validationResult.error.errors[0]?.message || "Invalid form data",
        });
      }

      const { name, email, company, phone, message } = validationResult.data;

      const adminEmailSetting = await storage.getGlobalSetting("admin_email");
      const smtpFromEmail = await storage.getGlobalSetting("smtp_from_email");
      const adminEmail =
        (adminEmailSetting?.value as string) ||
        (smtpFromEmail?.value as string) ||
        process.env.SMTP_USER;

      const appNameSetting = await storage.getGlobalSetting("app_name");
      const appName = (appNameSetting?.value as string) || "Wtrops.ai";

      if (!adminEmail) {
        console.error("No admin email configured for contact form");
        return res.status(500).json({
          error: "Contact form not configured. Please try again later.",
        });
      }

      if (!emailService.isEnabled()) {
        console.error("Email service is not configured");
        return res.status(500).json({
          error:
            "Email service not configured. Please contact the administrator.",
        });
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f59e0b, #ea580c); color: white; padding: 24px; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; }
            .field { margin-bottom: 16px; }
            .label { font-weight: 600; color: #6b7280; font-size: 12px; text-transform: uppercase; }
            .value { margin-top: 4px; font-size: 15px; }
            .message-box { background: white; padding: 16px; border-radius: 8px; border: 1px solid #e5e7eb; margin-top: 8px; white-space: pre-wrap; }
            .footer { text-align: center; padding: 16px; font-size: 12px; color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">${appName} - New Contact Form Submission</h2>
            </div>
            <div class="content">
              <div class="field">
                <div class="label">Name</div>
                <div class="value">${name}</div>
              </div>
              <div class="field">
                <div class="label">Email</div>
                <div class="value"><a href="mailto:${email}">${email}</a></div>
              </div>
              ${
                company
                  ? `<div class="field">
                <div class="label">Company</div>
                <div class="value">${company}</div>
              </div>`
                  : ""
              }
              ${
                phone
                  ? `<div class="field">
                <div class="label">Phone</div>
                <div class="value"><a href="tel:${phone}">${phone}</a></div>
              </div>`
                  : ""
              }
              <div class="field">
                <div class="label">Message</div>
                <div class="message-box">${message}</div>
              </div>
            </div>
            <div class="footer">
              Sent from ${appName} Contact Form
            </div>
          </div>
        </body>
        </html>
      `;

      const subject = `[${appName}] New Contact: ${name}${company ? ` from ${company}` : ""}`;
      const textContent = `New contact form submission:\n\nName: ${name}\nEmail: ${email}\n${company ? `Company: ${company}\n` : ""}${phone ? `Phone: ${phone}\n` : ""}Message:\n${message}`;

      const result = await emailService.sendEmail(
        adminEmail,
        subject,
        htmlContent,
        undefined,
        {
          replyTo: email,
          text: textContent,
        },
      );

      if (!result.success) {
        console.error(`Contact form email failed: ${result.error}`);
        return res
          .status(500)
          .json({ error: "Failed to send message. Please try again later." });
      }

      console.log(
        `✉️ [Contact] Form submission sent to ${adminEmail} from ${email}`,
      );

      res.json({
        success: true,
        message: "Thank you! We'll get back to you soon.",
      });
    } catch (error: any) {
      console.error("Contact form error:", error);
      res
        .status(500)
        .json({ error: "Failed to send message. Please try again later." });
    }
  });

  // ============================================
  // TWILIO COUNTRIES ROUTE
  // ============================================

  router.get("/api/twilio-countries", async (_req: Request, res: Response) => {
    try {
      const countries = await db
        .select()
        .from(twilioCountries)
        .where(eq(twilioCountries.isActive, true))
        .orderBy(twilioCountries.name);

      res.json(countries);
    } catch (error) {
      console.error("Error fetching Twilio countries:", error);
      res.status(500).json({ error: "Failed to fetch countries" });
    }
  });

  return router;
}
