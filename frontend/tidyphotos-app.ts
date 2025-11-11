import { Photo, Month, MobileTimelineView, Person } from "./types.js";
import { Router } from "./router.js";
import { FullscreenViewer } from "./fullscreen-viewer.js";
import { KeyboardHandler } from "./keyboard-handler.js";

// Helper functions for timeline filtering (extracted from TimelineManager)
function getYears(photos: Photo[]): number[] {
  const yearSet = new Set<number>();
  photos.forEach((photo) => {
    const date = new Date(photo.date);
    yearSet.add(date.getFullYear());
  });
  return Array.from(yearSet).sort((a, b) => b - a);
}

function getMonths(photos: Photo[], selectedYear: number | null): Month[] {
  if (!selectedYear) return [];

  const monthNames: string[] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const monthSet = new Set<number>();
  photos.forEach((photo) => {
    const date = new Date(photo.date);
    if (date.getFullYear() === selectedYear) {
      monthSet.add(date.getMonth());
    }
  });

  return Array.from(monthSet)
    .sort((a, b) => b - a)
    .map((month) => ({
      number: month,
      name: monthNames[month],
    }));
}

function filterPhotos(
  photos: Photo[],
  searchQuery: string,
  selectedYear: number | null,
  selectedMonth: number | null,
): Photo[] {
  let filtered = photos;

  // Filter by search query
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (photo) =>
        photo.name.toLowerCase().includes(query) ||
        photo.tags?.some((tag) => tag.toLowerCase().includes(query)),
    );
  }

  // Filter by timeline selection
  if (selectedYear) {
    filtered = filtered.filter((photo) => {
      const date = new Date(photo.date);
      const yearMatch = date.getFullYear() === selectedYear;

      if (selectedMonth !== null) {
        return yearMatch && date.getMonth() === selectedMonth;
      }
      return yearMatch;
    });
  }

  return filtered.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function generateMockPhotos(): Photo[] {
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

// Alpine.js compatibility class for components that need instance methods
// This is a minimal shim that allows existing components to work while
// the actual state is managed by Alpine.js reactive data
export class TidyPhotosApp {
  viewer: FullscreenViewer;
  keyboardHandler: KeyboardHandler;
  router: Router;

  // Reference to Alpine data (set after creation)
  private alpineData: any = null;

  constructor() {
    this.viewer = new FullscreenViewer(this);
    this.keyboardHandler = new KeyboardHandler(this);
    this.router = new Router(this);
  }

  setAlpineData(data: any): void {
    this.alpineData = data;
  }

  // Component getters
  getViewer(): FullscreenViewer {
    return this.viewer;
  }

  getKeyboardHandler(): KeyboardHandler {
    return this.keyboardHandler;
  }

  getRouter(): Router {
    return this.router;
  }

  // Compatibility methods that delegate to Alpine data
  getCurrentGallery(): string {
    return "all";
  }

  get currentSelectedPhotoId(): number | null {
    return this.alpineData?.selectedPhotoId ?? null;
  }

  get fullScreenMode(): boolean {
    return this.viewer.isFullScreen;
  }

  get currentPhoto(): Photo | null {
    return this.viewer.currentPhoto;
  }

  getCurrentView(): string {
    return this.alpineData?.currentView ?? "photos";
  }

  getSelectedPhotoId(): number | null {
    return this.alpineData?.selectedPhotoId ?? null;
  }

  getFilteredPhotos(): Photo[] {
    if (!this.alpineData) return [];
    return filterPhotos(
      this.alpineData.photos,
      this.alpineData.searchQuery,
      this.alpineData.selectedYear,
      this.alpineData.selectedMonth,
    );
  }

  // Methods that mutate Alpine state
  selectPhoto(photoId: number): void {
    if (this.alpineData) {
      this.alpineData.selectedPhotoId = photoId;
    }
  }

  setSelectedPhotoId(photoId: number | null): void {
    if (this.alpineData) {
      this.alpineData.selectedPhotoId = photoId;
    }
  }

  setCurrentGallery(_gallery: string): void {
    // Gallery system is unused, no-op
  }

  setCurrentView(view: "photos" | "people"): void {
    if (this.alpineData) {
      this.alpineData.currentView = view;
    }
  }

  setFullScreenMode(fullScreen: boolean): void {
    if (!fullScreen) {
      this.viewer.closeFullScreen();
    }
  }

  closeFullScreen(): void {
    this.viewer.closeFullScreen();
    if (this.alpineData) {
      this.alpineData.syncViewerState();
    }
  }

  openFullScreenFromRoute(photoId: number): void {
    this.viewer.openFullScreenFromRoute(photoId);
    if (this.alpineData) {
      this.alpineData.syncViewerState();
    }
  }

  async toggleFavorite(photoId: number): Promise<void> {
    if (this.alpineData) {
      await this.alpineData.toggleFavorite(photoId);
    }
  }

  scrollSelectedIntoView(): void {
    setTimeout(() => {
      const selectedElement = document.querySelector(".photo-item.selected");
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }, 0);
  }

  // Stub for legacy PhotoManager interface
  getPhotoManager(): any {
    return {
      allPhotos: this.alpineData?.photos ?? [],
      toggleFavorite: (photoId: number) => this.toggleFavorite(photoId),
    };
  }
}

// Factory function for Alpine.js
declare global {
  interface Window {
    photoApp(): any;
  }
}

let appInstance: TidyPhotosApp | null = null;

window.photoApp = function(): any {
  if (!appInstance) {
    appInstance = new TidyPhotosApp();
  }

  // Return pure Alpine.js reactive data object
  const alpineData = {
    // Photo data (reactive)
    photos: [] as Photo[],
    loading: true,

    // Timeline state (reactive)
    selectedYear: null as number | null,
    selectedMonth: null as number | null,
    mobileTimelineView: "all" as MobileTimelineView,

    // UI state (reactive)
    searchQuery: "",
    selectedPhotoId: null as number | null,
    currentView: "photos" as "photos" | "people",
    thumbnailSize: 200,

    // Fullscreen state (reactive - synced with viewer)
    fullScreenMode: false,
    currentPhoto: null as Photo | null,
    currentPhotoIndex: 0,

    // Face tagging state (reactive - synced with viewer)
    taggingMode: false,
    faceTags: [] as any[],
    showTagAssignModal: false,
    selectedTagId: null as number | null,
    isDrawingTag: false,
    drawingPreview: null as any,

    // Computed properties
    get years(): number[] {
      return getYears(this.photos);
    },

    get months(): Month[] {
      return getMonths(this.photos, this.selectedYear);
    },

    get filteredPhotos(): Photo[] {
      return filterPhotos(
        this.photos,
        this.searchQuery,
        this.selectedYear,
        this.selectedMonth,
      );
    },

    // Initialization
    async init() {
      console.log("🚀 TidyPhotos: Initializing...");

      // Load thumbnail size from localStorage
      const savedSize = localStorage.getItem("tidyphotos-thumbnail-size");
      if (savedSize) {
        this.thumbnailSize = parseInt(savedSize);
        document.documentElement.style.setProperty(
          "--thumbnail-size",
          savedSize + "px",
        );
      }

      // Load photos from API
      await this.loadPhotos();

      // Initialize router
      appInstance!.router.handleInitialRoute();

      console.log("✅ TidyPhotos: Initialization complete");
    },

    // Photo loading
    async loadPhotos() {
      console.log("📡 TidyPhotos: Loading photos from API...");
      try {
        const response = await fetch("/api/photos");
        const data = await response.json();
        if (!response.ok) {
          throw new Error(
            `API error: ${response.status} ${response.statusText}`,
          );
        }

        this.photos = data as Photo[];
        this.loading = false;
        console.log("✅ TidyPhotos: Photos loaded successfully");
      } catch (error) {
        console.error("❌ TidyPhotos: Failed to load photos:", error);
        this.photos = generateMockPhotos();
        this.loading = false;
      }
    },

    // Photo selection
    selectPhoto(photoId: number) {
      this.selectedPhotoId = photoId;
    },

    // Timeline methods
    selectYear(year: number) {
      this.selectedYear = year;
      this.selectedMonth = null;
    },

    selectMonth(month: number) {
      this.selectedMonth = month;
    },

    clearFilters() {
      this.selectedYear = null;
      this.selectedMonth = null;
    },

    setMobileView(view: MobileTimelineView) {
      this.mobileTimelineView = view;
      if (view === "all") {
        this.selectedYear = null;
        this.selectedMonth = null;
      }
    },

    // Photo operations
    async toggleFavorite(photoId: number) {
      const photo = this.photos.find((p: Photo) => p.id === photoId);
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
    },

    formatDate(dateString: string): string {
      return formatDate(dateString);
    },

    // Fullscreen methods
    async openFullScreen(photoId: number) {
      await appInstance!.viewer.openFullScreen(photoId);
      this.syncViewerState();
    },

    openFullScreenFromRoute(photoId: number) {
      appInstance!.viewer.openFullScreenFromRoute(photoId);
      this.syncViewerState();
    },

    closeFullScreen() {
      appInstance!.viewer.closeFullScreen();
      this.syncViewerState();
    },

    async nextPhoto() {
      await appInstance!.viewer.nextPhoto();
      this.syncViewerState();
    },

    async previousPhoto() {
      await appInstance!.viewer.previousPhoto();
      this.syncViewerState();
    },

    async toggleFullScreenFavorite() {
      await appInstance!.viewer.toggleFavorite();
      this.syncViewerState();
      // Also update the photo in the main photos array
      await this.loadPhotos();
    },

    // Sync viewer state to Alpine reactive properties
    syncViewerState() {
      this.fullScreenMode = appInstance!.viewer.isFullScreen;
      this.currentPhoto = appInstance!.viewer.currentPhoto
        ? { ...appInstance!.viewer.currentPhoto }
        : null;
      this.currentPhotoIndex = appInstance!.viewer.photoIndex;
      this.taggingMode = appInstance!.viewer.isTaggingMode;
      this.faceTags = appInstance!.viewer.faceTags.map((tag) => ({ ...tag }));
      this.isDrawingTag = appInstance!.viewer.isDrawing;
      this.drawingPreview = appInstance!.viewer.drawingPreview
        ? { ...appInstance!.viewer.drawingPreview }
        : null;
    },

    // Keyboard handlers
    handleKeyboard(event: KeyboardEvent) {
      appInstance!.keyboardHandler.handleGalleryKeyboard(event);
      this.syncViewerState();
    },

    handleFullScreenKeyboard(event: KeyboardEvent) {
      appInstance!.viewer.handleKeyboard(event);
      this.syncViewerState();
    },

    // Thumbnail size
    updateThumbnailSize(size: string) {
      this.thumbnailSize = parseInt(size);
      document.documentElement.style.setProperty(
        "--thumbnail-size",
        size + "px",
      );
      localStorage.setItem("tidyphotos-thumbnail-size", size);
    },

    // View management
    setCurrentView(view: "photos" | "people") {
      this.currentView = view;
      // Update URL when view changes
      appInstance!
        .getRouter()
        .updateUrl(this.fullScreenMode, "all", this.currentPhoto);
    },

    // Face tagging methods
    toggleTaggingMode() {
      appInstance!.viewer.toggleTaggingMode();
      this.syncViewerState();
    },

    startDrawingTag(event: MouseEvent) {
      appInstance!.viewer.startDrawingTag(event);
      this.syncViewerState();
    },

    updateDrawingTag(event: MouseEvent) {
      appInstance!.viewer.updateDrawingTag(event);
      this.syncViewerState();
    },

    finishDrawingTag(event: MouseEvent) {
      appInstance!.viewer.finishDrawingTag(event);
      this.syncViewerState();
    },

    removeTag(tagId: number) {
      appInstance!.viewer.removeTag(tagId);
      this.syncViewerState();
    },

    openTagAssignModal(tagId: number) {
      this.selectedTagId = tagId;
      this.showTagAssignModal = true;
    },

    assignPersonToTag(personId: number, personName: string) {
      if (this.selectedTagId) {
        appInstance!.viewer.assignPersonToTag(
          this.selectedTagId,
          personId,
          personName,
        );
        this.closeTagAssignModal();
        this.syncViewerState();
      }
    },

    closeTagAssignModal() {
      this.showTagAssignModal = false;
      this.selectedTagId = null;
    },

    async saveFaceTags() {
      await appInstance!.viewer.saveFaceTags();
      this.syncViewerState();
    },
  };

  // Connect Alpine data to app instance for compatibility
  appInstance.setAlpineData(alpineData);

  return alpineData;
};
