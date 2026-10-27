/**
 * Centralized formatting utilities for consistent display across the application
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  BRL: "R$",
  NGN: "₦",
  GHS: "₵",
  ZAR: "R",
  MXN: "$",
  ARS: "$",
  CAD: "C$",
  AUD: "A$",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
  CHF: "CHF",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  PLN: "zł",
  CZK: "Kč",
  HUF: "Ft",
  RUB: "₽",
  TRY: "₺",
  THB: "฿",
  SGD: "S$",
  HKD: "HK$",
  NZD: "NZ$",
  PHP: "₱",
  MYR: "RM",
  IDR: "Rp",
  VND: "₫",
  EGP: "E£",
  AED: "د.إ",
  SAR: "﷼",
  KES: "KSh",
  UGX: "USh",
  TZS: "TSh",
  ZMW: "ZK",
};

/**
 * Format currency with proper symbol and locale-aware number formatting
 * @param amount - The amount to format (string or number)
 * @param currency - ISO 4217 currency code (default: USD)
 * @param locale - Locale for number formatting (default: en-US)
 */
export function formatCurrency(
  amount: string | number,
  currency: string = "USD",
  locale: string = "en-US",
): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return `${CURRENCY_SYMBOLS[currency] || currency} 0.00`;
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numAmount);
  } catch {
    const symbol = CURRENCY_SYMBOLS[currency] || currency + " ";
    return `${symbol}${numAmount.toFixed(2)}`;
  }
}

/**
 * Format a number with proper thousands separators
 * @param value - The number to format
 * @param locale - Locale for number formatting (default: en-US)
 */
export function formatNumber(
  value: number | string,
  locale: string = "en-US",
): string {
  const numValue = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return "0";
  }

  return new Intl.NumberFormat(locale).format(numValue);
}

/**
 * Format a percentage value
 * @param value - The percentage value (0-100)
 * @param decimals - Number of decimal places (default: 1)
 */
export function formatPercentage(
  value: number | string,
  decimals: number = 1,
): string {
  const numValue = typeof value === "string" ? parseFloat(value) : value;

  if (isNaN(numValue)) {
    return "0%";
  }

  return `${numValue.toFixed(decimals)}%`;
}

/**
 * Format duration in seconds to human-readable format
 * @param seconds - Duration in seconds
 */
export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) {
    return "0:00";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Truncate text to a maximum length with ellipsis
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation (default: 50)
 * @param suffix - Suffix to add when truncated (default: '...')
 */
export function truncateText(
  text: string | null | undefined,
  maxLength: number = 50,
  suffix: string = "...",
): string {
  if (!text) {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Format phone number for display
 * @param phoneNumber - The phone number to format
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) {
    return "";
  }

  const cleaned = phoneNumber.replace(/\D/g, "");

  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  if (cleaned.length === 11 && cleaned[0] === "1") {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  if (phoneNumber.startsWith("+")) {
    return phoneNumber;
  }

  return `+${phoneNumber}`;
}

/**
 * Format file size to human-readable format
 * @param bytes - File size in bytes
 */
export function formatFileSize(bytes: number): string {
  if (isNaN(bytes) || bytes < 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/**
 * Sanitize text input - removes control characters but preserves Unicode/emoji
 * @param text - The text to sanitize
 */
export function sanitizeText(text: string): string {
  if (!text) {
    return "";
  }

  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

/**
 * Check if a string contains only safe characters (no SQL injection attempts)
 * @param text - The text to validate
 */
export function isSafeInput(text: string): boolean {
  if (!text) {
    return true;
  }

  const dangerousPatterns = [/[<>]/, /javascript:/i, /on\w+\s*=/i];

  return !dangerousPatterns.some((pattern) => pattern.test(text));
}

/**
 * Format a SIP endpoint to show a clean phone number with engine label
 * @param endpoint - The SIP URI or phone number (e.g., "sip:12708221598@livekit.cloud:5060;transport=tcp")
 * @param engine - Optional engine type from call data
 * @returns Formatted string like "+12708221598 (LiveKit SIP)" or the original if not a SIP URI
 */
export function formatSipEndpoint(
  endpoint: string | null | undefined,
  engine?: string | null,
): string {
  if (!endpoint) {
    return "";
  }

  // Check if it's a SIP URI
  if (!endpoint.startsWith("sip:")) {
    return endpoint;
  }

  // Extract phone number from SIP URI: sip:NUMBER@domain:port;params
  const sipMatch = endpoint.match(/^sip:(\+?\d+)@(.+?)(?::\d+)?(?:;.*)?$/);

  if (!sipMatch) {
    return endpoint;
  }

  const phoneNumber = sipMatch[1].startsWith("+")
    ? sipMatch[1]
    : `+${sipMatch[1]}`;

  return `${phoneNumber} (LiveKit SIP)`;
}
