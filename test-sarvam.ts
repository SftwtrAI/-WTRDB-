import "dotenv/config";
import { writeFileSync } from "fs";
import { sarvamTranscriptionService } from "./apps/server/src/services/sarvam-transcription";
import { openaiTranscriptionService } from "./apps/server/src/services/openai-transcription";

const CALL_ID = "e34a04da-b9af-4a97-83b0-fd83d5fa1086";
const RECORDING_URL =
  "https://kojttijkuvsfnxbqdzod.storage.supabase.co/storage/v1/s3/recordings/recordings/campaign-034e53ef-e22a-4c4e-bb4c-395788598d31-e34a04da-b9af-4a97-83b0-fd83d5fa1086-2026-02-13T124708.ogg";

(async function main() {
  console.log(`Transcribing call ${CALL_ID} with both providers...`);

  // Run both transcriptions in parallel
  const [sarvamTranscript, openaiTranscript] = await Promise.all([
    sarvamTranscriptionService
      .transcribe(RECORDING_URL)
      .catch((e) => `ERROR: ${e.message}`),
    openaiTranscriptionService
      .transcribe(RECORDING_URL, "bn")
      .catch((e) => `ERROR: ${e.message}`),
  ]);

  const output = [
    `Call ID: ${CALL_ID}`,
    `Recording: ${RECORDING_URL}`,
    `Timestamp: ${new Date().toISOString()}`,
    ``,
    `=== Sarvam Streaming Transcript ===`,
    sarvamTranscript || "(empty - no speech detected)",
    ``,
    `=== OpenAI Whisper Transcript ===`,
    openaiTranscript || "(empty - no speech detected)",
  ].join("\n");

  writeFileSync("sarvam-transcript.txt", output, "utf-8");
  console.log("Saved to sarvam-transcript.txt");
  console.log(
    `\nSarvam: ${sarvamTranscript ? sarvamTranscript.length + " chars" : "empty"}`,
  );
  console.log(
    `OpenAI: ${openaiTranscript ? openaiTranscript.length + " chars" : "empty"}`,
  );
})();
