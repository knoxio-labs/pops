import AppCore

/// What the result screen is showing, as one value the view switches on.
///
/// ``ReceiptOutcome`` already carries the tri-state the purchases pillar
/// answers with; this adds the two states around it — the call in flight, and
/// the call never getting an answer at all. Keeping the gateway failure out of
/// ``ReceiptOutcome`` itself is deliberate: a transport failure is not a fourth
/// reading of the receipt, it is the read never happening, and collapsing the
/// two would make "the BFM is down" and "the receipt was unreadable" say the
/// same thing to somebody standing in a checkout line.
public enum ReceiptResultState: Hashable, Sendable {
    /// The parts are in flight to the repository. Also what a retry after
    /// ``failed(_:)`` returns to — the receipt has not been read yet, either
    /// way.
    case submitting
    /// One of the three outcomes the pillar's gate answered with.
    case outcome(ReceiptOutcome)
    /// The call never got far enough to answer with an outcome at all.
    /// Carries a retry — the same bytes, tried again — because nothing about
    /// this receipt is known to be wrong.
    case failed(RepositoryError)
}
