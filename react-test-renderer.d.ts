declare module "react-test-renderer" {
  export type ReactTestRenderer = any;
  export const act: (...args: any[]) => any;
  const renderer: {
    create: (...args: any[]) => ReactTestRenderer;
  };
  export default renderer;
}
