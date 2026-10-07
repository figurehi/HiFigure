declare module "svgedit" {
  export default class Editor {
    constructor(container: HTMLElement);
    init(): Promise<void>;
    setConfig(config: Record<string, unknown>): void;
    svgCanvas: {
      getSvgString(): string;
      setMode?(mode: string): void;
      setSvgString(svg: string, preventUndo?: boolean): boolean;
    };
  }
}
