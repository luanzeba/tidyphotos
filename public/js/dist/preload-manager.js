/**
 * Intelligent Background Preloading Manager
 * Implements spiral preloading strategy from current selection
 * Based on high-performance photo management architecture
 */
export class PreloadManager {
    constructor() {
        this.preloadedImages = new Set();
        this.preloadQueue = [];
        this.isPreloading = false;
        this.maxPreloadImages = 100; // Limit to 100 images as per reference architecture
        this.preloadDelayMs = 50; // 50ms delay between preloads to avoid UI blocking
    }

    /**
     * Start preloading full-size images using spiral strategy
     * Spirals outward from current selection: current, ±1, ±2, etc.
     * @param {Array} photos - All photos in the current view
     * @param {number} currentIndex - Index of currently selected photo
     */
    startPreloading(photos, currentIndex) {
        if (!photos || photos.length === 0) return;

        // Clear existing queue
        this.preloadQueue = [];
        this.isPreloading = true;

        // Build spiral queue starting from current selection
        const queue = this.buildSpiralQueue(photos, currentIndex);

        console.log(`⚡ Starting background preload: ${queue.length} images from index ${currentIndex}`);

        // Start preloading
        this.preloadQueue = queue;
        this.processPreloadQueue();
    }

    /**
     * Build spiral preload queue: current, current±1, current±2, etc.
     * @param {Array} photos - All photos
     * @param {number} startIndex - Starting index (usually current selection)
     * @returns {Array} Queue of photos to preload
     */
    buildSpiralQueue(photos, startIndex) {
        const queue = [];
        const visited = new Set();

        // Ensure startIndex is valid
        if (startIndex < 0 || startIndex >= photos.length) {
            startIndex = 0;
        }

        // Add current image first (highest priority)
        queue.push(photos[startIndex]);
        visited.add(startIndex);

        // Spiral outward
        let distance = 1;
        while (visited.size < Math.min(photos.length, this.maxPreloadImages)) {
            const before = startIndex - distance;
            const after = startIndex + distance;

            // Add image before current
            if (before >= 0 && !visited.has(before)) {
                queue.push(photos[before]);
                visited.add(before);
            }

            // Add image after current
            if (after < photos.length && !visited.has(after)) {
                queue.push(photos[after]);
                visited.add(after);
            }

            distance++;

            // Safety check: stop if we've gone beyond both ends
            if (before < 0 && after >= photos.length) {
                break;
            }
        }

        return queue;
    }

    /**
     * Process preload queue with delays to avoid blocking UI
     */
    processPreloadQueue() {
        if (this.preloadQueue.length === 0) {
            this.isPreloading = false;
            console.log(`✓ Background preload complete: ${this.preloadedImages.size} images cached`);
            return;
        }

        const photo = this.preloadQueue.shift();

        // Skip if already preloaded
        if (this.preloadedImages.has(photo.id)) {
            this.processPreloadQueue();
            return;
        }

        // Skip if no fullUrl available
        if (!photo.fullUrl) {
            console.warn(`⚠️  No fullUrl for photo ${photo.id}, skipping preload`);
            this.processPreloadQueue();
            return;
        }

        // Preload image
        const img = new Image();

        img.onload = () => {
            this.preloadedImages.add(photo.id);

            // Check if image was loaded from cache
            const cacheStatus = this.checkCacheStatus(photo.fullUrl);
            if (cacheStatus === 'cached') {
                // Already cached, speed up preloading
                setTimeout(() => this.processPreloadQueue(), 10);
            } else {
                // Delay before next preload to avoid overwhelming network
                setTimeout(() => this.processPreloadQueue(), this.preloadDelayMs);
            }
        };

        img.onerror = () => {
            console.warn(`⚠️  Failed to preload ${photo.fullUrl}`);
            // Continue with next image even if this one failed
            setTimeout(() => this.processPreloadQueue(), this.preloadDelayMs);
        };

        img.src = photo.fullUrl;
    }

    /**
     * Check if an image is cached using Performance API
     * @param {string} url - Image URL to check
     * @returns {string} 'cached', 'network', or 'unknown'
     */
    checkCacheStatus(url) {
        if (!window.performance || !window.performance.getEntriesByName) {
            return 'unknown';
        }

        const entries = performance.getEntriesByName(url);
        if (entries.length === 0) {
            return 'unknown';
        }

        const entry = entries[entries.length - 1];

        // transferSize === 0 means loaded from cache
        // decodedBodySize > 0 means content was decoded
        if (entry.transferSize === 0 && entry.decodedBodySize > 0) {
            return 'cached';
        }

        return 'network';
    }

    /**
     * Stop current preloading operation
     */
    stopPreloading() {
        this.isPreloading = false;
        this.preloadQueue = [];
    }

    /**
     * Check if a photo has been preloaded
     * @param {number} photoId - Photo ID to check
     * @returns {boolean}
     */
    isPhotoPreloaded(photoId) {
        return this.preloadedImages.has(photoId);
    }

    /**
     * Get preloading statistics
     * @returns {Object} Statistics about preloaded images
     */
    getStats() {
        return {
            preloadedCount: this.preloadedImages.size,
            queueLength: this.preloadQueue.length,
            isPreloading: this.isPreloading
        };
    }
}
