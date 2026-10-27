/**
 * Universal Webhook Tool Builder
 *
 * Creates webhook tools that automatically include:
 * - Caller phone number
 * - Conversation ID and Call SID
 * - All conversation data collected from questions, forms, appointments
 * - Any custom payload fields defined in the flow builder
 *
 * This ensures webhooks work dynamically with any flow structure
 * without hardcoding specific fields.
 */

export interface WebhookNodeConfig {
  toolId: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  payload?: Record<string, any>;
  description?: string;
}

export interface UniversalWebhookTool {
  type: "webhook";
  name: string;
  description: string;
  api_schema: {
    url: string;
    method: "GET" | "POST";
    request_headers: Record<string, string>;
    request_body_schema?: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * Build a universal webhook tool that captures all conversation data
 *
 * The schema includes:
 * 1. Core call metadata (always included) - caller phone, conversation ID, call SID, timestamps
 * 2. Collected conversation data (dynamic object)
 * 3. Custom payload fields (from flow builder config)
 */
export function buildUniversalWebhookTool(
  config: WebhookNodeConfig,
): UniversalWebhookTool {
  // Only GET and POST are supported for webhook tools
  const httpMethod =
    config.method === "GET" ? ("GET" as const) : ("POST" as const);

  // For GET requests, don't include request_body_schema
  if (httpMethod === "GET") {
    return {
      type: "webhook",
      name: config.toolId,
      description:
        config.description ||
        `Send a GET request to fetch data from ${config.url}`,
      api_schema: {
        url: config.url,
        method: httpMethod,
        request_headers: config.headers || {
          "Content-Type": "application/json",
        },
      },
    };
  }

  // Core properties always included in every POST webhook
  const coreProperties: Record<string, any> = {
    // Caller information
    caller_phone: {
      type: "string",
      description:
        "The phone number of the caller. This is the number that initiated or received the call. Include country code if known. ALWAYS populate this field.",
    },
    caller_name: {
      type: "string",
      description:
        "The name of the caller if collected during the conversation.",
    },
    // Call metadata - critical identifiers
    conversation_id: {
      type: "string",
      description: "The unique conversation ID for this call session.",
    },
    call_sid: {
      type: "string",
      description:
        "The Twilio Call SID if this is a phone call. Available from the call context.",
    },
    timestamp: {
      type: "string",
      description:
        "The current timestamp in ISO 8601 format (e.g., 2024-01-15T14:30:00Z). Generate this at the time of webhook execution.",
    },
    // Conversation context
    conversation_summary: {
      type: "string",
      description:
        "A brief summary of the entire conversation, including what was discussed and any decisions made.",
    },
    // Collected data - flexible object for any flow structure
    collected_data: {
      type: "object",
      description:
        "All data collected during the conversation. Include EVERY piece of information the user provided: answers to questions, form field values, appointment details, preferences, contact info, etc. Use descriptive keys like 'product_name', 'quantity', 'delivery_address', 'email', 'preferred_date', etc. This object should contain all conversational data gathered during the call.",
    },
  };

  // Add any custom payload fields from the flow builder config
  const customProperties: Record<string, any> = {};
  if (config.payload && Object.keys(config.payload).length > 0) {
    for (const [key, value] of Object.entries(config.payload)) {
      // Determine type from the configured value
      const valueType =
        typeof value === "number"
          ? "number"
          : typeof value === "boolean"
            ? "boolean"
            : "string";

      customProperties[key] = {
        type: valueType,
        description: `Custom field: ${key}. Default value: ${JSON.stringify(value)}`,
      };
    }
  }

  // Combine all properties
  const allProperties = {
    ...coreProperties,
    ...customProperties,
  };

  // Build descriptive tool description
  const customFieldsList =
    Object.keys(customProperties).length > 0
      ? `\n\nCustom fields to include: ${Object.keys(customProperties).join(", ")}`
      : "";

  const toolDescription =
    config.description ||
    `Send collected conversation data to the webhook endpoint. ` +
      `ALWAYS include: the caller's phone number (caller_phone), conversation_id, call_sid if available, timestamp, ` +
      `a summary of the conversation, and ALL data collected during the call in the collected_data object. ` +
      `The collected_data should contain every answer, form response, appointment detail, preference, ` +
      `and any other information the caller provided during this conversation.${customFieldsList}`;

  return {
    type: "webhook",
    name: config.toolId,
    description: toolDescription,
    api_schema: {
      url: config.url,
      method: httpMethod,
      request_headers: config.headers || { "Content-Type": "application/json" },
      request_body_schema: {
        type: "object",
        properties: allProperties,
        required: ["caller_phone", "collected_data"],
      },
    },
  };
}

/**
 * Build webhook tools from an array of webhook node configs
 */
export function buildUniversalWebhookTools(
  webhookNodes: WebhookNodeConfig[],
): UniversalWebhookTool[] {
  return webhookNodes
    .filter((node) => node.url) // Only include nodes with valid URLs
    .map((node) => buildUniversalWebhookTool(node));
}

console.log("🔗 [Universal Webhook] Service loaded");
