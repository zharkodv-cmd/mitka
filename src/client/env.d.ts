declare module "*.css";
interface ImportMeta {
  readonly hot?: { accept(cb?: (mod: unknown) => void): void };
}
