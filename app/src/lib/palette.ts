/**
 * Symbol & template palette data (MathType-style).
 *
 * Templates use MathLive conventions: "#0" = current selection (or an empty slot),
 * "#?" = empty slot. Symbols insert their LaTeX command. `keys` holds meanings and synonyms
 * for search ("gradient" finds ∇, "cross product" finds ×).
 *
 * Every LaTeX command used here must be understood by packages/math-latex (tested in
 * app/src/lib/palette.test.ts), so anything inserted from the palette converts to Word cleanly.
 */

export interface PaletteItem {
  id: string;
  /** Inserted LaTeX (template). */
  latex: string;
  /** Human name shown in the tooltip. */
  name: string;
  /** Extra search words: meaning, synonyms. */
  keys?: string;
  /** Plain-text glyph for simple symbols (rendered in the math font). Templates are rendered by MathLive. */
  glyph?: string;
}

export interface PaletteGroup {
  id: string;
  label: string;
  /** Short preview shown on the group button (like MathType's "≤ ≠ ≈"): plain glyphs, or LaTeX when `iconTex`. */
  icon: string;
  iconTex?: boolean;
  /** "symbols": small glyph grid; "templates": larger rendered previews. */
  kind: "symbols" | "templates";
  /** Upper bars (dropdown groups) vs. lower tabs (topic collections). */
  row: "symbols" | "templates" | "tabs";
  items: PaletteItem[];
}

const sym = (id: string, latex: string, glyph: string, name: string, keys = ""): PaletteItem => ({ id, latex, glyph, name, keys });
const tpl = (id: string, latex: string, name: string, keys = ""): PaletteItem => ({ id, latex, name, keys });

// ------------------------------------------------------------------ symbol groups (row 1)

const relations: PaletteItem[] = [
  sym("lt", "<", "<", "Less than"),
  sym("gt", ">", ">", "Greater than"),
  sym("leq", "\\leq", "≤", "Less than or equal", "le"),
  sym("geq", "\\geq", "≥", "Greater than or equal", "ge"),
  sym("ll", "\\ll", "≪", "Much less than"),
  sym("gg", "\\gg", "≫", "Much greater than"),
  sym("eq", "=", "=", "Equals"),
  sym("neq", "\\neq", "≠", "Not equal", "ne different"),
  sym("approx", "\\approx", "≈", "Approximately equal", "approximation roughly"),
  sym("equiv", "\\equiv", "≡", "Identical / congruent", "identity defined modulo"),
  sym("sim", "\\sim", "∼", "Similar / distributed as", "tilde order of"),
  sym("simeq", "\\simeq", "≃", "Asymptotically equal"),
  sym("cong", "\\cong", "≅", "Congruent / isomorphic"),
  sym("propto", "\\propto", "∝", "Proportional to", "proportional"),
  sym("coloneqq", "\\coloneqq", "≔", "Defined as", "definition assign"),
  sym("doteq", "\\doteq", "≐", "Approaches the limit"),
  sym("mid", "\\mid", "∣", "Divides / such that", "conditional given"),
  sym("parallel", "\\parallel", "∥", "Parallel to"),
  sym("perp", "\\perp", "⊥", "Perpendicular", "orthogonal normal"),
];

const spacesAndDots: PaletteItem[] = [
  sym("thin", "\\,", "␣", "Thin space", "space"),
  sym("medium", "\\:", "␣␣", "Medium space", "space"),
  sym("thick", "\\;", "␣␣␣", "Thick space", "space"),
  sym("quad", "\\quad", "⎵", "Quad space (1 em)", "space em"),
  sym("qquad", "\\qquad", "⎵⎵", "Double quad space", "space"),
  sym("ldots", "\\ldots", "…", "Low dots", "ellipsis"),
  sym("cdots", "\\cdots", "⋯", "Centered dots", "ellipsis"),
  sym("vdots", "\\vdots", "⋮", "Vertical dots", "ellipsis"),
  sym("ddots", "\\ddots", "⋱", "Diagonal dots", "ellipsis"),
];

const operators: PaletteItem[] = [
  sym("plus", "+", "+", "Plus"),
  sym("minus", "-", "−", "Minus"),
  sym("pm", "\\pm", "±", "Plus-minus"),
  sym("mp", "\\mp", "∓", "Minus-plus"),
  sym("times", "\\times", "×", "Times / cross product", "multiply cross product vector product"),
  sym("div", "\\div", "÷", "Division"),
  sym("cdot", "\\cdot", "⋅", "Dot / scalar product", "multiply dot product inner product"),
  sym("ast", "\\ast", "∗", "Asterisk / convolution", "convolution"),
  sym("star", "\\star", "⋆", "Star"),
  sym("circ", "\\circ", "∘", "Composition", "compose ring"),
  sym("bullet", "\\bullet", "∙", "Bullet"),
  sym("oplus", "\\oplus", "⊕", "Direct sum / XOR", "xor"),
  sym("ominus", "\\ominus", "⊖", "Circled minus"),
  sym("otimes", "\\otimes", "⊗", "Tensor product", "kronecker outer product"),
  sym("odot", "\\odot", "⊙", "Hadamard product", "elementwise"),
  sym("wedge", "\\wedge", "∧", "Wedge / and", "exterior product and"),
  sym("vee", "\\vee", "∨", "Vee / or", "or"),
  sym("setminus", "\\setminus", "∖", "Set difference"),
];

