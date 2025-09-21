import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData } from 'canvas';
import * as tf from '@tensorflow/tfjs-node';
import * as fs from 'fs/promises';
import * as path from 'path';

// Patch face-api.js for Node.js environment
faceapi.env.monkeyPatch({
    Canvas: Canvas as any,
    Image: Image as any,
    ImageData: ImageData as any,
    createCanvasElement: () => new Canvas(1, 1) as any,
    createImageElement: () => new Image() as any
});

export interface FaceDetectionResult {
    faces: DetectedFace[];
    imageWidth: number;
    imageHeight: number;
}

export interface DetectedFace {
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    confidence: number;
    descriptor: Float32Array;
    landmarks?: faceapi.FaceLandmarks68;
}

export interface FaceMatchResult {
    personId?: number;
    confidence: number;
    distance: number;
    isMatch: boolean;
}

export class FaceDetectionService {
    private modelsLoaded = false;
    private readonly modelPath = path.join(process.cwd(), 'models');

    // Phase 1: Conservative thresholds for manual training
    private readonly DETECTION_CONFIDENCE = 0.5;
    private readonly RECOGNITION_DISTANCE_THRESHOLD = 0.45; // Lower = more strict
    private readonly HIGH_CONFIDENCE_THRESHOLD = 0.8;
    private readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.6;

    constructor() {
        this.ensureModelsDirectory();
    }

    private async ensureModelsDirectory(): Promise<void> {
        try {
            await fs.access(this.modelPath);
        } catch {
            await fs.mkdir(this.modelPath, { recursive: true });
            console.log(`📁 Created models directory: ${this.modelPath}`);
            console.log('⚠️  Please download face-api.js models to the models/ directory');
            console.log('   Models needed: ssd_mobilenetv1, face_recognition, face_landmark_68');
        }
    }

    async loadModels(): Promise<void> {
        if (this.modelsLoaded) return;

        try {
            console.log('🤖 Loading face-api.js models...');

            // Load the models
            await faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelPath);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelPath);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelPath);

            this.modelsLoaded = true;
            console.log('✅ Face detection models loaded successfully');
        } catch (error) {
            console.error('❌ Failed to load face detection models:', error);
            console.log('💡 Download models from: https://github.com/justadudewhohacks/face-api.js/tree/master/weights');
            throw new Error('Face detection models not available');
        }
    }

    async detectFaces(imagePath: string): Promise<FaceDetectionResult> {
        await this.loadModels();

        try {
            // Load and prepare image
            const imageBuffer = await fs.readFile(imagePath);
            const img = new Image();

            return new Promise((resolve, reject) => {
                img.onload = async () => {
                    try {
                        const canvas = new Canvas(img.width, img.height);
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);

                        // Detect faces with landmarks and descriptors
                        const detections = await faceapi
                            .detectAllFaces(canvas as any, new faceapi.SsdMobilenetv1Options({
                                minConfidence: this.DETECTION_CONFIDENCE
                            }))
                            .withFaceLandmarks()
                            .withFaceDescriptors();

                        const faces: DetectedFace[] = detections.map(detection => ({
                            boundingBox: {
                                x: detection.detection.box.x,
                                y: detection.detection.box.y,
                                width: detection.detection.box.width,
                                height: detection.detection.box.height
                            },
                            confidence: detection.detection.score,
                            descriptor: detection.descriptor,
                            landmarks: detection.landmarks
                        }));

                        console.log(`👤 Detected ${faces.length} faces in ${path.basename(imagePath)}`);

                        resolve({
                            faces,
                            imageWidth: img.width,
                            imageHeight: img.height
                        });
                    } catch (error) {
                        reject(error);
                    }
                };

                img.onerror = () => reject(new Error(`Failed to load image: ${imagePath}`));
                img.src = imageBuffer;
            });
        } catch (error) {
            console.error(`❌ Error detecting faces in ${imagePath}:`, error);
            throw error;
        }
    }

    /**
     * Compare a face descriptor against known person descriptors
     * Returns the best match with confidence metrics
     */
    findBestMatch(faceDescriptor: Float32Array, knownDescriptors: { personId: number; descriptor: Float32Array }[]): FaceMatchResult {
        if (knownDescriptors.length === 0) {
            return {
                confidence: 0,
                distance: 1,
                isMatch: false
            };
        }

        let bestMatch: FaceMatchResult = {
            confidence: 0,
            distance: 1,
            isMatch: false
        };

        for (const known of knownDescriptors) {
            const distance = faceapi.euclideanDistance(faceDescriptor, known.descriptor);
            const confidence = Math.max(0, 1 - distance);

            if (distance < bestMatch.distance) {
                bestMatch = {
                    personId: known.personId,
                    confidence,
                    distance,
                    isMatch: distance <= this.RECOGNITION_DISTANCE_THRESHOLD
                };
            }
        }

        return bestMatch;
    }

    /**
     * Get confidence level for UI feedback
     */
    getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
        if (confidence >= this.HIGH_CONFIDENCE_THRESHOLD) return 'high';
        if (confidence >= this.MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
        return 'low';
    }

    /**
     * Phase 1: Should this match be auto-confirmed?
     * Very conservative - only highest confidence matches
     */
    shouldAutoConfirm(confidence: number): boolean {
        return confidence >= this.HIGH_CONFIDENCE_THRESHOLD;
    }

    /**
     * Phase 1: Should this match be suggested to user?
     * Includes medium confidence matches for manual review
     */
    shouldSuggest(confidence: number): boolean {
        return confidence >= this.MEDIUM_CONFIDENCE_THRESHOLD;
    }

    /**
     * Parse face encodings from JSON string stored in database
     */
    parseFaceEncodings(encodingsJson: string): Float32Array[] {
        try {
            const data = JSON.parse(encodingsJson);
            if (Array.isArray(data)) {
                return data.map(arr => new Float32Array(arr));
            }
            return [new Float32Array(data)];
        } catch (error) {
            console.error('❌ Error parsing face encodings:', error);
            return [];
        }
    }

    /**
     * Serialize face descriptors to JSON string for database storage
     */
    serializeFaceEncodings(descriptors: Float32Array[]): string {
        const serializable = descriptors.map(desc => Array.from(desc));
        return JSON.stringify(serializable);
    }

    /**
     * Add a new face encoding to existing person encodings
     */
    addFaceEncoding(existingEncodingsJson: string | null, newDescriptor: Float32Array): string {
        const existing = existingEncodingsJson ? this.parseFaceEncodings(existingEncodingsJson) : [];
        existing.push(newDescriptor);

        // Limit to 10 encodings per person to prevent bloat
        const limited = existing.slice(-10);
        return this.serializeFaceEncodings(limited);
    }
}

// Singleton instance
export const faceDetectionService = new FaceDetectionService();