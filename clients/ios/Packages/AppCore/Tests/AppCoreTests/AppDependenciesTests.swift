import AppCore
import AppCoreFakes
import SwiftUI
import Testing

@Suite("Dependency container")
struct AppDependenciesTests {
    @Test("an unbound repository fails rather than trapping")
    func unboundTransactionsFail() async {
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await AppDependencies.unbound.transactions.transactions(after: nil)
        }
    }

    @Test("an unbound pairing service fails rather than trapping")
    func unboundPairingFails() async {
        await #expect(throws: PairingError.dependencyNotBound) {
            try await AppDependencies.unbound.pairing.pair(.fake())
        }
    }

    @Test("the environment holds the unbound container until something binds one")
    @MainActor
    func environmentDefaultIsUnbound() async {
        await #expect(throws: RepositoryError.dependencyNotBound) {
            try await EnvironmentValues().appDependencies.transactions.transactions(after: nil)
        }
    }

    @Test("a bound container hands back what it was given")
    func boundContainerResolves() async throws {
        let repository = InMemoryTransactionsRepository(rows: Transaction.fakes(count: 1))
        let dependencies = AppDependencies.fake(transactions: repository)

        let page = try await dependencies.transactions.transactions(after: nil)

        #expect(page.transactions.count == 1)
    }
}
