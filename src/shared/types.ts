export interface Attendee {
  id: number;
  qrId: string;
  name: string;
  email: string | null;
  company: string | null;
  ticketType: string;
  checkedInAt: string | null;
  badgePrinted: boolean;
  createdAt: string;
}

export interface OrganizerUser {
  username: string;
  displayName: string;
}

export interface DashboardSummary {
  total: number;
  checkedIn: number;
  remaining: number;
  recentCheckIns: Array<{
    name: string;
    ticketType: string;
    company: string | null;
    checkedInAt: string;
  }>;
}

export interface CheckInResult {
  status: 'valid' | 'duplicate' | 'invalid';
  message: string;
  attendee: Attendee | null;
}

export interface PublicRegisterInput {
  name: string;
  email?: string;
  company?: string;
  ticketType?: string;
}

export interface WalkInRegisterInput {
  name: string;
  email?: string;
  company?: string;
  ticketType: string;
}

export type BadgePreset = 'badge-3x4' | 'cr80' | 'label-4x6' | 'roll-80mm' | 'roll-58mm' | 'custom';
export type PrintColorMode = 'full-color' | 'monochrome' | 'high-contrast';
export type FontSizeScale = 'compact' | 'normal' | 'large';

export interface PrintConfig {
  printerDeviceName: string;
  preset: BadgePreset;
  width: string;
  height: string;
  orientation: 'portrait' | 'landscape';
  colorMode: PrintColorMode;
  accentColor: string;
  showLanyardHole: boolean;
  showLogo: boolean;
  showCompany: boolean;
  eventName: string;
  qrSize: number;
  fontSizeScale: FontSizeScale;
}

export const DEFAULT_PRINT_CONFIG: PrintConfig = {
  printerDeviceName: '',
  preset: 'label-4x6',
  width: '102mm',
  height: '152mm',
  orientation: 'portrait',
  colorMode: 'full-color',
  accentColor: '#000000',
  showLanyardHole: true,
  showLogo: true,
  showCompany: true,
  eventName: 'ARTECH • LIVE THE EXPERIENCE',
  qrSize: 130,
  fontSizeScale: 'normal',
};

export function sanitizeDimensions(width?: string, height?: string): { width: string; height: string } {
  let w = (width || '').trim();
  let h = (height || '').trim();

  // If width is compound like "102:152mm", "102x152", "4:6", "4x6"
  const multiMatch = w.match(/^(\d+(?:\.\d+)?)\s*[:xX*]\s*(\d+(?:\.\d+)?)\s*(mm|in|cm)?$/);
  if (multiMatch) {
    const v1 = parseFloat(multiMatch[1]);
    const v2 = parseFloat(multiMatch[2]);
    const unit = multiMatch[3] || (v1 <= 12 && v2 <= 18 ? 'in' : 'mm');
    return { width: `${v1}${unit}`, height: `${v2}${unit}` };
  }

  // If height is compound
  const hMultiMatch = h.match(/^(\d+(?:\.\d+)?)\s*[:xX*]\s*(\d+(?:\.\d+)?)\s*(mm|in|cm)?$/);
  if (hMultiMatch) {
    const v1 = parseFloat(hMultiMatch[1]);
    const v2 = parseFloat(hMultiMatch[2]);
    const unit = hMultiMatch[3] || (v1 <= 12 && v2 <= 18 ? 'in' : 'mm');
    return { width: `${v1}${unit}`, height: `${v2}${unit}` };
  }

  // Default fallbacks if empty
  if (!w) w = '102mm';
  if (!h) h = '152mm';

  // Normalize plain numbers without unit (e.g. "102" -> "102mm", "4" -> "4in")
  if (/^\d+(\.\d+)?$/.test(w)) {
    const val = parseFloat(w);
    w = val <= 18 ? `${val}in` : `${val}mm`;
  }
  if (/^\d+(\.\d+)?$/.test(h)) {
    const val = parseFloat(h);
    h = val <= 18 ? `${val}in` : `${val}mm`;
  }

  return { width: w, height: h };
}

