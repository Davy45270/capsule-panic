import {
    BatchableSprite,
    Batcher,
    BatchGeometry,
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
} from 'pixi.js';
import type { BatcherOptions, InstructionSet, Renderer, RenderLayer } from 'pixi.js';

const batchName = 'capsule-lock-flash';

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
