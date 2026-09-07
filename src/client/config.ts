// What /__devbar/config hands the browser (the endpoint keeps its old name; the classes keep dt-). Mirrors buildConfig() in the middleware.
export type DeviceFrame = { src: string; w: number; h: number; sx: number; sy: number; sw: number; sh: number };
export type Breakpoint = {
  id: string; label: string; min: number; max: number; ideal: number;
  frameH: number | null; device: string | null; frame: DeviceFrame | null; icon: string;
};
export type Device = { id: string; label: string; group: string; w: number; h: number; frame: DeviceFrame };
export type Category = { id: string; label: string; color: string };
export type Page = { route: string; name: string; label: string; group: string };
export type MitkaConfig = {
  pages: Page[];
  groups: string[];
  breakpoints: Breakpoint[];
  devices: Device[];
  categories: Category[];
  sanity: boolean;
  ignore: string[];
  grid: { container: string; grid: string; columns: number };
  zIndex: number;
};

export async function loadConfig(): Promise<MitkaConfig> {
  const res = await fetch("/__devbar/config");
  if (!res.ok) throw new Error(`/__devbar/config ${res.status}`);
  const cfg = (await res.json()) as MitkaConfig;
  // JSON cannot carry Infinity; the widest band comes back as null
  cfg.breakpoints = cfg.breakpoints.map((b) => ({ ...b, max: b.max ?? Infinity }));
  return cfg;
}
