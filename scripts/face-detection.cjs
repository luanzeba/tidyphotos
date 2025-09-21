#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const faceapi = require('@vladmandic/face-api');
const { Canvas, Image, ImageData } = require('canvas');

// Patch face-api.js for Node.js environment
faceapi.env.monkeyPatch({
    Canvas: Canvas,
    Image: Image,
    ImageData: ImageData,
    createCanvasElement: () => new Canvas(1, 1),
    createImageElement: () => new Image()
});

class FaceDetectionService {
    constructor() {
        this.modelsLoaded = false;
        this.modelPath = path.join(process.cwd(), 'models');

        // Phase 1: Conservative thresholds for manual training
        this.DETECTION_CONFIDENCE = 0.5;
        this.RECOGNITION_DISTANCE_THRESHOLD = 0.45; // Lower = more strict
        this.HIGH_CONFIDENCE_THRESHOLD = 0.8;
        this.MEDIUM_CONFIDENCE_THRESHOLD = 0.6;
    }

    async loadModels() {
        if (this.modelsLoaded) return;

        try {
            console.error('🤖 Loading face-api.js models...');

            // Load the models
            await faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelPath);
            await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelPath);
            await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelPath);

            this.modelsLoaded = true;
            console.error('✅ Face detection models loaded successfully');
        } catch (error) {
            console.error('❌ Failed to load face detection models:', error);
            throw new Error('Face detection models not available');
        }
    }

    async detectFaces(imagePath) {
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
                            .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({
                                minConfidence: this.DETECTION_CONFIDENCE
                            }))
                            .withFaceLandmarks()
                            .withFaceDescriptors();

                        const faces = detections.map(detection => ({
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

                        console.error(`👤 Detected ${faces.length} faces in ${path.basename(imagePath)}`);

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

    findBestMatch(faceDescriptor, knownDescriptors) {
        if (knownDescriptors.length === 0) {
            return {
                confidence: 0,
                distance: 1,
                isMatch: false
            };
        }

        let bestMatch = {
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

    getConfidenceLevel(confidence) {
        if (confidence >= this.HIGH_CONFIDENCE_THRESHOLD) return 'high';
        if (confidence >= this.MEDIUM_CONFIDENCE_THRESHOLD) return 'medium';
        return 'low';
    }

    shouldAutoConfirm(confidence) {
        return confidence >= this.HIGH_CONFIDENCE_THRESHOLD;
    }

    shouldSuggest(confidence) {
        return confidence >= this.MEDIUM_CONFIDENCE_THRESHOLD;
    }
}

const faceDetectionService = new FaceDetectionService();

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error('Usage: node face-detection.js <command> <imagePath> [options]');
        console.error('Commands:');
        console.error('  detect <imagePath>                 - Detect faces in image');
        console.error('  match <imagePath> <knownEncodings> - Match faces against known encodings');
        process.exit(1);
    }

    const command = args[0];
    const imagePath = args[1];

    try {
        switch (command) {
            case 'detect':
                await detectFaces(imagePath);
                break;
            case 'match':
                const knownEncodingsJson = args[2] || '[]';
                await matchFaces(imagePath, knownEncodingsJson);
                break;
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

async function detectFaces(imagePath) {
    console.log(`Detecting faces in: ${imagePath}`);

    const result = await faceDetectionService.detectFaces(imagePath);

    // Output JSON result for Zig to parse
    console.log(JSON.stringify({
        success: true,
        faces: result.faces.map(face => ({
            boundingBox: face.boundingBox,
            confidence: face.confidence,
            descriptor: Array.from(face.descriptor) // Convert Float32Array to regular array
        })),
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight
    }));
}

async function matchFaces(imagePath, knownEncodingsJson) {
    console.log(`Matching faces in: ${imagePath}`);

    const result = await faceDetectionService.detectFaces(imagePath);
    const knownEncodings = JSON.parse(knownEncodingsJson);

    const matches = result.faces.map(face => {
        const knownDescriptors = knownEncodings.map(item => ({
            personId: item.personId,
            descriptor: new Float32Array(item.descriptor)
        }));

        const match = faceDetectionService.findBestMatch(face.descriptor, knownDescriptors);

        return {
            boundingBox: face.boundingBox,
            confidence: face.confidence,
            descriptor: Array.from(face.descriptor),
            match: {
                personId: match.personId || null,
                confidence: match.confidence,
                distance: match.distance,
                isMatch: match.isMatch,
                confidenceLevel: faceDetectionService.getConfidenceLevel(match.confidence),
                shouldAutoConfirm: faceDetectionService.shouldAutoConfirm(match.confidence),
                shouldSuggest: faceDetectionService.shouldSuggest(match.confidence)
            }
        };
    });

    // Output JSON result for Zig to parse
    console.log(JSON.stringify({
        success: true,
        matches,
        imageWidth: result.imageWidth,
        imageHeight: result.imageHeight
    }));
}

if (require.main === module) {
    main();
}