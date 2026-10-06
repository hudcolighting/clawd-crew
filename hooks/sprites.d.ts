export declare const W: number
export declare const H: number
export declare const GROUND: number
export declare const TILE: string
export declare const FLOOR: string
export declare const PALETTE: readonly (string | null)[]
export declare const ANIMATIONS: readonly string[]
export declare const framesOf: (name: string) => { ms: number; frames: Uint8Array[] }
/** Each mood's animations, its own first: [animation, the name the settings show]. */
export declare const VARIANTS: Readonly<Record<string, readonly (readonly [string, string])[]>>
