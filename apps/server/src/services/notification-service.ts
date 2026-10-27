"use strict";
import { storage } from "../storage";

// Default fallbacks - only used if database is unavailable
const DEFAULT_LOW_CREDITS_THRESHOLD = 50;
const DEFAULT_APP_NAME = "Wtrops.ai";

// Cache for low credits threshold to avoid repeated DB calls
let cachedLowCreditsThreshold: number | null = null;
let thresholdCacheTime: number = 0;
const THRESHOLD_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for app name
let cachedAppName: string | null = null;
let appNameCacheTime: number = 0;

async function getLowCreditsThreshold(): Promise<number> {
  const now = Date.now();
  if (
    cachedLowCreditsThreshold !== null &&
    now - thresholdCacheTime < THRESHOLD_CACHE_TTL
  ) {
    return cachedLowCreditsThreshold;
  }

  try {
    const setting = await storage.getGlobalSetting("low_credits_threshold");
    const threshold =
      typeof setting?.value === "number"
        ? setting.value
        : DEFAULT_LOW_CREDITS_THRESHOLD;
    cachedLowCreditsThreshold = threshold;
    thresholdCacheTime = now;
    return threshold;
  } catch (error) {
    console.error(
      "[NotificationService] Failed to fetch low_credits_threshold, using default:",
      error,
    );
    return DEFAULT_LOW_CREDITS_THRESHOLD;
  }
}

async function getAppName(): Promise<string> {
  const now = Date.now();
  if (cachedAppName !== null && now - appNameCacheTime < THRESHOLD_CACHE_TTL) {
    return cachedAppName;
  }

  try {
    const setting = await storage.getGlobalSetting("app_name");
    const appName =
      typeof setting?.value === "string" ? setting.value : DEFAULT_APP_NAME;
    cachedAppName = appName;
    appNameCacheTime = now;
    return appName;
  } catch (error) {
    console.error(
      "[NotificationService] Failed to fetch app_name, using default:",
      error,
    );
    return DEFAULT_APP_NAME;
  }
}

export interface NotificationOptions {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  icon?: string;
  displayType?: "bell" | "banner" | "both";
  priority?: number;
  dismissible?: boolean;
  expiresAt?: Date | null;
}

