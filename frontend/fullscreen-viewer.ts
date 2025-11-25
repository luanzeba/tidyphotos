import { Photo } from "./types.js";
import type { TidyPhotosApp } from "./tidyphotos-app.js";

// ⚠️ DEPRECATED: Face tagging functionality has been moved to Alpine.js stores
//
// Face tagging is now handled by Alpine stores in public/index.html:
// - Alpine.store('viewer') - Manages tagging state, drawing, and tag CRUD operations
// - Alpine.store('tagging') - Manages tag assignment modal UI
// - Alpine.store('people') - Manages global people data
//
// All tagging-related methods and state have been removed from this class.
// This class is kept for backwards compatibility and may be deleted in the future.
//
// NOTE: Photo selection state has been moved to Alpine store (app.selectedPhotoIndex)
// This class now reads from Alpine store as the single source of truth

declare const Alpine: any;

export class FullscreenViewer {
  private app: TidyPhotosApp;
  private fullScreenMode: boolean = false;
  // currentPhotoIndex REMOVED - now reads from Alpine.store('app').selectedPhotoIndex

  constructor(app: TidyPhotosApp) {
    this.app = app;
  }

  get isFullScreen(): boolean {
    return this.fullScreenMode;
  }

  // Read photo index from Alpine store (single source of truth)
  get photoIndex(): number {
    if (typeof Alpine !== "undefined") {
      return Alpine.store("app").selectedPhotoIndex ?? 0;
    }
    return 0;
  }

  // Read current photo from Alpine store (single source of truth)
  get currentPhoto(): Photo | null {
    if (!this.fullScreenMode) return null;
    if (typeof Alpine !== "undefined") {
      return Alpine.store("app").selectedPhoto;
    }
    return null;
  }

  // Navigation methods REMOVED - now handled by Alpine.store('app') and Alpine.store('viewer')

  // DEPRECATED: toggleFavorite moved to Alpine.store('photos').toggleFavorite()
  async toggleFavorite(): Promise<void> {
    console.warn('FullscreenViewer.toggleFavorite is deprecated - use Alpine.store("photos").toggleFavorite() instead');
  }

  // DEPRECATED: All face tagging functionality moved to Alpine stores
  // - toggleTaggingMode() → Alpine.store('viewer').toggleTaggingMode()
  // - startDrawingTag() → Alpine.store('viewer').startDrawingTag()
  // - updateDrawingTag() → Alpine.store('viewer').updateDrawingTag()
  // - finishDrawingTag() → Alpine.store('viewer').finishDrawingTag()
  // - removeTag() → Alpine.store('viewer').removeTag()
  // - assignPersonToTag() → Alpine.store('tagging').assignPersonToTag()
  // - loadFaceTagsForCurrentPhoto() → Alpine.store('viewer').loadFaceTags()
  // - saveFaceTags() → Alpine.store('viewer').toggleTaggingMode()

  // DEPRECATED: Keyboard handling now done by Alpine store in index.html
  // handleKeyboard(event: KeyboardEvent): void {
  //   if (!this.fullScreenMode) return;
  //
  //   switch (event.key) {
  //     case "ArrowRight":
  //       event.preventDefault();
  //       this.nextPhoto();
  //       break;
  //
  //     case "ArrowLeft":
  //       event.preventDefault();
  //       this.previousPhoto();
  //       break;
  //
  //     case "f":
  //     case "F":
  //       event.preventDefault();
  //       this.toggleFavorite();
  //       break;
  //
  //     case "t":
  //     case "T":
  //       event.preventDefault();
  //       this.toggleTaggingMode();
  //       break;
  //
  //     case "Escape":
  //       event.preventDefault();
  //       if (this.taggingMode) {
  //         this.toggleTaggingMode();
  //       } else {
  //         this.closeFullScreen();
  //       }
  //       break;
  //
  //     case "q":
  //     case "Q":
  //       event.preventDefault();
  //       this.closeFullScreen();
  //       break;
  //   }
  // }
}
