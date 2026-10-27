import { db } from "../../db";
import { questionSets, questionSetItems } from "@wtrops/shared";
import { eq, and, desc, asc } from "drizzle-orm";
import type {
  QuestionSet,
  InsertQuestionSet,
  QuestionSetItem,
  InsertQuestionSetItem,
} from "@wtrops/shared";

export class QuestionSetStorage {
  // Question Sets
  async createSet(data: InsertQuestionSet): Promise<QuestionSet> {
    const [set] = await db.insert(questionSets).values(data).returning();
    return set;
  }

  async getSetById(id: string): Promise<QuestionSet | null> {
    const [set] = await db
      .select()
      .from(questionSets)
      .where(eq(questionSets.id, id))
      .limit(1);
    return set || null;
  }

  async getSetsByUser(
    userId: string,
    limit = 50,
    offset = 0,
  ): Promise<QuestionSet[]> {
    return db
      .select()
      .from(questionSets)
      .where(
        and(
          eq(questionSets.userId, userId),
          eq(questionSets.isArchived, false),
        ),
      )
      .orderBy(desc(questionSets.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async updateSet(
    id: string,
    userId: string,
    data: Partial<InsertQuestionSet>,
  ): Promise<QuestionSet | null> {
    const [set] = await db
      .update(questionSets)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(questionSets.id, id), eq(questionSets.userId, userId)))
      .returning();
    return set || null;
  }

  async archiveSet(id: string, userId: string): Promise<boolean> {
    const [set] = await db
      .update(questionSets)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(questionSets.id, id), eq(questionSets.userId, userId)))
      .returning();
    return !!set;
  }

  async updateQuestionCount(id: string): Promise<void> {
    const items = await this.getItemsBySet(id);
    await db
      .update(questionSets)
      .set({ questionCount: items.length, updatedAt: new Date() })
      .where(eq(questionSets.id, id));
  }

  // Question Set Items
  async createItems(data: InsertQuestionSetItem[]): Promise<QuestionSetItem[]> {
    if (data.length === 0) return [];
    return db.insert(questionSetItems).values(data).returning();
  }

  async getItemsBySet(setId: string): Promise<QuestionSetItem[]> {
    return db
      .select()
      .from(questionSetItems)
      .where(eq(questionSetItems.questionSetId, setId))
      .orderBy(asc(questionSetItems.order));
  }

  async updateItem(
    id: string,
    data: Partial<InsertQuestionSetItem>,
  ): Promise<QuestionSetItem | null> {
    const [item] = await db
      .update(questionSetItems)
      .set(data)
      .where(eq(questionSetItems.id, id))
      .returning();
    return item || null;
  }

  async deleteItem(id: string): Promise<boolean> {
    const [item] = await db
      .delete(questionSetItems)
      .where(eq(questionSetItems.id, id))
      .returning();
    return !!item;
  }
}

export const questionSetStorage = new QuestionSetStorage();
