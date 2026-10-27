import { db } from "../../db";
import {
  taskTemplates,
  taskTemplateVersions,
  taskApiKeys,
  taskExecutions,
  taskExecutionEvents,
  taskIntegrations,
  taskAutomationRules,
  taskIntegrationRuns,
  taskContainers,
} from "@wtrops/shared";
import { eq, and, desc, asc, sql, inArray } from "drizzle-orm";
import type {
  TaskTemplate,
  InsertTaskTemplate,
  TaskTemplateVersion,
  InsertTaskTemplateVersion,
  TaskApiKey,
  InsertTaskApiKey,
  TaskExecution,
  InsertTaskExecution,
  TaskExecutionEvent,
  InsertTaskExecutionEvent,
  TaskIntegration,
  InsertTaskIntegration,
  TaskAutomationRule,
  InsertTaskAutomationRule,
  TaskIntegrationRun,
  InsertTaskIntegrationRun,
  TaskContainer,
  InsertTaskContainer,
} from "@wtrops/shared";

// ── Task Templates ──────────────────────────────

export class TaskTemplateStorage {
  async create(data: InsertTaskTemplate): Promise<TaskTemplate> {
    const [t] = await db.insert(taskTemplates).values(data).returning();
    return t;
  }

  async getById(id: string): Promise<TaskTemplate | null> {
    const [t] = await db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.id, id))
      .limit(1);
    return t || null;
  }

  async getByUser(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<TaskTemplate[]> {
    return db
      .select()
      .from(taskTemplates)
      .where(
        and(
          eq(taskTemplates.userId, userId),
          eq(taskTemplates.isArchived, false),
        ),
      )
      .orderBy(desc(taskTemplates.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async update(
    id: string,
    userId: string,
    data: Partial<InsertTaskTemplate>,
  ): Promise<TaskTemplate | null> {
    const [t] = await db
      .update(taskTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(taskTemplates.id, id), eq(taskTemplates.userId, userId)),
      )
      .returning();
    return t || null;
  }

  async archive(id: string, userId: string): Promise<boolean> {
    const [t] = await db
      .update(taskTemplates)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(
        and(eq(taskTemplates.id, id), eq(taskTemplates.userId, userId)),
      )
      .returning();
    return !!t;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const [t] = await db
      .delete(taskTemplates)
      .where(
        and(eq(taskTemplates.id, id), eq(taskTemplates.userId, userId)),
      )
      .returning();
    return !!t;
  }
}

// ── Task Template Versions ──────────────────────

export class TaskTemplateVersionStorage {
  async create(data: InsertTaskTemplateVersion): Promise<TaskTemplateVersion> {
    const [v] = await db
      .insert(taskTemplateVersions)
      .values(data)
      .returning();
    return v;
  }

  async getById(id: string): Promise<TaskTemplateVersion | null> {
    const [v] = await db
      .select()
      .from(taskTemplateVersions)
      .where(eq(taskTemplateVersions.id, id))
      .limit(1);
    return v || null;
  }

  async getByTemplate(templateId: string): Promise<TaskTemplateVersion[]> {
    return db
      .select()
      .from(taskTemplateVersions)
      .where(eq(taskTemplateVersions.templateId, templateId))
      .orderBy(desc(taskTemplateVersions.version));
  }

  async getLatestVersion(templateId: string): Promise<number> {
    const [result] = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${taskTemplateVersions.version}), 0)` })
      .from(taskTemplateVersions)
      .where(eq(taskTemplateVersions.templateId, templateId));
    return result?.maxVersion ?? 0;
  }

  async getPublished(templateId: string): Promise<TaskTemplateVersion | null> {
    const [v] = await db
      .select()
      .from(taskTemplateVersions)
      .where(
        and(
          eq(taskTemplateVersions.templateId, templateId),
          eq(taskTemplateVersions.status, "published"),
        ),
      )
      .orderBy(desc(taskTemplateVersions.version))
      .limit(1);
    return v || null;
  }

  async update(
    id: string,
    data: Partial<InsertTaskTemplateVersion>,
  ): Promise<TaskTemplateVersion | null> {
    const [v] = await db
      .update(taskTemplateVersions)
      .set(data)
      .where(eq(taskTemplateVersions.id, id))
      .returning();
    return v || null;
  }

  async delete(id: string): Promise<boolean> {
    const [v] = await db
      .delete(taskTemplateVersions)
      .where(eq(taskTemplateVersions.id, id))
      .returning();
    return !!v;
  }
}

// ── Task API Keys ───────────────────────────────

export class TaskApiKeyStorage {
  async create(data: InsertTaskApiKey): Promise<TaskApiKey> {
    const [k] = await db.insert(taskApiKeys).values(data).returning();
    return k;
  }

  async getById(id: string): Promise<TaskApiKey | null> {
    const [k] = await db
      .select()
      .from(taskApiKeys)
      .where(eq(taskApiKeys.id, id))
      .limit(1);
    return k || null;
  }

  async getByUser(userId: string): Promise<TaskApiKey[]> {
    return db
      .select()
      .from(taskApiKeys)
      .where(eq(taskApiKeys.userId, userId))
      .orderBy(desc(taskApiKeys.createdAt));
  }

  async update(
    id: string,
    userId: string,
    data: Partial<InsertTaskApiKey>,
  ): Promise<TaskApiKey | null> {
    const [k] = await db
      .update(taskApiKeys)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(taskApiKeys.id, id), eq(taskApiKeys.userId, userId)))
      .returning();
    return k || null;
  }

  async updateLastUsed(id: string): Promise<void> {
    await db
      .update(taskApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(taskApiKeys.id, id));
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const [k] = await db
      .delete(taskApiKeys)
      .where(and(eq(taskApiKeys.id, id), eq(taskApiKeys.userId, userId)))
      .returning();
    return !!k;
  }
}

// ── Task Executions ─────────────────────────────

export class TaskExecutionStorage {
  async create(data: InsertTaskExecution): Promise<TaskExecution> {
    const [e] = await db.insert(taskExecutions).values(data).returning();
    return e;
  }

  async getById(id: string): Promise<TaskExecution | null> {
    const [e] = await db
      .select()
      .from(taskExecutions)
      .where(eq(taskExecutions.id, id))
      .limit(1);
    return e || null;
  }

  async getByUser(
    userId: string,
    limit = 50,
    offset = 0,
    status?: string,
  ): Promise<TaskExecution[]> {
    const conditions = [eq(taskExecutions.userId, userId)];
    if (status) conditions.push(eq(taskExecutions.status, status));

    return db
      .select()
      .from(taskExecutions)
      .where(and(...conditions))
      .orderBy(desc(taskExecutions.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getByTemplate(
    templateId: string,
    limit = 20,
  ): Promise<TaskExecution[]> {
    return db
      .select()
      .from(taskExecutions)
      .where(eq(taskExecutions.templateId, templateId))
      .orderBy(desc(taskExecutions.createdAt))
      .limit(limit);
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: Partial<TaskExecution>,
  ): Promise<TaskExecution | null> {
    const [e] = await db
      .update(taskExecutions)
      .set({ status, ...extra })
      .where(eq(taskExecutions.id, id))
      .returning();
    return e || null;
  }

  async setOutput(
    id: string,
    outputData: any,
    rawOutput: string,
    metadata?: any,
  ): Promise<TaskExecution | null> {
    const [e] = await db
      .update(taskExecutions)
      .set({
        outputData,
        rawOutput,
        metadata,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(taskExecutions.id, id))
      .returning();
    return e || null;
  }

  async setError(
    id: string,
    errorMessage: string,
  ): Promise<TaskExecution | null> {
    const [e] = await db
      .update(taskExecutions)
      .set({
        errorMessage,
        status: "failed",
        completedAt: new Date(),
      })
      .where(eq(taskExecutions.id, id))
      .returning();
    return e || null;
  }

  async cancel(id: string): Promise<TaskExecution | null> {
    const [e] = await db
      .update(taskExecutions)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(taskExecutions.id, id))
      .returning();
    return e || null;
  }

  async getRunningByUser(userId: string): Promise<TaskExecution[]> {
    return db
      .select()
      .from(taskExecutions)
      .where(
        and(
          eq(taskExecutions.userId, userId),
          inArray(taskExecutions.status, [
            "queued",
            "starting",
            "running",
            "completing",
          ]),
        ),
      );
  }
}

// ── Task Execution Events ───────────────────────

export class TaskExecutionEventStorage {
  async create(data: InsertTaskExecutionEvent): Promise<TaskExecutionEvent> {
    const [ev] = await db
      .insert(taskExecutionEvents)
      .values(data)
      .returning();
    return ev;
  }

  async getByExecution(
    executionId: string,
    afterTimestamp?: Date,
  ): Promise<TaskExecutionEvent[]> {
    const conditions = [eq(taskExecutionEvents.executionId, executionId)];
    if (afterTimestamp) {
      conditions.push(
        sql`${taskExecutionEvents.timestamp} > ${afterTimestamp}`,
      );
    }

    return db
      .select()
      .from(taskExecutionEvents)
      .where(and(...conditions))
      .orderBy(asc(taskExecutionEvents.timestamp));
  }
}

// ── Task Integrations ───────────────────────────

export class TaskIntegrationStorage {
  async create(data: InsertTaskIntegration): Promise<TaskIntegration> {
    const [i] = await db.insert(taskIntegrations).values(data).returning();
    return i;
  }

  async getById(id: string): Promise<TaskIntegration | null> {
    const [i] = await db
      .select()
      .from(taskIntegrations)
      .where(eq(taskIntegrations.id, id))
      .limit(1);
    return i || null;
  }

  async getByUser(userId: string): Promise<TaskIntegration[]> {
    return db
      .select()
      .from(taskIntegrations)
      .where(eq(taskIntegrations.userId, userId))
      .orderBy(desc(taskIntegrations.createdAt));
  }

  async update(
    id: string,
    userId: string,
    data: Partial<InsertTaskIntegration>,
  ): Promise<TaskIntegration | null> {
    const [i] = await db
      .update(taskIntegrations)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(taskIntegrations.id, id),
          eq(taskIntegrations.userId, userId),
        ),
      )
      .returning();
    return i || null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const [i] = await db
      .delete(taskIntegrations)
      .where(
        and(
          eq(taskIntegrations.id, id),
          eq(taskIntegrations.userId, userId),
        ),
      )
      .returning();
    return !!i;
  }
}

// ── Task Automation Rules ───────────────────────

export class TaskAutomationRuleStorage {
  async create(data: InsertTaskAutomationRule): Promise<TaskAutomationRule> {
    const [r] = await db
      .insert(taskAutomationRules)
      .values(data)
      .returning();
    return r;
  }

  async getById(id: string): Promise<TaskAutomationRule | null> {
    const [r] = await db
      .select()
      .from(taskAutomationRules)
      .where(eq(taskAutomationRules.id, id))
      .limit(1);
    return r || null;
  }

  async getByUser(userId: string): Promise<TaskAutomationRule[]> {
    return db
      .select()
      .from(taskAutomationRules)
      .where(eq(taskAutomationRules.userId, userId))
      .orderBy(desc(taskAutomationRules.createdAt));
  }

  async getActive(): Promise<TaskAutomationRule[]> {
    return db
      .select()
      .from(taskAutomationRules)
      .where(eq(taskAutomationRules.isActive, true));
  }

  async update(
    id: string,
    userId: string,
    data: Partial<InsertTaskAutomationRule>,
  ): Promise<TaskAutomationRule | null> {
    const [r] = await db
      .update(taskAutomationRules)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(taskAutomationRules.id, id),
          eq(taskAutomationRules.userId, userId),
        ),
      )
      .returning();
    return r || null;
  }

  async updateRunTimes(
    id: string,
    lastRunAt: Date,
    nextRunAt: Date | null,
  ): Promise<void> {
    await db
      .update(taskAutomationRules)
      .set({ lastRunAt, nextRunAt, updatedAt: new Date() })
      .where(eq(taskAutomationRules.id, id));
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const [r] = await db
      .delete(taskAutomationRules)
      .where(
        and(
          eq(taskAutomationRules.id, id),
          eq(taskAutomationRules.userId, userId),
        ),
      )
      .returning();
    return !!r;
  }
}

// ── Task Integration Runs ───────────────────────

export class TaskIntegrationRunStorage {
  async create(data: InsertTaskIntegrationRun): Promise<TaskIntegrationRun> {
    const [r] = await db
      .insert(taskIntegrationRuns)
      .values(data)
      .returning();
    return r;
  }

  async getById(id: string): Promise<TaskIntegrationRun | null> {
    const [r] = await db
      .select()
      .from(taskIntegrationRuns)
      .where(eq(taskIntegrationRuns.id, id))
      .limit(1);
    return r || null;
  }

  async getByIntegration(integrationId: string): Promise<TaskIntegrationRun[]> {
    return db
      .select()
      .from(taskIntegrationRuns)
      .where(eq(taskIntegrationRuns.integrationId, integrationId))
      .orderBy(desc(taskIntegrationRuns.createdAt))
      .limit(20);
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: Partial<TaskIntegrationRun>,
  ): Promise<TaskIntegrationRun | null> {
    const [r] = await db
      .update(taskIntegrationRuns)
      .set({ status, ...extra })
      .where(eq(taskIntegrationRuns.id, id))
      .returning();
    return r || null;
  }
}

// ── Task Containers ─────────────────────────────

export class TaskContainerStorage {
  async create(data: InsertTaskContainer): Promise<TaskContainer> {
    const [c] = await db.insert(taskContainers).values(data).returning();
    return c;
  }

  async getById(id: string): Promise<TaskContainer | null> {
    const [c] = await db
      .select()
      .from(taskContainers)
      .where(eq(taskContainers.id, id))
      .limit(1);
    return c || null;
  }

  async getByExecution(executionId: string): Promise<TaskContainer | null> {
    const [c] = await db
      .select()
      .from(taskContainers)
      .where(eq(taskContainers.executionId, executionId))
      .limit(1);
    return c || null;
  }

  async getRunning(): Promise<TaskContainer[]> {
    return db
      .select()
      .from(taskContainers)
      .where(
        inArray(taskContainers.status, ["creating", "starting", "running"]),
      );
  }

  async getRunningByUser(userId: string): Promise<TaskContainer[]> {
    return db
      .select()
      .from(taskContainers)
      .where(
        and(
          eq(taskContainers.userId, userId),
          inArray(taskContainers.status, ["creating", "starting", "running"]),
        ),
      );
  }

  async updateStatus(
    id: string,
    status: string,
    extra?: Partial<TaskContainer>,
  ): Promise<TaskContainer | null> {
    const [c] = await db
      .update(taskContainers)
      .set({ status, ...extra })
      .where(eq(taskContainers.id, id))
      .returning();
    return c || null;
  }
}

// ── Singleton Exports ───────────────────────────

export const templateStorage = new TaskTemplateStorage();
export const versionStorage = new TaskTemplateVersionStorage();
export const apiKeyStorage = new TaskApiKeyStorage();
export const executionStorage = new TaskExecutionStorage();
export const eventStorage = new TaskExecutionEventStorage();
export const integrationStorage = new TaskIntegrationStorage();
export const automationRuleStorage = new TaskAutomationRuleStorage();
export const integrationRunStorage = new TaskIntegrationRunStorage();
export const containerStorage = new TaskContainerStorage();
