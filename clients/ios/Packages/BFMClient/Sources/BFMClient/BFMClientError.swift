import OpenAPIRuntime

/// Everything a BFM call can fail with, in a form that is safe to log.
///
/// Two jobs, and the second one is not obvious.
///
/// **Naming what the generator will not.** The generated client turns any
/// undocumented status into a `.undocumented` case rather than an error, which
/// is the right default for a generator and the wrong one for a caller: it
/// makes "the BFM returned 502" indistinguishable from a successful call whose
/// body nobody looked at. Every such case is converted.
///
/// **Keeping credentials out of an error value.** `OpenAPIRuntime.ClientError`
/// is thrown whenever a request does not complete, and its `description`
/// interpolates `operationInput` — the operation's whole typed input, by
/// reflection. For `device.refresh` that input *is* the refresh token and the
/// signature; for `device.pair` it is the pairing code. An error that renders
/// its own payload does not have to be logged deliberately to escape: one
/// `"\(error)"` in a `catch` anywhere downstream is enough, and the value would
/// have looked entirely ordinary in review.
///
/// So no `ClientError` leaves this module. ``transportFailure(operation:summary:)``
/// carries the diagnostic half — what went wrong and what the far side said —
/// and nothing that was sent.
///
/// One structural premise holds that up, and it is checked rather than trusted.
/// Each operation reads its payload with `try …body.json` outside the
/// `do`/`catch` that converts `ClientError`, which is safe because a malformed
/// body is decoded inside `UniversalClient` and arrives already wrapped, and
/// because every generated body accessor has one case and so cannot throw. A
/// response declaring a *second* content type would break the second half
/// silently — `GeneratedSourcesTests` fails when the generator emits one.
public enum BFMClientError: Error, Hashable, Sendable {
    /// A status code the OpenAPI snapshot does not document for this operation.
    case undocumentedResponse(operation: String, statusCode: Int)

    /// The BFM answered a documented refusal. Carried as an error rather than
    /// returned, so a caller that ignores the distinction cannot mistake a
    /// refusal for a paired device.
    case pairingRefused(DevicePairingRefusal)

    /// The BFM refused to mint a nonce or to rotate the presented grant. Two of
    /// these cost the device its identity, which is why ``DeviceRefreshRefusal``
    /// is stricter than its pairing counterpart about what it will infer.
    case refreshRefused(DeviceRefreshRefusal)

    /// The call did not complete, or completed with something this build could
    /// not read.
    ///
    /// ``summary`` is for a person reading a crash report: the runtime's own
    /// account of the failure, the underlying error, and the status if one
    /// arrived. It carries no part of the request — see this type's note.
    case transportFailure(operation: String, summary: String)
}

extension BFMClientError: CustomStringConvertible {
    public var description: String {
        switch self {
        case .undocumentedResponse(let operation, let statusCode):
            "\(operation): undocumented status \(statusCode)"
        case .pairingRefused(let refusal):
            "pairing refused (\(refusal))"
        case .refreshRefused(let refusal):
            "refresh refused (\(refusal))"
        case .transportFailure(let operation, let summary):
            "\(operation): \(summary)"
        }
    }
}

extension BFMClientError {
    /// Reduces a `ClientError` to the part that is safe to keep.
    ///
    /// Three fields survive, and each is a fact about the *far side* or about
    /// this process rather than about what was sent:
    ///
    /// - `causeDescription` — the runtime's own one-line account ("Transport
    ///   threw an error", "Unexpected response status").
    /// - `underlyingError` — a `URLError` on the common path, whose code is the
    ///   single most useful thing to know when a call did not complete.
    /// - the response status, when one arrived.
    ///
    /// What is dropped, and why each one had to be: `operationInput` (the
    /// tokens), `requestBody` (the tokens again, once serialised), and
    /// `request`, whose `prettyDescription` renders every header field —
    /// `Authorization` included.
    internal static func transportFailure(
        _ error: ClientError,
        operation: String
    ) -> BFMClientError {
        let status = error.response.map { "status \($0.status.code)" } ?? "no response"
        return .transportFailure(
            operation: operation,
            summary: "\(error.causeDescription) [\(status)] \(error.underlyingError)"
        )
    }
}
