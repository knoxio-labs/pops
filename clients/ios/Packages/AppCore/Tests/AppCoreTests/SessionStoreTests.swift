import AppCore
import AppCoreFakes
import Testing

@MainActor
@Suite("Session store")
internal struct SessionStoreTests {
    @Test("starts unpaired")
    func startsUnpaired() {
        #expect(SessionStore().state == .unpaired)
    }

    @Test("restores a state given at launch, so a cold start does not flash the pairing screen")
    func restoresState() {
        let store = SessionStore(state: .paired(.fake()))

        #expect(store.state == .paired(.fake()))
    }

    @Test("applies events through the reducer")
    func appliesEvents() {
        let store = SessionStore(state: .paired(.fake()))

        store.send(.revoked(.revokedByOperator))

        #expect(store.state == .revoked(.revokedByOperator))
    }

    @Test("a revocation arriving while unpaired does not strand the user on an explanation")
    func ignoresRevocationWhenUnpaired() {
        let store = SessionStore()

        store.send(.revoked(.credentialsRejected))

        #expect(store.state == .unpaired)
    }
}
