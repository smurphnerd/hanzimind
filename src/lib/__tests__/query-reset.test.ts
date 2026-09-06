import { describe, expect, it, vi } from "vitest";

import { createUserChangeReset } from "../query-reset";

const client = () => ({ clear: vi.fn() });

describe("createUserChangeReset", () => {
  it("should not clear on the first call, which is whoever is already signed in", () => {
    const queryClient = client();

    createUserChangeReset(queryClient)("user-a");

    expect(queryClient.clear).not.toHaveBeenCalled();
  });

  it("should not clear on a rerender with the same id", () => {
    const queryClient = client();
    const reset = createUserChangeReset(queryClient);

    reset("user-a");
    reset("user-a");
    reset("user-a");

    expect(queryClient.clear).not.toHaveBeenCalled();
  });

  it("should clear when the learner signs out", () => {
    const queryClient = client();
    const reset = createUserChangeReset(queryClient);

    reset("user-a");
    reset(null);

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });

  it("should clear when a different learner signs in", () => {
    const queryClient = client();
    const reset = createUserChangeReset(queryClient);

    reset("user-a");
    reset("user-b");

    expect(queryClient.clear).toHaveBeenCalledTimes(1);
  });

  it("should clear once per change, not once per call", () => {
    const queryClient = client();
    const reset = createUserChangeReset(queryClient);

    reset("user-a");
    reset(null);
    reset(null);
    reset("user-b");
    reset("user-b");

    expect(queryClient.clear).toHaveBeenCalledTimes(2);
  });

  it("should not clear when the first id it sees is a signed-out null", () => {
    const queryClient = client();
    const reset = createUserChangeReset(queryClient);

    reset(null);

    expect(queryClient.clear).not.toHaveBeenCalled();
  });
});
