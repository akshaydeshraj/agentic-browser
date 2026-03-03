import * as fs from "fs/promises";
import * as path from "path";
import type { Profile } from "../types.js";

export class ProfileManager {
  constructor(private profilesDir: string) {}

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
    const dataDir = path.join(this.profilesDir, name);
    await fs.mkdir(dataDir, { recursive: true });
    const stat = await fs.stat(dataDir);
    return { name, dataDir, createdAt: stat.birthtime.toISOString() };
  }

  async deleteProfile(name: string): Promise<void> {
    const dataDir = path.join(this.profilesDir, name);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}
