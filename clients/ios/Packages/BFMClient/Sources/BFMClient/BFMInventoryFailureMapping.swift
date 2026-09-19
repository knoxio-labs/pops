import AppCore

/// The refusals every `/mobile/inventory/*` route can answer beyond its own
/// 200 (`MOBILE_REQUEST_RESPONSES`, `MOBILE_PERIMETER_RESPONSES`,
/// `MOBILE_UPSTREAM_RESPONSES`), collapsed into one small value so each
/// operation's own `switch` stays short: it extracts the few fields it has
/// (a distinct nominal type per operation, ADR-033) and hands off the
/// judgement of what they mean to one place.
internal enum BFMInventoryCommonFailure {
    /// `invalid_cursor` or `invalid_request` (`MobileRequestErrorSchema`):
    /// this build's own request was malformed, never something to retry
    /// unchanged.
    case badRequest
    case unauthorized
    /// `capability_not_granted` names the capability the route needed; a
    /// revoked device carries none.
    case capabilityDenied(capability: String)
    case rateLimited
    case upstream(code: String)
    case payloadTooLarge
    case undocumented(Int)
}

internal enum BFMInventoryFailureMapping {
    internal static func repositoryError(
        for failure: BFMInventoryCommonFailure, operation: String
    ) -> RepositoryError {
        switch failure {
        case .badRequest: .contractMismatch
        case .unauthorized, .capabilityDenied: .unauthorized
        case .rateLimited: .transport("\(operation): rate limited")
        case .upstream(let code): BFMRepositoryFailure.upstreamFailure(code, operation: operation)
        case .payloadTooLarge: .transport("\(operation): payload too large")
        case .undocumented(let status): .transport("\(operation): undocumented status \(status)")
        }
    }
}
