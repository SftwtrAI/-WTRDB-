import crypto from "crypto";
import { storage } from "../storage";
import { Webhook, InsertWebhookLog } from "@wtrops/shared";

export interface WebhookTestResult {
  success: boolean;
  status?: number;
  responseTime: number;
  responseBody?: string;
  error?: string;
  message: string;
}

export const WEBHOOK_EVENT_TYPES = [
  // Campaign events
  "campaign.started",
  "campaign.paused",
  "campaign.resumed",
  "campaign.completed",
  "campaign.failed",
  "campaign.cancelled",
  // Call events (outbound)
  "call.started",
  "call.ringing",
  "call.answered",
  "call.completed",
  "call.failed",
  "call.transferred",
  "call.no_answer",
  "call.busy",
  "call.voicemail",
  // Call events (inbound)
  "inbound_call.received",
  "inbound_call.answered",
  "inbound_call.completed",
  "inbound_call.missed",
  // Flow events
  "flow.started",
  "flow.completed",
  "flow.failed",
  // Appointment events
  "appointment.booked",
  "appointment.confirmed",
  "appointment.cancelled",
  "appointment.rescheduled",
  "appointment.completed",
  "appointment.no_show",
  // Form events
  "form.submitted",
  "form.lead_created",
  // System
  "webhook.test",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function generateComprehensiveTestPayload(
  eventType: WebhookEventType = "webhook.test",
) {
  const timestamp = new Date().toISOString();
  const baseData = {
    test: true,
    environment: "test",
    webhookVersion: "1.0",
  };

  switch (eventType) {
    case "call.started":
      return {
        event: "call.started",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            conversationId: `conv_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "outbound",
            status: "in-progress",
            startedAt: timestamp,
            fromNumber: "+15555551234",
            toNumber: "+15555559876",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "John Doe",
            phone: "+15555559876",
            email: "john.doe@example.com",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Campaign",
          },
          agent: {
            id: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Agent",
            type: "natural",
          },
        },
      };

    case "call.completed":
      return {
        event: "call.completed",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            conversationId: `conv_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "outbound",
            status: "completed",
            startedAt: new Date(Date.now() - 120000).toISOString(),
            endedAt: timestamp,
            duration: 120,
            durationMinutes: 2,
            fromNumber: "+15555551234",
            toNumber: "+15555559876",
            recordingUrl:
              "https://api.twilio.com/recordings/test-recording.mp3",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Jane Smith",
            phone: "+15555559876",
            email: "jane.smith@example.com",
            company: "Acme Corp",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Sales Outreach Q1",
          },
          agent: {
            id: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Sales Agent",
            type: "natural",
          },
          analysis: {
            classification: "Warm Lead",
            sentiment: "positive",
            summary:
              "The caller expressed interest in our product and requested a follow-up meeting. They mentioned budget approval is pending.",
            transcript: [
              {
                role: "agent",
                text: "Hello, this is Sarah from Acme. How are you today?",
              },
              {
                role: "user",
                text: "Hi Sarah, I'm doing well. I was actually looking into your services.",
              },
              {
                role: "agent",
                text: "That's great to hear! What specific services are you interested in?",
              },
              {
                role: "user",
                text: "We need help with our customer outreach program.",
              },
              {
                role: "agent",
                text: "I'd love to schedule a detailed demo. Would next Tuesday work for you?",
              },
              {
                role: "user",
                text: "Yes, that works. Let me give you my email.",
              },
            ],
            keyInsights: [
              "Interested in customer outreach services",
              "Budget approval pending",
              "Demo scheduled for next week",
            ],
            nextActions: [
              "Send calendar invite for demo",
              "Prepare custom proposal",
              "Follow up on budget timeline",
            ],
          },
          collectedData: {
            product_interest: "customer outreach",
            budget_status: "pending approval",
            meeting_scheduled: true,
            preferred_contact: "email",
          },
        },
      };

    case "call.failed":
      return {
        event: "call.failed",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            conversationId: `conv_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "outbound",
            status: "failed",
            startedAt: new Date(Date.now() - 30000).toISOString(),
            endedAt: timestamp,
            duration: 30,
            fromNumber: "+15555551234",
            toNumber: "+15555559876",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Robert Johnson",
            phone: "+15555559876",
            email: "robert.johnson@example.com",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Re-engagement Campaign",
          },
          error: {
            code: "NO_ANSWER",
            reason: "Call was not answered after multiple rings",
            retryable: true,
            suggestedAction: "Schedule retry in 2 hours",
          },
          analysis: {
            classification: "No Answer",
            summary: "Call was not answered. Voicemail was not detected.",
          },
        },
      };

    case "call.transferred":
      return {
        event: "call.transferred",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            conversationId: `conv_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "inbound",
            status: "transferred",
            startedAt: new Date(Date.now() - 180000).toISOString(),
            transferredAt: timestamp,
            duration: 180,
            fromNumber: "+15555559876",
            toNumber: "+15555551234",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Emily Chen",
            phone: "+15555559876",
            email: "emily.chen@example.com",
          },
          transfer: {
            reason: "Customer requested human agent",
            transferTo: "+15555550000",
            transferType: "warm",
            agentName: "Customer Support Team",
            department: "Support",
          },
          analysis: {
            summary:
              "Customer had a billing inquiry that required human assistance. AI collected initial information before transferring.",
            preTransferContext: {
              issue_type: "billing",
              account_number: "ACC-12345",
              issue_description: "Discrepancy in monthly invoice",
            },
          },
        },
      };

    case "campaign.started":
      return {
        event: "campaign.started",
        timestamp,
        data: {
          ...baseData,
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Product Launch Outreach",
            description: "Outreach campaign for new product launch",
            status: "running",
            startedAt: timestamp,
            totalContacts: 500,
            completedCalls: 0,
            remainingCalls: 500,
            estimatedDuration: "4 hours",
          },
          agent: {
            id: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Product Launch Agent",
            type: "natural",
          },
          schedule: {
            timezone: "America/New_York",
            callWindow: {
              start: "09:00",
              end: "17:00",
            },
            daysOfWeek: [
              "monday",
              "tuesday",
              "wednesday",
              "thursday",
              "friday",
            ],
          },
        },
      };

    case "campaign.completed":
      return {
        event: "campaign.completed",
        timestamp,
        data: {
          ...baseData,
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Q1 Sales Outreach",
            description: "Quarterly sales outreach campaign",
            status: "completed",
            startedAt: new Date(Date.now() - 14400000).toISOString(),
            completedAt: timestamp,
            totalContacts: 500,
            completedCalls: 487,
            failedCalls: 13,
          },
          statistics: {
            totalDuration: 14400,
            averageCallDuration: 95,
            successRate: 0.974,
            answeredRate: 0.68,
            classifications: {
              "Hot Lead": 45,
              "Warm Lead": 120,
              "Cold Lead": 80,
              "Not Interested": 90,
              "Callback Requested": 65,
              "No Answer": 87,
            },
            appointmentsBooked: 23,
            formsCompleted: 156,
            transfersCompleted: 12,
          },
          topPerformingSegments: [
            { segment: "Tech Industry", conversionRate: 0.32 },
            { segment: "Enterprise", conversionRate: 0.28 },
            { segment: "Mid-Market", conversionRate: 0.22 },
          ],
        },
      };

    case "campaign.paused":
      return {
        event: "campaign.paused",
        timestamp,
        data: {
          ...baseData,
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Holiday Promotion",
            description: "Holiday season promotional campaign",
            status: "paused",
            startedAt: new Date(Date.now() - 7200000).toISOString(),
            pausedAt: timestamp,
            totalContacts: 1000,
            completedCalls: 234,
            remainingCalls: 766,
          },
          pauseReason: "Scheduled maintenance window",
          resumeScheduledAt: new Date(Date.now() + 3600000).toISOString(),
          statistics: {
            callsBeforePause: 234,
            successRate: 0.89,
            averageCallDuration: 78,
          },
        },
      };

    case "campaign.resumed":
      return {
        event: "campaign.resumed",
        timestamp,
        data: {
          ...baseData,
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Holiday Promotion",
            description: "Holiday season promotional campaign",
            status: "running",
            startedAt: new Date(Date.now() - 7200000).toISOString(),
            pausedAt: new Date(Date.now() - 3600000).toISOString(),
            resumedAt: timestamp,
            totalContacts: 1000,
            completedCalls: 234,
            remainingCalls: 766,
          },
          resumeReason: "Maintenance completed",
          statistics: {
            callsBeforeResume: 234,
            successRate: 0.89,
          },
        },
      };

    case "campaign.failed":
      return {
        event: "campaign.failed",
        timestamp,
        data: {
          ...baseData,
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Failed Campaign",
            description: "Campaign that encountered an error",
            status: "failed",
            startedAt: new Date(Date.now() - 1800000).toISOString(),
            failedAt: timestamp,
            totalContacts: 500,
            completedCalls: 45,
            failedCalls: 12,
          },
          error: {
            code: "INSUFFICIENT_CREDITS",
            message: "Campaign stopped due to insufficient credits",
            details: "User credit balance reached zero during execution",
          },
        },
      };

    case "campaign.cancelled":
      return {
        event: "campaign.cancelled",
        timestamp,
        data: {
          ...baseData,
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Cancelled Campaign",
            description: "Campaign manually cancelled by user",
            status: "cancelled",
            startedAt: new Date(Date.now() - 3600000).toISOString(),
            cancelledAt: timestamp,
            totalContacts: 500,
            completedCalls: 123,
            remainingCalls: 377,
          },
          cancelReason: "User requested cancellation",
        },
      };

    case "call.ringing":
      return {
        event: "call.ringing",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "outbound",
            status: "ringing",
            startedAt: timestamp,
            fromNumber: "+15555551234",
            toNumber: "+15555559876",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "John Doe",
            phone: "+15555559876",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Campaign",
          },
        },
      };

    case "call.answered":
      return {
        event: "call.answered",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "outbound",
            status: "in-progress",
            startedAt: new Date(Date.now() - 10000).toISOString(),
            answeredAt: timestamp,
            fromNumber: "+15555551234",
            toNumber: "+15555559876",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "John Doe",
            phone: "+15555559876",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Campaign",
          },
        },
      };

    case "call.no_answer":
      return {
        event: "call.no_answer",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "outbound",
            status: "no-answer",
            startedAt: new Date(Date.now() - 30000).toISOString(),
            endedAt: timestamp,
            duration: 30,
            fromNumber: "+15555551234",
            toNumber: "+15555559876",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "John Doe",
            phone: "+15555559876",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Campaign",
          },
        },
      };

    case "call.busy":
      return {
        event: "call.busy",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "outbound",
            status: "busy",
            startedAt: new Date(Date.now() - 5000).toISOString(),
            endedAt: timestamp,
            duration: 5,
            fromNumber: "+15555551234",
            toNumber: "+15555559876",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "John Doe",
            phone: "+15555559876",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Campaign",
          },
        },
      };

    case "call.voicemail":
      return {
        event: "call.voicemail",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "outbound",
            status: "voicemail",
            startedAt: new Date(Date.now() - 45000).toISOString(),
            endedAt: timestamp,
            duration: 45,
            fromNumber: "+15555551234",
            toNumber: "+15555559876",
            voicemailDetected: true,
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "John Doe",
            phone: "+15555559876",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Campaign",
          },
        },
      };

    case "inbound_call.received":
      return {
        event: "inbound_call.received",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "inbound",
            status: "ringing",
            receivedAt: timestamp,
            fromNumber: "+15555559876",
            toNumber: "+15555551234",
          },
          agent: {
            id: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Inbound Support Agent",
            type: "incoming",
          },
          phoneNumber: {
            id: `phone_test_${crypto.randomUUID().substring(0, 8)}`,
            number: "+15555551234",
            country: "US",
          },
        },
      };

    case "inbound_call.answered":
      return {
        event: "inbound_call.answered",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "inbound",
            status: "in-progress",
            receivedAt: new Date(Date.now() - 5000).toISOString(),
            answeredAt: timestamp,
            fromNumber: "+15555559876",
            toNumber: "+15555551234",
          },
          agent: {
            id: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Inbound Support Agent",
            type: "incoming",
          },
        },
      };

    case "inbound_call.completed":
      return {
        event: "inbound_call.completed",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "inbound",
            status: "completed",
            receivedAt: new Date(Date.now() - 300000).toISOString(),
            answeredAt: new Date(Date.now() - 295000).toISOString(),
            endedAt: timestamp,
            duration: 300,
            durationMinutes: 5,
            fromNumber: "+15555559876",
            toNumber: "+15555551234",
          },
          agent: {
            id: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Inbound Support Agent",
            type: "incoming",
          },
          analysis: {
            classification: "Support Request",
            sentiment: "neutral",
            summary: "Customer called for product support",
          },
        },
      };

    case "inbound_call.missed":
      return {
        event: "inbound_call.missed",
        timestamp,
        data: {
          ...baseData,
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            direction: "inbound",
            status: "missed",
            receivedAt: new Date(Date.now() - 30000).toISOString(),
            missedAt: timestamp,
            fromNumber: "+15555559876",
            toNumber: "+15555551234",
          },
          agent: {
            id: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Inbound Support Agent",
            type: "incoming",
          },
          reason: "No answer - call timed out",
        },
      };

    case "flow.started":
      return {
        event: "flow.started",
        timestamp,
        data: {
          ...baseData,
          flow: {
            id: `flow_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Customer Support Flow",
            version: 1,
          },
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
          },
          startNode: {
            id: "node_start",
            type: "start",
          },
        },
      };

    case "flow.completed":
      return {
        event: "flow.completed",
        timestamp,
        data: {
          ...baseData,
          flow: {
            id: `flow_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Customer Support Flow",
            version: 1,
          },
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
          },
          endNode: {
            id: "node_end",
            type: "end_call",
          },
          nodesExecuted: 5,
          flowDuration: 180,
        },
      };

    case "flow.failed":
      return {
        event: "flow.failed",
        timestamp,
        data: {
          ...baseData,
          flow: {
            id: `flow_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Customer Support Flow",
            version: 1,
          },
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
          },
          failedNode: {
            id: "node_api_call",
            type: "api_call",
          },
          error: {
            code: "API_TIMEOUT",
            message: "External API call timed out",
          },
        },
      };

    case "appointment.booked":
      return {
        event: "appointment.booked",
        timestamp,
        data: {
          ...baseData,
          appointment: {
            id: `apt_test_${crypto.randomUUID().substring(0, 8)}`,
            type: "Product Demo",
            status: "confirmed",
            scheduledDate: new Date(Date.now() + 86400000 * 3)
              .toISOString()
              .split("T")[0],
            scheduledTime: "14:00",
            timezone: "America/New_York",
            duration: 30,
            location: "Virtual - Zoom",
            notes: "Customer interested in enterprise features",
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Michael Brown",
            phone: "+15555559876",
            email: "michael.brown@example.com",
            company: "Brown Industries",
            title: "Director of Operations",
          },
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            conversationId: `conv_test_${crypto.randomUUID().substring(0, 8)}`,
            duration: 145,
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Demo Scheduling Campaign",
          },
          bookedBy: {
            agentId: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            agentName: "Appointment Setter AI",
          },
        },
      };

    case "appointment.confirmed":
      return {
        event: "appointment.confirmed",
        timestamp,
        data: {
          ...baseData,
          appointment: {
            id: `apt_test_${crypto.randomUUID().substring(0, 8)}`,
            type: "Product Demo",
            status: "confirmed",
            scheduledDate: new Date(Date.now() + 86400000 * 2)
              .toISOString()
              .split("T")[0],
            scheduledTime: "10:00",
            timezone: "America/New_York",
            duration: 30,
            confirmedAt: timestamp,
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Michael Brown",
            phone: "+15555559876",
            email: "michael.brown@example.com",
          },
          confirmationMethod: "sms_reply",
        },
      };

    case "appointment.cancelled":
      return {
        event: "appointment.cancelled",
        timestamp,
        data: {
          ...baseData,
          appointment: {
            id: `apt_test_${crypto.randomUUID().substring(0, 8)}`,
            type: "Consultation",
            status: "cancelled",
            scheduledDate: new Date(Date.now() + 86400000)
              .toISOString()
              .split("T")[0],
            scheduledTime: "15:00",
            timezone: "America/New_York",
            cancelledAt: timestamp,
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Jane Smith",
            phone: "+15555559876",
            email: "jane.smith@example.com",
          },
          cancelReason: "Customer requested cancellation",
          cancelledBy: "customer",
        },
      };

    case "appointment.rescheduled":
      return {
        event: "appointment.rescheduled",
        timestamp,
        data: {
          ...baseData,
          appointment: {
            id: `apt_test_${crypto.randomUUID().substring(0, 8)}`,
            type: "Product Demo",
            status: "rescheduled",
            originalDate: new Date(Date.now() + 86400000)
              .toISOString()
              .split("T")[0],
            originalTime: "10:00",
            newDate: new Date(Date.now() + 86400000 * 3)
              .toISOString()
              .split("T")[0],
            newTime: "14:00",
            timezone: "America/New_York",
            rescheduledAt: timestamp,
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Michael Brown",
            phone: "+15555559876",
            email: "michael.brown@example.com",
          },
          rescheduleReason: "Conflict with another meeting",
          rescheduledBy: "customer",
        },
      };

    case "appointment.completed":
      return {
        event: "appointment.completed",
        timestamp,
        data: {
          ...baseData,
          appointment: {
            id: `apt_test_${crypto.randomUUID().substring(0, 8)}`,
            type: "Product Demo",
            status: "completed",
            scheduledDate: new Date().toISOString().split("T")[0],
            scheduledTime: "10:00",
            timezone: "America/New_York",
            duration: 30,
            completedAt: timestamp,
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Michael Brown",
            phone: "+15555559876",
            email: "michael.brown@example.com",
          },
          outcome: {
            status: "successful",
            notes: "Customer was impressed with demo, requested follow-up",
          },
        },
      };

    case "appointment.no_show":
      return {
        event: "appointment.no_show",
        timestamp,
        data: {
          ...baseData,
          appointment: {
            id: `apt_test_${crypto.randomUUID().substring(0, 8)}`,
            type: "Consultation",
            status: "no_show",
            scheduledDate: new Date().toISOString().split("T")[0],
            scheduledTime: "14:00",
            timezone: "America/New_York",
            markedNoShowAt: timestamp,
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Robert Wilson",
            phone: "+15555559876",
            email: "robert.wilson@example.com",
          },
          followUpAction: "Attempt to reschedule",
        },
      };

    case "form.submitted":
      return {
        event: "form.submitted",
        timestamp,
        data: {
          ...baseData,
          form: {
            id: `form_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Lead Qualification Form",
            submittedAt: timestamp,
          },
          submission: {
            id: `submission_test_${crypto.randomUUID().substring(0, 8)}`,
            fields: {
              full_name: "Sarah Williams",
              email: "sarah.williams@example.com",
              phone: "+15555559876",
              company: "Williams & Associates",
              company_size: "50-100 employees",
              annual_revenue: "$5M - $10M",
              current_solution: "Manual outreach",
              pain_points: "Time-consuming, inconsistent results",
              budget_range: "$1,000 - $5,000/month",
              decision_timeline: "1-3 months",
              preferred_contact_method: "Email",
              additional_notes: "Looking to scale outreach efforts for Q2",
            },
            completionTime: 180,
            completionPercentage: 100,
          },
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Sarah Williams",
            phone: "+15555559876",
            email: "sarah.williams@example.com",
          },
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            conversationId: `conv_test_${crypto.randomUUID().substring(0, 8)}`,
            duration: 210,
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Lead Qualification Campaign",
          },
          qualification: {
            score: 85,
            grade: "A",
            recommended_action: "Schedule demo call",
          },
        },
      };

    case "form.lead_created":
      return {
        event: "form.lead_created",
        timestamp,
        data: {
          ...baseData,
          lead: {
            id: `lead_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "David Johnson",
            email: "david.johnson@example.com",
            phone: "+15555559876",
            company: "Johnson Enterprises",
            source: "AI Voice Agent",
            status: "new",
            createdAt: timestamp,
          },
          form: {
            id: `form_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Lead Capture Form",
          },
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            duration: 180,
          },
          qualification: {
            score: 75,
            grade: "B",
            tags: ["enterprise", "demo-requested"],
          },
        },
      };

    case "webhook.test":
    default:
      return {
        event: "webhook.test",
        timestamp,
        data: {
          ...baseData,
          message: "This is a comprehensive test webhook from Wtrops.ai",
          sampleEvents: WEBHOOK_EVENT_TYPES.filter((e) => e !== "webhook.test"),
          documentation:
            "Each event type contains detailed structured data. Subscribe to specific events to receive real-time notifications.",
          contact: {
            id: `contact_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test User",
            phone: "+15555551234",
            email: "test@example.com",
            company: "Test Company Inc.",
          },
          call: {
            id: `call_test_${crypto.randomUUID().substring(0, 8)}`,
            conversationId: `conv_test_${crypto.randomUUID().substring(0, 8)}`,
            callSid: `CA${crypto.randomBytes(16).toString("hex")}`,
            status: "completed",
            duration: 120,
            durationMinutes: 2,
            classification: "Warm Lead",
            sentiment: "positive",
            transcript: "Sample transcript of the conversation...",
            summary: "Test call completed successfully with positive outcome.",
            recordingUrl: "https://example.com/recordings/test.mp3",
          },
          campaign: {
            id: `campaign_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Campaign",
            status: "running",
          },
          agent: {
            id: `agent_test_${crypto.randomUUID().substring(0, 8)}`,
            name: "Test Agent",
            type: "natural",
          },
          collectedData: {
            product_interest: "AI Voice Agents",
            budget: "$5,000/month",
            timeline: "Q1 2025",
            decision_maker: true,
          },
        },
      };
  }
}