const arrows: PaletteItem[] = [
  sym("to", "\\to", "→", "Right arrow / tends to", "approaches limit maps"),
  sym("leftarrow", "\\leftarrow", "←", "Left arrow"),
  sym("leftrightarrow", "\\leftrightarrow", "↔", "Left-right arrow"),
  sym("Rightarrow", "\\Rightarrow", "⇒", "Implies", "implication then"),
  sym("Leftarrow", "\\Leftarrow", "⇐", "Implied by"),
  sym("Leftrightarrow", "\\Leftrightarrow", "⇔", "If and only if", "iff equivalent"),
  sym("longrightarrow", "\\longrightarrow", "⟶", "Long right arrow"),
  sym("longleftarrow", "\\longleftarrow", "⟵", "Long left arrow"),
  sym("implies", "\\implies", "⟹", "Long implies"),
  sym("iff", "\\iff", "⟺", "Long if and only if"),
  sym("mapsto", "\\mapsto", "↦", "Maps to", "function mapping"),
  sym("uparrow", "\\uparrow", "↑", "Up arrow", "increase"),
  sym("downarrow", "\\downarrow", "↓", "Down arrow", "decrease"),
  sym("rightleftharpoons", "\\rightleftharpoons", "⇌", "Equilibrium", "reversible reaction"),
];

const logic: PaletteItem[] = [
  sym("therefore", "\\therefore", "∴", "Therefore"),
  sym("because", "\\because", "∵", "Because"),
  sym("forall", "\\forall", "∀", "For all", "universal quantifier every"),
  sym("exists", "\\exists", "∃", "There exists", "existential quantifier"),
  sym("nexists", "\\nexists", "∄", "There does not exist"),
  sym("neg", "\\neg", "¬", "Not", "negation"),
  sym("land", "\\land", "∧", "Logical and"),
  sym("lor", "\\lor", "∨", "Logical or"),
  sym("top", "\\top", "⊤", "True / top"),
  sym("bot", "\\bot", "⊥", "False / bottom"),
  sym("vdash", "\\vdash", "⊢", "Proves"),
  sym("models", "\\models", "⊨", "Models / entails"),
];

const sets: PaletteItem[] = [
  sym("in", "\\in", "∈", "Element of", "belongs member"),
  sym("notin", "\\notin", "∉", "Not an element of"),
  sym("ni", "\\ni", "∋", "Contains as member"),
  sym("subset", "\\subset", "⊂", "Subset"),
  sym("supset", "\\supset", "⊃", "Superset"),
  sym("subseteq", "\\subseteq", "⊆", "Subset or equal"),
  sym("supseteq", "\\supseteq", "⊇", "Superset or equal"),
  sym("cap", "\\cap", "∩", "Intersection", "and"),
  sym("cup", "\\cup", "∪", "Union", "or"),
  sym("emptyset", "\\emptyset", "∅", "Empty set", "null"),
  sym("N", "\\mathbb{N}", "ℕ", "Natural numbers"),
  sym("Z", "\\mathbb{Z}", "ℤ", "Integers"),
  sym("Q", "\\mathbb{Q}", "ℚ", "Rational numbers"),
  sym("R", "\\mathbb{R}", "ℝ", "Real numbers", "reals"),
  sym("C", "\\mathbb{C}", "ℂ", "Complex numbers"),
  sym("aleph", "\\aleph", "ℵ", "Aleph", "cardinality"),
];

const misc: PaletteItem[] = [
  sym("partial", "\\partial", "∂", "Partial derivative", "partial differential"),
  sym("infty", "\\infty", "∞", "Infinity", "infinite"),
  sym("ell", "\\ell", "ℓ", "Script l", "length"),
  sym("nabla", "\\nabla", "∇", "Nabla / gradient", "gradient del divergence curl"),
  sym("hbar", "\\hbar", "ℏ", "Reduced Planck constant", "h bar quantum"),
  sym("Re", "\\Re", "ℜ", "Real part"),
  sym("Im", "\\Im", "ℑ", "Imaginary part"),
  sym("wp", "\\wp", "℘", "Weierstrass p"),
  sym("degree", "^{\\circ}", "°", "Degree", "angle temperature"),
  sym("prime", "'", "′", "Prime", "derivative"),
  sym("angle", "\\angle", "∠", "Angle"),
  sym("triangle", "\\triangle", "△", "Triangle"),
];

