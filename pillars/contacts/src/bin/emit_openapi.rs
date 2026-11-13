//! Emit the source-owned OpenAPI value to stdout for the repository generator.

use std::io::{self, Write};

use contacts::openapi::openapi_30_json;

fn main() -> io::Result<()> {
    io::stdout().lock().write_all(openapi_30_json().as_bytes())
}
