declare module 'butterchurn' {
  export interface ButterchurnRenderOpts {
    elapsedTime?: number;
    audioLevels?: { timeByteArray: Uint8Array; timeByteArrayL: Uint8Array; timeByteArrayR: Uint8Array };
  }
  export interface ButterchurnSizeOpts {
    pixelRatio?: number;
    textureRatio?: number;
  }
  export interface ButterchurnVisualizer {
    connectAudio(node: AudioNode): void;
    disconnectAudio(node: AudioNode): void;
    loadPreset(preset: object, blendTime?: number): void;
    setRendererSize(width: number, height: number, opts?: ButterchurnSizeOpts): void;
    setInternalMeshSize(width: number, height: number): void;
    setOutputAA(useAA: boolean): void;
    launchSongTitleAnim(text: string): void;
    render(opts?: ButterchurnRenderOpts): void;
    toDataURL(): string;
    loseGLContext?(): void;
  }
  export interface ButterchurnCreateOpts extends ButterchurnSizeOpts {
    width?: number;
    height?: number;
    meshWidth?: number;
    meshHeight?: number;
    outputFXAA?: boolean;
  }
  const butterchurn: {
    createVisualizer(ctx: AudioContext, canvas: HTMLCanvasElement, opts?: ButterchurnCreateOpts): ButterchurnVisualizer;
  };
  export default butterchurn;
}
declare module 'butterchurn/lib/isSupported.min' {
  const isSupported: () => boolean;
  export default isSupported;
}
declare module 'butterchurn-presets' {
  const presets: { getPresets(): Record<string, object> };
  export default presets;
}
declare module 'butterchurn-presets/lib/butterchurnPresetsExtra.min' {
  const presets: { getPresets(): Record<string, object> };
  export default presets;
}
declare module 'butterchurn-presets/lib/butterchurnPresetsExtra2.min' {
  const presets: { getPresets(): Record<string, object> };
  export default presets;
}
declare module 'butterchurn-presets/lib/butterchurnPresetsMD1.min' {
  const presets: { getPresets(): Record<string, object> };
  export default presets;
}
