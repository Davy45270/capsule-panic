import {
    BatchableSprite,
    Batcher,
    BatchGeometry,
    CanvasSource,
    colorBit,
    colorBitGl,
    compileHighShaderGlProgram,
    compileHighShaderGpuProgram,
    DefaultBatcher,
    extensions,
    ExtensionType,
    generateTextureBatchBit,
    generateTextureBatchBitGl,
    getBatchSamplersUniformGroup,
    roundPixelsBit,
    roundPixelsBitGl,
    Shader,
    Sprite,
    Texture,
} from 'pixi.js';
import type { BatcherOptions, InstructionSet, Renderer, RenderLayer } from 'pixi.js';

const batchName = 'capsule-lock-flash';

const silhouettes = new WeakMap<Texture, Texture>();
const sources = new WeakMap<Texture, Texture>();

export function silhouetteSource(texture: Texture): Texture | undefined {
    return sources.get(texture);
}

export function blanchirSilhouette(source: ImageData): ImageData {
    const pixels = new Uint8ClampedArray(source.data);
    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = pixels[i]! * 0.07 + 255 * 0.93;
        pixels[i + 1] = pixels[i + 1]! * 0.07 + 255 * 0.93;
        pixels[i + 2] = pixels[i + 2]! * 0.07 + 255 * 0.93;
    }
    return new ImageData(pixels, source.width, source.height, { colorSpace: source.colorSpace });
}

export function lockFlashTexture(texture: Texture, rendererName: Renderer['name']): Texture {
    if (rendererName !== 'canvas') return texture;
    const cached = silhouettes.get(texture);
    if (cached) return cached;

    const { pixelWidth, pixelHeight, resolution } = texture.source;
    const resource: unknown = texture.source.resource;
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Contexte Canvas 2D indisponible pour l’éclat de verrouillage');
    // Le chargeur Pixi fournit les PNG des segments sous forme d’ImageBitmap ou d’image HTML.
    context.drawImage(resource as CanvasImageSource, 0, 0);
    const pixels = context.getImageData(0, 0, pixelWidth, pixelHeight);
    context.putImageData(blanchirSilhouette(pixels), 0, 0);

    const derived = new Texture({
        source: new CanvasSource({ resource: canvas, resolution }),
        frame: texture.frame,
        orig: texture.orig,
        trim: texture.trim,
        rotate: texture.rotate,
    });
    silhouettes.set(texture, derived);
    sources.set(derived, texture);
    return derived;
}

class LockFlashBatcher extends Batcher {
    readonly name = batchName;
    // Même format de sommets et de textures que les sprites PixiJS.
    protected readonly vertexSize = 6;
    readonly geometry = new BatchGeometry();
    readonly shader: Shader;

    constructor(options: BatcherOptions) {
        super(options);
        const { maxTextures } = options;
        // finalColor est prémultipliée. Le blanc de même alpha vaut (a, a, a, a).
        const glProgram = compileHighShaderGlProgram({
            name: batchName,
            bits: [
                colorBitGl,
                generateTextureBatchBitGl(maxTextures),
                roundPixelsBitGl,
                { fragment: { end: 'finalColor = mix(finalColor, vec4(finalColor.a), 0.93);' } },
            ],
        });
        const gpuProgram = compileHighShaderGpuProgram({
            name: batchName,
            bits: [
                colorBit,
                generateTextureBatchBit(maxTextures),
                roundPixelsBit,
                { fragment: { end: 'finalColor = mix(finalColor, vec4<f32>(finalColor.a), 0.93);' } },
            ],
        });
        this.shader = new Shader({
            glProgram,
            gpuProgram,
            resources: { batchSamplers: getBatchSamplersUniformGroup(maxTextures) },
        });
    }

    packAttributes(...args: Parameters<DefaultBatcher['packAttributes']>): void {
        DefaultBatcher.prototype.packAttributes(...args);
    }

    packQuadAttributes(...args: Parameters<DefaultBatcher['packQuadAttributes']>): void {
        DefaultBatcher.prototype.packQuadAttributes(...args);
    }

    override destroy(): void {
        super.destroy({ shader: true });
    }
}

extensions.add({ type: ExtensionType.Batcher, name: batchName, ref: LockFlashBatcher });

export class LockFlashSprite extends Sprite {
    override collectRenderablesSimple(
        instructions: InstructionSet,
        renderer: Renderer,
        currentLayer: RenderLayer,
    ): void {
        // SpritePipe reprend cette géométrie et continue de gérer les mises à jour du sprite.
        if (renderer.name !== 'canvas' && !this._gpuData[renderer.uid]) {
            const quad = new BatchableSprite();
            quad.batcherName = batchName;
            quad.renderable = this;
            quad.transform = this.groupTransform;
            quad.texture = this.texture;
            quad.bounds = this.visualBounds;
            quad.roundPixels = renderer._roundPixels || this._roundPixels;
            this._gpuData[renderer.uid] = quad;
        }
        super.collectRenderablesSimple(instructions, renderer, currentLayer);
    }
}
