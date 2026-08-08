/// Types generated from the BFM pillar's OpenAPI snapshot, plus the transport
/// that carries them.
///
/// The generated half lives under `Generated/` and is `internal` — nothing
/// outside this module can name it. What leaves is hand-written: a value type
/// per response shape, and ``BFMHTTPClient`` to fetch them.
public enum BFMClient {
    public static let moduleName = "BFMClient"
}
