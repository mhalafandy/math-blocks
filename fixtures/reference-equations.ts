/**
 * Reference equations used by converter tests and by the M1 spike documents.
 * They cover every Tier-1 structure, in notation from the target fields
 * (calculus, linear algebra, ODEs, mechanics, orbital mechanics, control).
 */
export interface ReferenceEquation {
  id: string;
  title: string;
  category: string;
  latex: string;
  display: boolean;
}

export const REFERENCE_EQUATIONS: ReferenceEquation[] = [
  { id: "newton2", title: "Newton's second law", category: "Classical Mechanics", latex: "\\vec{F} = m\\vec{a}", display: true },
  { id: "quadratic", title: "Quadratic formula", category: "General Mathematics", latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", display: true },
  { id: "gauss-int", title: "Gaussian integral", category: "Calculus", latex: "\\int_{-\\infty}^{\\infty} e^{-x^2}\\,\\mathrm{d}x = \\sqrt{\\pi}", display: true },
  { id: "taylor", title: "Taylor series", category: "Calculus", latex: "f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n", display: true },
  { id: "limit", title: "Fundamental limit", category: "Calculus", latex: "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1", display: true },
  { id: "double-int", title: "Double integral", category: "Calculus", latex: "\\iint_D \\left( \\frac{\\partial Q}{\\partial x} - \\frac{\\partial P}{\\partial y} \\right) \\mathrm{d}A = \\oint_{\\partial D} P\\,\\mathrm{d}x + Q\\,\\mathrm{d}y", display: true },
  { id: "partial-deriv", title: "Heat equation", category: "Differential Equations", latex: "\\frac{\\partial u}{\\partial t} = \\alpha \\nabla^2 u", display: true },
  { id: "ode2", title: "Damped oscillator", category: "Differential Equations", latex: "m\\ddot{x} + c\\dot{x} + kx = F_0 \\cos(\\omega t)", display: true },
  { id: "rotation", title: "Rotation matrix", category: "Linear Algebra", latex: "R_z(\\theta) = \\begin{bmatrix} \\cos\\theta & -\\sin\\theta & 0 \\\\ \\sin\\theta & \\cos\\theta & 0 \\\\ 0 & 0 & 1 \\end{bmatrix}", display: true },
  { id: "determinant", title: "2×2 determinant", category: "Linear Algebra", latex: "\\det A = \\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix} = ad - bc", display: true },
  { id: "eigen", title: "Eigenvalue problem", category: "Linear Algebra", latex: "A\\mathbf{v} = \\lambda \\mathbf{v}", display: true },
  { id: "cross", title: "Cross product", category: "Vector Calculus", latex: "\\vec{a} \\times \\vec{b} = \\begin{vmatrix} \\hat{i} & \\hat{j} & \\hat{k} \\\\ a_x & a_y & a_z \\\\ b_x & b_y & b_z \\end{vmatrix}", display: true },
  { id: "divergence", title: "Divergence theorem", category: "Vector Calculus", latex: "\\iiint_V \\nabla \\cdot \\vec{F}\\,\\mathrm{d}V = \\oiint_S \\vec{F} \\cdot \\hat{n}\\,\\mathrm{d}S", display: true },
  { id: "abs-cases", title: "Absolute value (piecewise)", category: "General Mathematics", latex: "|x| = \\begin{cases} x & x \\geq 0 \\\\ -x & x < 0 \\end{cases}", display: true },
  { id: "system", title: "Linear system", category: "Linear Algebra", latex: "\\left\\{ \\begin{aligned} 2x + y &= 5 \\\\ x - 3y &= -1 \\end{aligned} \\right.", display: true },
  { id: "derivation", title: "Aligned derivation", category: "General Mathematics", latex: "\\begin{aligned} (a+b)^2 &= (a+b)(a+b) \\\\ &= a^2 + ab + ba + b^2 \\\\ &= a^2 + 2ab + b^2 \\end{aligned}", display: true },
  { id: "lagrange", title: "Euler–Lagrange equation", category: "Classical Mechanics", latex: "\\frac{\\mathrm{d}}{\\mathrm{d}t} \\left( \\frac{\\partial L}{\\partial \\dot{q}_i} \\right) - \\frac{\\partial L}{\\partial q_i} = 0", display: true },
  { id: "euler-rigid", title: "Euler's rigid-body equations", category: "Spacecraft Dynamics", latex: "I_1 \\dot{\\omega}_1 + (I_3 - I_2)\\,\\omega_2 \\omega_3 = M_1", display: true },
  { id: "angmom", title: "Angular momentum", category: "Classical Mechanics", latex: "\\vec{L} = \\vec{r} \\times m\\vec{v} = I\\vec{\\omega}", display: true },
  { id: "vis-viva", title: "Vis-viva equation", category: "Orbital Mechanics", latex: "v^2 = \\mu \\left( \\frac{2}{r} - \\frac{1}{a} \\right)", display: true },
  { id: "kepler", title: "Kepler's equation", category: "Orbital Mechanics", latex: "M = E - e \\sin E", display: true },
  { id: "two-body", title: "Two-body equation of motion", category: "Orbital Mechanics", latex: "\\ddot{\\vec{r}} = -\\frac{\\mu}{r^3}\\vec{r}", display: true },
  { id: "period", title: "Orbital period", category: "Orbital Mechanics", latex: "T = 2\\pi \\sqrt{\\frac{a^3}{\\mu}}", display: true },
  { id: "transfer", title: "Transfer function", category: "Control Systems", latex: "G(s) = \\frac{\\omega_n^2}{s^2 + 2\\zeta\\omega_n s + \\omega_n^2}", display: true },
  { id: "state-space", title: "State-space model", category: "Control Systems", latex: "\\begin{aligned} \\dot{\\mathbf{x}} &= A\\mathbf{x} + B\\mathbf{u} \\\\ \\mathbf{y} &= C\\mathbf{x} + D\\mathbf{u} \\end{aligned}", display: true },
  { id: "maxwell", title: "Faraday's law", category: "Mathematical Physics", latex: "\\nabla \\times \\vec{E} = -\\frac{\\partial \\vec{B}}{\\partial t}", display: true },
  { id: "tensor", title: "Tensor with prescripts", category: "Mathematical Physics", latex: "{}^{i}_{j}T^{kl}_{m} = g^{ka} R_{a j}", display: true },
  { id: "nth-root", title: "Nth root and product", category: "General Mathematics", latex: "\\sqrt[n]{\\prod_{i=1}^{n} x_i} \\leq \\frac{1}{n}\\sum_{i=1}^{n} x_i", display: true },
  { id: "binomial", title: "Binomial theorem", category: "General Mathematics", latex: "(x+y)^n = \\sum_{k=0}^{n} \\binom{n}{k} x^{n-k} y^k", display: true },
  { id: "underbrace", title: "Underbrace annotation", category: "General Mathematics", latex: "\\underbrace{1 + 1 + \\cdots + 1}_{n \\text{ times}} = n", display: true },
  { id: "norm", title: "Norm and inner product", category: "Linear Algebra", latex: "\\left\\| \\mathbf{x} \\right\\| = \\sqrt{\\left\\langle \\mathbf{x}, \\mathbf{x} \\right\\rangle}", display: true },
  { id: "inline-energy", title: "Kinetic energy (inline)", category: "Classical Mechanics", latex: "E_k = \\tfrac{1}{2} m v^2", display: false },
];
