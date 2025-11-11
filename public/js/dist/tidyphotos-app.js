import { Router } from "./router.js";
import { FullscreenViewer } from "./fullscreen-viewer.js";
import { KeyboardHandler } from "./keyboard-handler.js";
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
export class TidyPhotosApp {
    constructor() {
        // Reference to Alpine data (set after creation)
        this.alpineData = null;
        this.viewer = new FullscreenViewer(this);
        this.keyboardHandler = new KeyboardHandler(this);
        this.router = new Router(this);
    }
    setAlpineData(data) {
        this.alpineData = data;
    }
    // Component getters
    getViewer() {
        return this.viewer;
    }
    getKeyboardHandler() {
        return this.keyboardHandler;
    }
    getRouter() {
        return this.router;
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
        return this.alpineData?.currentView ?? "photos";
    }
    getSelectedPhotoId() {
        return this.alpineData?.selectedPhotoId ?? null;
    }
    getFilteredPhotos() {
        if (!this.alpineData)
            return [];
        return filterPhotos(this.alpineData.photos, this.alpineData.searchQuery, this.alpineData.selectedYear, this.alpineData.selectedMonth);
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
        if (this.alpineData) {
            this.alpineData.currentView = view;
        }
    }
    setFullScreenMode(fullScreen) {
        if (!fullScreen) {
            this.viewer.closeFullScreen();
        }
    }
    closeFullScreen() {
        this.viewer.closeFullScreen();
        if (this.alpineData) {
            this.alpineData.syncViewerState();
        }
    }
    openFullScreenFromRoute(photoId) {
        this.viewer.openFullScreenFromRoute(photoId);
        if (this.alpineData) {
            this.alpineData.syncViewerState();
        }
    }
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
        return {
            allPhotos: this.alpineData?.photos ?? [],
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
        selectedPhotoId: null,
        currentView: "photos",
        thumbnailSize: 200,
        // Fullscreen state (reactive - synced with viewer)
        fullScreenMode: false,
        currentPhoto: null,
        currentPhotoIndex: 0,
        // Face tagging state (reactive - synced with viewer)
        taggingMode: false,
        faceTags: [],
        showTagAssignModal: false,
        selectedTagId: null,
        isDrawingTag: false,
        drawingPreview: null,
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
            // Load thumbnail size from localStorage
            const savedSize = localStorage.getItem("tidyphotos-thumbnail-size");
            if (savedSize) {
                this.thumbnailSize = parseInt(savedSize);
                document.documentElement.style.setProperty("--thumbnail-size", savedSize + "px");
            }
            // Load photos from API
            await this.loadPhotos();
            // Initialize router
            appInstance.router.handleInitialRoute();
            console.log("✅ TidyPhotos: Initialization complete");
        },
        // Photo loading
        async loadPhotos() {
            console.log("📡 TidyPhotos: Loading photos from API...");
            try {
                const response = await fetch("/api/photos");
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(`API error: ${response.status} ${response.statusText}`);
                }
                this.photos = data;
                this.loading = false;
                console.log("✅ TidyPhotos: Photos loaded successfully");
            }
            catch (error) {
                console.error("❌ TidyPhotos: Failed to load photos:", error);
                this.photos = generateMockPhotos();
                this.loading = false;
            }
        },
        // Photo selection
        selectPhoto(photoId) {
            this.selectedPhotoId = photoId;
        },
        // Timeline methods
        selectYear(year) {
            this.selectedYear = year;
            this.selectedMonth = null;
        },
        selectMonth(month) {
            this.selectedMonth = month;
        },
        clearFilters() {
            this.selectedYear = null;
            this.selectedMonth = null;
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
        // Fullscreen methods
        async openFullScreen(photoId) {
            await appInstance.viewer.openFullScreen(photoId);
            this.syncViewerState();
        },
        openFullScreenFromRoute(photoId) {
            appInstance.viewer.openFullScreenFromRoute(photoId);
            this.syncViewerState();
        },
        closeFullScreen() {
            appInstance.viewer.closeFullScreen();
            this.syncViewerState();
        },
        async nextPhoto() {
            await appInstance.viewer.nextPhoto();
            this.syncViewerState();
        },
        async previousPhoto() {
            await appInstance.viewer.previousPhoto();
            this.syncViewerState();
        },
        async toggleFullScreenFavorite() {
            await appInstance.viewer.toggleFavorite();
            this.syncViewerState();
            // Also update the photo in the main photos array
            await this.loadPhotos();
        },
        // Sync viewer state to Alpine reactive properties
        syncViewerState() {
            this.fullScreenMode = appInstance.viewer.isFullScreen;
            this.currentPhoto = appInstance.viewer.currentPhoto
                ? { ...appInstance.viewer.currentPhoto }
                : null;
            this.currentPhotoIndex = appInstance.viewer.photoIndex;
            this.taggingMode = appInstance.viewer.isTaggingMode;
            this.faceTags = appInstance.viewer.faceTags.map((tag) => ({ ...tag }));
            this.isDrawingTag = appInstance.viewer.isDrawing;
            this.drawingPreview = appInstance.viewer.drawingPreview
                ? { ...appInstance.viewer.drawingPreview }
                : null;
        },
        // Keyboard handlers
        handleKeyboard(event) {
            appInstance.keyboardHandler.handleGalleryKeyboard(event);
            this.syncViewerState();
        },
        handleFullScreenKeyboard(event) {
            appInstance.viewer.handleKeyboard(event);
            this.syncViewerState();
        },
        // Thumbnail size
        updateThumbnailSize(size) {
            this.thumbnailSize = parseInt(size);
            document.documentElement.style.setProperty("--thumbnail-size", size + "px");
            localStorage.setItem("tidyphotos-thumbnail-size", size);
        },
        // View management
        setCurrentView(view) {
            this.currentView = view;
            // Update URL when view changes
            appInstance
                .getRouter()
                .updateUrl(this.fullScreenMode, "all", this.currentPhoto);
        },
        // Face tagging methods
        toggleTaggingMode() {
            appInstance.viewer.toggleTaggingMode();
            this.syncViewerState();
        },
        startDrawingTag(event) {
            appInstance.viewer.startDrawingTag(event);
            this.syncViewerState();
        },
        updateDrawingTag(event) {
            appInstance.viewer.updateDrawingTag(event);
            this.syncViewerState();
        },
        finishDrawingTag(event) {
            appInstance.viewer.finishDrawingTag(event);
            this.syncViewerState();
        },
        removeTag(tagId) {
            appInstance.viewer.removeTag(tagId);
            this.syncViewerState();
        },
        openTagAssignModal(tagId) {
            this.selectedTagId = tagId;
            this.showTagAssignModal = true;
        },
        assignPersonToTag(personId, personName) {
            if (this.selectedTagId) {
                appInstance.viewer.assignPersonToTag(this.selectedTagId, personId, personName);
                this.closeTagAssignModal();
                this.syncViewerState();
            }
        },
        closeTagAssignModal() {
            this.showTagAssignModal = false;
            this.selectedTagId = null;
        },
        async saveFaceTags() {
            await appInstance.viewer.saveFaceTags();
            this.syncViewerState();
        },
    };
    // Connect Alpine data to app instance for compatibility
    appInstance.setAlpineData(alpineData);
    return alpineData;
};
//# sourceMappingURL=tidyphotos-app.js.map