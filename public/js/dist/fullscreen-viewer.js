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
    async openFullScreen(photoId) {
        const photoIndex = this.app.getFilteredPhotos().findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            await this.loadFaceTagsForCurrentPhoto();
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
    async openFullScreenById(photoId) {
        const photoIndex = this.app.getFilteredPhotos().findIndex(p => p.id === photoId);
        if (photoIndex !== -1) {
            this.currentPhotoIndex = photoIndex;
            this.fullScreenMode = true;
            await this.loadFaceTagsForCurrentPhoto();
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
    async nextPhoto() {
        if (this.currentPhotoIndex < this.app.getFilteredPhotos().length - 1) {
            this.currentPhotoIndex++;
            await this.loadFaceTagsForCurrentPhoto();
            this.app.getRouter().updateUrl(true, this.app.getCurrentGallery(), this.currentPhoto);
        }
    }
    async previousPhoto() {
        if (this.currentPhotoIndex > 0) {
            this.currentPhotoIndex--;
            await this.loadFaceTagsForCurrentPhoto();
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
        let isFromClickClick = false;
        if (typeof xOrEvent === 'number') {
            // Called with coordinates directly (from click-click mode)
            x = xOrEvent;
            actualY = y;
            isFromClickClick = true;
        }
        else {
            // Called with MouseEvent (from mouseup)
            const coordinates = this.convertEventToCoordinates(xOrEvent);
            if (!coordinates)
                return;
            x = coordinates.x;
            actualY = coordinates.y;
            isFromClickClick = false;
        }
        // For click-click mode, always create the tag when called from second click
        // For drag mode, only create if we were actually dragging
        const shouldCreateTag = isFromClickClick || this.isDragging;
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
            // Only add if tag has reasonable size (allow smaller tags for click-click mode)
            const minSize = isFromClickClick ? 1 : 2;
            if (tag.width > minSize && tag.height > minSize) {
                // Save to database immediately
                this.saveFaceTagToDatabase(tag).then(savedTag => {
                    if (savedTag) {
                        this.currentFaceTags.push(savedTag);
                        console.log('✅ Added face tag:', savedTag, 'Total tags:', this.currentFaceTags.length);
                    }
                }).catch(error => {
                    console.error('Failed to save face tag:', error);
                });
                // Reset drawing state after successful tag creation
                this.isDrawingTag = false;
                this.drawStartPos = null;
                this.originalStartPos = null;
                this.isDragging = false;
            }
            else {
                console.log('❌ Tag too small, not added. Size:', tag.width, 'x', tag.height);
                // For drag mode, reset state if tag is too small
                // For click-click mode, always reset since user completed the action
                if (this.isDragging || isFromClickClick) {
                    this.isDrawingTag = false;
                    this.drawStartPos = null;
                    this.originalStartPos = null;
                    this.isDragging = false;
                }
            }
        }
        else {
            // This is a mouseup without enough drag - don't create tag, wait for second click
            console.log('🖱️ Mouseup without drag - waiting for second click');
        }
    }
    async removeTag(tagId) {
        const tag = this.currentFaceTags.find(t => t.id === tagId);
        if (!tag)
            return;
        try {
            const response = await fetch(`/api/face-tags/${tagId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                this.currentFaceTags = this.currentFaceTags.filter(t => t.id !== tagId);
                console.log('✅ Removed face tag:', tagId);
            }
            else {
                console.error('Failed to remove face tag:', response.statusText);
            }
        }
        catch (error) {
            console.error('Error removing face tag:', error);
        }
    }
    async assignPersonToTag(tagId, personId, personName) {
        const tag = this.currentFaceTags.find(t => t.id === tagId);
        if (!tag)
            return;
        try {
            const response = await fetch(`/api/face-tags/${tagId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    x: tag.x,
                    y: tag.y,
                    width: tag.width,
                    height: tag.height,
                    personId: personId,
                    confidence: tag.confidence || 1.0
                })
            });
            if (response.ok) {
                tag.personId = personId;
                tag.personName = personName;
                console.log('✅ Updated face tag with person:', personName);
            }
            else {
                console.error('Failed to update face tag:', response.statusText);
            }
        }
        catch (error) {
            console.error('Error updating face tag:', error);
        }
    }
    async loadFaceTagsForCurrentPhoto() {
        // Reset drawing state
        this.taggingMode = false;
        this.isDrawingTag = false;
        this.drawStartPos = null;
        this.originalStartPos = null;
        this.isDragging = false;
        this.clickStartTime = 0;
        // Load existing tags from database
        if (this.currentPhoto?.name) {
            try {
                const response = await fetch(`/api/photos/${encodeURIComponent(this.currentPhoto.name)}/face-tags`);
                if (response.ok) {
                    const data = await response.json();
                    this.currentFaceTags = data.faceTags || [];
                    console.log('📸 Loaded', this.currentFaceTags.length, 'face tags from database for photo', this.currentPhoto.name);
                }
                else {
                    console.warn('Failed to load face tags:', response.statusText);
                    this.currentFaceTags = [];
                }
            }
            catch (error) {
                console.error('Error loading face tags:', error);
                this.currentFaceTags = [];
            }
        }
        else {
            this.currentFaceTags = [];
        }
    }
    async saveFaceTags() {
        // Exit tagging mode after saving (all tags are saved individually to database)
        this.taggingMode = false;
        this.isDrawingTag = false;
        this.drawStartPos = null;
        this.originalStartPos = null;
        this.isDragging = false;
        this.clickStartTime = 0;
        console.log('✅ Face tags saved successfully');
    }
    async saveFaceTagToDatabase(tag) {
        if (!this.currentPhoto?.name)
            return null;
        try {
            const response = await fetch(`/api/photos/${encodeURIComponent(this.currentPhoto.name)}/face-tags`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    x: tag.x,
                    y: tag.y,
                    width: tag.width,
                    height: tag.height,
                    personId: tag.personId,
                    confidence: 1.0,
                    isManual: true
                })
            });
            if (response.ok) {
                const data = await response.json();
                return data.faceTag;
            }
            else {
                console.error('Failed to save face tag:', response.statusText);
                return null;
            }
        }
        catch (error) {
            console.error('Error saving face tag:', error);
            return null;
        }
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