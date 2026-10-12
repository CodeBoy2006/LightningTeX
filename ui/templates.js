// Starting points. Every package used here ships in the bundled TeX tree.
const article=String.raw`\documentclass[11pt]{article}
\usepackage{amsmath,amssymb}
\usepackage[margin=1in]{geometry}

\title{A Short Note on Sums}
\author{}
\date{}

\begin{document}
\maketitle

\section{A closed form}
The sum of the first $n$ positive integers has a closed form. Pairing the first and last terms shows that every pair contributes $n+1$.

\begin{equation}\label{eq:sum}
  \sum_{k=1}^{n} k = \frac{n(n+1)}{2}
\end{equation}

Equation~\eqref{eq:sum} is often attributed to Gauss. A related identity for squares is
\[
  \sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}.
\]

\section{Euler's identity}
For real $\theta$ we have $e^{i\theta} = \cos\theta + i\sin\theta$, and therefore $e^{i\pi} + 1 = 0$.

\end{document}
`;
const notes=String.raw`\documentclass{article}
\usepackage{amsmath,amssymb,amsthm}
\usepackage[margin=1in]{geometry}
\newtheorem{theorem}{Theorem}

\begin{document}

\section*{Linear maps}
Let $V$ and $W$ be vector spaces over a field $F$.

\begin{theorem}[Rank--nullity]
For a linear map $T \colon V \to W$ with $V$ finite-dimensional,
\[
  \dim V = \dim \ker T + \dim \operatorname{im} T.
\]
\end{theorem}

A change of basis acts on coordinates by a matrix:
\begin{align}
  \begin{pmatrix} x' \\ y' \end{pmatrix}
    &= \begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix}
       \begin{pmatrix} x \\ y \end{pmatrix}, \\
  \det R_\theta &= \cos^2\theta + \sin^2\theta = 1.
\end{align}

\end{document}
`;
const report={
  'main.tex':String.raw`\documentclass[11pt]{article}
\usepackage{amsmath,amssymb}
\usepackage[margin=1in]{geometry}
\input{macros}

\title{Project Report}
\author{}
\date{\today}

\begin{document}
\maketitle
\tableofcontents

\input{sections/introduction}
\input{sections/method}

\end{document}
`,
  'macros.tex':String.raw`\newcommand{\R}{\mathbb{R}}
\newcommand{\norm}[1]{\left\lVert #1 \right\rVert}
\DeclareMathOperator{\argmin}{arg\,min}
`,
  'sections/introduction.tex':String.raw`\section{Introduction}
We study the least-squares problem for a matrix $A \in \R^{m \times n}$ and a vector $b \in \R^m$.
`,
  'sections/method.tex':String.raw`\section{Method}
The estimate minimizes the residual norm,
\[
  \hat{x} = \argmin_{x \in \R^n} \norm{Ax - b}^2,
\]
and satisfies the normal equations $A^{\top} A \hat{x} = A^{\top} b$.
`,
};
const blank=String.raw`\documentclass{article}

\begin{document}

\end{document}
`;
export const TEMPLATES=[
  {id:'article',name:{en:'Article',zh:'文章'},main:'main.tex',files:{'main.tex':article}},
  {id:'notes',name:{en:'Math notes',zh:'数学笔记'},main:'main.tex',files:{'main.tex':notes}},
  {id:'report',name:{en:'Multi-file report',zh:'多文件报告'},main:'main.tex',files:report},
  {id:'blank',name:{en:'Blank',zh:'空白文档'},main:'main.tex',files:{'main.tex':blank}},
];
export const templateProject=template=>({main:template.main,files:Object.entries(template.files).map(([path,text])=>({path,text}))});