export const NotificationService = {
  async create(options: NotificationOptions) {
    try {
      await storage.createNotification({
        userId: options.userId,
        type: options.type,
        title: options.title,
        message: options.message,
        link: options.link || null,
        icon: options.icon || null,
        displayType: options.displayType || "bell",
        priority: options.priority ?? 0,
        dismissible: options.dismissible ?? true,
        expiresAt: options.expiresAt || null,
      });
    } catch (error) {
      console.error("Failed to create notification:", error);
    }
  },

  async notifyLowCredits(userId: string, currentCredits: number) {
    await this.create({
      userId,
      type: "low_credits",
      title: "Low Credits Warning",
      message: `Your credit balance is low (${currentCredits} credits remaining). Purchase more credits to continue using phone numbers and making calls.`,
      link: "/app/billing",
    });
  },

  async notifyMembershipUpgraded(userId: string, planName: string) {
    await this.create({
      userId,
      type: "membership_upgraded",
      title: "Welcome to Pro",
      message: `Your membership has been upgraded to ${planName}. You now have unlimited agents, campaigns, and contacts!`,
      link: "/app/billing",
    });
  },

  async notifyMembershipCancelled(userId: string) {
    await this.create({
      userId,
      type: "membership_expiry",
      title: "Membership Cancelled",
      message:
        "Your Pro membership has been cancelled. You'll continue to have Pro access until the end of your billing period.",
      link: "/app/billing",
    });
  },

  async notifyCampaignCompleted(
    userId: string,
    campaignId: string,
    campaignName: string,
    callCount: number,
  ) {
    await this.create({
      userId,
      type: "campaign_completed",
      title: "Campaign Completed",
      message: `Campaign "${campaignName}" has completed with ${callCount} calls made.`,
      link: `/app/campaigns/${campaignId}`,
    });
  },

  async notifyCampaignFailed(
    userId: string,
    campaignId: string,
    campaignName: string,
    error: string,
  ) {
    await this.create({
      userId,
      type: "campaign_failed",
      title: "Campaign Failed",
      message: `Campaign "${campaignName}" failed: ${error}`,
      link: `/app/campaigns/${campaignId}`,
    });
  },

  async notifyCampaignPaused(
    userId: string,
    campaignId: string,
    campaignName: string,
    reason: string,
  ) {
    await this.create({
      userId,
      type: "campaign_paused",
      title: "Campaign Paused",
      message: `Campaign "${campaignName}" has been paused: ${reason}`,
      link: `/app/campaigns/${campaignId}`,
    });
  },

  async notifyPhoneBillingSuccess(
    userId: string,
    phoneNumber: string,
    creditsCharged: number,
  ) {
    await this.create({
      userId,
      type: "phone_billing_success",
      title: "Phone Number Renewed",
      message: `Phone number ${phoneNumber} has been renewed for ${creditsCharged} credits.`,
      link: "/app/phone-numbers",
    });
  },

  async notifyPhoneBillingFailed(
    userId: string,
    phoneNumber: string,
    reason: string,
  ) {
    await this.create({
      userId,
      type: "phone_billing_failed",
      title: "Phone Number Billing Failed",
      message: `Phone number ${phoneNumber} billing failed: ${reason}. The number has been released.`,
      link: "/app/phone-numbers",
    });
  },

  async notifyPhoneReleased(userId: string, phoneNumber: string) {
    await this.create({
      userId,
      type: "phone_released",
      title: "Phone Number Released",
      message: `Phone number ${phoneNumber} has been released due to insufficient credits.`,
      link: "/app/phone-numbers",
    });
  },

  async notifyWelcome(userId: string, userName: string) {
    const appName = await getAppName();
    await this.create({
      userId,
      type: "welcome",
      title: `Welcome to ${appName}, ${userName}`,
      message:
        "Get started by creating your first AI agent and launching a campaign. Check out our knowledge base for tips and best practices.",
      link: "/app/agents",
    });
  },

  async createNotificationForAllAdmins(
    options: Omit<NotificationOptions, "userId">,
  ) {
    try {
      // Get all admin users
      const adminUsers = await storage.getAllAdminUsers();

      // Create a notification for each admin
      for (const admin of adminUsers) {
        await this.create({
          ...options,
          userId: admin.id,
        });
      }
    } catch (error) {
      console.error("Failed to create admin notifications:", error);
    }
  },

  async notifyAdmins(
    title: string,
    message: string,
    severity: "info" | "warning" | "critical" = "info",
  ) {
    const icon =
      severity === "critical"
        ? "alert-triangle"
        : severity === "warning"
          ? "alert-circle"
          : "info";
    await this.createNotificationForAllAdmins({
      type: `admin_${severity}`,
      title,
      message,
      icon,
      priority: severity === "critical" ? 100 : severity === "warning" ? 50 : 0,
      displayType: severity === "critical" ? "both" : "bell",
    });
  },

  async notifyPaymentFailed(userId: string) {
    await this.create({
      userId,
      type: "payment_failed",
      title: "Payment Failed",
      message:
        "Your subscription payment failed. Please update your payment method to maintain your Pro membership.",
      link: "/app/billing",
      icon: "credit-card",
      priority: 80,
      displayType: "both",
    });
  },

  async notifySubscriptionPastDue(userId: string) {
    await this.create({
      userId,
      type: "subscription_past_due",
      title: "Payment Overdue",
      message:
        "Your subscription is past due. Please update your payment method to avoid losing access to Pro features.",
      link: "/app/billing",
      icon: "alert-triangle",
      priority: 90,
      displayType: "both",
    });
  },

  async shouldNotifyLowCredits(currentCredits: number): Promise<boolean> {
    const threshold = await getLowCreditsThreshold();
    return currentCredits > 0 && currentCredits <= threshold;
  },

  // Utility to get current threshold (for email service, etc.)
  async getLowCreditsThreshold(): Promise<number> {
    return getLowCreditsThreshold();
  },
};
