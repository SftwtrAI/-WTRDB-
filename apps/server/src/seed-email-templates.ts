import { db } from "./db";
import { emailTemplates } from "@wtrops/shared";

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

function wrapEmailTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{{companyName}}</title>
  <style>${getBaseEmailStyles()}</style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <div class="email-header">
        <h1 class="email-logo">{{companyName}}</h1>
        <p class="email-tagline">AI-Powered Bulk Calling Platform</p>
      </div>
      ${content}
      <div class="email-footer">
        <p class="email-footer-text">
          &copy; 2025 {{companyName}}. All rights reserved.
        </p>
        <p class="email-footer-links">
          <a href="{{unsubscribeUrl}}">Unsubscribe</a> |
          <a href="{{privacyUrl}}">Privacy Policy</a> |
          <a href="{{supportUrl}}">Contact Support</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

const EMAIL_TEMPLATES_SEED_DATA = [
  {
    templateType: "welcome",
    name: "Welcome Email",
    subject: "Welcome to {{companyName}}!",
    htmlBody: wrapEmailTemplate(`
    <div class="email-body">
      <h2 class="email-title">Welcome to {{companyName}}!</h2>
      <p class="email-text">
        Hi {{userName}},
      </p>
      <p class="email-text">
        Thank you for joining {{companyName}}! We're excited to have you on board. Our AI-powered bulk calling platform is designed to help you automate your outreach and engage with your contacts more effectively.
      </p>
      <div class="email-highlight-box">
        <p style="margin: 0 0 12px 0; font-weight: 600; color: #1e293b;">Here's what you can do with {{companyName}}:</p>
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
      <a href="{{dashboardUrl}}" class="email-button">Go to Dashboard</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280;">
        If you have any questions, our support team is here to help.
      </p>
    </div>
  `),
    textBody: `Welcome to {{companyName}}!

Hi {{userName}},

Thank you for joining {{companyName}}! We're excited to have you on board. Our AI-powered bulk calling platform is designed to help you automate your outreach and engage with your contacts more effectively.

Here's what you can do with {{companyName}}:
- Create AI-powered voice agents for automated calling
- Launch bulk calling campaigns with intelligent scheduling
- Track call analytics and performance metrics
- Integrate with your existing workflows

Ready to get started? Log in to your dashboard and create your first AI agent.

Go to Dashboard: {{dashboardUrl}}

If you have any questions, our support team is here to help.

© 2025 {{companyName}}. All rights reserved.`,
    variables: ["userName", "companyName", "dashboardUrl"],
    isActive: true,
  },
  {
    templateType: "purchase_confirmation",
    name: "Purchase Confirmation",
    subject: "Payment Confirmed - {{companyName}}",
    htmlBody: wrapEmailTemplate(`
    <div class="email-body">
      <h2 class="email-title">Payment Confirmed</h2>
      <p class="email-text">
        Hi {{userName}},
      </p>
      <p class="email-text">
        Thank you for your purchase! Your payment has been successfully processed.
      </p>
      <div class="email-highlight-box">
        <table class="email-table">
          <tr>
            <td>Description</td>
            <td>{{description}}</td>
          </tr>
          <tr>
            <td>Invoice Number</td>
            <td style="font-family: monospace;">{{invoiceNumber}}</td>
          </tr>
          <tr>
            <td>Transaction ID</td>
            <td style="font-family: monospace; font-size: 13px;">{{transactionId}}</td>
          </tr>
          <tr>
            <td>Amount Paid</td>
            <td>{{currency}} {{amount}}</td>
          </tr>
        </table>
      </div>
      <div class="email-alert email-alert-success">
        <strong>Your payment was successful!</strong> Your credits or subscription have been added to your account.
      </div>
      <p class="email-text">
        You can view your transaction history and download invoices from your billing dashboard.
      </p>
      <a href="{{billingUrl}}" class="email-button">View Transaction History</a>
    </div>
  `),
    textBody: `Payment Confirmed

Hi {{userName}},

Thank you for your purchase! Your payment has been successfully processed.

Transaction Details:
- Description: {{description}}
- Invoice Number: {{invoiceNumber}}
- Transaction ID: {{transactionId}}
- Amount Paid: {{currency}} {{amount}}

Your payment was successful! Your credits or subscription have been added to your account.

You can view your transaction history and download invoices from your billing dashboard.

View Transaction History: {{billingUrl}}

© 2025 {{companyName}}. All rights reserved.`,
    variables: [
      "userName",
      "amount",
      "currency",
      "description",
      "invoiceNumber",
      "transactionId",
      "billingUrl",
    ],
    isActive: true,
  },
  {
    templateType: "low_credits",
    name: "Low Credits Alert",
    subject: "Low Credits Alert - {{companyName}}",
    htmlBody: wrapEmailTemplate(`
    <div class="email-body">
      <h2 class="email-title">Low Credits Alert</h2>
      <p class="email-text">
        Hi {{userName}},
      </p>
      <p class="email-text">
        Your account credits are running low. To ensure uninterrupted service, consider purchasing more credits.
      </p>
      <div class="email-highlight-box">
        <div class="email-metric">
          <p class="email-metric-value">{{currentCredits}}</p>
          <p class="email-metric-label">Credits Remaining</p>
        </div>
      </div>
      <div class="email-alert">
        <strong>Warning:</strong> Your credit balance is below {{threshold}} credits. Your campaigns may be paused if you run out of credits.
      </div>
      <p class="email-text">
        Top up your credits now to keep your campaigns running smoothly.
      </p>
      <a href="{{creditsUrl}}" class="email-button">Purchase Credits</a>
    </div>
  `),
    textBody: `Low Credits Alert

Hi {{userName}},

Your account credits are running low. To ensure uninterrupted service, consider purchasing more credits.

Credits Remaining: {{currentCredits}}

Warning: Your credit balance is below {{threshold}} credits. Your campaigns may be paused if you run out of credits.

Top up your credits now to keep your campaigns running smoothly.

Purchase Credits: {{creditsUrl}}

© 2025 {{companyName}}. All rights reserved.`,
    variables: ["userName", "currentCredits", "threshold", "creditsUrl"],
    isActive: true,
  },
  {
    templateType: "campaign_completed",
    name: "Campaign Completed",
    subject: "Campaign Completed: {{campaignName}} - {{companyName}}",
    htmlBody: wrapEmailTemplate(`
    <div class="email-body">
      <h2 class="email-title">Campaign Completed</h2>
      <p class="email-text">
        Hi {{userName}},
      </p>
      <p class="email-text">
        Great news! Your campaign "<strong>{{campaignName}}</strong>" has finished running.
      </p>
      <div class="email-highlight-box">
        <table style="width: 100%; text-align: center;">
          <tr>
            <td style="padding: 16px;">
              <p class="email-metric-value">{{callsCompleted}}</p>
              <p class="email-metric-label">Calls Completed</p>
            </td>
            <td style="padding: 16px;">
              <p class="email-metric-value">{{callsSuccessful}}</p>
              <p class="email-metric-label">Successful Calls</p>
            </td>
            <td style="padding: 16px;">
              <p class="email-metric-value">{{successRate}}%</p>
              <p class="email-metric-label">Success Rate</p>
            </td>
          </tr>
        </table>
      </div>
      <div class="email-alert email-alert-success">
        <strong>Campaign completed successfully!</strong> View detailed analytics and transcripts in your dashboard.
      </div>
      <a href="{{campaignUrl}}" class="email-button">View Campaign Results</a>
    </div>
  `),
    textBody: `Campaign Completed

Hi {{userName}},

Great news! Your campaign "{{campaignName}}" has finished running.

Campaign Results:
- Calls Completed: {{callsCompleted}}
- Successful Calls: {{callsSuccessful}}
- Success Rate: {{successRate}}%

Campaign completed successfully! View detailed analytics and transcripts in your dashboard.

View Campaign Results: {{campaignUrl}}

© 2025 {{companyName}}. All rights reserved.`,
    variables: [
      "userName",
      "campaignName",
      "callsCompleted",
      "callsSuccessful",
      "successRate",
      "campaignUrl",
    ],
    isActive: true,
  },
  {
    templateType: "renewal_reminder",
    name: "Subscription Renewal Reminder",
    subject: "Subscription Renewal Reminder - {{companyName}}",
    htmlBody: wrapEmailTemplate(`
    <div class="email-body">
      <h2 class="email-title">Subscription Renewal Reminder</h2>
      <p class="email-text">
        Hi {{userName}},
      </p>
      <p class="email-text">
        This is a friendly reminder that your {{planName}} subscription will renew soon.
      </p>
      <div class="email-highlight-box">
        <table class="email-table">
          <tr>
            <td>Plan</td>
            <td>{{planName}}</td>
          </tr>
          <tr>
            <td>Renewal Date</td>
            <td>{{renewalDate}}</td>
          </tr>
          <tr>
            <td>Amount</td>
            <td>{{amount}}</td>
          </tr>
        </table>
      </div>
      <div class="email-alert email-alert-info">
        <strong>No action required.</strong> Your subscription will automatically renew on the date shown above.
      </div>
      <p class="email-text">
        If you'd like to make changes to your subscription or update your payment method, please visit your billing settings.
      </p>
      <a href="{{billingUrl}}" class="email-button">Manage Subscription</a>
    </div>
  `),
    textBody: `Subscription Renewal Reminder

Hi {{userName}},

This is a friendly reminder that your {{planName}} subscription will renew soon.

Subscription Details:
- Plan: {{planName}}
- Renewal Date: {{renewalDate}}
- Amount: {{amount}}

No action required. Your subscription will automatically renew on the date shown above.

If you'd like to make changes to your subscription or update your payment method, please visit your billing settings.

Manage Subscription: {{billingUrl}}

© 2025 {{companyName}}. All rights reserved.`,
    variables: ["userName", "planName", "renewalDate", "amount", "billingUrl"],
    isActive: true,
  },
  {
    templateType: "payment_failed",
    name: "Payment Failed",
    subject: "Payment Failed - {{companyName}}",
    htmlBody: wrapEmailTemplate(`
    <div class="email-body">
      <h2 class="email-title">Payment Failed</h2>
      <p class="email-text">
        Hi {{userName}},
      </p>
      <p class="email-text">
        We were unable to process your payment. Please update your payment method to continue using {{companyName}}.
      </p>
      <div class="email-alert email-alert-error">
        <strong>Payment declined:</strong> {{reason}}
      </div>
      <div class="email-highlight-box">
        <div class="email-metric">
          <p class="email-metric-value">{{amount}}</p>
          <p class="email-metric-label">Amount Due</p>
        </div>
      </div>
      <p class="email-text">
        Please update your payment method as soon as possible to avoid any service interruptions.
      </p>
      <a href="{{billingUrl}}" class="email-button">Update Payment Method</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        If you believe this is an error or need assistance, please contact our support team.
      </p>
    </div>
  `),
    textBody: `Payment Failed

Hi {{userName}},

We were unable to process your payment. Please update your payment method to continue using {{companyName}}.

Payment declined: {{reason}}

Amount Due: {{amount}}

Please update your payment method as soon as possible to avoid any service interruptions.

Update Payment Method: {{billingUrl}}

If you believe this is an error or need assistance, please contact our support team.

© 2025 {{companyName}}. All rights reserved.`,
    variables: ["userName", "amount", "reason", "billingUrl"],
    isActive: true,
  },
  {
    templateType: "account_suspended",
    name: "Account Suspended",
    subject: "Account Suspended - {{companyName}}",
    htmlBody: wrapEmailTemplate(`
    <div class="email-body">
      <h2 class="email-title">Account Suspended</h2>
      <p class="email-text">
        Hi {{userName}},
      </p>
      <p class="email-text">
        Your {{companyName}} account has been suspended.
      </p>
      <div class="email-alert email-alert-error">
        <strong>Reason for suspension:</strong> {{reason}}
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
      <a href="{{supportUrl}}" class="email-button">Contact Support</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        Please respond to this notice within 7 days to avoid permanent account termination.
      </p>
    </div>
  `),
    textBody: `Account Suspended

Hi {{userName}},

Your {{companyName}} account has been suspended.

Reason for suspension: {{reason}}

While your account is suspended, you will not be able to:
- Run or create new campaigns
- Make outbound calls
- Access certain features

If you believe this suspension is in error, or if you would like to resolve the issue, please contact our support team immediately.

Contact Support: {{supportUrl}}

Please respond to this notice within 7 days to avoid permanent account termination.

© 2025 {{companyName}}. All rights reserved.`,
    variables: ["userName", "reason", "supportUrl"],
    isActive: true,
  },
  {
    templateType: "phone_billing",
    name: "Phone Number Billing",
    subject: "Phone Number Billing - {{companyName}}",
    htmlBody: wrapEmailTemplate(`
    <div class="email-body">
      <h2 class="email-title">Phone Number Billing</h2>
      <p class="email-text">
        Hi {{userName}},
      </p>
      <p class="email-text">
        This is a notification regarding the monthly billing for your phone number(s) on {{companyName}}.
      </p>
      <div class="email-highlight-box">
        <table class="email-table">
          <tr>
            <td>Phone Number</td>
            <td>{{phoneNumber}}</td>
          </tr>
          <tr>
            <td>Billing Period</td>
            <td>{{billingPeriod}}</td>
          </tr>
          <tr>
            <td>Amount</td>
            <td>{{amount}}</td>
          </tr>
          <tr>
            <td>Status</td>
            <td>{{status}}</td>
          </tr>
        </table>
      </div>
      <p class="email-text">
        {{message}}
      </p>
      <a href="{{billingUrl}}" class="email-button">View Billing Details</a>
      <p class="email-text" style="font-size: 14px; color: #6b7280; margin-top: 24px;">
        If you have any questions about this charge, please contact our support team.
      </p>
    </div>
  `),
    textBody: `Phone Number Billing

Hi {{userName}},

This is a notification regarding the monthly billing for your phone number(s) on {{companyName}}.

Phone Number: {{phoneNumber}}
Billing Period: {{billingPeriod}}
Amount: {{amount}}
Status: {{status}}

{{message}}

View Billing Details: {{billingUrl}}

If you have any questions about this charge, please contact our support team.

© 2025 {{companyName}}. All rights reserved.`,
    variables: [
      "userName",
      "phoneNumber",
      "billingPeriod",
      "amount",
      "status",
      "message",
      "billingUrl",
    ],
    isActive: true,
  },
];

async function seedEmailTemplates() {
  try {
    console.log("🌱 Starting Email Templates seed...");

    const existing = await db.select().from(emailTemplates);
    const existingTypes = existing.map((t) => t.templateType);

    const templatesToInsert = EMAIL_TEMPLATES_SEED_DATA.filter(
      (template) => !existingTypes.includes(template.templateType),
    );

    if (templatesToInsert.length === 0) {
      console.log(
        `⚠️  All ${EMAIL_TEMPLATES_SEED_DATA.length} email templates already exist. Skipping.`,
      );
      return;
    }

    console.log(`📧 Inserting ${templatesToInsert.length} email templates...`);
    await db.insert(emailTemplates).values(templatesToInsert);

    console.log("✅ Successfully seeded Email Templates!");
    templatesToInsert.forEach((template) => {
      console.log(
        `   - ${template.name} (${template.templateType}): ${template.variables.length} variables`,
      );
    });
  } catch (error) {
    console.error("❌ Error seeding Email Templates:", error);
    throw error;
  }
}

export { seedEmailTemplates, EMAIL_TEMPLATES_SEED_DATA };
