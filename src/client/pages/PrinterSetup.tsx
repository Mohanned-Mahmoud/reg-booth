import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  Sliders,
  Check,
  RefreshCw,
  Save,
  RotateCcw,
  Sparkles,
  Layers,
  Palette,
  Eye,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Maximize2,
} from 'lucide-react';
import { Link } from 'wouter';
import { BadgeCard } from '../components/BadgeCard.js';
import {
  DEFAULT_PRINT_CONFIG,
  sanitizeDimensions,
  type PrintConfig,
  type BadgePreset,
  type PrintColorMode,
  type FontSizeScale,
  type Attendee,
} from '../../shared/types.js';

const PRESET_OPTIONS: Array<{
  id: BadgePreset;
  title: string;
  badgeSize: string;
  width: string;
  height: string;
  desc: string;
}> = [
  {
    id: 'badge-3x4',
    title: 'Standard Badge',
    badgeSize: '3.2" × 4.4"',
    width: '3.2in',
    height: '4.4in',
    desc: 'Lanyard credential sleeve & standard cardstock',
  },
  {
    id: 'cr80',
    title: 'ID Card (CR80)',
    badgeSize: '85.6 × 54 mm',
    width: '85.6mm',
    height: '54mm',
    desc: 'Direct-to-card PVC card printers (Evolis, Zebra ZC, Fargo)',
  },
  {
    id: 'label-4x6',
    title: 'Large Label / Photo Card (4×6)',
    badgeSize: '102 × 152 mm (4" × 6")',
    width: '102mm',
    height: '152mm',
    desc: 'Kodak photo card, 4x6 badge paper, or Zebra desktop thermal rolls',
  },
  {
    id: 'roll-80mm',
    title: 'Thermal Roll 80mm',
    badgeSize: '80mm × auto',
    width: '80mm',
    height: 'auto',
    desc: 'Continuous POS & kiosk thermal roll printers (Epson, Star)',
  },
  {
    id: 'custom',
    title: 'Custom Dimensions',
    badgeSize: 'Custom size',
    width: '3.2in',
    height: '4.4in',
    desc: 'Manually specify custom width and height in mm or inches',
  },
];

const SWATCHES = [
  { name: 'Obsidian Black', hex: '#0f172a' },
  { name: 'Cobalt Navy', hex: '#1e3a8a' },
  { name: 'Crimson Wine', hex: '#881337' },
  { name: 'Forest Jade', hex: '#064e3b' },
  { name: 'Deep Violet', hex: '#4c1d95' },
];

const SAMPLE_ATTENDEES: Attendee[] = [
  {
    id: 101,
    qrId: 'ART-99214',
    name: 'Sarah Jenkins',
    company: 'NextGen AI Labs',
    ticketType: 'VIP',
    email: 'sarah@example.com',
    checkedInAt: null,
    badgePrinted: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 102,
    qrId: 'ART-88301',
    name: 'Dr. Marcus Vance',
    company: 'Quantum Robotics Group',
    ticketType: 'SPEAKER',
    email: 'marcus@example.com',
    checkedInAt: null,
    badgePrinted: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 103,
    qrId: 'ART-77412',
    name: 'Elena Rostova',
    company: 'Vertex Media',
    ticketType: 'GENERAL',
    email: 'elena@example.com',
    checkedInAt: null,
    badgePrinted: false,
    createdAt: new Date().toISOString(),
  },
];