const greekLower: PaletteItem[] = [
  ["alpha", "α"], ["beta", "β"], ["gamma", "γ"], ["delta", "δ"], ["epsilon", "ϵ"], ["varepsilon", "ε"],
  ["zeta", "ζ"], ["eta", "η"], ["theta", "θ"], ["vartheta", "ϑ"], ["iota", "ι"], ["kappa", "κ"],
  ["lambda", "λ"], ["mu", "μ"], ["nu", "ν"], ["xi", "ξ"], ["pi", "π"], ["varpi", "ϖ"], ["rho", "ρ"],
  ["varrho", "ϱ"], ["sigma", "σ"], ["varsigma", "ς"], ["tau", "τ"], ["upsilon", "υ"], ["phi", "ϕ"],
  ["varphi", "φ"], ["chi", "χ"], ["psi", "ψ"], ["omega", "ω"],
].map(([n, g]) => sym(n!, `\\${n}`, g!, n!.replace(/^var/, "variant "), "greek"));

const greekUpper: PaletteItem[] = [
  ["Gamma", "Γ"], ["Delta", "Δ"], ["Theta", "Θ"], ["Lambda", "Λ"], ["Xi", "Ξ"], ["Pi", "Π"],
  ["Sigma", "Σ"], ["Upsilon", "Υ"], ["Phi", "Φ"], ["Psi", "Ψ"], ["Omega", "Ω"],
].map(([n, g]) => sym(n!, `\\${n}`, g!, `Capital ${n!.toLowerCase()}`, "greek"));

// ------------------------------------------------------------------ template groups (row 2)

const fences: PaletteItem[] = [
  tpl("paren", "\\left(#0\\right)", "Parentheses", "brackets round"),
  tpl("bracket", "\\left[#0\\right]", "Square brackets"),
  tpl("brace", "\\left\\{#0\\right\\}", "Braces", "curly set"),
  tpl("abs", "\\left|#0\\right|", "Absolute value", "modulus magnitude determinant bars"),
  tpl("norm", "\\left\\|#0\\right\\|", "Norm", "length magnitude double bars"),
  tpl("angle", "\\left\\langle #0\\right\\rangle", "Angle brackets", "expectation bra ket inner product"),
  tpl("inner", "\\left\\langle #0\\middle|#?\\right\\rangle", "Inner product ⟨a|b⟩", "bra ket dirac"),
  tpl("floor", "\\left\\lfloor #0\\right\\rfloor", "Floor"),
  tpl("ceil", "\\left\\lceil #0\\right\\rceil", "Ceiling"),
  tpl("halfopen1", "\\left[#0\\right)", "Half-open interval [a, b)", "interval"),
  tpl("halfopen2", "\\left(#0\\right]", "Half-open interval (a, b]", "interval"),
  tpl("leftbrace", "\\left\\{#0\\right.", "Left brace only", "system cases"),
  tpl("evalbar", "\\left.#0\\right|_{#?}", "Evaluated at", "evaluation bar substitute"),
];

const fractionsRoots: PaletteItem[] = [
  tpl("frac", "\\frac{#0}{#?}", "Fraction", "divide ratio over"),
  tpl("dfrac", "\\dfrac{#0}{#?}", "Display-size fraction"),
  tpl("tfrac", "\\tfrac{#0}{#?}", "Small fraction"),
  tpl("slash", "#0/#?", "Slash fraction", "divide"),
  tpl("sqrt", "\\sqrt{#0}", "Square root", "radical"),
  tpl("nroot", "\\sqrt[#?]{#0}", "Nth root", "cube root radical"),
  tpl("binom", "\\binom{#0}{#?}", "Binomial coefficient", "choose combination"),
];

const scripts: PaletteItem[] = [
  tpl("sup", "#0^{#?}", "Superscript", "power exponent"),
  tpl("sub", "#0_{#?}", "Subscript", "index"),
  tpl("subsup", "#0_{#?}^{#?}", "Subscript and superscript"),
  tpl("pre", "{}_{#?}^{#?}#0", "Left scripts (tensor / isotope)", "prescript tensor isotope"),
  tpl("tensor", "#0^{#?}_{#?}", "Tensor indices", "tensor index"),
  tpl("overset", "\\overset{#?}{#0}", "Text above", "over stack label"),
  tpl("underset", "\\underset{#?}{#0}", "Text below", "under stack label"),
];

const sumsProducts: PaletteItem[] = [
  tpl("sum", "\\sum #0", "Summation", "sigma series"),
  tpl("sumlim", "\\sum_{#?}^{#?}#0", "Summation with limits", "sigma series"),
  tpl("sumsub", "\\sum_{#?}#0", "Summation over index", "sigma"),
  tpl("prod", "\\prod_{#?}^{#?}#0", "Product", "pi product"),
  tpl("coprod", "\\coprod_{#?}^{#?}#0", "Coproduct"),
  tpl("bigcup", "\\bigcup_{#?}^{#?}#0", "Big union", "union"),
  tpl("bigcap", "\\bigcap_{#?}^{#?}#0", "Big intersection", "intersection"),
  tpl("bigoplus", "\\bigoplus_{#?}#0", "Big direct sum"),
  tpl("bigotimes", "\\bigotimes_{#?}#0", "Big tensor product"),
];

