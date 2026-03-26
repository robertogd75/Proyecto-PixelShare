export interface Pixel {
    id?: number;
    x: number;
    y: number;
    fromX?: number; // Previous position for line segment drawing
    fromY?: number; // Previous position for line segment drawing
    color: string;
    size?: number;
    roomId?: number;
    type?: string; // For control messages like 'HOST_CLOSED', 'RESIZE'
    width?: number;  // Used in RESIZE messages
    height?: number; // Used in RESIZE messages
    allowAllDraw?: boolean;  // For SETTINGS_UPDATE
    allowAllClear?: boolean; // For SETTINGS_UPDATE
    pixelHistory?: Pixel[]; // For INIT_PIXELS
}
