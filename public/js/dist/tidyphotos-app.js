import { FullscreenViewer } from "./fullscreen-viewer.js";
// Helper functions for timeline filtering (extracted from TimelineManager)
function getYears(photos) {
    const yearSet = new Set();
    photos.forEach((photo) => {
        const date = new Date(photo.date);
        yearSet.add(date.getFullYear());
    });
    return Array.from(yearSet).sort((a, b) => b - a);
}
function getMonths(photos, selectedYear) {
    if (!selectedYear)
        return [];
    const monthNames = [
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
    const monthSet = new Set();
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
function filterPhotos(photos, searchQuery, selectedYear, selectedMonth) {
    let filtered = photos;
    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter((photo) => photo.name.toLowerCase().includes(query) ||
            photo.tags?.some((tag) => tag.toLowerCase().includes(query)));
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
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
function generateMockPhotos() {
    const photos = [];
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
            tags: Math.random() > 0.7
                ? [["family", "vacation", "nature"][Math.floor(Math.random() * 3)]]
                : undefined,
        });
    }
    return photos;
}
// Alpine.js compatibility class for components that need instance methods
// This is a minimal shim that allows existing components to work while
// the actual state is managed by Alpine.js reactive data
// NOTE: Router and KeyboardHandler removed - functionality moved to Alpine stores
export class TidyPhotosApp {
    constructor() {
        // Reference to Alpine data (set after creation)
        this.alpineData = null;
        this.viewer = new FullscreenViewer(this);
    }
    setAlpineData(data) {
        this.alpineData = data;
    }
    // Component getters
    getViewer() {
        return this.viewer;
    }
    // Compatibility methods that delegate to Alpine data
    getCurrentGallery() {
        return "all";
    }
    get currentSelectedPhotoId() {
        return this.alpineData?.selectedPhotoId ?? null;
    }
    get fullScreenMode() {
        return this.viewer.isFullScreen;
    }
    get currentPhoto() {
        return this.viewer.currentPhoto;
    }
    getCurrentView() {
        if (typeof Alpine !== "undefined") {
            return Alpine.store("app").currentView;
        }
        return "photos";
    }
    getSelectedPhotoId() {
        return this.alpineData?.selectedPhotoId ?? null;
    }
    getFilteredPhotos() {
        if (!this.alpineData) {
            console.log("🔍 DEBUG: getFilteredPhotos() - alpineData is null, returning []");
            return [];
        }
        const filtered = filterPhotos(this.alpineData.photos, this.alpineData.searchQuery, this.alpineData.selectedYear, this.alpineData.selectedMonth);
        console.log("🔍 DEBUG: getFilteredPhotos() returning", filtered.length, "photos from", this.alpineData.photos.length, "total");
        return filtered;
    }
    // Methods that mutate Alpine state
    selectPhoto(photoId) {
        if (this.alpineData) {
            this.alpineData.selectedPhotoId = photoId;
        }
    }
    setSelectedPhotoId(photoId) {
        if (this.alpineData) {
            this.alpineData.selectedPhotoId = photoId;
        }
    }
    setCurrentGallery(_gallery) {
        // Gallery system is unused, no-op
    }
    setCurrentView(view) {
        // Use Alpine.store for global state management
        if (typeof Alpine !== "undefined") {
            Alpine.store("app").currentView = view;
        }
    }
    // DEPRECATED: These methods removed - fullscreen handled by Alpine store
    // setFullScreenMode, closeFullScreen, openFullScreenFromRoute
    async toggleFavorite(photoId) {
        if (this.alpineData) {
            await this.alpineData.toggleFavorite(photoId);
        }
    }
    scrollSelectedIntoView() {
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
    getPhotoManager() {
        const photos = this.alpineData?.photos ?? [];
        const isLoading = this.alpineData?.loading;
        console.log("🔍 DEBUG: getPhotoManager() called, returning:", {
            photosCount: photos.length,
            isLoading: isLoading,
        });
        return {
            allPhotos: photos,
            isLoading: isLoading,
            toggleFavorite: (photoId) => this.toggleFavorite(photoId),
        };
    }
}
let appInstance = null;
window.photoApp = function () {
    if (!appInstance) {
        appInstance = new TidyPhotosApp();
    }
    // Return pure Alpine.js reactive data object
    const alpineData = {
        // Photo data (reactive)
        photos: [],
        loading: true,
        // Timeline state (reactive)
        selectedYear: null,
        selectedMonth: null,
        mobileTimelineView: "all",
        // UI state (reactive)
        searchQuery: "",
        // selectedPhotoId REMOVED - now in Alpine.store('app').selectedPhotoIndex
        // currentView moved to Alpine.store('app')
        thumbnailSize: 200,
        // Fullscreen state (reactive - synced with viewer)
        fullScreenMode: false,
        // currentPhoto REMOVED - now in Alpine.store('app').selectedPhoto
        // currentPhotoIndex REMOVED - now in Alpine.store('app').selectedPhotoIndex
        // Face tagging state REMOVED - now in Alpine.store('viewer') and Alpine.store('tagging')
        // - taggingMode → Alpine.store('viewer').taggingMode
        // - faceTags → Alpine.store('viewer').faceTags
        // - showTagAssignModal → Alpine.store('tagging').showAssignModal
        // - selectedTagId → Alpine.store('tagging').selectedTagId
        // - isDrawingTag → Alpine.store('viewer').isDrawing
        // - drawingPreview → Alpine.store('viewer').drawingPreview
        // Computed properties
        get years() {
            return getYears(this.photos);
        },
        get months() {
            return getMonths(this.photos, this.selectedYear);
        },
        get filteredPhotos() {
            return filterPhotos(this.photos, this.searchQuery, this.selectedYear, this.selectedMonth);
        },
        // Initialization
        async init() {
            console.log("🚀 TidyPhotos: Initializing...");
            console.log("🔍 DEBUG: init() started");
            // Load thumbnail size from localStorage
            const savedSize = localStorage.getItem("tidyphotos-thumbnail-size");
            if (savedSize) {
                this.thumbnailSize = parseInt(savedSize);
                document.documentElement.style.setProperty("--thumbnail-size", savedSize + "px");
            }
            // Load photos from API
            console.log("🔍 DEBUG: About to call loadPhotos()");
            await this.loadPhotos();
            console.log("🔍 DEBUG: loadPhotos() completed, photos.length =", this.photos.length);
            // Router initialization REMOVED - now handled by Alpine.store('app').handleRoute()
            console.log("✅ TidyPhotos: Initialization complete");
        },
        // Photo loading
        async loadPhotos() {
            console.log("📡 TidyPhotos: Loading photos from API...");
            console.log("🔍 DEBUG: loadPhotos() started, loading =", this.loading);
            try {
                const response = await fetch("/api/photos");
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(`API error: ${response.status} ${response.statusText}`);
                }
                this.photos = data;
                this.loading = false;
                // Sync to Alpine store
                if (typeof Alpine !== "undefined") {
                    Alpine.store("photos").all = this.photos;
                    Alpine.store("photos").loading = this.loading;
                }
                console.log("✅ TidyPhotos: Photos loaded successfully");
                console.log("🔍 DEBUG: Loaded", this.photos.length, "photos, loading =", this.loading);
            }
            catch (error) {
                console.error("❌ TidyPhotos: Failed to load photos:", error);
                this.photos = generateMockPhotos();
                this.loading = false;
                // Sync to Alpine store
                if (typeof Alpine !== "undefined") {
                    Alpine.store("photos").all = this.photos;
                    Alpine.store("photos").loading = this.loading;
                }
                console.log("🔍 DEBUG: Using mock photos, count =", this.photos.length, ", loading =", this.loading);
            }
        },
        // Photo selection (migrated to Alpine store)
        selectPhoto(photoId) {
            if (typeof Alpine !== "undefined") {
                Alpine.store("photos").selectPhotoById(photoId);
            }
        },
        // Gallery navigation (migrated from KeyboardHandler)
        gallerySelectNext() {
            if (typeof Alpine !== "undefined") {
                Alpine.store("photos").selectNext();
                this.scrollSelectedIntoView();
            }
        },
        gallerySelectPrevious() {
            if (typeof Alpine !== "undefined") {
                Alpine.store("photos").selectPrevious();
                this.scrollSelectedIntoView();
            }
        },
        scrollSelectedIntoView() {
            setTimeout(() => {
                const selectedElement = document.querySelector(".photo-item.selected");
                if (selectedElement) {
                    selectedElement.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                    });
                    // Sync focus with selection
                    selectedElement.focus();
                }
            }, 0);
        },
        // Timeline methods
        selectYear(year) {
            this.selectedYear = year;
            this.selectedMonth = null;
            // Sync to Alpine store
            if (typeof Alpine !== "undefined") {
                Alpine.store("photos").selectedYear = year;
                Alpine.store("photos").selectedMonth = null;
            }
        },
        selectMonth(month) {
            this.selectedMonth = month;
            // Sync to Alpine store
            if (typeof Alpine !== "undefined") {
                Alpine.store("photos").selectedMonth = month;
            }
        },
        clearFilters() {
            this.selectedYear = null;
            this.selectedMonth = null;
            // Sync to Alpine store
            if (typeof Alpine !== "undefined") {
                Alpine.store("photos").selectedYear = null;
                Alpine.store("photos").selectedMonth = null;
            }
        },
        setMobileView(view) {
            this.mobileTimelineView = view;
            if (view === "all") {
                this.selectedYear = null;
                this.selectedMonth = null;
            }
        },
        // Photo operations
        async toggleFavorite(photoId) {
            const photo = this.photos.find((p) => p.id === photoId);
            console.log("⭐ TidyPhotos: Toggling favorite for photo ID", photoId, "favorite:", photo?.favorite);
            if (photo) {
                const originalState = photo.favorite;
                const newFavoriteState = !originalState;
                // Optimistic update: Update UI immediately
                photo.favorite = newFavoriteState;
                console.log(`🚀 Optimistic update: ${newFavoriteState ? "adding" : "removing"} favorite for ${photo.name}`);
                try {
                    // Call API to persist the change
                    const method = newFavoriteState ? "PUT" : "DELETE";
                    const response = await fetch(`/api/photos/${encodeURIComponent(photo.name)}/favorite`, {
                        method: method,
                    });
                    if (response.ok) {
                        // API call succeeded - optimistic update was correct
                        console.log(`✅ Successfully ${newFavoriteState ? "added" : "removed"} favorite for ${photo.name}`);
                    }
                    else {
                        // API call failed - revert the optimistic update
                        photo.favorite = originalState;
                        console.error(`❌ Failed to ${newFavoriteState ? "add" : "remove"} favorite, reverting UI:`, response.status, response.statusText);
                    }
                }
                catch (error) {
                    // Network error - revert the optimistic update
                    photo.favorite = originalState;
                    console.error("❌ Network error while updating favorite, reverting UI:", error);
                }
            }
        },
        formatDate(dateString) {
            return formatDate(dateString);
        },
        // Fullscreen methods DEPRECATED - now handled by Alpine.store('viewer') in index.html
        // TODO: Migrate to Alpine store
        async toggleFullScreenFavorite() {
            await appInstance.viewer.toggleFavorite();
            // this.syncViewerState();
            // Also update the photo in the main photos array
            await this.loadPhotos();
        },
        // Sync viewer state to Alpine reactive properties
        // NOTE: Photo selection state (currentPhoto, currentPhotoIndex) NOT synced - now in app store
        // NOTE: Face tagging state NOT synced - now managed by Alpine stores directly
        syncViewerState() {
            console.log("🔄 syncViewerState() - Syncing viewer-specific state");
            this.fullScreenMode = appInstance.viewer.isFullScreen;
            // currentPhoto and currentPhotoIndex NOT synced - read from app store
            // Face tagging state NOT synced - now in Alpine.store('viewer') and Alpine.store('tagging')
            // Sync to Alpine store (viewer-specific state only)
            if (typeof Alpine !== "undefined") {
                Alpine.store("viewer").isOpen = this.fullScreenMode;
                // Tagging state NOT synced - Alpine stores are source of truth
            }
        },
        // Keyboard handlers - DEPRECATED: Now handled by Alpine directives in index.html
        // handleKeyboard(event: KeyboardEvent) {
        //   // Keyboard handling moved to Alpine directives
        // },
        // Thumbnail size
        updateThumbnailSize(size) {
            this.thumbnailSize = parseInt(size);
            document.documentElement.style.setProperty("--thumbnail-size", size + "px");
            localStorage.setItem("tidyphotos-thumbnail-size", size);
        },
        // View management
        setCurrentView(view) {
            // Update global Alpine store
            Alpine.store("app").currentView = view;
            // Update URL when view changes
            Alpine.store("app").updateUrl();
        },
        // Face tagging methods REMOVED - now handled by Alpine stores
        // All tagging functionality has been migrated to Alpine.js stores in public/index.html:
        // - toggleTaggingMode() → Alpine.store('viewer').toggleTaggingMode()
        // - startDrawingTag() → Alpine.store('viewer').startDrawingTag()
        // - updateDrawingTag() → Alpine.store('viewer').updateDrawingTag()
        // - finishDrawingTag() → Alpine.store('viewer').finishDrawingTag()
        // - removeTag() → Alpine.store('viewer').removeTag()
        // - openTagAssignModal() → Alpine.store('tagging').openAssignModal()
        // - assignPersonToTag() → Alpine.store('tagging').assignPersonToTag()
        // - closeTagAssignModal() → Alpine.store('tagging').closeAssignModal()
        // - saveFaceTags() → Alpine.store('viewer').toggleTaggingMode()
    };
    // Connect Alpine data to app instance for compatibility
    appInstance.setAlpineData(alpineData);
    return alpineData;
};
//# sourceMappingURL=tidyphotos-app.js.map