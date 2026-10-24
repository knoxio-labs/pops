import { importsFilesStage, sourcesAccountsRegister } from '../contacts-api/sdk.gen';
import { contactRequest } from '../request';
import { reviewGateway } from '../review/api';

import type { FileImportGateway } from './contracts';

/** Stable file namespaces and explicit decoding metadata feed the contacts staging API. */
export const fileImportGateway: FileImportGateway = {
  stage: async (input) => {
    const account = await contactRequest(() =>
      sourcesAccountsRegister({
        body: {
          provider: input.format,
          accountKey: input.sourceName.trim(),
          label: input.sourceName.trim(),
        },
      })
    );
    const batch = await contactRequest(() =>
      importsFilesStage({
        body: input.file,
        query: {
          accountId: account.data.id,
          collectionKey: input.collectionKey.trim(),
          format: input.format,
          encoding: input.encoding,
          phoneCountryCode: input.phoneCountryCode,
        },
      })
    );
    return reviewGateway.load(batch.id);
  },
};
