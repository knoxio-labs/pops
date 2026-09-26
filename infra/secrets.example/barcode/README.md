# barcode secrets

The barcode pillar can use a Google Books API key, but the key is optional.
Open Library remains available without one; if Google Books is needed and no
key is configured, that source returns `unavailable`.

For a deployed key, set `BARCODE_GOOGLE_BOOKS_API_KEY_FILE` to the path of a
mounted secret file. The file is read before `BARCODE_GOOGLE_BOOKS_API_KEY`,
which is intended for local development and tests. Do not commit the live key
or place it in the repository; provision the file through the deployer's
secret-management workflow.

The Open Library contact is not a secret. Set `BARCODE_USER_AGENT_CONTACT` to
an operator-monitored contact address; the barcode image refuses to start
without it.
