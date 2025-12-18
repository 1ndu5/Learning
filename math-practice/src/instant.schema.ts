import { i } from '@instantdb/core';

const schema = i.schema({
  entities: {
    userData: i.entity({
      dataV2: i.any(),           // New compressed data format
      metaUpdatedAt: i.any(),    // Keep metadata
      deletedItems: i.any(),     // Keep deleted items tracking
      updatedAt: i.string(),     // Keep update timestamp
    }),
  },
});

export default schema;