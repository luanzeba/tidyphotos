export class FullscreenViewer {
    constructor(app) {
        this.fullScreenMode = false;
        this.currentPhotoIndex = 0;
        this.taggingMode = false;
        this.currentFaceTags = [];
        this.isDrawingTag = false;
        this.drawStartPos = null;
        this.originalStartPos = null;
        this.isDragging = false;
        this.clickStartTime = 0;
        this.photoTagsCache = new Map(); // In-memory storage for face tags per photo
        this.app = app;
    }
    get isFullScreen() {
        return this.fullScreenMode;
    }
    get photoIndex() {
        return this.currentPhotoIndex;
    }
    get currentPhoto() {
        if (!this.fullScreenMode || this.app.getFilteredPhotos().length === 0)
            return null;
        return this.app.getFilteredPhotos()[this.currentPhotoIndex];
    }
    get isTaggingMode() {
        return this.taggingMode;
    }
    get faceTags() {
        return this.currentFaceTags;
    }
    get isDrawing() {
        return this.isDrawingTag;
    }
    get drawingPreview() {
        return this.drawStartPos ? {
            x: this.drawStartPos.x,
            y: this.drawStartPos.y,
            width: this.drawStartPos.width || 0,
            height: this.drawStartPos.height || 0
        } : null;
    }
    convertEventToCoordinates(event) {
        const container = event.currentTarget;
        const img = container.querySelector('img');
        if (!img)
            return null;
        const rect = img.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        return { x, y };
    }
    openFullScreen(photoId) {
        const photoIndex = this.app.getFilteredPhotos().findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            this.loadFaceTagsForCurrentPhoto();
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }
    openFullScreenFromRoute(photoId) {
        // Wait for photos to load if needed
        if (this.app.getPhotoManager().isLoading) {
            const checkPhotos = () => {
                if (!this.app.getPhotoManager().isLoading) {
                    this.openFullScreenById(photoId);
                }
                else {
                    setTimeout(checkPhotos, 100);
                }
            };
            checkPhotos();
        }
        else {
            this.openFullScreenById(photoId);
        }
    }
    openFullScreenById(photoId) {
        const photoIndex = this.app.getFilteredPhotos().findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            this.loadFaceTagsForCurrentPhoto();
            this.app.setSelectedPhotoId(photoId);
        }
        else {
            // Photo not found, redirect to gallery
            console.warn('📷 TidyPhotos: Photo not found:', photoId);
            this.app.getRouter().navigateToGallery();
        }
    }
    closeFullScreen() {
        this.fullScreenMode = false;
        this.app.getRouter().updateUrl(false, this.app.getCurrentGallery(), null);
    }
    nextPhoto() {
        if (this.currentPhotoIndex < this.app.getFilteredPhotos().length - 1) {
            this.currentPhotoIndex++;
            this.loadFaceTagsForCurrentPhoto();
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }
    previousPhoto() {
        if (this.currentPhotoIndex > 0) {
            this.currentPhotoIndex--;
            this.loadFaceTagsForCurrentPhoto();
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }
    async toggleFavorite() {
        if (this.currentPhoto) {
            await this.app.getPhotoManager().toggleFavorite(this.currentPhoto.id);
        }
    }
    toggleTaggingMode() {
        this.taggingMode = !this.taggingMode;
        if (!this.taggingMode) {
            // Reset drawing state when exiting tagging mode
            this.isDrawingTag = false;
            this.drawStartPos = null;
            this.originalStartPos = null;
            this.isDragging = false;
            this.clickStartTime = 0;
        }
    }
    startDrawingTag(xOrEvent, y) {
        if (!this.taggingMode)
            return;
        let x, actualY;
        if (typeof xOrEvent === 'number') {
            // Called with coordinates directly
            x = xOrEvent;
            actualY = y;
        }
        else {
            // Called with MouseEvent - handle event target checking and coordinate conversion
            const event = xOrEvent;
            // Check if the click target is a button or UI element
            const target = event.target;
            if (target.tagName === 'BUTTON' || target.closest('button') || target.closest('.face-tag-controls')) {
                return; // Don't start drawing on UI elements
            }
            const coordinates = this.convertEventToCoordinates(event);
            if (!coordinates)
                return;
            x = coordinates.x;
            actualY = coordinates.y;
        }
        this.clickStartTime = Date.now();
        this.isDragging = false;
        if (!this.isDrawingTag) {
            // First click - start a new tag
            this.isDrawingTag = true;
            this.originalStartPos = { x, y: actualY };
            this.drawStartPos = { x, y: actualY, width: 0, height: 0 };
            console.log('🎯 Started tag at:', x, actualY);
        }
        else {
            // Second click - complete the tag (click-click mode)
            this.finishDrawingTag(x, actualY);
        }
    }
    updateDrawingTag(xOrEvent, y) {
        if (!this.isDrawingTag || !this.drawStartPos || !this.originalStartPos)
            return;
        let x, actualY;
        if (typeof xOrEvent === 'number') {
            // Called with coordinates directly
            x = xOrEvent;
            actualY = y;
        }
        else {
            // Called with MouseEvent - convert coordinates
            const coordinates = this.convertEventToCoordinates(xOrEvent);
            if (!coordinates)
                return;
            x = coordinates.x;
            actualY = coordinates.y;
        }
        // Detect if we're dragging (moved more than 2 pixels from start)
        const deltaX = Math.abs(x - this.originalStartPos.x);
        const deltaY = Math.abs(actualY - this.originalStartPos.y);
        if ((deltaX > 2 || deltaY > 2) && !this.isDragging) {
            this.isDragging = true;
            console.log('🖱️ Started dragging');
        }
        if (this.isDragging) {
            // Calculate rectangle bounds for bi-directional dragging
            const minX = Math.min(this.originalStartPos.x, x);
            const minY = Math.min(this.originalStartPos.y, actualY);
            const maxX = Math.max(this.originalStartPos.x, x);
            const maxY = Math.max(this.originalStartPos.y, actualY);
            // Update preview rectangle to show current drag state
            this.drawStartPos.x = minX;
            this.drawStartPos.y = minY;
            this.drawStartPos.width = maxX - minX;
            this.drawStartPos.height = maxY - minY;
        }
    }
    finishDrawingTag(xOrEvent, y) {
        if (!this.isDrawingTag || !this.drawStartPos || !this.originalStartPos)
            return;
        let x, actualY;
        if (typeof xOrEvent === 'number') {
            // Called with coordinates directly
            x = xOrEvent;
            actualY = y;
        }
        else {
            // Called with MouseEvent - convert coordinates
            const coordinates = this.convertEventToCoordinates(xOrEvent);
            if (!coordinates)
                return;
            x = coordinates.x;
            actualY = coordinates.y;
        }
        const timeSinceStart = Date.now() - this.clickStartTime;
        // For drag mode: complete the tag if we were dragging
        // For click-click mode: only complete if this is a second click (not mouseup from drag)
        const shouldCreateTag = this.isDragging || timeSinceStart < 200; // Quick click = click-click mode
        if (shouldCreateTag) {
            const tag = {
                id: Date.now(),
                x: Math.min(this.originalStartPos.x, x),
                y: Math.min(this.originalStartPos.y, actualY),
                width: Math.abs(x - this.originalStartPos.x),
                height: Math.abs(actualY - this.originalStartPos.y),
                personId: null,
                personName: ''
            };
            // Only add if tag has reasonable size
            if (tag.width > 2 && tag.height > 2) {
                this.currentFaceTags.push(tag);
                // Update cache immediately when tag is created
                if (this.currentPhoto?.id) {
                    this.photoTagsCache.set(this.currentPhoto.id, [...this.currentFaceTags]);
                }
                console.log('✅ Added face tag:', tag, 'Total tags:', this.currentFaceTags.length);
                // Reset drawing state after successful tag creation
                this.isDrawingTag = false;
                this.drawStartPos = null;
                this.originalStartPos = null;
                this.isDragging = false;
            }
            else {
                console.log('❌ Tag too small, not added. Size:', tag.width, 'x', tag.height);
                // For click-click mode, don't reset if tag is too small - wait for second click
                if (this.isDragging) {
                    this.isDrawingTag = false;
                    this.drawStartPos = null;
                    this.originalStartPos = null;
                    this.isDragging = false;
                }
            }
        }
        else {
            // This is a mouseup after dragging started but before significant movement
            // Don't create tag, but also don't reset state (wait for second click)
            console.log('🖱️ Mouseup without drag - waiting for second click');
        }
    }
    removeTag(tagId) {
        this.currentFaceTags = this.currentFaceTags.filter(tag => tag.id !== tagId);
        // Update cache immediately when tag is removed
        if (this.currentPhoto?.id) {
            this.photoTagsCache.set(this.currentPhoto.id, [...this.currentFaceTags]);
        }
    }
    assignPersonToTag(tagId, personId, personName) {
        const tag = this.currentFaceTags.find(t => t.id === tagId);
        if (tag) {
            tag.personId = personId;
            tag.personName = personName;
            // Update cache immediately when tag is modified
            if (this.currentPhoto?.id) {
                this.photoTagsCache.set(this.currentPhoto.id, [...this.currentFaceTags]);
            }
        }
    }
    loadFaceTagsForCurrentPhoto() {
        // Reset drawing state
        this.taggingMode = false;
        this.isDrawingTag = false;
        this.drawStartPos = null;
        this.originalStartPos = null;
        this.isDragging = false;
        this.clickStartTime = 0;
        // Load existing tags from cache if they exist
        if (this.currentPhoto?.id) {
            const cachedTags = this.photoTagsCache.get(this.currentPhoto.id);
            if (cachedTags) {
                this.currentFaceTags = [...cachedTags]; // Create a copy to avoid reference issues
                console.log('📸 Loaded', cachedTags.length, 'cached face tags for photo', this.currentPhoto.id);
            }
            else {
                this.currentFaceTags = [];
                console.log('📸 No cached face tags for photo', this.currentPhoto.id);
            }
        }
        else {
            this.currentFaceTags = [];
        }
        // TODO: Implement API call to load existing face tags from database
    }
    async saveFaceTags() {
        if (!this.currentPhoto || this.currentFaceTags.length === 0)
            return;
        // Store tags in cache for persistence across photo switches
        this.photoTagsCache.set(this.currentPhoto.id, [...this.currentFaceTags]);
        // TODO: Implement API call to save face tags to database
        console.log('💾 Saving face tags for photo', this.currentPhoto.id, this.currentFaceTags);
        // Exit tagging mode after saving
        this.taggingMode = false;
        this.isDrawingTag = false;
        this.drawStartPos = null;
        this.originalStartPos = null;
        this.isDragging = false;
        this.clickStartTime = 0;
        console.log('✅ Face tags saved successfully (stored in memory cache)');
    }
    handleKeyboard(event) {
        if (!this.fullScreenMode)
            return;
        switch (event.key) {
            case 'ArrowRight':
                event.preventDefault();
                this.nextPhoto();
                break;
            case 'ArrowLeft':
                event.preventDefault();
                this.previousPhoto();
                break;
            case 'f':
            case 'F':
                event.preventDefault();
                this.toggleFavorite();
                break;
            case 't':
            case 'T':
                event.preventDefault();
                this.toggleTaggingMode();
                break;
            case 'Escape':
                event.preventDefault();
                if (this.taggingMode) {
                    this.toggleTaggingMode();
                }
                else {
                    this.closeFullScreen();
                }
                break;
            case 'q':
            case 'Q':
                event.preventDefault();
                this.closeFullScreen();
                break;
        }
    }
}
//# sourceMappingURL=fullscreen-viewer.js.map