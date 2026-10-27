"use strict";

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { storage } from "../storage";
import { logger } from "../utils/logger";
import type { EmailTemplate } from "@wtrops/shared";

const SOURCE = "EmailService";
const DEFAULT_COMPANY_NAME = "Wtrops.ai";
const DEFAULT_TAGLINE = "AI-Powered Bulk Calling Platform";

interface BrandingSettings {
  appName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  baseUrl: string;
  dashboardUrl: string;
  loginUrl: string;
  billingUrl: string;
  supportUrl: string;
  privacyUrl: string;
  termsUrl: string;
  fromEmail: string;
  fromName: string;
}

async function getBrandingSettings(): Promise<BrandingSettings> {
  try {
    const [
      appNameSetting,
      taglineSetting,
      logoSetting,
      faviconSetting,
      fromEmailSetting,
      fromNameSetting,
    ] = await Promise.all([
      storage.getGlobalSetting("app_name"),
      storage.getGlobalSetting("app_tagline"),
      storage.getGlobalSetting("logo_url"),
      storage.getGlobalSetting("favicon_url"),
      storage.getGlobalSetting("smtp_from_email"),
      storage.getGlobalSetting("smtp_from_name"),
    ]);

    const baseUrl = process.env.APP_URL || "";
    const appName = (appNameSetting?.value as string) || DEFAULT_COMPANY_NAME;

    return {
      appName,
      tagline: (taglineSetting?.value as string) || DEFAULT_TAGLINE,
      logoUrl: (logoSetting?.value as string) || null,
      faviconUrl: (faviconSetting?.value as string) || null,
      baseUrl,
      dashboardUrl: baseUrl ? `${baseUrl}/app` : "/app",
      loginUrl: baseUrl ? `${baseUrl}/auth` : "/auth",
      billingUrl: baseUrl ? `${baseUrl}/billing` : "/billing",
      supportUrl: baseUrl ? `${baseUrl}/contact` : "/contact",
      privacyUrl: baseUrl ? `${baseUrl}/privacy` : "/privacy",
      termsUrl: baseUrl ? `${baseUrl}/terms` : "/terms",
      fromEmail:
        (fromEmailSetting?.value as string) ||
        process.env.SMTP_FROM_EMAIL ||
        "",
      fromName: (fromNameSetting?.value as string) || appName,
    };
  } catch (error) {
    logger.error("Failed to fetch branding settings", error, SOURCE);
    const baseUrl = process.env.APP_URL || "";
    return {
      appName: DEFAULT_COMPANY_NAME,
      tagline: DEFAULT_TAGLINE,
      logoUrl: null,
      faviconUrl: null,
      baseUrl,
      dashboardUrl: baseUrl ? `${baseUrl}/app` : "/app",
      loginUrl: baseUrl ? `${baseUrl}/auth` : "/auth",
      billingUrl: baseUrl ? `${baseUrl}/billing` : "/billing",
      supportUrl: baseUrl ? `${baseUrl}/contact` : "/contact",
      privacyUrl: baseUrl ? `${baseUrl}/privacy` : "/privacy",
      termsUrl: baseUrl ? `${baseUrl}/terms` : "/terms",
      fromEmail: process.env.SMTP_FROM_EMAIL || "",
      fromName: DEFAULT_COMPANY_NAME,
    };
  }
}

interface EmailAttachment {
  filename: string;
  content: Buffer | string;
}

interface PurchaseConfirmationData {
  userName: string;
  amount: string;
  currency: string;
  description: string;
  invoiceNumber: string;
  transactionId: string;
}

interface SubscriptionRenewalReminderData {
  userName: string;
  planName: string;
  renewalDate: string;
  amount: string;
}

interface PaymentFailedData {
  userName: string;
  amount: string;
  reason: string;
}

interface LowCreditsData {
  userName: string;
  currentCredits: number;
  threshold: number;
}

interface CampaignCompletedData {
  userName: string;
  campaignName: string;
  callsCompleted: number;
  callsSuccessful: number;
}

interface AccountSuspendedData {
  userName: string;
  reason: string;
}

interface AccountReactivatedData {
  userName: string;
  dashboardUrl: string;
}

interface MembershipUpgradeData {
  userName: string;
  newPlanName: string;
  features: string[];
}

const NOTIFICATION_TYPE_MAP: Record<string, string> = {
  welcome: "welcomeEmail",
  purchase_confirmation: "purchaseConfirmation",
  low_credits: "lowCredits",
  campaign_completed: "campaignCompleted",
  renewal_reminder: "renewalReminder",
  payment_failed: "paymentFailed",
  account_suspended: "accountSuspended",
  account_reactivated: "accountReactivated",
  membership_upgrade: "membershipUpgrade",
  kyc_approved: "kycApproved",
  kyc_rejected: "kycRejected",
};

