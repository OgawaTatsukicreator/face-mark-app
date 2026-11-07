export type MaskKind = "solid" | "mosaic" | "blur" | "stamp";

export type Box = {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
};

export type MaskSettings = {
  kind: MaskKind;
  color: string;
  opacity: number;
  scale: number;
  pixelSize: number;
  blurRadius: number;
};

export type Region = {
  id: string;
  box: Box;
  /** Original detector coordinates stay in box when the user moves a region. */
  adjustment?: Box;
  probability: number | null;
  enabled: boolean;
  source: "detected" | "manual";
  settings?: Partial<MaskSettings>;
};

export type EditState = {
  regions: Region[];
  settings: MaskSettings;
  threshold: number;
};

export type EditHistory = {
  past: EditState[];
  present: EditState;
  future: EditState[];
};

export type ImageItem = {
  id: string;
  file: File;
  url: string;
  width: number;
  height: number;
  status: "queued" | "processing" | "done" | "error";
  error?: string;
  history: EditHistory;
  isSample?: boolean;
};

export const MAX_IMAGES = 10;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MAX_DIMENSION = 8192;
export const MAX_PIXELS = 24_000_000;
export const HISTORY_LIMIT = 50;

export const DEFAULT_SETTINGS: MaskSettings = {
  kind: "solid",
  color: "#000000",
  opacity: 1,
  scale: 1.15,
  pixelSize: 14,
  blurRadius: 12,
};

function bounded(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/** Only explicitly supported settings are restored from untrusted localStorage. */
export function sanitizeSettings(input: unknown): MaskSettings {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const kinds: MaskKind[] = ["solid", "mosaic", "blur", "stamp"];
  return {
    kind: kinds.includes(value.kind as MaskKind) ? value.kind as MaskKind : DEFAULT_SETTINGS.kind,
    color: typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)
      ? value.color : DEFAULT_SETTINGS.color,
    opacity: bounded(value.opacity, DEFAULT_SETTINGS.opacity, 0, 1),
    scale: bounded(value.scale, DEFAULT_SETTINGS.scale, 0.5, 2),
    pixelSize: Math.round(bounded(value.pixelSize, DEFAULT_SETTINGS.pixelSize, 2, 80)),
    blurRadius: bounded(value.blurRadius, DEFAULT_SETTINGS.blurRadius, 1, 60),
  };
}

export function clampBox(box: Box, width: number, height: number): Box | null {
  if (![width, height, box.x_min, box.y_min, box.x_max, box.y_max].every(Number.isFinite)
      || width <= 0 || height <= 0 || box.x_max <= box.x_min || box.y_max <= box.y_min) return null;
  const result = {
    x_min: Math.max(0, Math.min(width, box.x_min)),
    y_min: Math.max(0, Math.min(height, box.y_min)),
    x_max: Math.max(0, Math.min(width, box.x_max)),
    y_max: Math.max(0, Math.min(height, box.y_max)),
  };
  return result.x_max > result.x_min && result.y_max > result.y_min ? result : null;
}

export function effectiveBox(region: Region, state: EditState, width: number, height: number): Box | null {
  const box = region.adjustment ?? region.box;
  if (![box.x_min, box.y_min, box.x_max, box.y_max].every(Number.isFinite)
      || box.x_max <= box.x_min || box.y_max <= box.y_min) return null;
  const scale = sanitizeSettings({ ...state.settings, ...region.settings }).scale;
  const centerX = (box.x_min + box.x_max) / 2;
  const centerY = (box.y_min + box.y_max) / 2;
  const halfWidth = (box.x_max - box.x_min) * scale / 2;
  const halfHeight = (box.y_max - box.y_min) * scale / 2;
  return clampBox({
    x_min: Math.floor(centerX - halfWidth), y_min: Math.floor(centerY - halfHeight),
    x_max: Math.ceil(centerX + halfWidth), y_max: Math.ceil(centerY + halfHeight),
  }, width, height);
}

export function activeRegions(state: EditState): Region[] {
  return state.regions.filter((region) => region.enabled && (
    region.source === "manual" || region.probability === null || region.probability >= state.threshold
  ));
}

function cloneState(state: EditState): EditState {
  return {
    settings: { ...state.settings },
    threshold: state.threshold,
    regions: state.regions.map((region) => ({
      ...region,
      box: { ...region.box },
      ...(region.adjustment ? { adjustment: { ...region.adjustment } } : {}),
      ...(region.settings ? { settings: { ...region.settings } } : {}),
    })),
  };
}

export function createHistory(settings: MaskSettings = DEFAULT_SETTINGS, regions: Region[] = []): EditHistory {
  return { past: [], present: cloneState({ settings: sanitizeSettings(settings), regions, threshold: 0 }), future: [] };
}

export function editHistory(history: EditHistory, next: EditState): EditHistory {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history;
  return {
    past: [...history.past, cloneState(history.present)].slice(-HISTORY_LIMIT),
    present: cloneState(next),
    future: [],
  };
}

export function undoHistory(history: EditHistory): EditHistory {
  if (!history.past.length) return history;
  return {
    past: history.past.slice(0, -1),
    present: cloneState(history.past[history.past.length - 1]),
    future: [cloneState(history.present), ...history.future].slice(0, HISTORY_LIMIT),
  };
}

export function redoHistory(history: EditHistory): EditHistory {
  if (!history.future.length) return history;
  return {
    past: [...history.past, cloneState(history.present)].slice(-HISTORY_LIMIT),
    present: cloneState(history.future[0]),
    future: history.future.slice(1),
  };
}
