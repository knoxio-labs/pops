import { defineErrors } from '@pops/pillar-express';

/** The refusals `PUT /uploads/:token` answers with, coded `mcp.upload.<reason>`. */
export const uploadErrors = defineErrors('mcp', {
  not_found: {
    area: 'upload',
    status: 404,
    message:
      'This upload URL is unknown, expired or already used. Mint a new one with the tool that issued it (inventory.photos.createUpload or inventory.documents.createUpload).',
    retryable: false,
  },
  empty_body: {
    area: 'upload',
    status: 400,
    message: 'The upload body is empty. Send the file bytes, e.g. curl -T photo.jpg <url>.',
    retryable: false,
  },
  unsupported_media_type: {
    area: 'upload',
    status: 415,
    message:
      'This is a photo URL: only JPEG and HEIC images are accepted. Convert first, e.g. on macOS: sips -s format jpeg in.png --out out.jpg. ' +
      'To attach a PDF or another document to an item, mint a document URL with inventory.documents.createUpload instead.',
    retryable: false,
  },
  missing_content_type: {
    area: 'upload',
    status: 415,
    message:
      "This is a document URL: send the file's MIME type, e.g. curl -T receipt.pdf -H 'Content-Type: application/pdf' <url>.",
    retryable: false,
  },
  unsupported_document_type: {
    area: 'upload',
    status: 415,
    message:
      'This is a document URL and documents does not accept this file type. ' +
      'For an item photo (JPEG or HEIC, shown on the item), mint a photo URL with inventory.photos.createUpload instead.',
    retryable: false,
  },
  too_large: {
    area: 'upload',
    status: 413,
    message: 'The file is larger than the upload limit.',
    retryable: false,
  },
  rejected: {
    area: 'upload',
    status: 400,
    message: 'Inventory rejected the image.',
    retryable: false,
  },
  upstream_unavailable: {
    area: 'upload',
    status: 502,
    message: 'Inventory could not store the upload. Mint a new upload URL and try again.',
    retryable: true,
  },
});
