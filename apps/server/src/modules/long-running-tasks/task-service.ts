import { logger } from "../../utils/logger";
import { templateStorage, versionStorage } from "./task-storage";
import type {
  TaskTemplate,
  InsertTaskTemplate,
  TaskTemplateVersion,
  InsertTaskTemplateVersion,
} from "@wtrops/shared";

const SOURCE = "TaskService";

// ── Template CRUD ───────────────────────────────

export async function createTemplate(
  userId: string,
  data: Omit<InsertTaskTemplate, "userId">,
): Promise<TaskTemplate> {
  const template = await templateStorage.create({ ...data, userId });
  logger.info(SOURCE, `Created template ${template.id} for user ${userId}`);
  return template;
}

export async function getTemplate(id: string): Promise<TaskTemplate | null> {
  return templateStorage.getById(id);
}

export async function getUserTemplates(
  userId: string,
  limit?: number,
  offset?: number,
): Promise<TaskTemplate[]> {
  return templateStorage.getByUser(userId, limit, offset);
}

export async function updateTemplate(
  id: string,
  userId: string,
  data: Partial<InsertTaskTemplate>,
): Promise<TaskTemplate | null> {
  const template = await templateStorage.update(id, userId, data);
  if (template) {
    logger.info(SOURCE, `Updated template ${id}`);
  }
  return template;
}

export async function archiveTemplate(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await templateStorage.archive(id, userId);
  if (result) {
    logger.info(SOURCE, `Archived template ${id}`);
  }
  return result;
}

export async function deleteTemplate(
  id: string,
  userId: string,
): Promise<boolean> {
  const result = await templateStorage.delete(id, userId);
  if (result) {
    logger.info(SOURCE, `Deleted template ${id}`);
  }
  return result;
}

// ── Version Management ──────────────────────────

export async function createVersion(
  templateId: string,
  userId: string,
  data: Omit<InsertTaskTemplateVersion, "templateId" | "version" | "createdBy">,
): Promise<TaskTemplateVersion> {
  const latestVersion = await versionStorage.getLatestVersion(templateId);
  const version = await versionStorage.create({
    ...data,
    templateId,
    version: latestVersion + 1,
    createdBy: userId,
  });
  logger.info(
    SOURCE,
    `Created version ${version.version} for template ${templateId}`,
  );
  return version;
}

export async function getVersion(
  id: string,
): Promise<TaskTemplateVersion | null> {
  return versionStorage.getById(id);
}

export async function getTemplateVersions(
  templateId: string,
): Promise<TaskTemplateVersion[]> {
  return versionStorage.getByTemplate(templateId);
}

export async function getPublishedVersion(
  templateId: string,
): Promise<TaskTemplateVersion | null> {
  return versionStorage.getPublished(templateId);
}

export async function updateVersion(
  id: string,
  data: Partial<InsertTaskTemplateVersion>,
): Promise<TaskTemplateVersion | null> {
  const version = await versionStorage.update(id, data);
  if (version) {
    logger.info(SOURCE, `Updated version ${id}`);
  }
  return version;
}

export async function publishVersion(
  id: string,
  templateId: string,
): Promise<TaskTemplateVersion | null> {
  // Archive any currently published version for this template
  const currentPublished = await versionStorage.getPublished(templateId);
  if (currentPublished) {
    await versionStorage.update(currentPublished.id, { status: "archived" });
  }

  const version = await versionStorage.update(id, {
    status: "published",
    publishedAt: new Date(),
  });
  if (version) {
    logger.info(
      SOURCE,
      `Published version ${version.version} for template ${templateId}`,
    );
  }
  return version;
}

export async function deleteVersion(id: string): Promise<boolean> {
  const result = await versionStorage.delete(id);
  if (result) {
    logger.info(SOURCE, `Deleted version ${id}`);
  }
  return result;
}