function getBaseEmailStyles(): string {
  return `
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background-color: #f3f4f6;
      margin: 0;
      padding: 0;
    }
    .email-wrapper {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .email-container {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    .email-header {
      background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
      padding: 32px;
      text-align: center;
    }
    .email-logo {
      font-size: 28px;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .email-tagline {
      color: #94a3b8;
      font-size: 14px;
      margin: 8px 0 0 0;
    }
    .email-body {
      padding: 40px 32px;
    }
    .email-title {
      font-size: 24px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 16px 0;
    }
    .email-text {
      font-size: 16px;
      color: #4b5563;
      margin: 0 0 24px 0;
    }
    .email-highlight-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 24px;
      margin: 24px 0;
    }
    .email-metric {
      text-align: center;
      padding: 16px;
    }
    .email-metric-value {
      font-size: 36px;
      font-weight: 700;
      color: #1e293b;
      margin: 0;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
    }
    .email-metric-label {
      font-size: 14px;
      color: #64748b;
      margin: 4px 0 0 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .email-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
    }
    .email-table td {
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
      font-size: 15px;
    }
    .email-table td:first-child {
      color: #6b7280;
    }
    .email-table td:last-child {
      text-align: right;
      font-weight: 500;
      color: #1f2937;
    }
    .email-table tr:last-child td {
      border-bottom: none;
      font-weight: 600;
    }
    .email-button {
      display: inline-block;
      background: #1e293b;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 15px;
      margin: 24px 0;
    }
    .email-button-secondary {
      background: #f1f5f9;
      color: #1e293b !important;
    }
    .email-alert {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 24px 0;
      border-radius: 0 8px 8px 0;
    }
    .email-alert-error {
      background: #fee2e2;
      border-left-color: #ef4444;
    }
    .email-alert-success {
      background: #dcfce7;
      border-left-color: #22c55e;
    }
    .email-alert-info {
      background: #dbeafe;
      border-left-color: #3b82f6;
    }
    .email-footer {
      background: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .email-footer-text {
      font-size: 13px;
      color: #9ca3af;
      margin: 0 0 12px 0;
    }
    .email-footer-links a {
      color: #6b7280;
      text-decoration: none;
      margin: 0 8px;
      font-size: 13px;
    }
    .email-footer-links a:hover {
      color: #1f2937;
    }
    .email-divider {
      border: 0;
      height: 1px;
      background: #e5e7eb;
      margin: 24px 0;
    }
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 20px 12px;
      }
      .email-body {
        padding: 28px 20px;
      }
      .email-header {
        padding: 24px 20px;
      }
      .email-title {
        font-size: 20px;
      }
    }
  `;
}

function wrapEmailTemplate(
  branding: BrandingSettings,
  content: string,
): string {
  const logoHtml = branding.logoUrl
    ? `<img src="${branding.logoUrl}" alt="${branding.appName}" style="max-height: 48px; max-width: 200px; margin-bottom: 12px;" />`
    : `<h1 class="email-logo">${branding.appName}</h1>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${branding.appName}</title>
  ${branding.faviconUrl ? `<link rel="icon" href="${branding.faviconUrl}" type="image/x-icon">` : ""}
  <style>${getBaseEmailStyles()}</style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        ${logoHtml}
        <p class="email-tagline">${branding.tagline}</p>
      </div>
      ${content}
      <div class="email-footer">
        <p class="email-footer-text">
          &copy; ${new Date().getFullYear()} ${branding.appName}. All rights reserved.
        </p>
        <p class="email-footer-text" style="margin-top: 8px;">
          This is a transactional email sent from ${branding.appName}.
        </p>
        <p class="email-footer-links" style="margin-top: 16px;">
          <a href="${branding.privacyUrl}">Privacy Policy</a> |
          <a href="${branding.termsUrl}">Terms of Service</a> |
          <a href="${branding.supportUrl}">Contact Support</a>
        </p>
        ${branding.baseUrl ? `<p class="email-footer-text" style="margin-top: 12px; font-size: 11px;">${branding.baseUrl}</p>` : ""}
      </div>
    </div>
  </div>
</body>
</html>
`;
}

