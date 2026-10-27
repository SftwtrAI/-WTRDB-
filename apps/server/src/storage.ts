"use strict";
import { db } from "./db";
import { nanoid } from "nanoid";
import {
  users,
  knowledgeBase,
  plans,
  userSubscriptions,
  globalSettings,
  creditPackages,
  webhookSubscriptions,
  webhookDeliveryLogs,
  notifications,
  emailTemplates,
  promptTemplates,
  seoSettings,
  analyticsScripts,
  paymentTransactions,
  refunds,
  invoices,
  paymentWebhookQueue,
  emailNotificationSettings,
  bannedWords,
  type User,
  type InsertUser,
  type KnowledgeBase as KnowledgeBaseType,
  type InsertKnowledgeBase,
  type Plan,
  type InsertPlan,
  type UserSubscription,
  type InsertUserSubscription,
  type GlobalSettings,
  type InsertGlobalSettings,
  type CreditPackage,
  type InsertCreditPackage,
  type Webhook,
  type InsertWebhook,
  type WebhookLog,
  type InsertWebhookLog,
  type Notification,
  type InsertNotification,
  type EmailTemplate,
  type InsertEmailTemplate,
  type PromptTemplate,
  type InsertPromptTemplate,
  type SeoSettings,
  type InsertSeoSettings,
  type AnalyticsScript,
  type InsertAnalyticsScript,
  type PaymentTransaction,
  type InsertPaymentTransaction,
  type Refund,
  type InsertRefund,
  type Invoice,
  type InsertInvoice,
  type PaymentWebhookQueue,
  type InsertPaymentWebhookQueue,
  type EmailNotificationSettings,
  type InsertEmailNotificationSettings,
  type BannedWord,
  type InsertBannedWord,
} from "@wtrops/shared";
import {
  eq,
  sql,
  and,
  gte,
  lte,
  desc,
  asc,
  isNull,
  isNotNull,
  or,
  inArray,
} from "drizzle-orm";

