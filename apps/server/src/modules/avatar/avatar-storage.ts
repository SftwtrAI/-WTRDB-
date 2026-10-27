import { db } from "../../db";
import { avatars } from "@wtrops/shared";
import { eq, and, desc } from "drizzle-orm";
import type { Avatar, InsertAvatar } from "@wtrops/shared";

export class AvatarStorage {
  async createAvatar(data: InsertAvatar): Promise<Avatar> {
    const [avatar] = await db.insert(avatars).values(data).returning();
    return avatar;
  }

  async getAvatarById(id: string): Promise<Avatar | null> {
    const [avatar] = await db
      .select()
      .from(avatars)
      .where(eq(avatars.id, id))
      .limit(1);
    return avatar || null;
  }

  async getAvatarsByUser(userId: string): Promise<Avatar[]> {
    return db
      .select()
      .from(avatars)
      .where(and(eq(avatars.userId, userId), eq(avatars.isActive, true)))
      .orderBy(desc(avatars.createdAt));
  }

  async getAvatarByProviderId(
    userId: string,
    providerAvatarId: string,
  ): Promise<Avatar | null> {
    const [avatar] = await db
      .select()
      .from(avatars)
      .where(
        and(
          eq(avatars.userId, userId),
          eq(avatars.providerAvatarId, providerAvatarId),
        ),
      )
      .limit(1);
    return avatar || null;
  }

  async updateAvatar(
    id: string,
    userId: string,
    data: Partial<InsertAvatar>,
  ): Promise<Avatar | null> {
    const [avatar] = await db
      .update(avatars)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(avatars.id, id), eq(avatars.userId, userId)))
      .returning();
    return avatar || null;
  }

  async deleteAvatar(id: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(avatars)
      .where(and(eq(avatars.id, id), eq(avatars.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  }
}

export const avatarStorage = new AvatarStorage();
