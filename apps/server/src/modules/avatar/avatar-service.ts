import { avatarStorage } from "./avatar-storage";
import { logger } from "../../utils/logger";
import type { Avatar } from "@wtrops/shared";

const HEDRA_API_URL = process.env.HEDRA_API_URL || "https://api.hedra.com";

export class AvatarService {
  private getApiKey(): string {
    const key = process.env.HEDRA_API_KEY;
    if (!key) {
      throw new Error("HEDRA_API_KEY environment variable is not set");
    }
    return key;
  }

  /**
   * Create a custom avatar on Hedra from an image file, then save to our DB.
   *
   * Hedra two-step flow:
   * 1. POST /web-app/public/assets  → create asset placeholder → returns { id }
   * 2. POST /web-app/public/assets/:id/upload → upload the image file
   */
  async createCustomAvatar(
    userId: string,
    displayName: string,
    imageSource:
      | { type: "file"; buffer: Buffer; mimetype: string }
      | { type: "url"; imageUrl: string },
  ): Promise<Avatar> {
    const apiKey = this.getApiKey();

    // Step 1: Create asset placeholder
    const createRes = await fetch(`${HEDRA_API_URL}/web-app/public/assets`, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "image", name: displayName }),
    });

    if (!createRes.ok) {
      const text = await createRes.text();
      logger.error(
        `Hedra create asset failed: ${createRes.status} ${text}`,
        undefined,
        "AvatarService",
      );
      throw new Error(
        `Failed to create avatar on Hedra: ${createRes.status} ${text}`,
      );
    }

    const asset = (await createRes.json()) as {
      id: string;
      [key: string]: any;
    };
    const assetId = asset.id;

    // Step 2: Upload the image
    let imageBuffer: Buffer;
    let imageMimetype: string;

    if (imageSource.type === "file") {
      imageBuffer = imageSource.buffer;
      imageMimetype = imageSource.mimetype;
    } else {
      // Download from URL first
      const imgRes = await fetch(imageSource.imageUrl);
      if (!imgRes.ok) {
        throw new Error(`Failed to download image from URL: ${imgRes.status}`);
      }
      imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      imageMimetype = imgRes.headers.get("content-type") || "image/jpeg";
    }

    const ext = imageMimetype.split("/")[1] || "png";
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([imageBuffer], { type: imageMimetype }),
      `avatar.${ext}`,
    );

    const uploadRes = await fetch(
      `${HEDRA_API_URL}/web-app/public/assets/${assetId}/upload`,
      {
        method: "POST",
        headers: {
          "X-API-Key": apiKey,
        },
        body: formData,
      },
    );

    if (!uploadRes.ok) {
      const text = await uploadRes.text();
      logger.error(
        `Hedra upload asset failed: ${uploadRes.status} ${text}`,
        undefined,
        "AvatarService",
      );
      throw new Error(
        `Failed to upload avatar image to Hedra: ${uploadRes.status} ${text}`,
      );
    }

    // Save reference in our DB
    const avatar = await avatarStorage.createAvatar({
      userId,
      providerAvatarId: assetId,
      displayName,
      imageUrl: null, // Hedra doesn't return a preview URL from the upload
      type: "custom",
      isActive: true,
    });

    logger.info(
      `Custom avatar created: ${avatar.id} (hedra: ${assetId})`,
      undefined,
      "AvatarService",
    );
    return avatar;
  }

  /**
   * Delete an avatar from our DB.
   * Hedra doesn't expose a public delete endpoint, so we only remove from our DB.
   */
  async deleteAvatar(userId: string, avatarId: string): Promise<boolean> {
    const avatar = await avatarStorage.getAvatarById(avatarId);
    if (!avatar || avatar.userId !== userId) {
      return false;
    }

    return avatarStorage.deleteAvatar(avatarId, userId);
  }

  /**
   * Get all avatars belonging to a user.
   */
  async getUserAvatars(userId: string): Promise<Avatar[]> {
    return avatarStorage.getAvatarsByUser(userId);
  }

  /**
   * Get a single avatar by ID, verifying ownership.
   */
  async getAvatarById(
    avatarId: string,
    userId?: string,
  ): Promise<Avatar | null> {
    const avatar = await avatarStorage.getAvatarById(avatarId);
    if (!avatar) return null;
    if (userId && avatar.userId !== userId) return null;
    return avatar;
  }

  /**
   * Update an avatar's display name.
   */
  async updateAvatar(
    userId: string,
    avatarId: string,
    displayName: string,
  ): Promise<Avatar | null> {
    return avatarStorage.updateAvatar(avatarId, userId, { displayName });
  }
}

export const avatarService = new AvatarService();
