import { logger } from "../../utils/logger";
import {
  integrationStorage,
  integrationRunStorage,
} from "./task-storage";
import type {
  TaskIntegration,
  InsertTaskIntegration,
  TaskIntegrationRun,
} from "@wtrops/shared";

const SOURCE = "IntegrationService";

// ── Integration CRUD ────────────────────────────

export async function createIntegration(
  userId: string,
  data: Omit<InsertTaskIntegration, "userId">,
): Promise<TaskIntegration> {
  const integration = await integrationStorage.create({ ...data, userId });
  logger.info(SOURCE, `Created integration ${integration.id} (${data.type})`);
  return integration;
}

export async function getIntegration(
  id: string,
): Promise<TaskIntegration | null> {
  return integrationStorage.getById(id);
}

export async function getUserIntegrations(
  userId: string,
): Promise<TaskIntegration[]> {
  return integrationStorage.getByUser(userId);
}

export async function updateIntegration(
  id: string,
  userId: string,
  data: Partial<InsertTaskIntegration>,
): Promise<TaskIntegration | null> {
  const integration = await integrationStorage.update(id, userId, data);
  if (integration) {
    logger.info(SOURCE, `Updated integration ${id}`);
  }
  return integration;
}

export async function deleteIntegration(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await integrationStorage.delete(id, userId);
  if (result) {
    logger.info(SOURCE, `Deleted integration ${id}`);
  }
  return result;
}

// ── Data Pull Logic ─────────────────────────────

export async function pullData(
  integration: TaskIntegration,
  automationRuleId?: string,
): Promise<TaskIntegrationRun> {
  const run = await integrationRunStorage.create({
    integrationId: integration.id,
    automationRuleId: automationRuleId || null,
    status: "pulling",
  });

  await integrationRunStorage.updateStatus(run.id, "pulling", {
    startedAt: new Date(),
  });

  try {
    let data: any;

    switch (integration.type) {
      case "webhook":
        // Webhooks push data; nothing to pull
        data = null;
        break;

      case "api_pull":
        data = await pullFromApi(integration);
        break;

      case "s3":
        data = await pullFromS3(integration);
        break;

      case "google_drive":
        data = await pullFromGoogleDrive(integration);
        break;

      case "database":
        data = await pullFromDatabase(integration);
        break;

      case "custom":
        data = await pullCustom(integration);
        break;

      default:
        throw new Error(`Unsupported integration type: ${integration.type}`);
    }

    const completedRun = await integrationRunStorage.updateStatus(
      run.id,
      "success",
      {
        data,
        completedAt: new Date(),
      },
    );

    // Update integration last sync
    await integrationStorage.update(integration.id, integration.userId, {
      lastSyncAt: new Date(),
    } as any);

    logger.info(SOURCE, `Data pull completed for integration ${integration.id}`);
    return completedRun!;
  } catch (err: any) {
    logger.error(
      SOURCE,
      `Data pull failed for integration ${integration.id}: ${err.message}`,
    );
    await integrationRunStorage.updateStatus(run.id, "failed", {
      errorMessage: err.message,
      completedAt: new Date(),
    });
    throw err;
  }
}

async function pullFromApi(
  integration: TaskIntegration,
): Promise<any> {
  const config = integration.config as any;
  if (!config?.url) throw new Error("API URL not configured");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers || {}),
  };

  // Add auth headers if configured
  const authConfig = integration.authConfig as any;
  if (authConfig?.type === "bearer" && authConfig.token) {
    headers["Authorization"] = `Bearer ${authConfig.token}`;
  } else if (authConfig?.type === "api_key" && authConfig.key) {
    headers[authConfig.headerName || "X-API-Key"] = authConfig.key;
  }

  const response = await fetch(config.url, {
    method: config.method || "GET",
    headers,
    body: config.body ? JSON.stringify(config.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function pullFromS3(_integration: TaskIntegration): Promise<any> {
  // S3 pull implementation — requires aws-sdk
  logger.warn(SOURCE, "S3 pull not yet implemented");
  return { message: "S3 pull pending implementation" };
}

async function pullFromGoogleDrive(
  _integration: TaskIntegration,
): Promise<any> {
  logger.warn(SOURCE, "Google Drive pull not yet implemented");
  return { message: "Google Drive pull pending implementation" };
}

async function pullFromDatabase(
  _integration: TaskIntegration,
): Promise<any> {
  logger.warn(SOURCE, "Database pull not yet implemented");
  return { message: "Database pull pending implementation" };
}

async function pullCustom(integration: TaskIntegration): Promise<any> {
  // Custom is same as API pull but with user-defined body template
  return pullFromApi(integration);
}

// ── Test Connection ─────────────────────────────

export async function testConnection(
  integration: TaskIntegration,
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const start = Date.now();

  try {
    switch (integration.type) {
      case "api_pull":
      case "custom": {
        const config = integration.config as any;
        if (!config?.url) return { success: false, message: "No URL configured" };
        const res = await fetch(config.url, {
          method: "HEAD",
          signal: AbortSignal.timeout(10000),
        });
        return {
          success: res.ok,
          message: res.ok ? "Connection successful" : `HTTP ${res.status}`,
          latencyMs: Date.now() - start,
        };
      }

      case "webhook":
        return {
          success: true,
          message: "Webhook integrations accept incoming data — no outbound connection to test",
        };

      default:
        return {
          success: false,
          message: `Connection test not yet supported for type: ${integration.type}`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      message: err.message,
      latencyMs: Date.now() - start,
    };
  }
}

export async function getIntegrationRuns(
  integrationId: string,
): Promise<TaskIntegrationRun[]> {
  return integrationRunStorage.getByIntegration(integrationId);
}
