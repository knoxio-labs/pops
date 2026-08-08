import AppCore
import Testing

@Suite("Navigation reduction")
internal struct NavigationReductionTests {
    @Test("push appends")
    func pushAppends() {
        let path = NavigationReducer.reduce([], applying: .push(.transactionList))

        #expect(path == [.transactionList])
    }

    @Test("pushing the route already on top is ignored")
    func pushIgnoresRepeat() {
        let path: [Route] = [.transactionList, .transactionDetail(id: "txn-1")]

        let reduced = NavigationReducer.reduce(
            path, applying: .push(.transactionDetail(id: "txn-1")))

        #expect(reduced == path)
    }

    @Test("pushing the same route from elsewhere in the path is allowed")
    func pushAllowsRepeatDeeper() {
        let path: [Route] = [.transactionDetail(id: "txn-1"), .transactionList]

        let reduced = NavigationReducer.reduce(
            path, applying: .push(.transactionDetail(id: "txn-1")))

        #expect(reduced == path + [.transactionDetail(id: "txn-1")])
    }

    @Test("pop removes the last route")
    func popRemovesLast() {
        let path: [Route] = [.transactionList, .transactionDetail(id: "txn-1")]

        let reduced = NavigationReducer.reduce(path, applying: .pop)

        #expect(reduced == [.transactionList])
    }

    @Test("pop on an empty path is a no-op")
    func popOnEmptyPath() {
        #expect(NavigationReducer.reduce([], applying: .pop).isEmpty)
    }

    @Test("popToRoot empties the path")
    func popToRootEmpties() {
        let path: [Route] = [.transactionList, .transactionDetail(id: "txn-1")]

        #expect(NavigationReducer.reduce(path, applying: .popToRoot).isEmpty)
    }

    @Test("popToRoot on an empty path is a no-op")
    func popToRootOnEmptyPath() {
        #expect(NavigationReducer.reduce([], applying: .popToRoot).isEmpty)
    }

    @Test("replace sets the whole path")
    func replaceSetsPath() {
        let replacement: [Route] = [.transactionDetail(id: "txn-2")]

        let reduced = NavigationReducer.reduce([.transactionList], applying: .replace(replacement))

        #expect(reduced == replacement)
    }

    @Test("replace with an empty path clears it")
    func replaceClearsPath() {
        #expect(NavigationReducer.reduce([.transactionList], applying: .replace([])).isEmpty)
    }

    @Test("details of different transactions are different routes")
    func detailRoutesAreDistinguishedById() {
        let path = NavigationReducer.reduce(
            [.transactionDetail(id: "txn-1")],
            applying: .push(.transactionDetail(id: "txn-2"))
        )

        #expect(path == [.transactionDetail(id: "txn-1"), .transactionDetail(id: "txn-2")])
    }
}
