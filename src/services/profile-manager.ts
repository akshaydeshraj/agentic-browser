import * as fs from "fs/promises";
import * as path from "path";
import type { Profile } from "../types.js";

export class ProfileManager {
  constructor(private profilesDir: string) {}

  private safeName(name: string): string {
    // Only allow alphanumeric, hyphens, underscores
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error(
        `Invalid profile name: "${name}". Only alphanumeric, hyphens, and underscores allowed.`,
      );
    }
    // Verify resolved path stays under profilesDir
    const resolved = path.resolve(this.profilesDir, name);
    if (!resolved.startsWith(path.resolve(this.profilesDir) + path.sep)) {
      throw new Error(`Invalid profile name: "${name}"`);
    }
    return name;
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.profilesDir, { recursive: true });
  }

  async listProfiles(): Promise<Profile[]> {
    await this.ensureDir();
    const entries = await fs.readdir(this.profilesDir, { withFileTypes: true });
    const profiles: Profile[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dataDir = path.join(this.profilesDir, entry.name);
      const stat = await fs.stat(dataDir);
      profiles.push({
        name: entry.name,
        dataDir,
        createdAt: stat.birthtime.toISOString(),
      });
    }
    return profiles;
  }

  async createProfile(name: string): Promise<Profile> {
    const safe = this.safeName(name);
    const dataDir = path.join(this.profilesDir, safe);
    await fs.mkdir(dataDir, { recursive: true });
    const stat = await fs.stat(dataDir);
    return { name: safe, dataDir, createdAt: stat.birthtime.toISOString() };
  }

  async deleteProfile(name: string): Promise<void> {
    const safe = this.safeName(name);
    const dataDir = path.join(this.profilesDir, safe);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}
