// MathJax 4's Node bundle ships without type declarations; only the calls used by the tools.
declare module "@mathjax/src" {
  interface MathJaxNode {
    init(config: object): Promise<void>;
    tex2svgPromise(latex: string, options: { display: boolean }): Promise<unknown>;
    startup: { adaptor: { outerHTML(node: unknown): string } };
  }
  const MathJax: MathJaxNode;
  export default MathJax;
}
