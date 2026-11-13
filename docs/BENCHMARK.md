# Writing-speed benchmark

The built-in benchmark (Settings → Benchmark) times ten typical, generic equations one at a time in
MathBlocks: the clock starts with the first key and stops when the equation is right; keys are counted.
The same set is timed in MathType by hand.

| # | Equation | LaTeX |
|---|---|---|
| 1 | Fraction | `\frac{a+b}{c-d}` |
| 2 | Integral with limits | `\int_{0}^{\infty}e^{-x^{2}}\,\mathrm{d}x` |
| 3 | Sum and fraction | `\sum_{k=1}^{n}k^{2}=\frac{n(n+1)(2n+1)}{6}` |
| 4 | Matrix product | `\begin{bmatrix}a&b\\c&d\end{bmatrix}\begin{bmatrix}x\\y\end{bmatrix}` |
| 5 | Vectors with frames | `\pvec[B/N]{v}=\frac{\mathrm{d}}{\mathrm{d}t}\pvec[B/N]{r}` |
| 6 | Direction cosine matrix | `\cmat{v}=\dcm{B}{N}\cmat{r}` |
| 7 | Root | `\sqrt{x^{2}+y^{2}+z^{2}}` |
| 8 | Multi-line derivation | `\begin{aligned}f(x)&=(x+1)^{2}\\&=x^{2}+2x+1\end{aligned}` |
| 9 | Limit | `\lim_{h\to 0}\frac{f(x+h)-f(x)}{h}` |
| 10 | Cross products | `\pvec{\omega}\times\left(\pvec{\omega}\times\pvec{r}\right)` |

## Results

No results yet: they will be recorded here when you send them (MathBlocks seconds and keys per equation,
MathType seconds per equation, and the build used).
