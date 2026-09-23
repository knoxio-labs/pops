import AppCore
import OpenAPIRuntime

/// The two translations every `/mobile/*` repository gives a failure that
/// never became an outcome, factored out because ``BFMTransactionsRepository``
/// and ``BFMReceiptCaptureRepository`` need the identical reading of the
/// identical wire vocabulary — a second copy would only be a second place
/// for the two to drift.
internal enum BFMRepositoryFailure {
    /// What a call that did not complete — or completed with a body this
    /// build could not decode — means.
    ///
    /// The status is the actionable half and it survives even when the body
    /// does not, which is the case an intermediary in front of this BFM
    /// produces: an HTML error page on a documented status never reaches the
    /// caller's own switch. `502`/`503` resolve to `unavailable` rather than
    /// to the mismatch they might have carried, because "not answering" is
    /// the reading that costs least when it is wrong.
    internal static func failure(_ error: ClientError, operation: String) -> RepositoryError {
        switch error.response?.status.code {
        case 401, 403:
            return .unauthorized
        case 502, 503:
            return .unavailable
        default:
            // Through `BFMClientError` for its sanitiser and not around it: a
            // `ClientError`'s own description renders the operation's typed
            // input and every request header, `Authorization` included.
            return .transport(
                BFMClientError.transportFailure(error, operation: operation).description
            )
        }
    }

    /// The BFM's upstream vocabulary, collapsed onto what a screen can do
    /// about it — but not past the three distinctions that matter.
    ///
    /// `upstream_unavailable`, `upstream_contract_mismatch`, and
    /// `upstream_conflict` must not converge. The first is "the pillar behind
    /// this is not answering", worth retrying; the second is "it answered
    /// something this build cannot read"; the third is a write collision that
    /// preserves its wire reason because retrying the same input cannot work.
    ///
    /// `upstream_misconfigured` joins the unavailable side rather than the
    /// mismatch one: a pillar whose configuration is wrong is not serving,
    /// and nothing about the phone's build is implicated. Matched on the raw
    /// string because the generator emits one closed enum per status and
    /// every response carrying this code is a distinct type with an
    /// identical case.
    internal static func upstreamFailure(_ code: String, operation: String) -> RepositoryError {
        switch code {
        case "upstream_unavailable", "upstream_degraded", "upstream_misconfigured":
            return .unavailable
        case "upstream_contract_mismatch":
            return .contractMismatch
        case "upstream_conflict":
            return .conflict(code)
        default:
            return .transport("\(operation): upstream \(code)")
        }
    }
}
