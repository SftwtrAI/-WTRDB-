"use strict";

/**
 * Format a phone number for TTS (Text-to-Speech) pronunciation.
 *
 * This prevents TTS engines from reading phone numbers as large numbers.
 * For example, "9990155993" would be read as "nine billion, nine hundred ninety million..."
 * Instead, we format it as "9 9 9 0 1 5 5 9 9 3" so TTS reads it digit by digit.
 *
 * @param phoneNumber - The phone number to format
 * @returns Phone number formatted for TTS with spaces between digit groups
 */
export function formatPhoneForTTS(phoneNumber: string): string {
  if (!phoneNumber) {
    return phoneNumber;
  }

  // Remove any non-digit characters except + at the start
  const hasPlus = phoneNumber.startsWith("+");
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.length === 0) {
    return phoneNumber;
  }

  // Format digits with spaces between each digit for clear TTS pronunciation
  // Group in sets of 3 for natural reading rhythm: "999 015 5993" → "9 9 9, 0 1 5, 5 9 9 3"
  const formattedDigits = digitsOnly.split("").join(" ");

  // Add country code prefix if it existed
  if (hasPlus) {
    return `plus ${formattedDigits}`;
  }

  return formattedDigits;
}

/**
 * Format a phone number for TTS with grouping for better readability.
 * Uses groups of 3 digits separated by short pauses (commas in TTS).
 *
 * @param phoneNumber - The phone number to format
 * @returns Phone number formatted with groups for TTS
 */
export function formatPhoneForTTSGrouped(phoneNumber: string): string {
  if (!phoneNumber) {
    return phoneNumber;
  }

  // Remove any non-digit characters except + at the start
  const hasPlus = phoneNumber.startsWith("+");
  const digitsOnly = phoneNumber.replace(/\D/g, "");

  if (digitsOnly.length === 0) {
    return phoneNumber;
  }

  // Split digits and group by 3s for natural reading
  const digits = digitsOnly.split("");
  const groups: string[] = [];

  for (let i = 0; i < digits.length; i += 3) {
    const group = digits.slice(i, i + 3).join(" ");
    groups.push(group);
  }

  // Join groups with commas for brief pauses
  const formattedNumber = groups.join(", ");

  // Add country code prefix if it existed
  if (hasPlus) {
    return `plus, ${formattedNumber}`;
  }

  return formattedNumber;
}
