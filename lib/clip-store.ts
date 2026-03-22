// In-memory clip storage for MVP
export interface StoredClip {
  id: string;
  title: string;
  url: string;
  duration: number;
  createdAt: string; // ISO string
  streamUrl: string;
}

class ClipStore {
  private clips: Map<string, StoredClip> = new Map();

  addClip(clip: StoredClip): void {
    this.clips.set(clip.id, clip);
  }

  getClips(): StoredClip[] {
    return Array.from(this.clips.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getClip(id: string): StoredClip | undefined {
    return this.clips.get(id);
  }

  deleteClip(id: string): boolean {
    return this.clips.delete(id);
  }

  clear(): void {
    this.clips.clear();
  }
}

export const clipStore = new ClipStore();
