// Core data types for TidyPhotos application

export interface Photo {
    id: number;
    name: string;
    thumbnail: string;
    date: string;
    favorite: boolean;
    tags?: string[];
    people?: Person[];
}

export interface Person {
    id: number;
    name: string;
    photoCount?: number;
    lastSeen?: string;
}

export interface FaceDetection {
    photoId: number;
    personId?: number;
    confidence: number;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    confirmed: boolean;
}

export interface Month {
    number: number;
    name: string;
}

export type MobileTimelineView = 'years' | 'months' | 'all';

export interface RouteState {
    gallery: string;
    photoId?: number;
}

// Alpine.js compatibility types
export interface AlpineInstance {
    $nextTick(callback: () => void): void;
}

// Event handler types
export type KeyboardEventHandler = (event: KeyboardEvent) => void;
export type PhotoEventHandler = (photoId: number) => void;
export type VoidEventHandler = () => void;