const integrals: PaletteItem[] = [
  tpl("int", "\\int #0\\,\\mathrm{d}#?", "Indefinite integral", "antiderivative integrate"),
  tpl("intlim", "\\int_{#?}^{#?}#0\\,\\mathrm{d}#?", "Definite integral", "integrate area"),
  tpl("intlimits", "\\int\\limits_{#?}^{#?}#0\\,\\mathrm{d}#?", "Integral, limits above/below"),
  tpl("iint", "\\iint_{#?}#0\\,\\mathrm{d}A", "Double integral", "surface area"),
  tpl("iiint", "\\iiint_{#?}#0\\,\\mathrm{d}V", "Triple integral", "volume"),
  tpl("oint", "\\oint_{#?}#0\\,\\mathrm{d}#?", "Contour integral", "closed line circulation"),
  tpl("oiint", "\\oiint_{#?}#0\\,\\mathrm{d}S", "Closed surface integral", "flux"),
  tpl("intinf", "\\int_{-\\infty}^{\\infty}#0\\,\\mathrm{d}#?", "Integral over ℝ", "improper"),
];

const embellishments: PaletteItem[] = [
  tpl("vec", "\\vec{#0}", "Vector arrow", "vector"),
  tpl("overrightarrow", "\\overrightarrow{#0}", "Long vector arrow", "vector AB"),
  tpl("overleftarrow", "\\overleftarrow{#0}", "Left arrow above"),
  tpl("hat", "\\hat{#0}", "Hat", "unit vector estimate operator"),
  tpl("widehat", "\\widehat{#0}", "Wide hat"),
  tpl("bar", "\\bar{#0}", "Bar", "mean average conjugate"),
  tpl("overline", "\\overline{#0}", "Overline", "conjugate closure"),
  tpl("underline", "\\underline{#0}", "Underline"),
  tpl("tilde", "\\tilde{#0}", "Tilde", "approximation"),
  tpl("widetilde", "\\widetilde{#0}", "Wide tilde"),
  tpl("dot", "\\dot{#0}", "Dot (time derivative)", "velocity newton derivative"),
  tpl("ddot", "\\ddot{#0}", "Double dot", "acceleration second derivative"),
  tpl("dddot", "\\dddot{#0}", "Triple dot", "jerk third derivative"),
  tpl("primex", "#0'", "Prime", "derivative"),
  tpl("dprimex", "#0''", "Double prime", "second derivative"),
  tpl("check", "\\check{#0}", "Check"),
  tpl("breve", "\\breve{#0}", "Breve"),
  tpl("overbrace", "\\overbrace{#0}^{#?}", "Overbrace with label", "brace annotation"),
  tpl("underbrace", "\\underbrace{#0}_{#?}", "Underbrace with label", "brace annotation"),
  tpl("boxed", "\\boxed{#0}", "Boxed", "frame result highlight"),
];

const labeledArrows: PaletteItem[] = [
  tpl("arrowover", "\\overset{#?}{\\longrightarrow}", "Arrow with label above", "labeled arrow tends"),
  tpl("arrowunder", "\\underset{#?}{\\longrightarrow}", "Arrow with label below"),
  tpl("eqover", "\\overset{#?}{=}", "Equals with label", "by definition annotated equals"),
  tpl("defeq", "\\overset{\\text{def}}{=}", "Equal by definition", "define"),
  tpl("impliesover", "\\overset{#?}{\\Longrightarrow}", "Implies with label"),
  tpl("limto", "\\overset{#?}{\\to}", "Tends to (labeled)", "limit"),
];

const matrices: PaletteItem[] = [
  tpl("pmat2", "\\begin{pmatrix}#? & #?\\\\ #? & #?\\end{pmatrix}", "2×2 matrix ( )", "matrix"),
  tpl("bmat2", "\\begin{bmatrix}#? & #?\\\\ #? & #?\\end{bmatrix}", "2×2 matrix [ ]", "matrix"),
  tpl("pmat3", "\\begin{pmatrix}#? & #? & #?\\\\ #? & #? & #?\\\\ #? & #? & #?\\end{pmatrix}", "3×3 matrix ( )", "matrix"),
  tpl("bmat3", "\\begin{bmatrix}#? & #? & #?\\\\ #? & #? & #?\\\\ #? & #? & #?\\end{bmatrix}", "3×3 matrix [ ]", "matrix rotation"),
  tpl("vmat2", "\\begin{vmatrix}#? & #?\\\\ #? & #?\\end{vmatrix}", "2×2 determinant", "determinant"),
  tpl("vmat3", "\\begin{vmatrix}#? & #? & #?\\\\ #? & #? & #?\\\\ #? & #? & #?\\end{vmatrix}", "3×3 determinant", "determinant cross product"),
  tpl("colvec2", "\\begin{pmatrix}#?\\\\ #?\\end{pmatrix}", "Column vector (2)", "vector components"),
  tpl("colvec3", "\\begin{bmatrix}#?\\\\ #?\\\\ #?\\end{bmatrix}", "Column vector (3)", "vector components xyz"),
  tpl("rowvec3", "\\begin{bmatrix}#? & #? & #?\\end{bmatrix}", "Row vector (3)", "vector"),
  tpl("general", "\\begin{pmatrix}a_{11} & \\cdots & a_{1n}\\\\ \\vdots & \\ddots & \\vdots\\\\ a_{m1} & \\cdots & a_{mn}\\end{pmatrix}", "General m×n matrix", "matrix dots"),
  tpl("identity", "\\begin{pmatrix}1 & 0\\\\ 0 & 1\\end{pmatrix}", "Identity matrix", "unit"),
  tpl("diag", "\\begin{pmatrix}#? & & 0\\\\ & \\ddots & \\\\ 0 & & #?\\end{pmatrix}", "Diagonal matrix", "diagonal"),
  tpl("cases2", "\\begin{cases}#? & #?\\\\ #? & #?\\end{cases}", "Piecewise (2 cases)", "cases conditional"),
  tpl("cases3", "\\begin{cases}#? & #?\\\\ #? & #?\\\\ #? & #?\\end{cases}", "Piecewise (3 cases)", "cases"),
  tpl("aligned2", "\\begin{aligned}#? &= #?\\\\ &= #?\\end{aligned}", "Aligned derivation", "align equal signs steps"),
  tpl("system2", "\\left\\{\\begin{aligned}#? &= #?\\\\ #? &= #?\\end{aligned}\\right.", "System of equations", "simultaneous"),
];

