"use strict";

/**
 * LiveKit Room Service — STUB
 *
 * The full LiveKit engine was removed in the wtrdb extraction.
 * This stub provides the LiveKitRoomService class so that modules
 * that import it will still compile.
 */

export class LiveKitRoomService {
  constructor(_config: any) {}
  async createRoom(..._args: any[]): Promise<any> {
    throw new Error("LiveKit room service removed in wtrdb extraction");
  }
  async getParticipantToken(..._args: any[]): Promise<string> {
    throw new Error("LiveKit room service removed in wtrdb extraction");
  }
  async deleteRoom(..._args: any[]): Promise<void> {
    throw new Error("LiveKit room service removed in wtrdb extraction");
  }
}
