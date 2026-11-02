/** Which editor the user worked in last, so palette insertions go to the right place. */
let last: "visual" | "latex" = "visual";
export const setLastEditor = (e: "visual" | "latex") => {
  last = e;
};
export const lastEditor = () => last;
