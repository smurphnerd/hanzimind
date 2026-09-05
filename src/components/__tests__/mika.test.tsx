import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Footer } from "../footer";
import { Mika } from "../mika";

describe("Mika", () => {
  it("should draw the sleeping mark rather than set it as text", () => {
    // A text node lands in the page's extracted text wherever the mascot
    // renders, which put a stray "z" in every empty state. Screen readers were
    // never affected: the svg carries its own role and label.
    const html = renderToStaticMarkup(<Mika pose="sleep" />);

    expect(html).not.toContain("<text");
  });

  it("should keep the label a screen reader announces", () => {
    const html = renderToStaticMarkup(<Mika pose="sleep" />);

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Mika the red panda"');
  });
});

describe("Footer", () => {
  it("should show this year and no other", () => {
    const html = renderToStaticMarkup(<Footer />);

    expect(html.match(/20\d\d/g)).toEqual([String(new Date().getFullYear())]);
  });
});
