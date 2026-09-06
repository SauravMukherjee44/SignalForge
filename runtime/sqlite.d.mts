export function openDatabase(filename: string): D1Database & {
  close(): void;
  migrate(directory: string): void;
};