export class WebhookTestService {
  private generateSignature(
    payload: string,
    secret: string,
    timestamp: string,
  ): string {
    const signaturePayload = timestamp + payload;
    return crypto
      .createHmac("sha256", secret)
      .update(signaturePayload)
      .digest("hex");
  }

  private buildHeaders(
    webhook: Webhook,
    payload: string,
    timestamp: string,
  ): Record<string, string> {
    const signature = this.generateSignature(
      payload,
      webhook.secret,
      timestamp,
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Wtrops.ai-Webhook/1.0",
      "X-Webhook-Signature": signature,
      "X-Webhook-Timestamp": timestamp,
      "X-Webhook-Event": "webhook.test",
      "X-Webhook-Delivery": crypto.randomUUID(),
    };

    if (webhook.authType === "bearer" && webhook.authCredentials) {
      const creds = webhook.authCredentials as { token?: string };
      if (creds.token) {
        headers["Authorization"] = `Bearer ${creds.token}`;
      }
    } else if (webhook.authType === "basic" && webhook.authCredentials) {
      const creds = webhook.authCredentials as {
        username?: string;
        password?: string;
      };
      if (creds.username) {
        const basicAuth = Buffer.from(
          `${creds.username}:${creds.password || ""}`,
        ).toString("base64");
        headers["Authorization"] = `Basic ${basicAuth}`;
      }
    }

    if (webhook.headers) {
      Object.assign(headers, webhook.headers as Record<string, string>);
    }

    return headers;
  }

