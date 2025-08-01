import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { logChange } from "@/app/utils/logger";

const jsonFilePath = path.resolve(process.cwd(), "app/data/json/settings.json");

async function getSettings() {
  try {
    const data = await fs.readFile(jsonFilePath, "utf-8");
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function saveSettings(settings: any) {
  await fs.writeFile(jsonFilePath, JSON.stringify(settings, null, 2));
}

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  const newSettings = await request.json();
  await saveSettings(newSettings);
  logChange("settings.json", "Settings updated");
  return NextResponse.json(newSettings, { status: 200 });
}
