// Vitest setup — PHASE_01 §1.109 (Testing Library).
//
// Testing Library registers its own afterEach cleanup ONLY when
// vitest globals are enabled. They are not here, because this
// project prefers explicit imports. Without this file, every
// render() accumulates in the same document and tests see elements
// from earlier tests: the first symptom is "Found multiple elements
// with the text ...", and the subtler one is a query that passes
// because a PREVIOUS test rendered the thing it was looking for.

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