// ------------------------------------------------------------------ topic tabs (row 3)

const algebra: PaletteItem[] = [
  tpl("quadratic", "x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}", "Quadratic formula"),
  tpl("square", "(a+b)^2=a^2+2ab+b^2", "Square of a sum"),
  tpl("diffsq", "a^2-b^2=(a-b)(a+b)", "Difference of squares"),
  tpl("binomthm", "(x+y)^n=\\sum_{k=0}^{n}\\binom{n}{k}x^{n-k}y^k", "Binomial theorem"),
  tpl("log", "\\log_{#?}#0", "Logarithm with base"),
  tpl("ln", "\\ln #0", "Natural logarithm"),
  tpl("exp", "e^{#0}", "Exponential", "e power"),
  tpl("abseq", "|x|=\\begin{cases}x & x\\geq 0\\\\ -x & x<0\\end{cases}", "Absolute value (piecewise)"),
];

const derivs: PaletteItem[] = [
  tpl("ddx", "\\frac{\\mathrm{d}#0}{\\mathrm{d}#?}", "Derivative d/dx", "differentiate"),
  tpl("d2dx2", "\\frac{\\mathrm{d}^2#0}{\\mathrm{d}#?^2}", "Second derivative", "differentiate"),
  tpl("dndx", "\\frac{\\mathrm{d}^{#?}#0}{\\mathrm{d}#?^{#?}}", "n-th derivative"),
  tpl("pdx", "\\frac{\\partial #0}{\\partial #?}", "Partial derivative", "partial"),
  tpl("p2dx2", "\\frac{\\partial^2#0}{\\partial #?^2}", "Second partial derivative"),
  tpl("pdxdy", "\\frac{\\partial^2#0}{\\partial #?\\,\\partial #?}", "Mixed partial derivative"),
  tpl("ddt", "\\frac{\\mathrm{d}}{\\mathrm{d}t}\\left(#0\\right)", "Time derivative operator"),
  tpl("fprime", "f'(#0)", "f′(x)"),
  tpl("lim", "\\lim_{#?\\to #?}#0", "Limit", "limit tends"),
  tpl("liminf", "\\lim_{#?\\to\\infty}#0", "Limit at infinity"),
  tpl("taylor", "f(x)=\\sum_{n=0}^{\\infty}\\frac{f^{(n)}(a)}{n!}(x-a)^n", "Taylor series"),
  tpl("euler-lagrange", "\\frac{\\mathrm{d}}{\\mathrm{d}t}\\left(\\frac{\\partial L}{\\partial\\dot{q}_i}\\right)-\\frac{\\partial L}{\\partial q_i}=0", "Euler–Lagrange equation", "lagrangian mechanics"),
];

const vectors: PaletteItem[] = [
  tpl("unitvec", "\\hat{#0}", "Unit vector", "direction"),
  tpl("ijk", "#?\\,\\hat{i}+#?\\,\\hat{j}+#?\\,\\hat{k}", "Components in i, j, k", "cartesian unit vectors"),
  tpl("magnitude", "\\left\\|\\vec{#0}\\right\\|", "Vector magnitude", "norm length"),
  tpl("dotprod", "\\vec{a}\\cdot\\vec{b}", "Dot product", "scalar product"),
  tpl("crossprod", "\\vec{a}\\times\\vec{b}", "Cross product", "vector product"),
  tpl("grad", "\\nabla #0", "Gradient", "nabla del"),
  tpl("divergence", "\\nabla\\cdot\\vec{#0}", "Divergence", "div"),
  tpl("curl", "\\nabla\\times\\vec{#0}", "Curl", "rot rotation"),
  tpl("laplacian", "\\nabla^2#0", "Laplacian", "laplace"),
  tpl("newton", "\\vec{F}=m\\vec{a}", "Newton's second law", "force"),
  tpl("angvel", "\\vec{v}=\\vec{\\omega}\\times\\vec{r}", "Velocity from angular velocity", "angular velocity rotation"),
  tpl("angmom", "\\vec{L}=\\vec{r}\\times\\vec{p}", "Angular momentum", "momentum"),
  tpl("crossdet", "\\vec{a}\\times\\vec{b}=\\begin{vmatrix}\\hat{i} & \\hat{j} & \\hat{k}\\\\ a_x & a_y & a_z\\\\ b_x & b_y & b_z\\end{vmatrix}", "Cross product determinant"),
];

