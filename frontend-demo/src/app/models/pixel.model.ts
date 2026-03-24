export interface Pixel {
    id?: number;
    x: number;
    y: number;
    color: string;
    size?: number;
    roomId?: number;
    type?: string; // For control messages like 'HOST_CLOSED'
}
