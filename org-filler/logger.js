import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

function datePart(date) {
  return date.toISOString().slice(0, 10);
}

function line(level, message) {
  return `${new Date().toISOString()} ${level.toUpperCase()} ${String(message).replace(/[\r\n]+/g, " ")}`;
}

export function formatDuration(milliseconds) {
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(1)}s`;
  return `${Math.floor(milliseconds / 60_000)}m ${((milliseconds % 60_000) / 1000).toFixed(1)}s`;
}

export async function createLogger() {
  const directory = join(process.cwd(), "logs");
  const file = join(directory, `org-filler-${datePart(new Date())}.log`);
  await mkdir(directory, { recursive: true });
  const write = async (level, message) => {
    const output = line(level, message);
    console[(level === "error") ? "error" : "log"](output);
    await appendFile(file, `${output}\n`, "utf8");
  };
  return {
    file,
    info: (message) => write("info", message),
    error: (message) => write("error", message)
  };
}