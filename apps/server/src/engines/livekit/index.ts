"use strict";

/**
 * LiveKit Engine — STUB
 *
 * The full LiveKit engine was removed in the wtrdb extraction.
 * This stub provides minimal type-compatible exports so that
 * modules still importing from this path will compile.
 */

import type { Express } from "express";
import { Router } from "express";

export function initLiveKitEngine(_app: Express): void {
  // no-op
}

export const livekitApiRouter = Router();

export class LiveKitRoomService {
  constructor(_config: any) {}
  async createRoom(..._args: any[]): Promise<any> {
    throw new Error("LiveKit engine removed in wtrdb extraction");
  }
  async getParticipantToken(..._args: any[]): Promise<string> {
    throw new Error("LiveKit engine removed in wtrdb extraction");
  }
}
