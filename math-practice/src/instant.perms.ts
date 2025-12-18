// Docs: https://www.instantdb.com/docs/permissions
import type { InstantRules } from "@instantdb/react";

const rules = {
  userData: {
    allow: {
      view: "auth.id == data.id",
      create: "auth.id == data.id",
      delete: "auth.id == data.id",
      update: "auth.id == data.id",
    },
  },
} satisfies InstantRules;

export default rules;