// Effective limits type - merges plan limits with per-user subscription overrides
export interface EffectiveLimits {
  maxAgents: number;
  maxCampaigns: number;
  maxContactsPerCampaign: number;
  maxWebhooks: number;
  maxKnowledgeBases: number;
  maxFlows: number;
  maxPhoneNumbers: number;
  includedCredits: number;
  // Source tracking for admin UI
  sources: {
    maxAgents: "plan" | "override";
    maxCampaigns: "plan" | "override";
    maxContactsPerCampaign: "plan" | "override";
    maxWebhooks: "plan" | "override";
    maxKnowledgeBases: "plan" | "override";
    maxFlows: "plan" | "override";
    maxPhoneNumbers: "plan" | "override";
    includedCredits: "plan" | "override";
  };
  planName: string;
  planDisplayName: string;
}

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserCredits(userId: string, credits: number): Promise<void>;

  // Knowledge Base
  getKnowledgeBaseItem(id: string): Promise<KnowledgeBaseType | undefined>;
  getUserKnowledgeBase(userId: string): Promise<KnowledgeBaseType[]>;
  getUserKnowledgeBaseCount(userId: string): Promise<number>;
  createKnowledgeBaseItem(
    item: InsertKnowledgeBase,
  ): Promise<KnowledgeBaseType>;
  updateKnowledgeBaseItem(
    id: string,
    item: Partial<InsertKnowledgeBase>,
  ): Promise<void>;
  deleteKnowledgeBaseItem(id: string): Promise<void>;

  // Plans
  getPlan(id: string): Promise<Plan | undefined>;
  getAllPlans(): Promise<Plan[]>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, plan: Partial<InsertPlan>): Promise<void>;
  deletePlan(id: string): Promise<void>;

  // Global Settings
  getGlobalSetting(key: string): Promise<GlobalSettings | undefined>;
  updateGlobalSetting(key: string, value: any): Promise<void>;

  // Credit Packages
  getCreditPackage(id: string): Promise<CreditPackage | undefined>;
  getAllCreditPackages(): Promise<CreditPackage[]>;
  createCreditPackage(pack: InsertCreditPackage): Promise<CreditPackage>;
  updateCreditPackage(
    id: string,
    pack: Partial<InsertCreditPackage>,
  ): Promise<void>;

  // Admin Functions
  getAllUsers(): Promise<User[]>;
  getAllAdminUsers(): Promise<User[]>;
  updateUser(id: string, user: Partial<User>): Promise<void>;

  // User Subscriptions
  getUserSubscription(userId: string): Promise<any>; // Returns subscription with embedded plan or null
  getUserSubscriptionByPaystackCode(
    subscriptionCode: string,
  ): Promise<UserSubscription | undefined>; // Find by Paystack subscription code
  getAllUserSubscriptions(): Promise<UserSubscription[]>; // Returns all subscriptions for webhook lookups
  createUserSubscription(
    subscription: InsertUserSubscription,
  ): Promise<UserSubscription>;
  updateUserSubscription(
    id: string,
    subscription: Partial<InsertUserSubscription>,
  ): Promise<void>;
  updateUserSubscriptionByUserId(
    userId: string,
    subscription: Partial<InsertUserSubscription>,
  ): Promise<void>;

  // Effective Limits - Merges plan limits with per-user subscription overrides
  getUserEffectiveLimits(userId: string): Promise<EffectiveLimits>;

  // Webhooks (Subscriptions)
  getWebhook(id: string): Promise<Webhook | undefined>;
  getUserWebhooks(userId: string): Promise<Webhook[]>;
  getUserWebhookCount(userId: string): Promise<number>;
  getWebhooksForEvent(
    userId: string,
    event: string,
    campaignId?: string,
  ): Promise<Webhook[]>;
  createWebhook(webhook: InsertWebhook): Promise<Webhook>;
  updateWebhook(id: string, webhook: Partial<InsertWebhook>): Promise<void>;
  deleteWebhook(id: string): Promise<void>;

  // Webhook Delivery Logs
  getWebhookLog(id: number): Promise<WebhookLog | undefined>;
  getWebhookLogs(webhookId: string, limit?: number): Promise<WebhookLog[]>;
  createWebhookLog(log: InsertWebhookLog): Promise<WebhookLog>;
  updateWebhookLog(id: number, log: Partial<InsertWebhookLog>): Promise<void>;
  getFailedWebhookLogs(limit?: number): Promise<WebhookLog[]>;

  // Notifications
  getNotification(id: string): Promise<Notification | undefined>;
  getUserNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getBannerNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<void>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  dismissNotification(id: string, userId?: string): Promise<void>;
  deleteNotification(id: string): Promise<void>;

  // Email Templates
  getEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(templateType: string): Promise<EmailTemplate | undefined>;
  updateEmailTemplate(id: string, data: Partial<EmailTemplate>): Promise<void>;
  createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate>;

  // Prompt Templates
  getPromptTemplate(id: string): Promise<PromptTemplate | undefined>;
  getUserPromptTemplates(userId: string): Promise<PromptTemplate[]>;
  getSystemPromptTemplates(): Promise<PromptTemplate[]>;
  getPublicPromptTemplates(): Promise<PromptTemplate[]>;
  createPromptTemplate(template: InsertPromptTemplate): Promise<PromptTemplate>;
  updatePromptTemplate(
    id: string,
    template: Partial<InsertPromptTemplate>,
  ): Promise<void>;
  deletePromptTemplate(id: string): Promise<void>;
  incrementPromptTemplateUsage(id: string): Promise<void>;

  // SEO Settings
  getSeoSettings(): Promise<SeoSettings | undefined>;
  updateSeoSettings(settings: Partial<InsertSeoSettings>): Promise<SeoSettings>;

  // Analytics Scripts
  getAnalyticsScript(id: string): Promise<AnalyticsScript | undefined>;
  getAllAnalyticsScripts(): Promise<AnalyticsScript[]>;
  getEnabledAnalyticsScripts(): Promise<AnalyticsScript[]>;
  createAnalyticsScript(
    script: InsertAnalyticsScript,
  ): Promise<AnalyticsScript>;
  updateAnalyticsScript(
    id: string,
    script: Partial<InsertAnalyticsScript>,
  ): Promise<void>;
  deleteAnalyticsScript(id: string): Promise<void>;

  // Payment Transactions
  getPaymentTransaction(id: string): Promise<PaymentTransaction | undefined>;
  getPaymentTransactionByGatewayId(
    gateway: string,
    gatewayTransactionId: string,
  ): Promise<PaymentTransaction | undefined>;
  getUserPaymentTransactions(userId: string): Promise<PaymentTransaction[]>;
  getAllPaymentTransactions(filters?: {
    gateway?: string;
    type?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PaymentTransaction[]>;
  createPaymentTransaction(
    transaction: InsertPaymentTransaction,
  ): Promise<PaymentTransaction>;
  updatePaymentTransaction(
    id: string,
    transaction: Partial<InsertPaymentTransaction>,
  ): Promise<void>;
  getPaymentAnalytics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalRevenue: number;
    revenueByGateway: Record<string, number>;
    revenueByType: Record<string, number>;
    transactionCount: number;
    transactionsByStatus: Record<string, number>;
    refundCount: number;
    totalRefunded: number;
  }>;

  // Refunds
  getRefund(id: string): Promise<Refund | undefined>;
  getTransactionRefunds(transactionId: string): Promise<Refund[]>;
  getUserRefunds(userId: string): Promise<Refund[]>;
  getAllRefunds(): Promise<Refund[]>;
  createRefund(refund: InsertRefund): Promise<Refund>;
  updateRefund(id: string, refund: Partial<InsertRefund>): Promise<void>;

  // Invoices
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined>;
  getTransactionInvoice(transactionId: string): Promise<Invoice | undefined>;
  getUserInvoices(userId: string): Promise<Invoice[]>;
  getAllInvoices(): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<void>;
  getNextInvoiceNumber(): Promise<string>;

  // Payment Webhook Queue
  getWebhookQueueItem(id: string): Promise<PaymentWebhookQueue | undefined>;
  getPendingWebhooks(): Promise<PaymentWebhookQueue[]>;
  getWebhookByEventId(
    gateway: string,
    eventId: string,
  ): Promise<PaymentWebhookQueue | undefined>;
  createWebhookQueueItem(
    item: InsertPaymentWebhookQueue,
  ): Promise<PaymentWebhookQueue>;
  updateWebhookQueueItem(
    id: string,
    item: Partial<InsertPaymentWebhookQueue>,
  ): Promise<void>;
  getExpiredWebhooks(): Promise<PaymentWebhookQueue[]>;
  getRetryableWebhooks(): Promise<PaymentWebhookQueue[]>;

  // Email Notification Settings
  getEmailNotificationSetting(
    eventType: string,
  ): Promise<EmailNotificationSettings | undefined>;
  getAllEmailNotificationSettings(): Promise<EmailNotificationSettings[]>;
  getEmailNotificationSettingsByCategory(
    category: string,
  ): Promise<EmailNotificationSettings[]>;
  createEmailNotificationSetting(
    setting: InsertEmailNotificationSettings,
  ): Promise<EmailNotificationSettings>;
  updateEmailNotificationSetting(
    eventType: string,
    setting: Partial<InsertEmailNotificationSettings>,
  ): Promise<void>;

  getUserById(id: string): Promise<User | undefined>;

  // Banned Words
  getBannedWords(): Promise<BannedWord[]>;
  getActiveBannedWords(): Promise<BannedWord[]>;
  createBannedWord(data: InsertBannedWord): Promise<BannedWord>;
  updateBannedWord(
    id: string,
    data: Partial<InsertBannedWord>,
  ): Promise<BannedWord | undefined>;
  deleteBannedWord(id: string): Promise<boolean>;
}

