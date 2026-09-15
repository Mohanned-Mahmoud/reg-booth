import React, { useEffect, useState } from 'react';
import { sanitizeDimensions, type Attendee, type PrintConfig } from '../../shared/types.js';
import { generateQrDataUrl } from '../lib/qr-utils.js';

interface BadgeCardProps {
  attendee: Attendee;
  eventName?: string;
  isPrintable?: boolean;
  qrDataUrl?: string;
  config?: Partial<PrintConfig>;
}

export function BadgeCard({
  attendee,
  eventName: eventNameProp,
  isPrintable = false,
  qrDataUrl,
  config,
}: BadgeCardProps) {
  const [qrUrl, setQrUrl] = useState<string>(qrDataUrl || '');

  const eventName = config?.eventName || eventNameProp || 'ARTECH • LIVE THE EXPERIENCE';
  const showLanyardHole = config?.showLanyardHole ?? true;
  const showLogo = config?.showLogo ?? true;
  const showCompany = config?.showCompany ?? true;
  const colorMode = config?.colorMode ?? 'full-color';
  const accentColor = config?.accentColor || '#000000';
  const qrPixelSize = config?.qrSize || 130;
  const fontSizeScale = config?.fontSizeScale || 'normal';
  const orientation = config?.orientation || 'portrait';
  const isLandscape = orientation === 'landscape';

  useEffect(() => {
    if (qrDataUrl) {
      setQrUrl(qrDataUrl);
      return;
    }
    let active = true;
    generateQrDataUrl(attendee.qrId, 450).then((url) => {
      if (active) setQrUrl(url);
    });
    return () => {
      active = false;
    };
  }, [attendee.qrId, qrDataUrl]);

  const tier = (attendee.ticketType || 'Standard').toLowerCase();
  const isMono = colorMode === 'monochrome';

  // Tier color pill styling
  let tierStyleClass = 'bg-neutral-100 text-neutral-900 border-neutral-300';
  let customTierStyle: React.CSSProperties = {};

  if (isMono) {
    tierStyleClass = tier === 'vip' || tier === 'speaker'
      ? 'bg-black text-white border-black'
      : 'bg-white text-black border-black font-black';
  } else {
    if (tier === 'vip') {
      tierStyleClass = 'bg-black text-white border-black shadow-sm font-black';
      customTierStyle = { backgroundColor: '#0f172a' };
    } else {
      // Boldly apply the chosen Event Brand Accent Color to the Access Tier Pill
      tierStyleClass = 'text-white border-transparent shadow-sm font-black';
      customTierStyle = { backgroundColor: accentColor };
    }
  }

  // Name font size
  const nameSizeClass =
    fontSizeScale === 'compact'
      ? 'text-xl sm:text-2xl'
      : fontSizeScale === 'large'
      ? 'text-2xl sm:text-4xl'
      : 'text-2xl sm:text-3xl';

  // Dynamic preview width & height when not isPrintable
  const previewPreset = config?.preset || 'badge-3x4';
  let previewDimensionsClass = 'w-[320px] sm:w-[350px] min-h-[460px]';

  if (previewPreset === 'cr80') {
    previewDimensionsClass = isLandscape
      ? 'w-[380px] h-[240px]'
      : 'w-[250px] h-[380px]';
  } else if (previewPreset === 'roll-80mm' || previewPreset === 'roll-58mm') {
    previewDimensionsClass = 'w-[290px] min-h-[400px]';
  } else if (previewPreset === 'label-4x6') {
    previewDimensionsClass = isLandscape
      ? 'w-[440px] h-[300px]'
      : 'w-[340px] min-h-[480px]';
  }

  const { width: sanitizedWidth, height: sanitizedHeight } = sanitizeDimensions(config?.width, config?.height);

  return (
    <div
      className={`badge-card-printable relative flex ${
        isLandscape ? 'flex-row items-center justify-between' : 'flex-col items-center justify-between'
      } rounded-2xl bg-white p-5 text-slate-900 transition-all ${
        isPrintable
          ? 'shadow-none border border-neutral-400'
          : `${previewDimensionsClass} shadow-xl border border-neutral-200`
      }`}
      style={{
        boxSizing: 'border-box',
        width: isPrintable ? sanitizedWidth : undefined,
        height: isPrintable
          ? (config?.height === 'auto' ? undefined : sanitizedHeight)
          : undefined,
        maxWidth: isPrintable ? '100%' : undefined,
        maxHeight: isPrintable ? '100%' : undefined,
        minHeight: isPrintable && config?.height === 'auto' ? 'auto' : undefined,
        borderColor: isMono ? '#000000' : accentColor,
      }}
    >
      {/* Top prominent header accent bar */}
      {!isLandscape && (
        <div
          className="w-full h-3 rounded-full -mt-1 mb-2.5 shadow-sm"
          style={{
            backgroundColor: isMono ? '#000000' : accentColor,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        />
      )}

      {/* Lanyard punch hole guide indicator */}
      {showLanyardHole && (
        <div className="flex flex-col items-center gap-1 mb-1">
          <div className="h-2 w-10 rounded-full border border-dashed border-neutral-400 bg-neutral-100" />
        </div>
      )}

      {/* Header & Event Title with Brand Mark */}
      <div className={`w-full text-center ${isLandscape ? 'border-r pr-4' : 'border-b pb-2.5'} border-neutral-200 flex flex-col items-center`}>
        <div className="flex items-center justify-center gap-1.5 mb-1">
          {showLogo && (
            <img
              src="/brand-logo-mark.png"
              alt="Brand Logo"
              className={`h-4 w-4 object-contain ${isMono ? 'filter invert contrast-200' : 'filter invert opacity-90'}`}
            />
          )}
          <p className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-neutral-500">
            Official Credential
          </p>
        </div>
        <h3 className="font-display text-xs font-black tracking-wider text-black uppercase">
          {eventName}
        </h3>
      </div>

      {/* Attendee Name & Company */}
      <div className="w-full text-center my-auto py-2 flex flex-col items-center justify-center">
        <h2 className={`font-display ${nameSizeClass} font-black tracking-tight text-black leading-tight break-words px-2`}>
          {attendee.name}
        </h2>
        {showCompany && attendee.company && (
          <p className="mt-1 text-sm font-semibold text-neutral-600 line-clamp-2 px-2">
            {attendee.company}
          </p>
        )}

        {/* Ticket Tier Pill */}
        <div className="mt-2.5 flex justify-center">
          <span
            className={`inline-block rounded-md px-4 py-1 font-mono text-xs font-black uppercase tracking-widest border ${tierStyleClass}`}
            style={{
              ...customTierStyle,
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          >
            {attendee.ticketType || 'GENERAL'} ACCESS
          </span>
        </div>
      </div>

      {/* QR Code Container (Crisp, High Contrast) */}
      <div className="flex flex-col items-center justify-center p-2 rounded-xl bg-white border border-neutral-200 shadow-sm">
        {qrUrl ? (
          <img
            src={qrUrl}
            alt={attendee.qrId}
            style={{ width: `${qrPixelSize}px`, height: `${qrPixelSize}px` }}
            className="object-contain"
          />
        ) : (
          <div
            style={{ width: `${qrPixelSize}px`, height: `${qrPixelSize}px` }}
            className="animate-pulse bg-neutral-200 rounded-lg"
          />
        )}
        <span className="mt-1 font-mono text-[11px] font-bold tracking-widest text-black">
          {attendee.qrId}
        </span>
      </div>

      {/* Footer / Access Verification Bar */}
      <div className="w-full pt-2.5 mt-1 border-t border-neutral-200 flex items-center justify-between text-[8px] font-mono text-neutral-400 uppercase tracking-wider">
        <span>ARTECH Station</span>
        <span>• Pass Valid •</span>
        <span>Auth Entrance</span>
      </div>
    </div>
  );
}

