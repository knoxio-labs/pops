import AppCore

extension InventoryItemFormModel {
    internal func suggestCode() async {
        guard draft.code.assist.canSuggest else { return }
        guard !isOffline else {
            codeSuggestionFailure = .offline
            return
        }
        guard draft.isNamed else {
            codeSuggestionFailure = .nameRequired
            return
        }
        codeSuggestionFailure = nil
        draft.code.assist = .suggesting
        do {
            let suggestions = try await suggester.suggest(
                draft.trimmedName, draft.typeKey, draft.code.normalized)
            guard let first = suggestions.first else {
                draft.code.assist = .unavailable
                codeSuggestionFailure = .emptyResponse
                return
            }
            draft.code.value = first
            draft.code.assist = .offered(alternatives: Array(suggestions.dropFirst()))
            await checkCode()
            if draft.code.normalized == first, draft.code.heldBy == nil {
                draft.code.assist = .accepted
            }
        } catch is CancellationError {
            draft.code.assist = .idle
        } catch {
            codeSuggestionFailure = InventoryCodeSuggestionFailure(error)
            switch error {
            case RepositoryError.unavailable, RepositoryError.transport:
                draft.code.assist = .offline
            default:
                draft.code.assist = .unavailable
            }
        }
    }

    internal func retryCodeSuggestion() async {
        guard draft.code.assist != .suggesting else { return }
        draft.code.assist = .idle
        await suggestCode()
    }
}
