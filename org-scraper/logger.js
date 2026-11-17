import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function createLogger() {
  const directory = join(process.cwd(), "logs");
  await mkdir(directory, { recursive: true });
  const file = join(directory, `org-scraper-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}.log`);
  const write = async (level, message) => {
    const output = `${new Date().toISOString()} ${level.toUpperCase()} ${String(message).replace(/[\r\n]+/g, " ")}`;
    console[level === "error" ? "error" : "log"](output);
    await appendFile(file, `${output}\n`, "utf8");
  };
  return { file, info: (message) => write("info", message), error: (message) => write("error", message) };
}
