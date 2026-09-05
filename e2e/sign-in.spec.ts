import { expect, test } from "@playwright/test";

import { LEARNER_STATE } from "../playwright.config";
import { explainSignInFailure, LEARNER, warmUpGrading } from "./fixtures";

test("the seeded learner signs in and lands on the dashboard", async ({
  page,
  request,
}) => {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(LEARNER.email);
  await page.getByLabel("Password").fill(LEARNER.password);
  await page.getByRole("button", { name: "Sign In" }).click();

  const welcome = page.getByRole("heading", { name: "Welcome back!" });
  const toast = page.locator("[data-sonner-toast]");
  await expect(welcome.or(toast).first()).toBeVisible();
  if (!(await welcome.isVisible())) {
    throw new Error(
      `Sign-in showed "${await toast.innerText()}". ${await explainSignInFailure(request)}`,
    );
  }

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
  await page.context().storageState({ path: LEARNER_STATE });
  await warmUpGrading(page.request);
});
