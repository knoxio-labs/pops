import AppCore
import AppCoreFakes
import Testing

@testable import FeatureInventory

@MainActor
@Suite("Code suggestion error reporting")
internal struct InventoryCodeSuggestionFailureTests {
    @Test(arguments: [
        (RepositoryError.unavailable, InventoryCodeSuggestionFailure.unavailable),
        (.unauthorized, .unauthorized), (.contractMismatch, .contractMismatch),
        (.conflict("private diagnostic"), .conflict),
        (.transport("private diagnostic"), .transport), (.dependencyNotBound, .dependencyNotBound),
    ])
    func repositoryFailuresAreReportable(
        _ error: RepositoryError, expected: InventoryCodeSuggestionFailure
    ) async {
        let form = makeForm(InventoryCodeSuggester { _, _, _ in throw error })
        form.draft.name = "Drill"
        form.draft.code.value = "D"

        await form.suggestCode()

        #expect(form.codeSuggestionFailure == expected)
        #expect(form.codeSuggestionFailure?.report.contains("private diagnostic") == false)
        #expect(form.draft.name == "Drill")
        #expect(form.draft.code.value == "D")
    }

    @Test("empty responses can be retried using the unsaved name")
    func emptyThenSuccessfulResponse() async {
        let responses = SuggestionResponses()
        let form = makeForm(
            InventoryCodeSuggester { name, _, _ in
                #expect(name == "Drill")
                return await responses.next()
            })
        form.draft.name = "  Drill  "

        await form.suggestCode()
        #expect(form.codeSuggestionFailure == .emptyResponse)
        await form.retryCodeSuggestion()

        #expect(form.codeSuggestionFailure == nil)
        #expect(form.draft.code.value == "D001")
    }

    @Test("cancellation restores the control without showing an error")
    func cancellation() async {
        let form = makeForm(InventoryCodeSuggester { _, _, _ in throw CancellationError() })
        form.draft.name = "Drill"
        await form.suggestCode()
        #expect(form.codeSuggestionFailure == nil)
        #expect(form.draft.code.assist == .idle)
    }

    @Test("server refusals and unknown errors keep distinct identifiers")
    func errorIdentifiers() {
        #expect(
            InventoryCodeSuggestionFailure(RepositoryError.unauthorized).rawValue
                == "code_suggestion_unauthorized")
        #expect(
            InventoryCodeSuggestionFailure(RepositoryError.contractMismatch).rawValue
                == "code_suggestion_contract_mismatch")
        #expect(
            InventoryCodeSuggestionFailure(InventorySyncTransportError.clientTooOld)
                == .clientTooOld)
        #expect(
            InventoryCodeSuggestionFailure(InventorySyncTransportError.suggestionsUnavailable)
                == .suggestionsUnavailable)
        #expect(InventoryCodeSuggestionFailure(UnknownFailure()) == .unexpected)
    }

    private func makeForm(_ suggester: InventoryCodeSuggester) -> InventoryItemFormModel {
        InventoryItemFormModel(
            request: .create(placement: nil),
            store: InMemoryInventoryStore(catalogue: FormFixture.catalogue), suggester: suggester)
    }
}

private struct UnknownFailure: Error {}

private actor SuggestionResponses {
    private var hasResponded = false

    func next() -> [String] {
        defer { hasResponded = true }
        return hasResponded ? ["D001"] : []
    }
}
