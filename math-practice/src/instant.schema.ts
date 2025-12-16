// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/core";

const _schema = i.schema({
  entities: {
    "$files": i.entity({
      "path": i.string().unique().indexed(),
      "url": i.string().optional(),
    }),
    "$users": i.entity({
      "email": i.string().unique().indexed().optional(),
      "imageURL": i.string().optional(),
      "type": i.string().optional(),
    }),
    "userData": i.entity({
      "users": i.any(),
      "allUserData": i.any(),
      "savedWorksheets": i.any(),
      "metaUpdatedAt": i.any(),
      "updatedAt": i.string(),
    }),
  },
  links: {
    "$usersLinkedPrimaryUser": {
      "forward": {
        "on": "$users",
        "has": "one",
        "label": "linkedPrimaryUser",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "$users",
        "has": "many",
        "label": "linkedGuestUsers"
      }
    }
  },
  rooms: {}
});

type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema }
export default schema;