export class DbStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserCredits(userId: string, credits: number): Promise<void> {
    await db.update(users).set({ credits }).where(eq(users.id, userId));
  }

  // Knowledge Base
  async getKnowledgeBaseItem(
    id: string,
  ): Promise<KnowledgeBaseType | undefined> {
    const [item] = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.id, id));
    return item;
  }

  async getUserKnowledgeBase(userId: string): Promise<KnowledgeBaseType[]> {
    return db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.userId, userId));
  }

  async getUserKnowledgeBaseCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(knowledgeBase)
      .where(eq(knowledgeBase.userId, userId));
    return Number(result[0]?.count || 0);
  }

  async createKnowledgeBaseItem(
    insertItem: InsertKnowledgeBase,
  ): Promise<KnowledgeBaseType> {
    const [item] = await db
      .insert(knowledgeBase)
      .values(insertItem)
      .returning();
    return item;
  }

  async updateKnowledgeBaseItem(
    id: string,
    item: Partial<InsertKnowledgeBase>,
  ): Promise<void> {
    await db.update(knowledgeBase).set(item).where(eq(knowledgeBase.id, id));
  }

  async deleteKnowledgeBaseItem(id: string): Promise<void> {
    await db.delete(knowledgeBase).where(eq(knowledgeBase.id, id));
  }

  // Plans
  async getPlan(id: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  async getPlanByName(name: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.name, name));
    return plan;
  }

  async getAllPlans(): Promise<Plan[]> {
    return db.select().from(plans).where(eq(plans.isActive, true));
  }

  async createPlan(insertPlan: InsertPlan): Promise<Plan> {
    const [plan] = await db.insert(plans).values(insertPlan).returning();
    return plan;
  }

  async updatePlan(id: string, plan: Partial<InsertPlan>): Promise<void> {
    const result = await db
      .update(plans)
      .set(plan)
      .where(eq(plans.id, id))
      .returning({ id: plans.id });
    if (result.length === 0) {
      throw new Error(`Failed to update plan: Plan with id '${id}' not found`);
    }
  }

  async deletePlan(id: string): Promise<void> {
    await db.delete(plans).where(eq(plans.id, id));
  }

  // Global Settings
  async getGlobalSetting(key: string): Promise<GlobalSettings | undefined> {
    const [setting] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, key));
    if (setting && setting.value !== null && setting.value !== undefined) {
      // Handle double-encoded JSON strings (legacy data fix)
      // If value is a string that looks like a JSON-encoded string (starts/ends with quotes), parse it
      let val = setting.value;
      if (typeof val === "string" && val.startsWith('"') && val.endsWith('"')) {
        try {
          val = JSON.parse(val);
        } catch {
          // Keep original value if parsing fails
        }
      }
      return { ...setting, value: val };
    }
    return setting;
  }

  async updateGlobalSetting(key: string, value: any): Promise<void> {
    // Use raw SQL to properly store values in jsonb column without double-encoding
    // This ensures strings are stored as JSON strings, not as JSON strings of JSON strings
    try {
      const jsonValue = JSON.stringify(value);
      await db.execute(sql`
        INSERT INTO global_settings (id, key, value, updated_at)
        VALUES (gen_random_uuid(), ${key}, ${jsonValue}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET 
          value = ${jsonValue}::jsonb,
          updated_at = NOW()
      `);
      console.log(`✅ [Settings] Saved setting '${key}' successfully`);
    } catch (error: any) {
      console.error(
        `❌ [Settings] Failed to save setting '${key}':`,
        error.message,
      );
      throw new Error(`Failed to save setting '${key}': ${error.message}`);
    }
  }

  // Credit Packages
  async getCreditPackage(id: string): Promise<CreditPackage | undefined> {
    const [pack] = await db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.id, id));
    return pack;
  }

  async getAllCreditPackages(): Promise<CreditPackage[]> {
    return db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.isActive, true));
  }

  async createCreditPackage(
    insertPack: InsertCreditPackage,
  ): Promise<CreditPackage> {
    const [pack] = await db
      .insert(creditPackages)
      .values(insertPack)
      .returning();
    return pack;
  }

  async updateCreditPackage(
    id: string,
    pack: Partial<InsertCreditPackage>,
  ): Promise<void> {
    const result = await db
      .update(creditPackages)
      .set(pack)
      .where(eq(creditPackages.id, id))
      .returning({ id: creditPackages.id });
    if (result.length === 0) {
      throw new Error(
        `Failed to update credit package: Package with id '${id}' not found`,
      );
    }
  }

  // Admin Functions
  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getAllAdminUsers(): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(sql`${users.role} = 'admin'`)
      .orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, user: Partial<User>): Promise<void> {
    const result = await db
      .update(users)
      .set(user)
      .where(eq(users.id, id))
      .returning({ id: users.id });
    if (result.length === 0) {
      throw new Error(`Failed to update user: User with id '${id}' not found`);
    }
  }


  // User Subscriptions
  async getUserSubscription(userId: string): Promise<any> {
    // Left join to get subscription with plan details - ORDER BY createdAt DESC to get the most recent
    const result = await db
      .select({
        subscription: userSubscriptions,
        plan: plans,
      })
      .from(userSubscriptions)
      .leftJoin(plans, eq(userSubscriptions.planId, plans.id))
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.createdAt))
      .limit(1);

    if (result.length > 0 && result[0].subscription && result[0].plan) {
      // Return subscription with embedded plan
      return {
        ...result[0].subscription,
        plan: result[0].plan,
      };
    }

    // No subscription exists - return free plan fallback
    const [freePlan] = await db
      .select()
      .from(plans)
      .where(eq(plans.name, "free"))
      .limit(1);
    if (!freePlan) {
      return null;
    }

    // Return a virtual subscription with free plan
    return null; // Let frontend handle free tier separately
  }

  async getAllUserSubscriptions(): Promise<UserSubscription[]> {
    return await db.select().from(userSubscriptions);
  }

  async getUserSubscriptionByPaystackCode(
    subscriptionCode: string,
  ): Promise<UserSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(userSubscriptions)
      .where(eq(userSubscriptions.paystackSubscriptionCode, subscriptionCode))
      .limit(1);
    return subscription;
  }

  async createUserSubscription(
    insertSubscription: InsertUserSubscription,
  ): Promise<UserSubscription> {
    const [subscription] = await db
      .insert(userSubscriptions)
      .values(insertSubscription)
      .returning();
    return subscription;
  }

  async updateUserSubscription(
    id: string,
    subscription: Partial<InsertUserSubscription>,
  ): Promise<void> {
    await db
      .update(userSubscriptions)
      .set(subscription)
      .where(eq(userSubscriptions.id, id));
  }

  async updateUserSubscriptionByUserId(
    userId: string,
    subscription: Partial<InsertUserSubscription>,
  ): Promise<void> {
    await db
      .update(userSubscriptions)
      .set({ ...subscription, updatedAt: new Date() })
      .where(eq(userSubscriptions.userId, userId));
  }

  // Get effective limits for a user - merges plan defaults with per-user overrides
  async getUserEffectiveLimits(userId: string): Promise<EffectiveLimits> {
    // Get user's subscription with plan
    const subscriptionWithPlan = await this.getUserSubscription(userId);

    // Default free tier limits if no subscription
    const defaultLimits: EffectiveLimits = {
      maxAgents: 1,
      maxCampaigns: 1,
      maxContactsPerCampaign: 5,
      maxWebhooks: 3,
      maxKnowledgeBases: 5,
      maxFlows: 5,
      maxPhoneNumbers: 0,
      includedCredits: 0,
      sources: {
        maxAgents: "plan",
        maxCampaigns: "plan",
        maxContactsPerCampaign: "plan",
        maxWebhooks: "plan",
        maxKnowledgeBases: "plan",
        maxFlows: "plan",
        maxPhoneNumbers: "plan",
        includedCredits: "plan",
      },
      planName: "free",
      planDisplayName: "Free",
    };

    if (!subscriptionWithPlan || !subscriptionWithPlan.plan) {
      // Try to get free plan from database
      const [freePlan] = await db
        .select()
        .from(plans)
        .where(eq(plans.name, "free"))
        .limit(1);
      if (freePlan) {
        return {
          maxAgents: freePlan.maxAgents,
          maxCampaigns: freePlan.maxCampaigns,
          maxContactsPerCampaign: freePlan.maxContactsPerCampaign,
          maxWebhooks: freePlan.maxWebhooks ?? 3,
          maxKnowledgeBases: freePlan.maxKnowledgeBases ?? 5,
          maxFlows: freePlan.maxFlows ?? 3,
          maxPhoneNumbers: freePlan.maxPhoneNumbers ?? 0,
          includedCredits: freePlan.includedCredits,
          sources: {
            maxAgents: "plan",
            maxCampaigns: "plan",
            maxContactsPerCampaign: "plan",
            maxWebhooks: "plan",
            maxKnowledgeBases: "plan",
            maxFlows: "plan",
            maxPhoneNumbers: "plan",
            includedCredits: "plan",
          },
          planName: freePlan.name,
          planDisplayName: freePlan.displayName,
        };
      }
      return defaultLimits;
    }

    const plan = subscriptionWithPlan.plan;
    const sub = subscriptionWithPlan;

    // Calculate effective limits - override takes precedence if set (not null)
    return {
      maxAgents: sub.overrideMaxAgents ?? plan.maxAgents,
      maxCampaigns: sub.overrideMaxCampaigns ?? plan.maxCampaigns,
      maxContactsPerCampaign:
        sub.overrideMaxContactsPerCampaign ?? plan.maxContactsPerCampaign,
      maxWebhooks: sub.overrideMaxWebhooks ?? plan.maxWebhooks ?? 3,
      maxKnowledgeBases:
        sub.overrideMaxKnowledgeBases ?? plan.maxKnowledgeBases ?? 5,
      maxFlows: sub.overrideMaxFlows ?? plan.maxFlows ?? 5,
      maxPhoneNumbers: sub.overrideMaxPhoneNumbers ?? plan.maxPhoneNumbers ?? 0,
      includedCredits: sub.overrideIncludedCredits ?? plan.includedCredits,
      sources: {
        maxAgents: sub.overrideMaxAgents !== null ? "override" : "plan",
        maxCampaigns: sub.overrideMaxCampaigns !== null ? "override" : "plan",
        maxContactsPerCampaign:
          sub.overrideMaxContactsPerCampaign !== null ? "override" : "plan",
        maxWebhooks: sub.overrideMaxWebhooks !== null ? "override" : "plan",
        maxKnowledgeBases:
          sub.overrideMaxKnowledgeBases !== null ? "override" : "plan",
        maxFlows: sub.overrideMaxFlows !== null ? "override" : "plan",
        maxPhoneNumbers:
          sub.overrideMaxPhoneNumbers !== null ? "override" : "plan",
        includedCredits:
          sub.overrideIncludedCredits !== null ? "override" : "plan",
      },
      planName: plan.name,
      planDisplayName: plan.displayName,
    };
  }

  // Webhooks (Subscriptions)
  async getWebhook(id: string): Promise<Webhook | undefined> {
    const [webhook] = await db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.id, id));
    return webhook;
  }

  async getUserWebhooks(userId: string): Promise<Webhook[]> {
    return await db
      .select()
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, userId))
      .orderBy(desc(webhookSubscriptions.createdAt));
  }

  async getUserWebhookCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(webhookSubscriptions)
      .where(eq(webhookSubscriptions.userId, userId));
    return Number(result[0]?.count || 0);
  }

  async getWebhooksForEvent(
    userId: string,
    event: string,
    campaignId?: string,
  ): Promise<Webhook[]> {
    const allUserWebhooks = await db
      .select()
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.userId, userId),
          eq(webhookSubscriptions.isActive, true),
        ),
      );

    return allUserWebhooks.filter((webhook) => {
      if (!webhook.events.includes(event)) return false;
      if (campaignId && webhook.campaignIds && webhook.campaignIds.length > 0) {
        return webhook.campaignIds.includes(campaignId);
      }
      return true;
    });
  }

  async createWebhook(webhook: InsertWebhook): Promise<Webhook> {
    const [newWebhook] = await db
      .insert(webhookSubscriptions)
      .values({
        ...webhook,
        id: nanoid(),
      } as typeof webhookSubscriptions.$inferInsert)
      .returning();
    return newWebhook;
  }

  async updateWebhook(
    id: string,
    webhook: Partial<InsertWebhook>,
  ): Promise<void> {
    const updateData = {
      ...webhook,
      updatedAt: new Date(),
    } as typeof webhookSubscriptions.$inferInsert;
    await db
      .update(webhookSubscriptions)
      .set(updateData)
      .where(eq(webhookSubscriptions.id, id));
  }

  async deleteWebhook(id: string): Promise<void> {
    await db
      .delete(webhookSubscriptions)
      .where(eq(webhookSubscriptions.id, id));
  }

  // Webhook Delivery Logs
  async getWebhookLog(id: number): Promise<WebhookLog | undefined> {
    const [log] = await db
      .select()
      .from(webhookDeliveryLogs)
      .where(eq(webhookDeliveryLogs.id, id));
    return log;
  }

  async getWebhookLogs(
    webhookId: string,
    limit: number = 50,
  ): Promise<WebhookLog[]> {
    return await db
      .select()
      .from(webhookDeliveryLogs)
      .where(eq(webhookDeliveryLogs.webhookId, webhookId))
      .orderBy(desc(webhookDeliveryLogs.createdAt))
      .limit(limit);
  }

  async createWebhookLog(log: InsertWebhookLog): Promise<WebhookLog> {
    const [newLog] = await db
      .insert(webhookDeliveryLogs)
      .values(log)
      .returning();
    return newLog;
  }

  async updateWebhookLog(
    id: number,
    log: Partial<InsertWebhookLog>,
  ): Promise<void> {
    await db
      .update(webhookDeliveryLogs)
      .set(log)
      .where(eq(webhookDeliveryLogs.id, id));
  }

  async getFailedWebhookLogs(limit: number = 100): Promise<WebhookLog[]> {
    return await db
      .select()
      .from(webhookDeliveryLogs)
      .where(
        and(
          eq(webhookDeliveryLogs.success, false),
          isNotNull(webhookDeliveryLogs.nextRetryAt),
        ),
      )
      .orderBy(asc(webhookDeliveryLogs.nextRetryAt))
      .limit(limit);
  }

  // Notifications
  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));
    return notification;
  }

  async getUserNotifications(
    userId: string,
    limit = 50,
  ): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.isRead, false)),
      );
    return Number(result[0]?.count || 0);
  }

  async createNotification(
    notification: InsertNotification,
  ): Promise<Notification> {
    const [newNotification] = await db
      .insert(notifications)
      .values(notification)
      .returning();
    return newNotification;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async getBannerNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          or(
            eq(notifications.displayType, "banner"),
            eq(notifications.displayType, "both"),
          ),
          eq(notifications.isDismissed, false),
          or(
            isNull(notifications.expiresAt),
            gte(notifications.expiresAt, new Date()),
          ),
        ),
      )
      .orderBy(desc(notifications.priority), desc(notifications.createdAt));
  }

  async dismissNotification(id: string, userId?: string): Promise<void> {
    if (userId) {
      await db
        .update(notifications)
        .set({ isDismissed: true })
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    } else {
      await db
        .update(notifications)
        .set({ isDismissed: true })
        .where(eq(notifications.id, id));
    }
  }

  async deleteNotification(id: string): Promise<void> {
    await db.delete(notifications).where(eq(notifications.id, id));
  }

  // Email Templates
  async getEmailTemplates(): Promise<EmailTemplate[]> {
    return await db
      .select()
      .from(emailTemplates)
      .orderBy(emailTemplates.templateType);
  }

  async getEmailTemplate(
    templateType: string,
  ): Promise<EmailTemplate | undefined> {
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.templateType, templateType));
    return template;
  }

  async updateEmailTemplate(
    id: string,
    data: Partial<EmailTemplate>,
  ): Promise<void> {
    await db
      .update(emailTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id));
  }

  async createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const [template] = await db.insert(emailTemplates).values(data).returning();
    return template;
  }

  // Prompt Templates
  async getPromptTemplate(id: string): Promise<PromptTemplate | undefined> {
    const [template] = await db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.id, id));
    return template;
  }

  async getUserPromptTemplates(userId: string): Promise<PromptTemplate[]> {
    return await db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.userId, userId))
      .orderBy(desc(promptTemplates.createdAt));
  }

  async getSystemPromptTemplates(): Promise<PromptTemplate[]> {
    return await db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.isSystemTemplate, true))
      .orderBy(asc(promptTemplates.category), asc(promptTemplates.name));
  }

  async getPublicPromptTemplates(): Promise<PromptTemplate[]> {
    return await db
      .select()
      .from(promptTemplates)
      .where(eq(promptTemplates.isPublic, true))
      .orderBy(desc(promptTemplates.usageCount), asc(promptTemplates.name));
  }

  async createPromptTemplate(
    template: InsertPromptTemplate,
  ): Promise<PromptTemplate> {
    const [newTemplate] = await db
      .insert(promptTemplates)
      .values(template)
      .returning();
    return newTemplate;
  }

  async updatePromptTemplate(
    id: string,
    template: Partial<InsertPromptTemplate>,
  ): Promise<void> {
    await db
      .update(promptTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(promptTemplates.id, id));
  }

  async deletePromptTemplate(id: string): Promise<void> {
    await db.delete(promptTemplates).where(eq(promptTemplates.id, id));
  }

  async incrementPromptTemplateUsage(id: string): Promise<void> {
    await db
      .update(promptTemplates)
      .set({
        usageCount: sql`${promptTemplates.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(promptTemplates.id, id));
  }

  // SEO Settings
  async getSeoSettings(): Promise<SeoSettings | undefined> {
    const [settings] = await db.select().from(seoSettings).limit(1);
    return settings;
  }

  async updateSeoSettings(
    settings: Partial<InsertSeoSettings>,
  ): Promise<SeoSettings> {
    const existing = await this.getSeoSettings();

    if (existing) {
      const updateData = {
        ...settings,
        updatedAt: new Date(),
      } as typeof seoSettings.$inferInsert;
      const [updated] = await db
        .update(seoSettings)
        .set(updateData)
        .where(eq(seoSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(seoSettings)
        .values(settings as typeof seoSettings.$inferInsert)
        .returning();
      return created;
    }
  }

  // Analytics Scripts
  async getAnalyticsScript(id: string): Promise<AnalyticsScript | undefined> {
    const [script] = await db
      .select()
      .from(analyticsScripts)
      .where(eq(analyticsScripts.id, id));
    return script;
  }

  async getAllAnalyticsScripts(): Promise<AnalyticsScript[]> {
    return db
      .select()
      .from(analyticsScripts)
      .orderBy(
        desc(analyticsScripts.loadPriority),
        asc(analyticsScripts.createdAt),
      );
  }

  async getEnabledAnalyticsScripts(): Promise<AnalyticsScript[]> {
    return db
      .select()
      .from(analyticsScripts)
      .where(eq(analyticsScripts.enabled, true))
      .orderBy(
        desc(analyticsScripts.loadPriority),
        asc(analyticsScripts.createdAt),
      );
  }

  async createAnalyticsScript(
    script: InsertAnalyticsScript,
  ): Promise<AnalyticsScript> {
    const [created] = await db
      .insert(analyticsScripts)
      .values(script as typeof analyticsScripts.$inferInsert)
      .returning();
    return created;
  }

  async updateAnalyticsScript(
    id: string,
    script: Partial<InsertAnalyticsScript>,
  ): Promise<void> {
    const updateData: Partial<typeof analyticsScripts.$inferInsert> = {
      ...script,
      updatedAt: new Date(),
    };
    await db
      .update(analyticsScripts)
      .set(updateData)
      .where(eq(analyticsScripts.id, id));
  }

  async deleteAnalyticsScript(id: string): Promise<void> {
    await db.delete(analyticsScripts).where(eq(analyticsScripts.id, id));
  }

  // Payment Transactions
  async getPaymentTransaction(
    id: string,
  ): Promise<PaymentTransaction | undefined> {
    const [transaction] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, id));
    return transaction;
  }

  async getPaymentTransactionByGatewayId(
    gateway: string,
    gatewayTransactionId: string,
  ): Promise<PaymentTransaction | undefined> {
    const [transaction] = await db
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.gateway, gateway),
          eq(paymentTransactions.gatewayTransactionId, gatewayTransactionId),
        ),
      );
    return transaction;
  }

  async getUserPaymentTransactions(
    userId: string,
  ): Promise<PaymentTransaction[]> {
    return db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.userId, userId))
      .orderBy(desc(paymentTransactions.createdAt));
  }

  async getAllPaymentTransactions(filters?: {
    gateway?: string;
    type?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<PaymentTransaction[]> {
    const conditions = [];

    if (filters?.gateway) {
      conditions.push(eq(paymentTransactions.gateway, filters.gateway));
    }
    if (filters?.type) {
      conditions.push(eq(paymentTransactions.type, filters.type));
    }
    if (filters?.status) {
      conditions.push(eq(paymentTransactions.status, filters.status));
    }
    if (filters?.startDate) {
      conditions.push(gte(paymentTransactions.createdAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(paymentTransactions.createdAt, filters.endDate));
    }

    if (conditions.length > 0) {
      return db
        .select()
        .from(paymentTransactions)
        .where(and(...conditions))
        .orderBy(desc(paymentTransactions.createdAt));
    }

    return db
      .select()
      .from(paymentTransactions)
      .orderBy(desc(paymentTransactions.createdAt));
  }

  async createPaymentTransaction(
    transaction: InsertPaymentTransaction,
  ): Promise<PaymentTransaction> {
    const [created] = await db
      .insert(paymentTransactions)
      .values(transaction)
      .returning();
    return created;
  }

  async updatePaymentTransaction(
    id: string,
    transaction: Partial<InsertPaymentTransaction>,
  ): Promise<void> {
    await db
      .update(paymentTransactions)
      .set({ ...transaction, updatedAt: new Date() })
      .where(eq(paymentTransactions.id, id));
  }

  async getPaymentAnalytics(
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    totalRevenue: number;
    revenueByGateway: Record<string, number>;
    revenueByType: Record<string, number>;
    transactionCount: number;
    transactionsByStatus: Record<string, number>;
    refundCount: number;
    totalRefunded: number;
  }> {
    // Include completed, refunded, and partially_refunded transactions for revenue
    // These all represent successful payments that were collected
    const revenueStatuses = ["completed", "refunded", "partially_refunded"];
    const conditions: any[] = [];
    if (startDate)
      conditions.push(gte(paymentTransactions.createdAt, startDate));
    if (endDate) conditions.push(lte(paymentTransactions.createdAt, endDate));

    const transactions = await db
      .select()
      .from(paymentTransactions)
      .where(
        conditions.length > 0
          ? and(
              inArray(paymentTransactions.status, revenueStatuses),
              ...conditions,
            )
          : inArray(paymentTransactions.status, revenueStatuses),
      );

    // Get all transactions within date range (ignoring status filter for counts)
    const dateConditions: any[] = [];
    if (startDate)
      dateConditions.push(gte(paymentTransactions.createdAt, startDate));
    if (endDate)
      dateConditions.push(lte(paymentTransactions.createdAt, endDate));

    const allTransactions = await db
      .select()
      .from(paymentTransactions)
      .where(dateConditions.length > 0 ? and(...dateConditions) : undefined);

    // Get refund data within date range
    const refundConditions: any[] = [];
    if (startDate) refundConditions.push(gte(refunds.createdAt, startDate));
    if (endDate) refundConditions.push(lte(refunds.createdAt, endDate));

    const allRefunds = await db
      .select()
      .from(refunds)
      .where(
        refundConditions.length > 0 ? and(...refundConditions) : undefined,
      );

    let totalRevenue = 0;
    const revenueByGateway: Record<string, number> = {};
    const revenueByType: Record<string, number> = {};
    const transactionsByStatus: Record<string, number> = {};

    for (const tx of transactions) {
      const amount = parseFloat(tx.amount || "0");
      totalRevenue += amount;
      revenueByGateway[tx.gateway] =
        (revenueByGateway[tx.gateway] || 0) + amount;
      revenueByType[tx.type] = (revenueByType[tx.type] || 0) + amount;
    }

    for (const tx of allTransactions) {
      transactionsByStatus[tx.status] =
        (transactionsByStatus[tx.status] || 0) + 1;
    }

    // Calculate refund totals
    let totalRefunded = 0;
    for (const refund of allRefunds) {
      totalRefunded += parseFloat(refund.amount || "0");
    }

    return {
      totalRevenue,
      revenueByGateway,
      revenueByType,
      transactionCount: allTransactions.length,
      transactionsByStatus,
      refundCount: allRefunds.length,
      totalRefunded,
    };
  }

  // Refunds
  async getRefund(id: string): Promise<Refund | undefined> {
    const [refund] = await db.select().from(refunds).where(eq(refunds.id, id));
    return refund;
  }

  async getTransactionRefunds(transactionId: string): Promise<Refund[]> {
    return db
      .select()
      .from(refunds)
      .where(eq(refunds.transactionId, transactionId))
      .orderBy(desc(refunds.createdAt));
  }

  async getUserRefunds(userId: string): Promise<Refund[]> {
    return db
      .select()
      .from(refunds)
      .where(eq(refunds.userId, userId))
      .orderBy(desc(refunds.createdAt));
  }

  async getAllRefunds(): Promise<Refund[]> {
    return db.select().from(refunds).orderBy(desc(refunds.createdAt));
  }

  async createRefund(refund: InsertRefund): Promise<Refund> {
    const [created] = await db.insert(refunds).values(refund).returning();
    return created;
  }

  async updateRefund(id: string, refund: Partial<InsertRefund>): Promise<void> {
    await db
      .update(refunds)
      .set({ ...refund, updatedAt: new Date() })
      .where(eq(refunds.id, id));
  }

  // Invoices
  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id));
    return invoice;
  }

  async getInvoiceByNumber(
    invoiceNumber: string,
  ): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.invoiceNumber, invoiceNumber));
    return invoice;
  }

  async getTransactionInvoice(
    transactionId: string,
  ): Promise<Invoice | undefined> {
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.transactionId, transactionId));
    return invoice;
  }

  async getUserInvoices(userId: string): Promise<Invoice[]> {
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.userId, userId))
      .orderBy(desc(invoices.createdAt));
  }

  async getAllInvoices(): Promise<Invoice[]> {
    return db.select().from(invoices).orderBy(desc(invoices.createdAt));
  }

  async createInvoice(invoice: InsertInvoice): Promise<Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async updateInvoice(
    id: string,
    invoice: Partial<InsertInvoice>,
  ): Promise<void> {
    await db
      .update(invoices)
      .set({ ...invoice, updatedAt: new Date() })
      .where(eq(invoices.id, id));
  }

  async getNextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();

    // Get configurable prefix from global_settings (default: INV)
    const [prefixSetting] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "invoice_prefix"));
    let rawPrefix = prefixSetting?.value
      ? String(prefixSetting.value).replace(/"/g, "")
      : "INV";
    // Sanitize prefix: only allow alphanumeric and underscore, max 10 chars
    const prefix =
      rawPrefix.replace(/[^A-Za-z0-9_]/g, "").substring(0, 10) || "INV";

    // Get configurable starting number from global_settings (default: 1)
    const [startSetting] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "invoice_start_number"));
    const startNumber = startSetting?.value
      ? parseInt(String(startSetting.value).replace(/"/g, ""), 10) || 1
      : 1;

    // Find the maximum invoice number for this prefix and year
    // Extract the numeric suffix and find the max to avoid ordering issues
    const likePattern = `${prefix}-${year}-%`;
    const result = await db.execute(sql`
      SELECT MAX(CAST(SPLIT_PART(${invoices.invoiceNumber}, '-', 3) AS INTEGER)) as max_num
      FROM ${invoices}
      WHERE ${invoices.invoiceNumber} LIKE ${likePattern}
    `);

    // Start with configured starting number
    let nextNum = startNumber;
    const maxNum = result.rows?.[0]?.max_num;
    if (maxNum !== null && maxNum !== undefined && !isNaN(Number(maxNum))) {
      // Use the higher of (maxNum + 1) or startNumber to respect configured minimum
      nextNum = Math.max(Number(maxNum) + 1, startNumber);
    }

    return `${prefix}-${year}-${String(nextNum).padStart(5, "0")}`;
  }

  async getNextRefundNoteNumber(): Promise<string> {
    // Get configurable prefix from global_settings (default: RF for Refund)
    const [prefixSetting] = await db
      .select()
      .from(globalSettings)
      .where(eq(globalSettings.key, "refund_note_prefix"));
    let rawPrefix = prefixSetting?.value
      ? String(prefixSetting.value).replace(/"/g, "")
      : "RF";
    const prefix =
      rawPrefix.replace(/[^A-Za-z0-9]/g, "").substring(0, 10) || "RF";

    // Find the maximum refund note number with simple format (RF01, RF02, etc.)
    // Extract numeric suffix from refund_note_number like 'RF01', 'RF02', etc.
    const result = await db.execute(sql`
      SELECT MAX(
        CAST(
          REGEXP_REPLACE(refund_note_number, '^[A-Za-z]+', '', 'g') 
          AS INTEGER
        )
      ) as max_num
      FROM refunds
      WHERE refund_note_number ~ ${`^${prefix}[0-9]+$`}
    `);

    let nextNum = 1;
    const maxNum = result.rows?.[0]?.max_num;
    if (maxNum !== null && maxNum !== undefined && !isNaN(Number(maxNum))) {
      nextNum = Number(maxNum) + 1;
    }

    // Simple format: RF01, RF02, RF03...
    return `${prefix}${String(nextNum).padStart(2, "0")}`;
  }

  // Payment Webhook Queue
  async getWebhookQueueItem(
    id: string,
  ): Promise<PaymentWebhookQueue | undefined> {
    const [item] = await db
      .select()
      .from(paymentWebhookQueue)
      .where(eq(paymentWebhookQueue.id, id));
    return item;
  }

  async getPendingWebhooks(): Promise<PaymentWebhookQueue[]> {
    return db
      .select()
      .from(paymentWebhookQueue)
      .where(eq(paymentWebhookQueue.status, "pending"))
      .orderBy(asc(paymentWebhookQueue.receivedAt));
  }

  async getWebhookByEventId(
    gateway: string,
    eventId: string,
  ): Promise<PaymentWebhookQueue | undefined> {
    const [item] = await db
      .select()
      .from(paymentWebhookQueue)
      .where(
        and(
          eq(paymentWebhookQueue.gateway, gateway),
          eq(paymentWebhookQueue.eventId, eventId),
        ),
      );
    return item;
  }

  async createWebhookQueueItem(
    item: InsertPaymentWebhookQueue,
  ): Promise<PaymentWebhookQueue> {
    const [created] = await db
      .insert(paymentWebhookQueue)
      .values(item)
      .returning();
    return created;
  }

  async updateWebhookQueueItem(
    id: string,
    item: Partial<InsertPaymentWebhookQueue>,
  ): Promise<void> {
    await db
      .update(paymentWebhookQueue)
      .set(item)
      .where(eq(paymentWebhookQueue.id, id));
  }

  async getExpiredWebhooks(): Promise<PaymentWebhookQueue[]> {
    const now = new Date();
    return db
      .select()
      .from(paymentWebhookQueue)
      .where(
        and(
          eq(paymentWebhookQueue.status, "pending"),
          lte(paymentWebhookQueue.expiresAt, now),
        ),
      );
  }

  async getRetryableWebhooks(): Promise<PaymentWebhookQueue[]> {
    const now = new Date();
    return db
      .select()
      .from(paymentWebhookQueue)
      .where(
        and(
          or(
            eq(paymentWebhookQueue.status, "pending"),
            eq(paymentWebhookQueue.status, "failed"),
          ),
          sql`${paymentWebhookQueue.attemptCount} < ${paymentWebhookQueue.maxAttempts}`,
          or(
            isNull(paymentWebhookQueue.nextRetryAt),
            lte(paymentWebhookQueue.nextRetryAt, now),
          ),
          gte(paymentWebhookQueue.expiresAt, now),
        ),
      )
      .orderBy(asc(paymentWebhookQueue.receivedAt));
  }

  // Email Notification Settings
  async getEmailNotificationSetting(
    eventType: string,
  ): Promise<EmailNotificationSettings | undefined> {
    const [setting] = await db
      .select()
      .from(emailNotificationSettings)
      .where(eq(emailNotificationSettings.eventType, eventType));
    return setting;
  }

  async getAllEmailNotificationSettings(): Promise<
    EmailNotificationSettings[]
  > {
    return db
      .select()
      .from(emailNotificationSettings)
      .orderBy(
        asc(emailNotificationSettings.category),
        asc(emailNotificationSettings.eventType),
      );
  }

  async getEmailNotificationSettingsByCategory(
    category: string,
  ): Promise<EmailNotificationSettings[]> {
    return db
      .select()
      .from(emailNotificationSettings)
      .where(eq(emailNotificationSettings.category, category))
      .orderBy(asc(emailNotificationSettings.eventType));
  }

  async createEmailNotificationSetting(
    setting: InsertEmailNotificationSettings,
  ): Promise<EmailNotificationSettings> {
    const [created] = await db
      .insert(emailNotificationSettings)
      .values(setting)
      .returning();
    return created;
  }

  async updateEmailNotificationSetting(
    eventType: string,
    setting: Partial<InsertEmailNotificationSettings>,
  ): Promise<void> {
    await db
      .update(emailNotificationSettings)
      .set({ ...setting, updatedAt: new Date() })
      .where(eq(emailNotificationSettings.eventType, eventType));
  }

  async getUserById(id: string): Promise<User | undefined> {
    return this.getUser(id);
  }

}

export const storage = new DbStorage();
