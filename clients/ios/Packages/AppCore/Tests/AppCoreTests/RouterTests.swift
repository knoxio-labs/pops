import AppCore
import Testing

@MainActor
@Suite("Router")
internal struct RouterTests {
    @Test("starts empty")
    func startsEmpty() {
        #expect(Router().path.isEmpty)
    }

    @Test("applies actions through the reducer")
    func appliesActions() {
        let router = Router()

        router.send(.push(.transactionList))
        router.send(.push(.transactionDetail(id: "txn-1")))
        router.send(.pop)

        #expect(router.path == [.transactionList])
    }

    @Test("a path written back by NavigationStack replaces the path")
    func stackPathWritesBack() {
        let router = Router(path: [.transactionList, .transactionDetail(id: "txn-1")])

        router.stackPath.wrappedValue = [.transactionList]

        #expect(router.path == [.transactionList])
    }

    @Test("the binding reads the current path")
    func stackPathReads() {
        let router = Router(path: [.transactionList])

        #expect(router.stackPath.wrappedValue == [.transactionList])
    }
}
