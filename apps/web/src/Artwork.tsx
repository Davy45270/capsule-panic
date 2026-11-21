import characterAtlas from '../../../packages/assets/atlas/personnages-origine@3x.webp';
import characters from '../../../packages/assets/atlas/personnages-origine@3x.json';
import { artwork } from './artwork';

export type ArtworkName = keyof typeof artwork;

export function Art({ name, alt = '', className }: { name: ArtworkName; alt?: string; className?: string }) {
    return <img src={artwork[name]} data-art={name} alt={alt} className={className} draggable={false} />;
}

export function ArtButton({
    name,
    label,
    labelled = false,
    onClick,
}: {
    name: ArtworkName;
    label: string;
    labelled?: boolean;
    onClick(): void;
}) {
    return (
        <button
            className="art-button"
            aria-label={label}
            title={labelled ? undefined : label}
            onClick={onClick}
        >
            <Art name={name} />
            {labelled && <span>{label}</span>}
        </button>
    );
}

type CharacterName = 'chercheuse-origine' | 'responsable-origine';

export function Character({ name, className = '' }: { name: CharacterName; className?: string }) {
    const frame = characters.frames[`sprite-${name}`].frame;
    const atlas = characters.meta.size;
    return (
        <span
            aria-hidden="true"
            data-art={name}
            className={`character ${className}`}
            style={{
                backgroundImage: `url(${characterAtlas})`,
                backgroundSize: `${(100 * atlas.w) / frame.w}% ${(100 * atlas.h) / frame.h}%`,
                backgroundPosition: `${(100 * frame.x) / (atlas.w - frame.w)}% ${(100 * frame.y) / (atlas.h - frame.h)}%`,
            }}
        />
    );
}
