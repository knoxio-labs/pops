/// Why a capture produced no receipt to send.
///
/// Separate from `RepositoryError`, which is the upload's vocabulary: nothing
/// here ever reached the network, and telling somebody the server is
/// unreachable because their scan came back empty would send them to fix the
/// wrong thing.
public enum ReceiptCaptureProblem: Hashable, Sendable {
    /// The document camera reported a failure instead of a scan.
    case cameraFailed
    /// It finished with no pages at all.
    case noPages
    /// Pages were photographed and at least one could not be turned into bytes
    /// to send. Refused whole rather than sent short — a receipt missing a page
    /// still adds up to a total, just not to the one printed on the paper, and
    /// the reading that came back would be wrong in a way nobody could see.
    case unpreparedPages
}