const orbital: PaletteItem[] = [
  tpl("vis-viva", "v^2=\\mu\\left(\\frac{2}{r}-\\frac{1}{a}\\right)", "Vis-viva equation", "orbit speed"),
  tpl("kepler", "M=E-e\\sin E", "Kepler's equation", "anomaly"),
  tpl("two-body", "\\ddot{\\vec{r}}=-\\frac{\\mu}{r^3}\\vec{r}", "Two-body equation of motion"),
  tpl("period", "T=2\\pi\\sqrt{\\frac{a^3}{\\mu}}", "Orbital period"),
  tpl("conic", "r=\\frac{p}{1+e\\cos\\nu}", "Orbit equation (conic)", "true anomaly"),
  tpl("euler-rigid", "I_1\\dot{\\omega}_1+(I_3-I_2)\\,\\omega_2\\omega_3=M_1", "Euler's rigid-body equation", "attitude spacecraft"),
  tpl("rotz", "R_z(\\theta)=\\begin{bmatrix}\\cos\\theta & -\\sin\\theta & 0\\\\ \\sin\\theta & \\cos\\theta & 0\\\\ 0 & 0 & 1\\end{bmatrix}", "Rotation matrix about z", "rotation attitude dcm"),
  tpl("transfer", "G(s)=\\frac{\\omega_n^2}{s^2+2\\zeta\\omega_n s+\\omega_n^2}", "Second-order transfer function", "control"),
  tpl("statespace", "\\begin{aligned}\\dot{\\mathbf{x}} &= A\\mathbf{x}+B\\mathbf{u}\\\\ \\mathbf{y} &= C\\mathbf{x}+D\\mathbf{u}\\end{aligned}", "State-space model", "control"),
];

/** Spacecraft dynamics in vectrix notation (Hughes): the user's thesis notation. */
const spacecraft: PaletteItem[] = [
  tpl("vecbold", "\\vec{\\mathbf{#0}}", "Geometric vector (bold with arrow)", "physical vector arrow bold"),
  tpl("vectrixT", "\\vec{\\mathbf{#0}}^{\\mathbf{T}}", "Vectrix transpose (frame)", "vectrix frame basis hughes transpose"),
  tpl("vectrix", "\\vec{\\mathbf{#0}}", "Vectrix / frame", "vectrix frame basis"),
  tpl("colmat", "\\mathbf{#0}", "Column matrix (bold)", "components bold matrix column"),
  tpl("transpose", "#0^{\\mathbf{T}}", "Transpose (bold T)", "transpose T"),
  tpl("colmatsub", "\\mathbf{#0}_{#?}", "Bold with subscript", "components index"),
  tpl("unitbold", "\\hat{\\mathbf{#0}}_{#?}", "Unit vector, bold (b̂₁)", "unit vector basis axis"),
  tpl("unitsub", "\\hat{#0}_{#?}", "Unit vector (ŝ₂)", "unit vector basis axis"),
  tpl("zerovec", "\\vec{\\mathbf{0}}", "Zero vector", "null vector"),
  tpl("zerocol", "\\mathbf{0}", "Zero column", "null zero matrix"),
  tpl("rowT", "\\begin{bmatrix}#? & #? & #?\\end{bmatrix}^{\\mathbf{T}}", "Components [x y z]ᵀ", "column components transpose row"),
  tpl("bodyint", "\\int_{\\mathbf{B}_{#?}}#0\\,\\mathrm{d}m", "Integral over a body", "mass body integral first moment"),
  tpl("dm", "\\mathrm{d}m", "Mass element dm", "differential mass"),
  tpl("dA", "\\mathrm{d}A", "Area element dA", "differential area"),
  tpl("dV", "\\mathrm{d}V", "Volume element dV", "differential volume"),
  tpl("dx", "\\mathrm{d}#0", "Upright differential d", "differential"),
  tpl("dint2", "\\int_{#?}^{#?}\\int_{#?}^{#?}#0\\,\\mathrm{d}#?\\,\\mathrm{d}#?", "Double integral with limits", "iterated"),
  tpl("dint3", "\\int_{#?}^{#?}\\int_{#?}^{#?}\\int_{#?}^{#?}#0\\,\\mathrm{d}#?\\,\\mathrm{d}#?\\,\\mathrm{d}#?", "Triple integral with limits", "iterated volume"),
  tpl("range", "#?\\leq #?\\leq #?", "Range a ≤ x ≤ b", "bounds interval limits inequality"),
  tpl("cross", "#0^{\\times}", "Cross (skew-symmetric) matrix", "skew symmetric cross product matrix"),
  tpl("omega", "\\boldsymbol{\\omega}", "Angular velocity column ω", "angular velocity bold greek"),
  tpl("omegacross", "\\boldsymbol{\\omega}^{\\times}", "ω× matrix", "angular velocity cross"),
  tpl("dyadic", "\\vec{\\vec{\\mathbf{#0}}}", "Dyadic (double arrow)", "inertia dyadic tensor"),
  tpl("rot", "\\mathbf{C}_{#?#?}", "Rotation matrix C_ab", "direction cosine dcm attitude"),
  tpl("vectrixrel", "\\vec{\\mathbf{c}}=\\vec{\\mathbf{S}}^{\\mathbf{T}}\\mathbf{c}", "Vector from frame components", "vectrix"),
  tpl("firstmoment", "\\vec{\\mathbf{c}}_i=\\int_{\\mathbf{B}_i}\\vec{\\mathbf{r}}\\,\\mathrm{d}m", "First moment of mass", "mass properties"),
  tpl("cylr", "\\mathbf{r}=\\begin{bmatrix}x & r\\cos\\phi & r\\sin\\phi\\end{bmatrix}^{\\mathbf{T}}", "Position, cylindrical", "cylindrical coordinates"),
  tpl("cyldv", "r\\,\\mathrm{d}r\\,\\mathrm{d}\\phi\\,\\mathrm{d}x", "Cylindrical volume element", "cylindrical dV"),
];

