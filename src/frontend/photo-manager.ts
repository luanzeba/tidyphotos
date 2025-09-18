import { Photo } from "./types.js";

export class PhotoManager {
  private photos: Photo[] = [];
  private loading: boolean = true;

  get isLoading(): boolean {
    return this.loading;
  }

  get allPhotos(): Photo[] {
    return this.photos;
  }

  async loadPhotos(): Promise<void> {
    console.log("📡 TidyPhotos: Loading photos from API...");
    try {
      const response = await fetch("/api/photos");
      console.log("📡 TidyPhotos: API response status:", response.status);
      this.photos = (await response.json()) as Photo[];
      console.log(
        "📷 TidyPhotos: Loaded",
        this.photos.length,
        "photos:",
        this.photos,
      );

      // Mock data for now
      if (this.photos.length === 0) {
        console.log("⚠️ TidyPhotos: No photos from API, using mock data");
        this.photos = this.generateMockPhotos();
      }

      this.loading = false;
      console.log("✅ TidyPhotos: Photos loaded successfully");
    } catch (error) {
      console.error("❌ TidyPhotos: Failed to load photos:", error);
      this.photos = this.generateMockPhotos();
      this.loading = false;
    }
  }

  private generateMockPhotos(): Photo[] {
    const photos: Photo[] = [];
    const currentDate = new Date();

    for (let i = 0; i < 50; i++) {
      const date = new Date(currentDate);
      date.setDate(date.getDate() - Math.floor(Math.random() * 365));

      photos.push({
        id: i + 1,
        name: `Photo ${i + 1}`,
        thumbnail: `https://picsum.photos/300/300?random=${i}`,
        date: date.toISOString(),
        favorite: Math.random() > 0.8,
        tags:
          Math.random() > 0.7
            ? [["family", "vacation", "nature"][Math.floor(Math.random() * 3)]]
            : undefined,
      });
    }

    return photos;
  }

  toggleFavorite(photoId: number): void {
    const photo = this.photos.find((p) => p.id === photoId);
    console.log(
      "⭐ TidyPhotos: Toggling favorite for photo ID",
      photoId,
      "favorite:",
      photo?.favorite,
    );
    if (photo) {
      photo.favorite = !photo.favorite;
      // TODO: API call to update favorite status
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
}

