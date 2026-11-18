/** Image SVG générée par le rendu (art original), insérée comme image décorative ou étiquetée. */
export function Svg({ svg, label }: { svg: string; label?: string }) {
    const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return label ? <img src={src} alt={label} /> : <img src={src} alt="" aria-hidden="true" />;
}