const trig: PaletteItem[] = [
  tpl("sin", "\\sin #0", "Sine"),
  tpl("cos", "\\cos #0", "Cosine"),
  tpl("tan", "\\tan #0", "Tangent"),
  tpl("arcsin", "\\arcsin #0", "Arcsine", "inverse sine"),
  tpl("sin2", "\\sin^2#0", "Sine squared"),
  tpl("pyth", "\\sin^2\\theta+\\cos^2\\theta=1", "Pythagorean identity"),
  tpl("sumangle", "\\sin(\\alpha\\pm\\beta)=\\sin\\alpha\\cos\\beta\\pm\\cos\\alpha\\sin\\beta", "Angle sum (sine)"),
  tpl("euler", "e^{i\\theta}=\\cos\\theta+i\\sin\\theta", "Euler's formula", "complex exponential"),
];

const statistics: PaletteItem[] = [
  tpl("mean", "\\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_i", "Sample mean", "average"),
  tpl("variance", "\\sigma^2=\\frac{1}{n}\\sum_{i=1}^{n}(x_i-\\mu)^2", "Variance"),
  tpl("expect", "\\operatorname{E}\\left[#0\\right]", "Expected value", "expectation"),
  tpl("var", "\\operatorname{Var}\\left(#0\\right)", "Variance operator"),
  tpl("prob", "P\\left(#0\\right)", "Probability"),
  tpl("cond", "P\\left(#0\\middle|#?\\right)", "Conditional probability", "given bayes"),
  tpl("normal", "f(x)=\\frac{1}{\\sigma\\sqrt{2\\pi}}e^{-\\frac{(x-\\mu)^2}{2\\sigma^2}}", "Normal distribution", "gaussian bell"),
  tpl("comb", "\\binom{n}{k}=\\frac{n!}{k!\\,(n-k)!}", "Combinations", "choose"),
];