export function welcomeEmail(
  userName: string,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Welcome to ${branding.appName}!</h2>
      <p class="email-text">
        Hi ${userName},
      </p>
      <p class="email-text">
        Thank you for joining ${branding.appName}! We're excited to have you on board. Our AI-powered bulk calling platform is designed to help you automate your outreach and engage with your contacts more effectively.
      </p>
      <div class="email-highlight-box">
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #1e293b;">Here's what you can do with ${branding.appName}:</p>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          <li style="margin-bottom: 8px;">Create AI-powered voice agents for automated calling</li>
          <li style="margin-bottom: 8px;">Launch bulk calling campaigns with intelligent scheduling</li>
          <li style="margin-bottom: 8px;">Track call analytics and performance metrics</li>
          <li style="margin-bottom: 8px;">Integrate with your existing workflows</li>
        </ul>
      </div>
      <p class="email-text">
        Ready to get started? Log in to your dashboard and create your first AI agent.
      </p>
      <a href="${branding.dashboardUrl}" class="email-button">Go to Dashboard</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280;">
        If you have any questions, our support team is here to help.
      </p>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function purchaseConfirmationEmail(
  data: PurchaseConfirmationData,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Payment Confirmed</h2>
      <p class="email-text">
        Hi ${data.userName},
      </p>
      <p class="email-text">
        Thank you for your purchase! Your payment has been successfully processed.
      </p>
      <div class="email-highlight-box">
        <table class="email-table">
          <tr>
            <td>Description</td>
            <td>${data.description}</td>
          </tr>
          <tr>
            <td>Invoice Number</td>
            <td style="font-family: monospace;">${data.invoiceNumber}</td>
          </tr>
          <tr>
            <td>Transaction ID</td>
            <td style="font-family: monospace; font-size: 13px;">${data.transactionId}</td>
          </tr>
          <tr>
            <td>Amount Paid</td>
            <td>${data.currency} ${data.amount}</td>
          </tr>
        </table>
      </div>
      <div class="email-alert email-alert-success">
        <strong>Your payment was successful!</strong> Your credits or subscription have been added to your account.
      </div>
      <p class="email-text">
        You can view your transaction history and download invoices from your billing dashboard.
      </p>
      <a href="${branding.billingUrl}" class="email-button">View Transaction History</a>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function subscriptionRenewalReminderEmail(
  data: SubscriptionRenewalReminderData,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Subscription Renewal Reminder</h2>
      <p class="email-text">
        Hi ${data.userName},
      </p>
      <p class="email-text">
        This is a friendly reminder that your ${data.planName} subscription will renew soon.
      </p>
      <div class="email-highlight-box">
        <table class="email-table">
          <tr>
            <td>Plan</td>
            <td>${data.planName}</td>
          </tr>
          <tr>
            <td>Renewal Date</td>
            <td>${data.renewalDate}</td>
          </tr>
          <tr>
            <td>Amount</td>
            <td>${data.amount}</td>
          </tr>
        </table>
      </div>
      <div class="email-alert email-alert-info">
        <strong>No action required.</strong> Your subscription will automatically renew on the date shown above.
      </div>
      <p class="email-text">
        If you'd like to make changes to your subscription or update your payment method, please visit your billing settings.
      </p>
      <a href="${branding.billingUrl}" class="email-button">Manage Subscription</a>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function paymentFailedEmail(
  data: PaymentFailedData,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Payment Failed</h2>
      <p class="email-text">
        Hi ${data.userName},
      </p>
      <p class="email-text">
        We were unable to process your payment. Please update your payment method to continue using ${branding.appName}.
      </p>
      <div class="email-alert email-alert-error">
        <strong>Payment declined:</strong> ${data.reason}
      </div>
      <div class="email-highlight-box">
        <div class="email-metric">
          <p class="email-metric-value">${data.amount}</p>
          <p class="email-metric-label">Amount Due</p>
        </div>
      </div>
      <p class="email-text">
        Please update your payment method as soon as possible to avoid any service interruptions.
      </p>
      <a href="${branding.billingUrl}" class="email-button">Update Payment Method</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        If you believe this is an error or need assistance, please contact our support team.
      </p>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function lowCreditsEmail(
  data: LowCreditsData,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Low Credits Alert</h2>
      <p class="email-text">
        Hi ${data.userName},
      </p>
      <p class="email-text">
        Your account credits are running low. To ensure uninterrupted service, consider purchasing more credits.
      </p>
      <div class="email-highlight-box">
        <div class="email-metric">
          <p class="email-metric-value">${data.currentCredits.toLocaleString()}</p>
          <p class="email-metric-label">Credits Remaining</p>
        </div>
      </div>
      <div class="email-alert">
        <strong>Warning:</strong> Your credit balance is below ${data.threshold.toLocaleString()} credits. Your campaigns may be paused if you run out of credits.
      </div>
      <p class="email-text">
        Top up your credits now to keep your campaigns running smoothly.
      </p>
      <a href="${branding.billingUrl}" class="email-button">Purchase Credits</a>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function campaignCompletedEmail(
  data: CampaignCompletedData & { campaignId?: string },
  branding: BrandingSettings,
): string {
  const successRate =
    data.callsCompleted > 0
      ? Math.round((data.callsSuccessful / data.callsCompleted) * 100)
      : 0;
  const campaignUrl = data.campaignId
    ? `${branding.baseUrl}/campaigns/${data.campaignId}`
    : branding.dashboardUrl;

  const content = `
    <div class="email-body">
      <h2 class="email-title">Campaign Completed</h2>
      <p class="email-text">
        Hi ${data.userName},
      </p>
      <p class="email-text">
        Great news! Your campaign "<strong>${data.campaignName}</strong>" has finished running.
      </p>
      <div class="email-highlight-box">
        <table style="width: 100%; text-align: center;">
          <tr>
            <td style="padding: 16px;">
              <p class="email-metric-value">${data.callsCompleted.toLocaleString()}</p>
              <p class="email-metric-label">Calls Completed</p>
            </td>
            <td style="padding: 16px;">
              <p class="email-metric-value">${data.callsSuccessful.toLocaleString()}</p>
              <p class="email-metric-label">Successful Calls</p>
            </td>
            <td style="padding: 16px;">
              <p class="email-metric-value">${successRate}%</p>
              <p class="email-metric-label">Success Rate</p>
            </td>
          </tr>
        </table>
      </div>
      <div class="email-alert email-alert-success">
        <strong>Campaign completed successfully!</strong> View detailed analytics and transcripts in your dashboard.
      </div>
      <a href="${campaignUrl}" class="email-button">View Campaign Results</a>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function accountSuspendedEmail(
  data: AccountSuspendedData,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Account Suspended</h2>
      <p class="email-text">
        Hi ${data.userName},
      </p>
      <p class="email-text">
        Your ${branding.appName} account has been suspended.
      </p>
      <div class="email-alert email-alert-error">
        <strong>Reason for suspension:</strong> ${data.reason}
      </div>
      <p class="email-text">
        While your account is suspended, you will not be able to:
      </p>
      <ul style="color: #4b5563; margin: 0 0 24px 0; padding-left: 20px;">
        <li style="margin-bottom: 8px;">Run or create new campaigns</li>
        <li style="margin-bottom: 8px;">Make outbound calls</li>
        <li style="margin-bottom: 8px;">Access certain features</li>
      </ul>
      <p class="email-text">
        If you believe this suspension is in error, or if you would like to resolve the issue, please contact our support team immediately.
      </p>
      <a href="${branding.supportUrl}" class="email-button">Contact Support</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        Please respond to this notice within 7 days to avoid permanent account termination.
      </p>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function accountReactivatedEmail(
  data: AccountReactivatedData,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Account Reactivated</h2>
      <p class="email-text">
        Hi ${data.userName},
      </p>
      <p class="email-text">
        Great news! Your ${branding.appName} account has been reactivated.
      </p>
      <div class="email-alert email-alert-success">
        <strong>Your account is now active!</strong> You have full access to all features.
      </div>
      <p class="email-text">
        You can now:
      </p>
      <ul style="color: #4b5563; margin: 0 0 24px 0; padding-left: 20px;">
        <li style="margin-bottom: 8px;">Run and create new campaigns</li>
        <li style="margin-bottom: 8px;">Make outbound calls</li>
        <li style="margin-bottom: 8px;">Access all platform features</li>
      </ul>
      <p class="email-text">
        Log in to your dashboard to continue where you left off.
      </p>
      <a href="${branding.dashboardUrl}" class="email-button">Go to Dashboard</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        Thank you for being a valued member of ${branding.appName}!
      </p>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function membershipUpgradeEmail(
  data: MembershipUpgradeData,
  branding: BrandingSettings,
): string {
  const featuresList = data.features
    .map((f) => `<li style="margin-bottom: 8px;">${f}</li>`)
    .join("");
  const content = `
    <div class="email-body">
      <h2 class="email-title">Welcome to ${data.newPlanName}!</h2>
      <p class="email-text">
        Hi ${data.userName},
      </p>
      <p class="email-text">
        Great news! Your account has been upgraded to the <strong>${data.newPlanName}</strong> plan.
      </p>
      <div class="email-alert email-alert-success">
        <strong>Upgrade successful!</strong> You now have access to all premium features.
      </div>
      <div class="email-highlight-box">
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #1e293b;">Your new ${data.newPlanName} benefits include:</p>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          ${featuresList}
        </ul>
      </div>
      <p class="email-text">
        Start using your new features right away by visiting your dashboard.
      </p>
      <a href="${branding.dashboardUrl}" class="email-button">Go to Dashboard</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        Thank you for upgrading! If you have any questions, our support team is here to help.
      </p>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function kycApprovedEmail(
  userName: string,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">KYC Verification Approved</h2>
      <p class="email-text">
        Hi ${userName},
      </p>
      <p class="email-text">
        Congratulations! Your KYC verification has been successfully approved.
      </p>
      <div class="email-alert email-alert-success">
        <strong>Verification Complete!</strong> You can now purchase phone numbers on ${branding.appName}.
      </div>
      <p class="email-text">
        With your verified account, you now have access to:
      </p>
      <ul style="color: #4b5563; margin: 0 0 24px 0; padding-left: 20px;">
        <li style="margin-bottom: 8px;">Purchase phone numbers for your campaigns</li>
        <li style="margin-bottom: 8px;">Full access to all platform features</li>
        <li style="margin-bottom: 8px;">Priority support for verified users</li>
      </ul>
      <p class="email-text">
        Head to your dashboard to start exploring the full capabilities of ${branding.appName}.
      </p>
      <a href="${branding.dashboardUrl}" class="email-button">Go to Dashboard</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        Thank you for completing your verification!
      </p>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function kycRejectedEmail(
  userName: string,
  reason: string,
  branding: BrandingSettings,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">KYC Verification Requires Attention</h2>
      <p class="email-text">
        Hi ${userName},
      </p>
      <p class="email-text">
        Unfortunately, your KYC verification could not be approved at this time.
      </p>
      <div class="email-alert email-alert-error">
        <strong>Reason for rejection:</strong> ${reason}
      </div>
      <p class="email-text">
        Please review the reason above and take the necessary steps to resolve the issue. You can resubmit your documents after addressing the concerns.
      </p>
      <div class="email-highlight-box">
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #1e293b;">Next Steps:</p>
        <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
          <li style="margin-bottom: 8px;">Review the rejection reason carefully</li>
          <li style="margin-bottom: 8px;">Ensure your documents are clear and legible</li>
          <li style="margin-bottom: 8px;">Upload updated documents if necessary</li>
          <li style="margin-bottom: 8px;">Resubmit your KYC verification</li>
        </ul>
      </div>
      <p class="email-text">
        Visit your settings page to update and resubmit your KYC documents.
      </p>
      <a href="${branding.baseUrl}/app/settings" class="email-button">Go to Settings</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        If you have any questions, please contact our support team for assistance.
      </p>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function otpEmail(
  otpCode: string,
  branding: BrandingSettings,
  name?: string,
  expiryMinutes: number = 5,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Verify Your Email</h2>
      <p class="email-text">
        ${name ? `Hi ${name},` : "Hello,"}
      </p>
      <p class="email-text">
        Thank you for signing up! Please use the verification code below to complete your registration:
      </p>
      <div class="email-highlight-box" style="text-align: center;">
        <p style="font-size: 14px; color: #6b7280; margin: 0 0 12px 0;">Your Verification Code</p>
        <p style="font-size: 42px; font-weight: 700; letter-spacing: 8px; color: #1e293b; margin: 0; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;">${otpCode}</p>
        <p style="font-size: 13px; color: #9ca3af; margin: 12px 0 0 0;">Valid for ${expiryMinutes} minutes</p>
      </div>
      <div class="email-alert">
        <strong>Security Notice:</strong> Never share this code with anyone. ${branding.appName} will never ask for your verification code.
      </div>
      <p class="email-text">
        If you didn't request this code, please ignore this email or contact our support team.
      </p>
      <a href="${branding.supportUrl}" class="email-button email-button-secondary">Contact Support</a>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export function passwordResetEmail(
  otpCode: string,
  branding: BrandingSettings,
  name?: string,
  expiryMinutes: number = 5,
): string {
  const content = `
    <div class="email-body">
      <h2 class="email-title">Reset Your Password</h2>
      <p class="email-text">
        ${name ? `Hi ${name},` : "Hello,"}
      </p>
      <p class="email-text">
        We received a request to reset your password. Use the verification code below to proceed:
      </p>
      <div class="email-highlight-box" style="text-align: center; background: #fef3c7; border-color: #f59e0b;">
        <p style="font-size: 14px; color: #92400e; margin: 0 0 12px 0;">Password Reset Code</p>
        <p style="font-size: 42px; font-weight: 700; letter-spacing: 8px; color: #1e293b; margin: 0; font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;">${otpCode}</p>
        <p style="font-size: 13px; color: #b45309; margin: 12px 0 0 0;">Valid for ${expiryMinutes} minutes</p>
      </div>
      <div class="email-alert email-alert-error">
        <strong>Did not request this?</strong> If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
      </div>
      <p class="email-text">
        For security reasons, this code will expire in ${expiryMinutes} minutes.
      </p>
    </div>
  `;
  return wrapEmailTemplate(branding, content);
}

export class EmailService {
  private transporter: Transporter | null = null;
  private smtpConfigured: boolean = false;
  private fromAddress: string = "";
  private fromName: string = "";

  constructor() {
    this.initialize();
  }

  /**
   * Helper to clean database values that may have extra quotes
   * e.g., """value""" -> value, "value" -> value
   */
  private cleanDbValue(value: string | undefined | null): string {
    if (!value) return "";
    // Remove leading/trailing whitespace first
    let cleaned = value.trim();
    // Remove multiple layers of quotes (handles """value""" case)
    while (
      (cleaned.startsWith('"""') && cleaned.endsWith('"""')) ||
      (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length > 2)
    ) {
      if (cleaned.startsWith('"""') && cleaned.endsWith('"""')) {
        cleaned = cleaned.slice(3, -3);
      } else if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1);
      }
      cleaned = cleaned.trim();
    }
    return cleaned;
  }

  /**
   * Extract raw email from a potentially formatted address
   * e.g., "Name" <email@domain.com> -> email@domain.com
   */
  private extractRawEmail(address: string): string {
    if (!address) return "";
    const cleaned = this.cleanDbValue(address);
    // Check if it's in "Name" <email> format
    const match = cleaned.match(/<([^>]+)>/);
    if (match) {
      return match[1].trim();
    }
    return cleaned;
  }

  private initialize(): void {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM || user;

    if (host && port && user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port: parseInt(port, 10),
          secure: parseInt(port, 10) === 465,
          auth: {
            user,
            pass,
          },
        });
        this.smtpConfigured = true;
        this.fromAddress = from || "";
        logger.info(
          "Email service initialized with SMTP configuration",
          undefined,
          SOURCE,
        );
      } catch (error) {
        logger.error("Failed to initialize SMTP transporter", error, SOURCE);
        this.smtpConfigured = false;
      }
    } else {
      logger.warn(
        "SMTP not configured via env vars - will try database settings",
        undefined,
        SOURCE,
      );
      this.smtpConfigured = false;
    }
  }

  /**
   * Reinitialize SMTP transporter with settings from database
   * Called when admin updates SMTP settings in Communications page
   */
  async reinitializeFromDatabase(): Promise<boolean> {
    try {
      const hostSetting = await storage.getGlobalSetting("smtp_host");
      const portSetting = await storage.getGlobalSetting("smtp_port");
      const userSetting = await storage.getGlobalSetting("smtp_username");
      const passSetting = await storage.getGlobalSetting("smtp_password");
      const fromEmailSetting =
        await storage.getGlobalSetting("smtp_from_email");
      const fromNameSetting = await storage.getGlobalSetting("smtp_from_name");

      // Clean database values to remove extra quotes
      const host = this.cleanDbValue(hostSetting?.value as string);
      const port = portSetting?.value as number | string;
      const user = this.cleanDbValue(userSetting?.value as string);
      const pass = this.cleanDbValue(passSetting?.value as string);
      const fromEmail = this.cleanDbValue(fromEmailSetting?.value as string);
      const fromName = this.cleanDbValue(fromNameSetting?.value as string);

      if (host && port && user && pass) {
        const portNum = typeof port === "string" ? parseInt(port, 10) : port;

        this.transporter = nodemailer.createTransport({
          host,
          port: portNum,
          secure: portNum === 465,
          auth: {
            user,
            pass,
          },
        });
        this.smtpConfigured = true;
        // Store only raw email address (not formatted string)
        // Extract raw email in case fromEmail is formatted like "Name" <email>
        this.fromAddress = this.extractRawEmail(fromEmail) || user || "";
        this.fromName = fromName || "";
        logger.info(
          "Email service reinitialized from database settings",
          { fromAddress: this.fromAddress, fromName: this.fromName },
          SOURCE,
        );
        return true;
      }
      return false;
    } catch (error) {
      logger.error("Failed to reinitialize SMTP from database", error, SOURCE);
      return false;
    }
  }

  /**
   * Test SMTP connection with provided settings (without saving)
   */
  async testConnection(config: {
    host: string;
    port: number;
    username: string;
    password: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const testTransporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        auth: {
          user: config.username,
          pass: config.password,
        },
      });

      await testTransporter.verify();
      return { success: true };
    } catch (error: any) {
      logger.error("SMTP connection test failed", error, SOURCE);
      return {
        success: false,
        error: error.message || "Connection test failed",
      };
    }
  }

  isEnabled(): boolean {
    return this.smtpConfigured && this.transporter !== null;
  }

  private async isNotificationTypeEnabled(eventType: string): Promise<boolean> {
    try {
      const setting = await storage.getEmailNotificationSetting(eventType);
      return setting?.isEnabled ?? true;
    } catch {
      return true;
    }
  }

  /**
   * Load an email template from the database and perform variable substitution
   * Falls back to null if template not found or not active (caller should use hardcoded fallback)
   */
  private async getTemplateFromDatabase(
    templateType: string,
    variables: Record<string, string | number>,
  ): Promise<{ subject: string; htmlBody: string; textBody: string } | null> {
    try {
      const template = await storage.getEmailTemplate(templateType);

      if (!template || !template.isActive) {
        logger.debug(
          `Template ${templateType} not found or inactive, using fallback`,
          undefined,
          SOURCE,
        );
        return null;
      }

      // Perform variable substitution
      let subject = template.subject;
      let htmlBody = template.htmlBody;
      let textBody = template.textBody || "";

      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        const strValue = String(value);
        subject = subject.replace(regex, strValue);
        htmlBody = htmlBody.replace(regex, strValue);
        textBody = textBody.replace(regex, strValue);
      }

      return { subject, htmlBody, textBody };
    } catch (error) {
      logger.error(
        `Failed to load template ${templateType} from database`,
        error,
        SOURCE,
      );
      return null;
    }
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments?: EmailAttachment[],
    options?: { replyTo?: string; text?: string },
  ): Promise<{ success: boolean; error?: string; messageId?: string }> {
    // Check if SMTP is enabled
    if (!this.isEnabled()) {
      const reason = !this.smtpConfigured
        ? "SMTP not configured (missing SMTP_HOST, SMTP_PORT, SMTP_USER, or SMTP_PASS)"
        : "Email transporter not initialized";
      logger.warn(
        `[EMAIL DISABLED] Cannot send to: ${to} - ${reason}`,
        { subject },
        SOURCE,
      );
      console.log(
        `⚠️ [Email] SMTP not enabled - email to ${to} not sent. Subject: "${subject}"`,
      );
      return { success: false, error: reason };
    }

    const branding = await getBrandingSettings();

    // Ensure we have a valid from address with proper email format validation
    // Extract raw email in case fromAddress is still in formatted form
    const rawFromAddress =
      this.extractRawEmail(this.fromAddress) || this.fromAddress;
    const fromAddress =
      rawFromAddress || branding.fromEmail || process.env.SMTP_USER || "";
    if (!fromAddress) {
      const error =
        "No from address configured (SMTP_FROM or SMTP_USER required)";
      logger.error(`[EMAIL ERROR] ${error}`, undefined, SOURCE);
      console.log(`❌ [Email] ${error}`);
      return { success: false, error };
    }

    // Simple RFC5322-safe email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fromAddress)) {
      const error = `Invalid from address format: ${fromAddress}. Must be a valid email address.`;
      logger.error(`[EMAIL ERROR] ${error}`, undefined, SOURCE);
      console.log(`❌ [Email] ${error}`);
      return { success: false, error };
    }

    // Use configured fromName if available, otherwise fall back to branding appName
    const displayName = this.fromName || branding.fromName || branding.appName;

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: `"${displayName}" <${fromAddress}>`,
        to,
        subject,
        html,
        attachments: attachments?.map((att) => ({
          filename: att.filename,
          content: att.content,
        })),
      };

      // Add optional replyTo and text body if provided
      if (options?.replyTo) {
        mailOptions.replyTo = options.replyTo;
      }
      if (options?.text) {
        mailOptions.text = options.text;
      }

      console.log(
        `📧 [Email] Sending to: ${to}, Subject: "${subject}", From: ${fromAddress}${options?.replyTo ? `, Reply-To: ${options.replyTo}` : ""}`,
      );
      const info = await this.transporter!.sendMail(mailOptions);
      logger.info(
        `Email sent successfully to: ${to}`,
        { messageId: info.messageId },
        SOURCE,
      );
      console.log(
        `✅ [Email] Sent successfully to: ${to}, MessageId: ${info.messageId}`,
      );
      return { success: true, messageId: info.messageId };
    } catch (error: any) {
      const errorMsg = error?.message || "Unknown error";
      logger.error(`Failed to send email to: ${to}`, error, SOURCE);
      console.log(`❌ [Email] Failed to send to: ${to} - Error: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async sendWelcomeEmail(
    userId: string,
  ): Promise<{ success: boolean; error?: string }> {
    console.log(`📧 [Email] Preparing welcome email for user: ${userId}`);

    const eventType = NOTIFICATION_TYPE_MAP.welcome;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      const msg = `Welcome email disabled in settings (event type: ${eventType})`;
      logger.info(msg, undefined, SOURCE);
      console.log(`⚠️ [Email] ${msg}`);
      return { success: false, error: msg };
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        const error = `User not found for welcome email: ${userId}`;
        logger.error(error, undefined, SOURCE);
        console.log(`❌ [Email] ${error}`);
        return { success: false, error };
      }

      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase("welcome", {
        userName: user.name,
        companyName: branding.appName,
        dashboardUrl: branding.dashboardUrl,
      });

      let result;
      if (dbTemplate) {
        console.log(`📧 [Email] Using database template for welcome email`);
        result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
      } else {
        console.log(`📧 [Email] Using fallback template for welcome email`);
        const html = welcomeEmail(user.name, branding);
        const subject = `Welcome to ${branding.appName}!`;
        result = await this.sendEmail(user.email, subject, html);
      }

      if (result.success) {
        console.log(`✅ [Email] Welcome email sent to ${user.email}`);
      } else {
        console.log(
          `❌ [Email] Welcome email failed for ${user.email}: ${result.error}`,
        );
      }

      return result;
    } catch (error: any) {
      const errorMsg = error?.message || "Unknown error";
      logger.error(
        `Failed to send welcome email for user: ${userId}`,
        error,
        SOURCE,
      );
      console.log(`❌ [Email] Exception sending welcome email: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  async sendPurchaseConfirmation(
    transactionId: string,
    invoicePDF?: Buffer,
  ): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.purchase_confirmation;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `Purchase confirmation email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const transaction = await storage.getPaymentTransaction(transactionId);
      if (!transaction) {
        logger.error(
          `Transaction not found for purchase confirmation: ${transactionId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const user = await storage.getUser(transaction.userId);
      if (!user) {
        logger.error(
          `User not found for purchase confirmation: ${transaction.userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const invoice = await storage.getTransactionInvoice(transactionId);
      const invoiceNumber = invoice?.invoiceNumber || "N/A";

      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase(
        "purchase_confirmation",
        {
          userName: user.name,
          amount: String(transaction.amount),
          currency: transaction.currency,
          description: transaction.description,
          invoiceNumber,
          transactionId: transaction.id,
          billingUrl: branding.billingUrl,
          companyName: branding.appName,
        },
      );

      const attachments: EmailAttachment[] = [];
      if (invoicePDF) {
        attachments.push({
          filename: `invoice-${invoiceNumber}.pdf`,
          content: invoicePDF,
        });
      }

      if (dbTemplate) {
        const result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
          attachments.length > 0 ? attachments : undefined,
        );
        return result.success;
      }

      // Fallback to hardcoded template
      const data: PurchaseConfirmationData = {
        userName: user.name,
        amount: String(transaction.amount),
        currency: transaction.currency,
        description: transaction.description,
        invoiceNumber,
        transactionId: transaction.id,
      };

      const html = purchaseConfirmationEmail(data, branding);
      const subject = `Payment Confirmed - ${branding.appName}`;

      const result = await this.sendEmail(
        user.email,
        subject,
        html,
        attachments.length > 0 ? attachments : undefined,
      );
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send purchase confirmation for transaction: ${transactionId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendLowCreditsAlert(
    userId: string,
    currentCredits: number,
  ): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.low_credits;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `Low credits email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        logger.error(
          `User not found for low credits alert: ${userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const setting = await storage.getEmailNotificationSetting(eventType);
      const threshold = setting?.thresholdValue || 100;

      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase("low_credits", {
        userName: user.name,
        currentCredits,
        threshold,
        creditsUrl: branding.billingUrl,
        companyName: branding.appName,
      });

      if (dbTemplate) {
        const result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        return result.success;
      }

      // Fallback to hardcoded template
      const data: LowCreditsData = {
        userName: user.name,
        currentCredits,
        threshold,
      };

      const html = lowCreditsEmail(data, branding);
      const subject = `Low Credits Alert - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send low credits alert for user: ${userId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendCampaignCompleted(campaignId: string): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.campaign_completed;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `Campaign completed email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const campaign = await storage.getCampaign(campaignId);
      if (!campaign) {
        logger.error(
          `Campaign not found for completion email: ${campaignId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const user = await storage.getUser(campaign.userId);
      if (!user) {
        logger.error(
          `User not found for campaign completion email: ${campaign.userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const calls = await storage.getCampaignCalls(campaignId);
      const callsCompleted = calls.length;
      const callsSuccessful = calls.filter(
        (c) => c.status === "completed",
      ).length;
      const successRate =
        callsCompleted > 0
          ? Math.round((callsSuccessful / callsCompleted) * 100)
          : 0;

      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase(
        "campaign_completed",
        {
          userName: user.name,
          campaignName: campaign.name,
          callsCompleted,
          callsSuccessful,
          successRate: `${successRate}%`,
          campaignUrl: `${branding.baseUrl}/campaigns/${campaignId}`,
          companyName: branding.appName,
        },
      );

      if (dbTemplate) {
        const result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        return result.success;
      }

      // Fallback to hardcoded template
      const data: CampaignCompletedData & { campaignId?: string } = {
        userName: user.name,
        campaignName: campaign.name,
        callsCompleted,
        callsSuccessful,
        campaignId,
      };

      const html = campaignCompletedEmail(data, branding);
      const subject = `Campaign Completed: ${campaign.name} - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send campaign completed email for campaign: ${campaignId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendPaymentFailed(
    userId: string,
    amount: string,
    reason: string,
  ): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.payment_failed;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `Payment failed email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        logger.error(
          `User not found for payment failed email: ${userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase("payment_failed", {
        userName: user.name,
        amount,
        reason,
        billingUrl: branding.billingUrl,
        companyName: branding.appName,
      });

      if (dbTemplate) {
        const result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        return result.success;
      }

      // Fallback to hardcoded template
      const data: PaymentFailedData = {
        userName: user.name,
        amount,
        reason,
      };

      const html = paymentFailedEmail(data, branding);
      const subject = `Payment Failed - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send payment failed email for user: ${userId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendAccountSuspended(userId: string, reason: string): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.account_suspended;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `Account suspended email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        logger.error(
          `User not found for account suspended email: ${userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase(
        "account_suspended",
        {
          userName: user.name,
          reason,
          supportUrl: branding.supportUrl,
          companyName: branding.appName,
        },
      );

      if (dbTemplate) {
        const result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        return result.success;
      }

      // Fallback to hardcoded template
      const data: AccountSuspendedData = {
        userName: user.name,
        reason,
      };

      const html = accountSuspendedEmail(data, branding);
      const subject = `Account Suspended - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send account suspended email for user: ${userId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendAccountReactivated(userId: string): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.account_reactivated;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `Account reactivated email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        logger.error(
          `User not found for account reactivated email: ${userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase(
        "account_reactivated",
        {
          userName: user.name,
          dashboardUrl: branding.dashboardUrl,
          companyName: branding.appName,
        },
      );

      if (dbTemplate) {
        const result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        return result.success;
      }

      // Fallback to hardcoded template
      const data: AccountReactivatedData = {
        userName: user.name,
        dashboardUrl: branding.dashboardUrl,
      };

      const html = accountReactivatedEmail(data, branding);
      const subject = `Account Reactivated - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send account reactivated email for user: ${userId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendMembershipUpgrade(
    userId: string,
    newPlanName: string,
  ): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.membership_upgrade;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `Membership upgrade email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        logger.error(
          `User not found for membership upgrade email: ${userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const branding = await getBrandingSettings();

      // Default Pro plan features
      const proFeatures = [
        "Unlimited AI agents",
        "Priority support",
        "Advanced analytics",
        "Custom integrations",
        "Increased API limits",
      ];

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase(
        "membership_upgrade",
        {
          userName: user.name,
          newPlanName,
          features: proFeatures.join(", "),
          dashboardUrl: branding.dashboardUrl,
          companyName: branding.appName,
        },
      );

      if (dbTemplate) {
        const result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        return result.success;
      }

      // Fallback to hardcoded template
      const data: MembershipUpgradeData = {
        userName: user.name,
        newPlanName,
        features: proFeatures,
      };

      const html = membershipUpgradeEmail(data, branding);
      const subject = `Welcome to ${newPlanName} - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send membership upgrade email for user: ${userId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendRenewalReminder(subscriptionId: string): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.renewal_reminder;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `Renewal reminder email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const allSubscriptions = await storage.getAllUserSubscriptions();
      const subscription = allSubscriptions.find(
        (s) => s.id === subscriptionId,
      );

      if (!subscription) {
        logger.error(
          `Subscription not found for renewal reminder: ${subscriptionId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const user = await storage.getUser(subscription.userId);
      if (!user) {
        logger.error(
          `User not found for renewal reminder: ${subscription.userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const userSubscription = await storage.getUserSubscription(
        subscription.userId,
      );
      if (!userSubscription || !userSubscription.plan) {
        logger.error(
          `Plan not found for subscription: ${subscriptionId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const renewalDate = subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "N/A";

      const plan = userSubscription.plan;
      const amount =
        subscription.billingPeriod === "yearly"
          ? `${plan.priceYearly || plan.price} ${plan.currency}`
          : `${plan.price} ${plan.currency}`;

      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase(
        "renewal_reminder",
        {
          userName: user.name,
          planName: plan.displayName || plan.name,
          renewalDate,
          amount,
          billingUrl: branding.billingUrl,
          companyName: branding.appName,
        },
      );

      if (dbTemplate) {
        const result = await this.sendEmail(
          user.email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        return result.success;
      }

      // Fallback to hardcoded template
      const data: SubscriptionRenewalReminderData = {
        userName: user.name,
        planName: plan.displayName || plan.name,
        renewalDate,
        amount,
      };

      const html = subscriptionRenewalReminderEmail(data, branding);
      const subject = `Subscription Renewal Reminder - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send renewal reminder for subscription: ${subscriptionId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendOTPEmail(
    email: string,
    code: string,
    name?: string,
    expiryMinutes: number = 5,
  ): Promise<{ success: boolean; messageId?: string }> {
    try {
      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase("otp", {
        userName: name || "",
        name: name || "",
        email,
        otpCode: code,
        code,
        expiryMinutes: expiryMinutes.toString(),
        companyName: branding.appName,
        year: new Date().getFullYear().toString(),
      });

      if (dbTemplate) {
        const result = await this.sendEmail(
          email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        logger.info(`OTP email sent to: ${email}`, undefined, SOURCE);
        return result;
      }

      // Fallback to hardcoded template
      const html = otpEmail(code, branding, name, expiryMinutes);
      const subject = `Your ${branding.appName} Verification Code`;

      const result = await this.sendEmail(email, subject, html);
      logger.info(`OTP email sent to: ${email}`, undefined, SOURCE);
      return result;
    } catch (error) {
      logger.error(`Failed to send OTP email to: ${email}`, error, SOURCE);
      throw new Error("Failed to send verification email");
    }
  }

  async sendPasswordResetEmail(
    email: string,
    code: string,
    name?: string,
    expiryMinutes: number = 5,
  ): Promise<{ success: boolean; messageId?: string }> {
    try {
      const branding = await getBrandingSettings();

      // Try database template first
      const dbTemplate = await this.getTemplateFromDatabase("password_reset", {
        userName: name || "",
        name: name || "",
        email,
        otpCode: code,
        code,
        expiryMinutes: expiryMinutes.toString(),
        companyName: branding.appName,
        year: new Date().getFullYear().toString(),
      });

      if (dbTemplate) {
        const result = await this.sendEmail(
          email,
          dbTemplate.subject,
          dbTemplate.htmlBody,
        );
        logger.info(
          `Password reset email sent to: ${email}`,
          undefined,
          SOURCE,
        );
        return result;
      }

      // Fallback to hardcoded template
      const html = passwordResetEmail(code, branding, name, expiryMinutes);
      const subject = `Reset Your ${branding.appName} Password`;

      const result = await this.sendEmail(email, subject, html);
      logger.info(`Password reset email sent to: ${email}`, undefined, SOURCE);
      return result;
    } catch (error) {
      logger.error(
        `Failed to send password reset email to: ${email}`,
        error,
        SOURCE,
      );
      throw new Error("Failed to send password reset email");
    }
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.warn(
        "Cannot verify connection - SMTP not configured",
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      await this.transporter!.verify();
      logger.info("SMTP connection verified successfully", undefined, SOURCE);
      return true;
    } catch (error) {
      logger.error("SMTP connection verification failed", error, SOURCE);
      return false;
    }
  }

  async sendKycApproved(userId: string): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.kyc_approved;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `KYC approved email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        logger.error(
          `User not found for KYC approved email: ${userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const branding = await getBrandingSettings();

      const html = kycApprovedEmail(user.name, branding);
      const subject = `KYC Verification Approved - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send KYC approved email for user: ${userId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }

  async sendKycRejected(userId: string, reason: string): Promise<boolean> {
    const eventType = NOTIFICATION_TYPE_MAP.kyc_rejected;
    if (!(await this.isNotificationTypeEnabled(eventType))) {
      logger.info(
        `KYC rejected email disabled for event type: ${eventType}`,
        undefined,
        SOURCE,
      );
      return false;
    }

    try {
      const user = await storage.getUser(userId);
      if (!user) {
        logger.error(
          `User not found for KYC rejected email: ${userId}`,
          undefined,
          SOURCE,
        );
        return false;
      }

      const branding = await getBrandingSettings();

      const html = kycRejectedEmail(user.name, reason, branding);
      const subject = `KYC Verification Requires Attention - ${branding.appName}`;

      const result = await this.sendEmail(user.email, subject, html);
      return result.success;
    } catch (error) {
      logger.error(
        `Failed to send KYC rejected email for user: ${userId}`,
        error,
        SOURCE,
      );
      return false;
    }
  }
}

export const emailService = new EmailService();
