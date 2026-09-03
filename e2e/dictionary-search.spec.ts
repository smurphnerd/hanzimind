import { expect, test } from "@playwright/test";

test("dictionary search lists 人 as a character with audio", async ({
  page,
}) => {
  await page.goto("/dictionary");
  await page
    .getByPlaceholder("Search Chinese characters or pinyin...")
    .fill("人");
  await page.getByRole("button", { name: "Search" }).click();

  const row = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "人", exact: true }),
  });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("Meaning only")).toHaveCount(0);
  await expect(row.getByRole("button")).toBeEnabled();
});