  async testWebhook(
    webhookId: string,
    userId: string,
  ): Promise<WebhookTestResult> {
    console.log(`🧪 [WebhookTest] Testing webhook ${webhookId}`);

    const webhook = await storage.getWebhook(webhookId);

    if (!webhook) {
      console.log(
        `❌ [WebhookTest] Webhook ${webhookId} not found in database`,
      );
      return {
        success: false,
        responseTime: 0,
        error: "Webhook not found. It may have been deleted.",
        message: "Webhook not found",
      };
    }

    if (webhook.userId !== userId) {
      console.log(`❌ [WebhookTest] Access denied for webhook ${webhookId}`);
      return {
        success: false,
        responseTime: 0,
        error: "Access denied",
        message: "You do not have permission to test this webhook",
      };
    }

    const testPayload = generateComprehensiveTestPayload("webhook.test");
    const timestamp = testPayload.timestamp;
    const payloadString = JSON.stringify(testPayload);
    const headers = this.buildHeaders(webhook, payloadString, timestamp);

    const startTime = Date.now();
    let result: WebhookTestResult;

    try {
      console.log(`📤 [WebhookTest] Sending to ${webhook.url}`);

      const response = await fetch(webhook.url, {
        method: webhook.method || "POST",
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000),
      });

      const responseTime = Date.now() - startTime;
      let responseBody = "";

      try {
        responseBody = await response.text();
        if (responseBody.length > 2000) {
          responseBody = responseBody.substring(0, 2000) + "...[truncated]";
        }
      } catch {
        responseBody = "Unable to read response body";
      }

      if (response.ok) {
        console.log(
          `✅ [WebhookTest] Success - Status: ${response.status}, Time: ${responseTime}ms`,
        );
        result = {
          success: true,
          status: response.status,
          responseTime,
          responseBody,
          message: "Test webhook sent successfully",
        };
      } else {
        console.log(
          `⚠️ [WebhookTest] Failed - Status: ${response.status}, Time: ${responseTime}ms`,
        );
        result = {
          success: false,
          status: response.status,
          responseTime,
          responseBody,
          error: `Webhook endpoint returned ${response.status}: ${response.statusText}`,
          message: "Webhook endpoint returned an error",
        };
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error.name === "TimeoutError"
          ? "Request timed out after 30 seconds"
          : error.message || "Unknown error";

      console.error(`❌ [WebhookTest] Error: ${errorMessage}`);

      result = {
        success: false,
        responseTime,
        error: errorMessage,
        message: "Failed to send test webhook",
      };
    }

    await this.logDelivery(webhook, testPayload, result);

    return result;
  }

  private async logDelivery(
    webhook: Webhook,
    payload: any,
    result: WebhookTestResult,
  ): Promise<void> {
    try {
      const existingWebhook = await storage.getWebhook(webhook.id);
      if (!existingWebhook) {
        console.log(
          `⚠️ [WebhookTest] Webhook ${webhook.id} no longer exists, skipping log`,
        );
        return;
      }

      const logData: InsertWebhookLog = {
        webhookId: webhook.id,
        event: "webhook.test",
        payload: payload,
        success: result.success,
        httpStatus: result.status || null,
        responseBody: result.responseBody || null,
        responseTime: result.responseTime || null,
        error: result.error || null,
        attemptNumber: 1,
        maxAttempts: 1,
        nextRetryAt: null,
      };

      await storage.createWebhookLog(logData);
      console.log(`📝 [WebhookTest] Logged delivery for webhook ${webhook.id}`);
    } catch (error) {
      console.error(
        `⚠️ [WebhookTest] Failed to log delivery (non-fatal):`,
        error,
      );
    }
  }
}

export const webhookTestService = new WebhookTestService();