export function PrinterSetup() {
  const [config, setConfig] = useState<PrintConfig>(DEFAULT_PRINT_CONFIG);
  const [printers, setPrinters] = useState<Array<{ name: string; isDefault: boolean }>>([]);
  const [isDetectingPrinters, setIsDetectingPrinters] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [testPrintStatus, setTestPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [sampleIndex, setSampleIndex] = useState(0);

  // Load initial configuration
  useEffect(() => {
    async function loadConfig() {
      // 1. If Electron IPC available
      const electron = (window as any).electronAPI;
      if (electron && typeof electron.getStationConfig === 'function') {
        try {
          const cfg = await electron.getStationConfig();
          if (cfg && cfg.printConfig) {
            const { width, height } = sanitizeDimensions(cfg.printConfig.width, cfg.printConfig.height);
            setConfig({
              ...DEFAULT_PRINT_CONFIG,
              ...cfg.printConfig,
              width,
              height: cfg.printConfig.height === 'auto' ? 'auto' : height,
            });
          } else if (cfg) {
            setConfig((prev) => ({
              ...prev,
              printerDeviceName: cfg.printerDeviceName || prev.printerDeviceName,
            }));
          }
        } catch (e) {
          console.warn('Electron getStationConfig failed:', e);
        }
      } else {
        // 2. Fallback to server API
        try {
          const res = await fetch('/api/station-config');
          if (res.ok) {
            const data = await res.json();
            if (data.printConfig) {
              const { width, height } = sanitizeDimensions(data.printConfig.width, data.printConfig.height);
              setConfig({
                ...DEFAULT_PRINT_CONFIG,
                ...data.printConfig,
                width,
                height: data.printConfig.height === 'auto' ? 'auto' : height,
              });
            }
          }
        } catch (e) {
          console.warn('API fetch station-config failed:', e);
        }
      }
    }
    loadConfig();
    detectPrinters();
  }, []);

  const detectPrinters = async () => {
    setIsDetectingPrinters(true);
    const electron = (window as any).electronAPI;
    if (electron && typeof electron.getPrinters === 'function') {
      try {
        const detected = await electron.getPrinters();
        if (Array.isArray(detected)) {
          setPrinters(detected);
        }
      } catch (err) {
        console.error('Failed to get printers:', err);
      }
    }
    setIsDetectingPrinters(false);
  };

  const handlePresetSelect = (preset: BadgePreset) => {
    const found = PRESET_OPTIONS.find((p) => p.id === preset);
    if (found) {
      setConfig((prev) => ({
        ...prev,
        preset,
        width: found.width,
        height: found.height,
        orientation: preset === 'cr80' ? 'landscape' : 'portrait',
      }));
    }
  };

  const handleWidthChange = (val: string) => {
    // Smart detection of "102:152" or "102x152" or "4:6" or "4x6"
    const match = val.trim().match(/^(\d+(?:\.\d+)?)\s*[:xX*]\s*(\d+(?:\.\d+)?)\s*(mm|in|cm)?$/);
    if (match) {
      const v1 = parseFloat(match[1]);
      const v2 = parseFloat(match[2]);
      const unit = match[3] || (v1 <= 12 && v2 <= 18 ? 'in' : 'mm');
      setConfig((prev) => ({
        ...prev,
        preset: 'custom',
        width: `${v1}${unit}`,
        height: `${v2}${unit}`,
      }));
      return;
    }
    setConfig((prev) => ({ ...prev, width: val, preset: 'custom' }));
  };

  const handleHeightChange = (val: string) => {
    const match = val.trim().match(/^(\d+(?:\.\d+)?)\s*[:xX*]\s*(\d+(?:\.\d+)?)\s*(mm|in|cm)?$/);
    if (match) {
      const v1 = parseFloat(match[1]);
      const v2 = parseFloat(match[2]);
      const unit = match[3] || (v1 <= 12 && v2 <= 18 ? 'in' : 'mm');
      setConfig((prev) => ({
        ...prev,
        preset: 'custom',
        width: `${v1}${unit}`,
        height: `${v2}${unit}`,
      }));
      return;
    }
    setConfig((prev) => ({ ...prev, height: val, preset: 'custom' }));
  };

  // Inject dynamic @page size into <head> for accurate paper tray matching
  useEffect(() => {
    let styleEl = document.getElementById('badge-page-size-style') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'badge-page-size-style';
      document.head.appendChild(styleEl);
    }
    const { width: sanitizedW, height: sanitizedH } = sanitizeDimensions(config.width, config.height);
    const h = config.height === 'auto' ? 'auto' : sanitizedH;
    styleEl.textContent = `
      @page {
        size: ${sanitizedW} ${h};
        margin: 0mm !important;
      }
      @media print {
        @page {
          size: ${sanitizedW} ${h};
          margin: 0mm !important;
        }
      }
    `;
  }, [config.width, config.height]);

  const handleSave = async () => {
    setSaveStatus('saving');
    setStatusMessage('');

    const { width: safeW, height: safeH } = sanitizeDimensions(config.width, config.height);
    const safeConfig: PrintConfig = {
      ...config,
      width: safeW,
      height: config.height === 'auto' ? 'auto' : safeH,
    };

    const electron = (window as any).electronAPI;
    if (electron && typeof electron.saveStationConfig === 'function') {
      try {
        const res = await electron.saveStationConfig({
          printerDeviceName: safeConfig.printerDeviceName,
          printConfig: safeConfig,
        });
        if (res && res.success) {
          setSaveStatus('saved');
          setStatusMessage('Settings saved to station-config.json successfully!');
          setTimeout(() => setSaveStatus('idle'), 4000);
          return;
        }
      } catch (err: any) {
        setSaveStatus('error');
        setStatusMessage(err.message || 'Failed to save via Electron');
        return;
      }
    }

    // Fallback: API save
    try {
      const res = await fetch('/api/station-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          printerDeviceName: safeConfig.printerDeviceName,
          printConfig: safeConfig,
        }),
      });
      if (res.ok) {
        setSaveStatus('saved');
        setStatusMessage('Configuration synchronized with station server.');
        setTimeout(() => setSaveStatus('idle'), 4000);
      } else {
        setSaveStatus('error');
        setStatusMessage('Failed to save to server API.');
      }
    } catch (err: any) {
      setSaveStatus('error');
      setStatusMessage(err.message || 'Network error while saving.');
    }
  };

  const handleTestPrint = async () => {
    setTestPrintStatus('printing');
    setStatusMessage('Dispatching sample test badge to printer...');

    const { width: safeW, height: safeH } = sanitizeDimensions(config.width, config.height);
    const safeConfig: PrintConfig = {
      ...config,
      width: safeW,
      height: config.height === 'auto' ? 'auto' : safeH,
    };

    const electron = (window as any).electronAPI;
    if (electron && typeof electron.testPrint === 'function') {
      try {
        const result = await electron.testPrint(safeConfig);
        if (result && result.success) {
          setTestPrintStatus('success');
          setStatusMessage('Test badge printed successfully! Check printer paper tray.');
          setTimeout(() => setTestPrintStatus('idle'), 5000);
          return;
        } else {
          setTestPrintStatus('error');
          setStatusMessage(`Print failed: ${result?.failureReason || 'Unknown error'}`);
          setTimeout(() => setTestPrintStatus('idle'), 6000);
          return;
        }
      } catch (err: any) {
        setTestPrintStatus('error');
        setStatusMessage(err.message || 'Electron print dispatch error');
        setTimeout(() => setTestPrintStatus('idle'), 6000);
        return;
      }
    }

    // Web browser fallback
    window.print();
    setTestPrintStatus('idle');
  };

  const handleReset = () => {
    setConfig(DEFAULT_PRINT_CONFIG);
  };

  const activeSample = SAMPLE_ATTENDEES[sampleIndex];

  return (
    <div className="min-h-screen bg-[#08090C] text-stone-100 flex flex-col selection:bg-white/20">
      {/* Top Header Bar */}
      <header className="border-b border-white/10 bg-[#0C0E14]/90 backdrop-blur-xl px-6 py-4 sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-stone-400 hover:text-white transition px-3 py-1.5 rounded-lg hover:bg-white/5 text-sm font-medium cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Console</span>
          </Link>
          <div className="h-5 w-px bg-white/10" />
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white border border-white/15">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                ARTECH • Printer & Badge Studio
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-white/10 text-stone-300 px-2 py-0.5 rounded border border-white/15">
                  Companion Utility
                </span>
              </h1>
              <p className="text-xs text-stone-400">
                Configure thermal & card printer presets, colors, and badge dimensions with live 1:1 preview.
              </p>
            </div>
          </div>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-stone-400 hover:text-white hover:bg-white/5 border border-white/10 transition cursor-pointer"
            title="Reset to factory settings"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleTestPrint}
            disabled={testPrintStatus === 'printing'}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 border border-white/20 transition cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {testPrintStatus === 'printing' ? (
              <RefreshCw className="h-4 w-4 animate-spin text-white" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            <span>Test Print</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-slate-900 bg-white hover:bg-stone-200 transition cursor-pointer shadow-md active:scale-95 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : saveStatus === 'saved' ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{saveStatus === 'saved' ? 'Saved' : 'Save Configuration'}</span>
          </button>
        </div>
      </header>

      {/* Notification Toast */}
      {statusMessage && (
        <div className="bg-[#12141A] border-b border-white/10 px-6 py-2.5 flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            {saveStatus === 'error' || testPrintStatus === 'error' ? (
              <AlertCircle className="h-4 w-4 text-red-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
            <span className={saveStatus === 'error' || testPrintStatus === 'error' ? 'text-red-300' : 'text-stone-300'}>
              {statusMessage}
            </span>
          </div>
          <button
            onClick={() => setStatusMessage('')}
            className="text-stone-400 hover:text-white text-xs cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Studio Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Settings Panel (7 cols) */}
        <section className="lg:col-span-7 space-y-6">
          {/* Section 1: Printer Hardware Device */}
          <div className="rounded-2xl border border-white/10 bg-[#12141A]/80 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Printer className="h-4 w-4 text-stone-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                  1. Hardware Device Target
                </h2>
              </div>
              <button
                onClick={detectPrinters}
                disabled={isDetectingPrinters}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-400 hover:text-white cursor-pointer"
              >
                <RefreshCw className={`h-3 w-3 ${isDetectingPrinters ? 'animate-spin' : ''}`} />
                <span>Scan Windows Printers</span>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                  Selected Printer
                </label>
                {printers.length > 0 ? (
                  <select
                    value={config.printerDeviceName}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, printerDeviceName: e.target.value }))
                    }
                    className="w-full rounded-xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white focus:border-white/40 focus:outline-none"
                  >
                    <option value="">(Auto-Detect Thermal Badge Printer)</option>
                    {printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} {p.isDefault ? ' [Windows Default]' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={config.printerDeviceName}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, printerDeviceName: e.target.value }))
                    }
                    placeholder="e.g. Zebra ZD420, Brother QL-800, Epson TM-T88 (or leave empty for auto)"
                    className="w-full rounded-xl bg-black/40 border border-white/15 px-3.5 py-2.5 text-sm text-white placeholder:text-stone-500 focus:border-white/40 focus:outline-none font-mono"
                  />
                )}
                <p className="mt-1.5 text-[11px] text-stone-400">
                  Leave empty to let the system automatically detect connected Zebra, Brother, TSC, or thermal badge printers.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Presets & Paper Dimensions */}
          <div className="rounded-2xl border border-white/10 bg-[#12141A]/80 p-5 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-stone-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                2. Badge Format & Dimensions
              </h2>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
              {PRESET_OPTIONS.map((opt) => {
                const isSelected = config.preset === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handlePresetSelect(opt.id)}
                    className={`text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-white bg-white/10 shadow-sm ring-1 ring-white/30'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-white">{opt.title}</span>
                      <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-white/10 text-stone-300 font-semibold">
                        {opt.badgeSize}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-stone-400 leading-relaxed">
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Manual Dimensions Tuning */}
            <div className="pt-3 border-t border-white/10 grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-stone-400 mb-1">
                  Width (e.g. 102mm, 4in)
                </label>
                <input
                  type="text"
                  value={config.width}
                  onChange={(e) => handleWidthChange(e.target.value)}
                  placeholder="e.g. 102mm or 4in"
                  className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-1.5 text-xs text-white font-mono focus:border-white/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-400 mb-1">
                  Height (e.g. 152mm, 6in)
                </label>
                <input
                  type="text"
                  value={config.height}
                  onChange={(e) => handleHeightChange(e.target.value)}
                  placeholder="e.g. 152mm or 6in"
                  className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-1.5 text-xs text-white font-mono focus:border-white/40 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-stone-400 mb-1">
                  Orientation
                </label>
                <select
                  value={config.orientation}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      orientation: e.target.value as 'portrait' | 'landscape',
                    }))
                  }
                  className="w-full rounded-lg bg-black/40 border border-white/15 px-3 py-1.5 text-xs text-white focus:border-white/40 focus:outline-none"
                >
                  <option value="portrait">Portrait</option>
                  <option value="landscape">Landscape</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Color & Thermal Contrast Mode */}
          <div className="rounded-2xl border border-white/10 bg-[#12141A]/80 p-5 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="h-4 w-4 text-stone-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                3. Color & Contrast Mode
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              {[
                {
                  id: 'full-color',
                  title: 'Full Color',
                  desc: 'Vibrant for dye-sublimation PVC & laser card printers',
                },
                {
                  id: 'monochrome',
                  title: 'Monochrome B&W',
                  desc: 'Pure crisp black & white for thermal badge heads',
                },
                {
                  id: 'high-contrast',
                  title: 'High Contrast',
                  desc: 'Bold edges & prominent elements for fast scanners',
                },
              ].map((m) => {
                const active = config.colorMode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() =>
                      setConfig((prev) => ({ ...prev, colorMode: m.id as PrintColorMode }))
                    }
                    className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                      active
                        ? 'border-white bg-white/10 ring-1 ring-white/30'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <span className="font-bold text-xs text-white block">{m.title}</span>
                    <span className="text-[10px] text-stone-400 block mt-1 leading-snug">
                      {m.desc}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Accent Color Swatches */}
            {config.colorMode !== 'monochrome' && (
              <div className="pt-3 border-t border-white/10">
                <label className="block text-xs font-semibold text-stone-300 mb-2">
                  Event Brand / Header Accent Color
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    {SWATCHES.map((s) => (
                      <button
                        key={s.hex}
                        onClick={() => setConfig((prev) => ({ ...prev, accentColor: s.hex }))}
                        className={`h-7 w-7 rounded-full border-2 transition cursor-pointer ${
                          config.accentColor.toLowerCase() === s.hex.toLowerCase()
                            ? 'border-white scale-110 shadow-lg'
                            : 'border-transparent opacity-80 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: s.hex }}
                        title={s.name}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs font-mono text-stone-400">Custom:</span>
                    <input
                      type="color"
                      value={config.accentColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, accentColor: e.target.value }))
                      }
                      className="h-8 w-10 rounded cursor-pointer border border-white/20 bg-transparent p-0"
                    />
                    <input
                      type="text"
                      value={config.accentColor}
                      onChange={(e) =>
                        setConfig((prev) => ({ ...prev, accentColor: e.target.value }))
                      }
                      className="w-20 rounded-lg bg-black/40 border border-white/15 px-2 py-1 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Badge Layout Elements & Typography */}
          <div className="rounded-2xl border border-white/10 bg-[#12141A]/80 p-5 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-4">
              <Sliders className="h-4 w-4 text-stone-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                4. Elements & Typography
              </h2>
            </div>

            {/* Event Name Override */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-stone-300 mb-1">
                Event Title on Badge
              </label>
              <input
                type="text"
                value={config.eventName}
                onChange={(e) => setConfig((prev) => ({ ...prev, eventName: e.target.value }))}
                className="w-full rounded-xl bg-black/40 border border-white/15 px-3.5 py-2 text-sm text-white font-mono focus:border-white/40 focus:outline-none"
              />
            </div>

            {/* Layout Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <label className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer">
                <span className="text-xs font-semibold text-stone-200">Lanyard Slot</span>
                <input
                  type="checkbox"
                  checked={config.showLanyardHole}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, showLanyardHole: e.target.checked }))
                  }
                  className="rounded border-white/20 text-white focus:ring-0 cursor-pointer h-4 w-4"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer">
                <span className="text-xs font-semibold text-stone-200">Brand Logo</span>
                <input
                  type="checkbox"
                  checked={config.showLogo}
                  onChange={(e) => setConfig((prev) => ({ ...prev, showLogo: e.target.checked }))}
                  className="rounded border-white/20 text-white focus:ring-0 cursor-pointer h-4 w-4"
                />
              </label>
              <label className="flex items-center justify-between p-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer">
                <span className="text-xs font-semibold text-stone-200">Company Name</span>
                <input
                  type="checkbox"
                  checked={config.showCompany}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, showCompany: e.target.checked }))
                  }
                  className="rounded border-white/20 text-white focus:ring-0 cursor-pointer h-4 w-4"
                />
              </label>
            </div>

            {/* QR Size and Name Font Scale */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/10">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-stone-300">
                    QR Code Size ({config.qrSize}px)
                  </label>
                </div>
                <input
                  type="range"
                  min="90"
                  max="180"
                  step="5"
                  value={config.qrSize}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, qrSize: parseInt(e.target.value, 10) }))
                  }
                  className="w-full accent-white cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1">
                  Name Typography Scale
                </label>
                <div className="flex gap-2">
                  {(['compact', 'normal', 'large'] as FontSizeScale[]).map((scale) => (
                    <button
                      key={scale}
                      onClick={() => setConfig((prev) => ({ ...prev, fontSizeScale: scale }))}
                      className={`flex-1 py-1.5 rounded-lg border text-xs font-medium capitalize transition cursor-pointer ${
                        config.fontSizeScale === scale
                          ? 'border-white bg-white/15 text-white font-bold'
                          : 'border-white/10 bg-white/5 text-stone-400 hover:text-white'
                      }`}
                    >
                      {scale}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Interactive Live Preview & Print Bed (5 cols) */}
        <section className="lg:col-span-5 sticky top-24 space-y-4">
          <div className="rounded-3xl border border-white/15 bg-[#12141A] p-6 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            {/* Header / Ruler indicator */}
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-stone-400" />
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-stone-300">
                  Live Visual Bed (1:1 Scale)
                </span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-stone-400 bg-white/5 px-2.5 py-1 rounded-md border border-white/10">
                <Maximize2 className="h-3 w-3" />
                <span>{config.width} × {config.height}</span>
              </div>
            </div>

            {/* Attendee Sample Switcher */}
            <div className="flex items-center justify-between mb-4 bg-white/5 p-1.5 rounded-xl border border-white/10">
              <span className="text-[11px] font-mono text-stone-400 pl-2">Sample Role:</span>
              <div className="flex gap-1">
                {SAMPLE_ATTENDEES.map((att, idx) => (
                  <button
                    key={att.id}
                    onClick={() => setSampleIndex(idx)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      sampleIndex === idx
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-stone-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {att.ticketType}
                  </button>
                ))}
              </div>
            </div>

            {/* Live Badge Preview Stage */}
            <div className="flex justify-center items-center py-6 bg-[#08090C]/60 rounded-2xl border border-dashed border-white/15 relative overflow-auto min-h-[480px]">
              {/* Dimensions grid guidelines */}
              <div className="absolute top-2 left-3 font-mono text-[9px] text-stone-500 uppercase tracking-wider">
                Target: {config.printerDeviceName || 'Default System Printer'}
              </div>
              <div className="absolute bottom-2 right-3 font-mono text-[9px] text-stone-500 uppercase">
                Mode: {config.colorMode}
              </div>

              {/* Reactive Badge Component */}
              <BadgeCard
                attendee={activeSample}
                config={config}
                eventName={config.eventName}
              />
            </div>

            {/* Action Bar Under Preview */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={handleTestPrint}
                disabled={testPrintStatus === 'printing'}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-white/10 hover:bg-white/15 border border-white/20 transition cursor-pointer active:scale-[0.98] disabled:opacity-50"
              >
                {testPrintStatus === 'printing' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin text-white" />
                    Printing Test Badge...
                  </>
                ) : (
                  <>
                    <Printer className="h-4 w-4" />
                    Dispatch Test Print
                  </>
                )}
              </button>
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs uppercase tracking-wider text-slate-900 bg-white hover:bg-stone-200 transition cursor-pointer active:scale-[0.98] disabled:opacity-50 shadow-lg"
              >
                {saveStatus === 'saving' ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
            <p className="mt-2.5 text-center text-[10px] text-stone-400">
              Saved configuration is automatically read by ARTECH-Station.exe and all booth kiosks.
            </p>
          </div>
        </section>
      </main>

      {/* Dedicated Print Portal for @media print (Test Print) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="print-badge-container">
            <BadgeCard attendee={activeSample} isPrintable={true} config={config} />
          </div>,
          document.body
        )}
    </div>
  );
}
