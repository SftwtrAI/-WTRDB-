import { questionSetStorage } from "./question-set-storage";
import { logAuditEvent } from "../../services/audit-log";
import { logger } from "../../utils/logger";
import type {
  QuestionSet,
  QuestionSetItem,
  InsertQuestionSetItem,
} from "@wtrops/shared";

const SOURCE = "QuestionSetService";

// ── Question Set CRUD ────────────────────────────────────────

export async function createQuestionSet(
  userId: string,
  data: { name: string; description?: string },
): Promise<QuestionSet> {
  const set = await questionSetStorage.createSet({
    userId,
    name: data.name,
    description: data.description,
  });

  logger.info(SOURCE, `Created question set ${set.id} for user ${userId}`);
  logAuditEvent({
    action: "question_set.create",
    userId,
    resourceType: "question_set",
    resourceId: set.id,
    metadata: { name: data.name },
  });

  return set;
}

export async function listQuestionSets(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<QuestionSet[]> {
  return questionSetStorage.getSetsByUser(userId, limit, offset);
}

export async function getQuestionSet(
  id: string,
  userId: string,
): Promise<QuestionSet | null> {
  const set = await questionSetStorage.getSetById(id);
  if (!set || set.userId !== userId) return null;
  return set;
}

export async function getQuestionSetWithItems(
  id: string,
  userId: string,
): Promise<{ set: QuestionSet; items: QuestionSetItem[] } | null> {
  const set = await questionSetStorage.getSetById(id);
  if (!set || set.userId !== userId) return null;
  const items = await questionSetStorage.getItemsBySet(id);
  return { set, items };
}

export async function updateQuestionSet(
  id: string,
  userId: string,
  data: { name?: string; description?: string },
): Promise<QuestionSet | null> {
  const set = await questionSetStorage.updateSet(id, userId, data);
  if (!set) return null;

  logger.info(SOURCE, `Updated question set ${id}`);
  logAuditEvent({
    action: "question_set.update",
    userId,
    resourceType: "question_set",
    resourceId: id,
    metadata: { updatedFields: Object.keys(data) },
  });

  return set;
}

export async function archiveQuestionSet(
  id: string,
  userId: string,
): Promise<boolean> {
  const archived = await questionSetStorage.archiveSet(id, userId);
  if (!archived) return false;

  logger.info(SOURCE, `Archived question set ${id}`);
  logAuditEvent({
    action: "question_set.delete",
    userId,
    resourceType: "question_set",
    resourceId: id,
  });

  return true;
}

// ── Question Set Items ───────────────────────────────────────

export async function addItems(
  setId: string,
  items: Array<{
    question: string;
    category?: string;
    scoringRubric?: string;
    maxScore?: number;
    weight?: number;
    expectedKeywords?: string[];
    followUpGuidance?: string;
    timeLimitSeconds?: number;
    isRequired?: boolean;
  }>,
): Promise<QuestionSetItem[]> {
  // Get current max order to auto-increment
  const existing = await questionSetStorage.getItemsBySet(setId);
  const maxOrder =
    existing.length > 0 ? Math.max(...existing.map((item) => item.order)) : 0;

  const data: InsertQuestionSetItem[] = items.map((item, index) => ({
    questionSetId: setId,
    question: item.question,
    category: item.category ?? "general",
    order: maxOrder + index + 1,
    timeLimitSeconds: item.timeLimitSeconds,
    isRequired: item.isRequired ?? true,
    scoringRubric: item.scoringRubric,
    maxScore: item.maxScore ?? 10,
    weight: item.weight ?? 1.0,
    followUpGuidance: item.followUpGuidance,
    expectedKeywords: item.expectedKeywords,
  }));

  const created = await questionSetStorage.createItems(data);
  await questionSetStorage.updateQuestionCount(setId);

  logger.info(SOURCE, `Added ${created.length} items to question set ${setId}`);
  return created;
}

export async function updateItem(
  itemId: string,
  data: Partial<{
    question: string;
    category: string;
    scoringRubric: string;
    maxScore: number;
    weight: number;
    expectedKeywords: string[];
    followUpGuidance: string;
    timeLimitSeconds: number;
    isRequired: boolean;
  }>,
): Promise<QuestionSetItem | null> {
  const item = await questionSetStorage.updateItem(itemId, data);
  if (item) {
    logger.info(
      SOURCE,
      `Updated item ${itemId} in question set ${item.questionSetId}`,
    );
  }
  return item;
}

export async function deleteItem(
  itemId: string,
  setId: string,
): Promise<boolean> {
  const deleted = await questionSetStorage.deleteItem(itemId);
  if (!deleted) return false;

  await questionSetStorage.updateQuestionCount(setId);
  logger.info(SOURCE, `Deleted item ${itemId} from question set ${setId}`);
  return true;
}

export async function reorderItems(
  setId: string,
  itemIds: string[],
): Promise<void> {
  const updates = itemIds.map((id, index) =>
    questionSetStorage.updateItem(id, { order: index + 1 } as any),
  );
  await Promise.all(updates);
  logger.info(
    SOURCE,
    `Reordered ${itemIds.length} items in question set ${setId}`,
  );
}

// ── Duplicate ────────────────────────────────────────────────

export async function duplicateSet(
  id: string,
  userId: string,
): Promise<{ set: QuestionSet; items: QuestionSetItem[] } | null> {
  const original = await questionSetStorage.getSetById(id);
  if (!original || original.userId !== userId) return null;

  const originalItems = await questionSetStorage.getItemsBySet(id);

  // Clone the set
  const newSet = await questionSetStorage.createSet({
    userId,
    name: `Copy of ${original.name}`,
    description: original.description,
    sourceType: original.sourceType,
    sourceJobDescriptionId: original.sourceJobDescriptionId,
  });

  // Clone items with new set ID
  let newItems: QuestionSetItem[] = [];
  if (originalItems.length > 0) {
    const itemData: InsertQuestionSetItem[] = originalItems.map((item) => ({
      questionSetId: newSet.id,
      question: item.question,
      category: item.category,
      order: item.order,
      timeLimitSeconds: item.timeLimitSeconds,
      isRequired: item.isRequired,
      scoringRubric: item.scoringRubric,
      maxScore: item.maxScore,
      weight: item.weight,
      followUpGuidance: item.followUpGuidance,
      expectedKeywords: item.expectedKeywords,
    }));
    newItems = await questionSetStorage.createItems(itemData);
  }

  await questionSetStorage.updateQuestionCount(newSet.id);

  logger.info(SOURCE, `Duplicated question set ${id} -> ${newSet.id}`);
  logAuditEvent({
    action: "question_set.create",
    userId,
    resourceType: "question_set",
    resourceId: newSet.id,
    metadata: { duplicatedFrom: id },
  });

  return { set: newSet, items: newItems };
}