export const GROUPS: PaletteGroup[] = [
  { id: "relations", label: "Relations", icon: "≤ ≠ ≈", kind: "symbols", row: "symbols", items: relations },
  { id: "spaces", label: "Spaces & dots", icon: "␣ ⋯ ⋱", kind: "symbols", row: "symbols", items: spacesAndDots },
  { id: "operators", label: "Operators", icon: "± ⋅ ⊗", kind: "symbols", row: "symbols", items: operators },
  { id: "arrows", label: "Arrows", icon: "→ ⇔ ↓", kind: "symbols", row: "symbols", items: arrows },
  { id: "logic", label: "Logic", icon: "∴ ∀ ∃", kind: "symbols", row: "symbols", items: logic },
  { id: "sets", label: "Sets", icon: "∉ ∩ ⊂", kind: "symbols", row: "symbols", items: sets },
  { id: "misc", label: "Calculus symbols", icon: "∂ ∞ ℓ", kind: "symbols", row: "symbols", items: misc },
  { id: "greek", label: "Greek", icon: "λ ω θ", kind: "symbols", row: "symbols", items: greekLower },
  { id: "Greek", label: "Greek capitals", icon: "Λ Ω Θ", kind: "symbols", row: "symbols", items: greekUpper },

  { id: "fences", label: "Brackets", icon: "\\left(#?\\right)\\left[#?\\right]", iconTex: true, kind: "templates", row: "templates", items: fences },
  { id: "fractions", label: "Fractions & roots", icon: "\\frac{#?}{#?}\\,\\sqrt{#?}", iconTex: true, kind: "templates", row: "templates", items: fractionsRoots },
  { id: "scripts", label: "Scripts", icon: "#?^{#?}\\,#?_{#?}", iconTex: true, kind: "templates", row: "templates", items: scripts },
  { id: "sums", label: "Sums & products", icon: "\\sum_{#?}^{#?}\\prod", iconTex: true, kind: "templates", row: "templates", items: sumsProducts },
  { id: "integrals", label: "Integrals", icon: "\\int_{#?}^{#?}\\oint", iconTex: true, kind: "templates", row: "templates", items: integrals },
  { id: "accents", label: "Accents & bars", icon: "\\vec{#?}\\,\\hat{#?}\\,\\dot{#?}", iconTex: true, kind: "templates", row: "templates", items: embellishments },
  { id: "labeled", label: "Labeled arrows", icon: "\\overset{#?}{\\to}\\,\\overset{#?}{=}", iconTex: true, kind: "templates", row: "templates", items: labeledArrows },
  { id: "matrices", label: "Matrices & cases", icon: "\\begin{pmatrix}#? & #?\\\\ #? & #?\\end{pmatrix}", iconTex: true, kind: "templates", row: "templates", items: matrices },

  { id: "tab-spacecraft", label: "Spacecraft dynamics", icon: "", kind: "templates", row: "tabs", items: spacecraft },
  { id: "tab-algebra", label: "Algebra", icon: "", kind: "templates", row: "tabs", items: algebra },
  { id: "tab-derivs", label: "Derivatives", icon: "", kind: "templates", row: "tabs", items: derivs },
  { id: "tab-vectors", label: "Vectors & mechanics", icon: "", kind: "templates", row: "tabs", items: vectors },
  { id: "tab-matrices", label: "Matrices", icon: "", kind: "templates", row: "tabs", items: matrices },
  { id: "tab-orbital", label: "Orbital & control", icon: "", kind: "templates", row: "tabs", items: orbital },
  { id: "tab-trig", label: "Trig", icon: "", kind: "templates", row: "tabs", items: trig },
  { id: "tab-stats", label: "Statistics", icon: "", kind: "templates", row: "tabs", items: statistics },
];

/** Default quick-access bar (MathType's third row). The user can pin/unpin items. */
export const DEFAULT_FAVORITES = [
  "symbols:greek:pi", "symbols:greek:theta", "symbols:misc:infty", "symbols:sets:in", "symbols:arrows:to",
  "symbols:misc:partial", "symbols:relations:leq", "symbols:relations:neq", "symbols:operators:pm",
  "templates:fences:paren", "templates:fences:bracket", "templates:fences:brace", "templates:fractions:frac",
  "templates:sums:sumlim", "templates:fractions:sqrt", "templates:scripts:sup", "templates:scripts:sub",
  "templates:accents:vec", "templates:accents:dot",
  "tabs:tab-spacecraft:vecbold", "tabs:tab-spacecraft:vectrixT", "tabs:tab-spacecraft:colmat", "tabs:tab-spacecraft:transpose",
  "tabs:tab-spacecraft:unitsub", "tabs:tab-spacecraft:bodyint", "tabs:tab-spacecraft:dm",
];

/** Global key of an item: "<row>:<group>:<item>" (unique even when a group appears twice). */
export const itemKey = (g: PaletteGroup, it: PaletteItem) => `${g.row === "tabs" ? "tabs" : g.row}:${g.id}:${it.id}`;

export interface IndexedItem {
  key: string;
  group: PaletteGroup;
  item: PaletteItem;
}

export const ALL_ITEMS: IndexedItem[] = GROUPS.flatMap((group) => group.items.map((item) => ({ key: itemKey(group, item), group, item })));

const BY_KEY = new Map(ALL_ITEMS.map((x) => [x.key, x]));
export const findItem = (key: string) => BY_KEY.get(key);

/** Search by name, meaning, LaTeX command or category; every word must match. Deduplicates by LaTeX. */
export function searchPalette(query: string, limit = 60): IndexedItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const seen = new Set<string>();
  const scored: { x: IndexedItem; s: number }[] = [];
  for (const x of ALL_ITEMS) {
    const name = x.item.name.toLowerCase();
    const hay = `${name} ${x.item.keys ?? ""} ${x.item.latex} ${x.item.glyph ?? ""} ${x.group.label}`.toLowerCase();
    let s = 0;
    let ok = true;
    for (const w of words) {
      const i = hay.indexOf(w);
      if (i < 0) {
        ok = false;
        break;
      }
      s += name.startsWith(w) ? 5 : i === 0 || hay[i - 1] === " " || hay[i - 1] === "\\" ? 3 : 1;
    }
    if (ok && !seen.has(x.item.latex)) {
      seen.add(x.item.latex);
      scored.push({ x, s });
    }
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((r) => r.x);
}

/**
 * LaTeX used to draw a template preview. The main slot (#0) shows a sample letter so that styles
 * are visible (bold x, x with arrow, xᵀ); other slots (#?) become grey boxes.
 */
export const previewLatex = (latex: string) => latex.replace(/#0/g, "x").replace(/#\?/g, "{\\color{#9a9aa6}\\square}");

/** LaTeX inserted into the plain-text LaTeX editor: slots become empty groups. */
export const plainLatex = (latex: string) => latex.replace(/#0|#\?/g, "{}");
