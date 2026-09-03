import { useState } from "react";

export function CiProbe(flag: boolean) {
  if (flag) {
    useState(0);
  }
  return flag;
}
