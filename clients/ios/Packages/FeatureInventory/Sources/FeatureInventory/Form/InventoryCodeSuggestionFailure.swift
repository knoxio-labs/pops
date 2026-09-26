import AppCore

internal enum InventoryCodeSuggestionFailure: String, Equatable {
    case nameRequired = "code_suggestion_name_required"
    case offline = "code_suggestion_offline"
    case emptyResponse = "code_suggestion_empty_response"
    case unavailable = "code_suggestion_service_unavailable"
    case unauthorized = "code_suggestion_unauthorized"
    case contractMismatch = "code_suggestion_contract_mismatch"
    case conflict = "code_suggestion_conflict"
    case transport = "code_suggestion_transport_error"
    case dependencyNotBound = "code_suggestion_not_configured"
    case clientTooOld = "code_suggestion_update_required"
    case suggestionsUnavailable = "code_suggestion_unavailable"
    case unexpected = "code_suggestion_unexpected_error"

    internal init(_ error: any Error) {
        switch error {
        case RepositoryError.unavailable: self = .unavailable
        case RepositoryError.unauthorized: self = .unauthorized
        case RepositoryError.contractMismatch: self = .contractMismatch
        case RepositoryError.conflict: self = .conflict
        case RepositoryError.transport: self = .transport
        case RepositoryError.dependencyNotBound: self = .dependencyNotBound
        case InventorySyncTransportError.clientTooOld: self = .clientTooOld
        case InventorySyncTransportError.suggestionsUnavailable: self = .suggestionsUnavailable
        default: self = .unexpected
        }
    }

    internal var message: String {
        switch self {
        case .nameRequired: "Enter an item name before asking for a code."
        case .offline: "You’re offline. Connect to request a code."
        case .emptyResponse: "The server returned no code suggestions. Try again."
        case .unavailable: "The inventory service is unavailable. Try again shortly."
        case .unauthorized: "The server denied access to code suggestions. Check your pairing."
        case .contractMismatch:
            "The app and server could not agree on the code request or response."
        case .conflict: "The server reported a conflict while suggesting a code."
        case .transport: "The code request could not complete. Check your connection and try again."
        case .dependencyNotBound: "Code suggestions are not configured in this app."
        case .clientTooOld: "Update the app to request code suggestions."
        case .suggestionsUnavailable:
            "The server cannot suggest codes right now. Try again shortly."
        case .unexpected: "An unexpected error prevented code generation."
        }
    }

    internal var report: String { "Couldn’t suggest a code. \(message) [\(rawValue)]" }
}
