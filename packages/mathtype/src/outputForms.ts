/**
 * The forms Convert MathType writes (generic examples): every construct of the MathType reader and of
 * the notation-kind rules applied on conversion. Convert LaTeX must accept each of them and read it
 * back to the same equation (tested), and docs/LATEX-INTERCHANGE.md lists them from this table.
 */
export const MATHTYPE_OUTPUT_FORMS: { what: string; latex: string }[] = [
  { what: "Physical vector", latex: "\\pvec{r}" },
  { what: "Physical vector with a frame pair (relative to)", latex: "\\pvec[P/O]{r}" },
  { what: "Primed frames in the frame pair", latex: "\\pvec[B'/B]{\\omega}" },
  { what: "Vectrix (frame) and its transpose", latex: "\\vectrix{F}^{\\T}" },
  { what: "Dyadic", latex: "\\dyadic{J}_{c}" },
  { what: "Basis (unit) vector with an index", latex: "\\bvec{f}_{1}" },
  { what: "Column matrix, matrix", latex: "\\cmat{x}=\\mat{A}\\cmat{y}" },
  { what: "Rotation matrix (direction cosines)", latex: "\\dcm{A}{B}" },
  { what: "Left superscript (frame of a column)", latex: "{}^{E}\\cmat{n}_{3}" },
  { what: "Left superscript and subscript", latex: "{}^{a}_{b}X" },
  { what: "Primes", latex: "x''+y'" },
  { what: "Dot product, cross product", latex: "a\\cdot b+a\\times b" },
  { what: "Fraction, root, n-th root", latex: "\\frac{a}{b}+\\sqrt{x}+\\sqrt[3]{y}" },
  { what: "Sum, product, integral with limits", latex: "\\sum_{i=1}^{n}a_i+\\prod_{k}b_k+\\int_{0}^{T}f\\,dt" },
  { what: "Stretchy brackets", latex: "\\left(\\frac{a}{b}\\right)+\\left[x\\right]+\\left\\{y\\right\\}+\\left|z\\right|" },
  { what: "Matrices", latex: "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}+\\begin{pmatrix}x\\\\y\\end{pmatrix}" },
  { what: "Accents", latex: "\\dot{x}+\\ddot{x}+\\hat{x}+\\bar{x}+\\tilde{x}+\\vec{x}+\\overrightharpoon{x}" },
  { what: "Over and under", latex: "\\overset{\\leftrightarrow}{I}+\\underset{n\\to\\infty}{\\lim}x" },
  { what: "Functions", latex: "\\sin\\theta+\\cos\\phi+\\exp x+\\ln y" },
  { what: "Text and upright letters", latex: "\\text{if }x>0,\\ \\mathrm{d}t" },
  { what: "Bold Latin and Greek", latex: "\\mathbf{F}+\\boldsymbol{\\omega}" },
  { what: "Number sets", latex: "k\\in\\mathbb{Z},\\ x\\in\\mathbb{R}" },
  { what: "Spaces", latex: "a\\,b\\:c\;d\\quad e\\qquad f" },
  { what: "Aligned lines", latex: "\\begin{aligned}a&=b\\\\&=c\\end{aligned}" },
  { what: "Cases", latex: "f=\\begin{cases}1&x>0\\\\0&\\text{else}\\end{cases}" },
];
