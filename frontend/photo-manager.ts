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
      const data = await response.json();
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      this.photos = data as Photo[];

      // // Mock data for now
      // if (this.photos.length === 0) {
      //   console.log("⚠️ TidyPhotos: No photos from API, using mock data");
      //   this.photos = this.generateMockPhotos();
      // }

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

  async toggleFavorite(photoId: number): Promise<void> {
    const photo = this.photos.find((p) => p.id === photoId);
    console.log(
      "⭐ TidyPhotos: Toggling favorite for photo ID",
      photoId,
      "favorite:",
      photo?.favorite,
    );

    if (photo) {
      const originalState = photo.favorite;
      const newFavoriteState = !originalState;

      // Optimistic update: Update UI immediately
      photo.favorite = newFavoriteState;
      console.log(
        `🚀 Optimistic update: ${newFavoriteState ? "adding" : "removing"} favorite for ${photo.name}`,
      );

      try {
        // Call API to persist the change
        const method = newFavoriteState ? "PUT" : "DELETE";
        const response = await fetch(
          `/api/photos/${encodeURIComponent(photo.name)}/favorite`,
          {
            method: method,
          },
        );

        if (response.ok) {
          // API call succeeded - optimistic update was correct
          console.log(
            `✅ Successfully ${newFavoriteState ? "added" : "removed"} favorite for ${photo.name}`,
          );
        } else {
          // API call failed - revert the optimistic update
          photo.favorite = originalState;
          console.error(
            `❌ Failed to ${newFavoriteState ? "add" : "remove"} favorite, reverting UI:`,
            response.status,
            response.statusText,
          );
        }
      } catch (error) {
        // Network error - revert the optimistic update
        photo.favorite = originalState;
        console.error(
          "❌ Network error while updating favorite, reverting UI:",
          error,
        );
      }
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
