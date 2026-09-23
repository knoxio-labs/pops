import AppCoreFakes
import Testing

@testable import AppCore

@Suite("Network reachability streams")
internal struct NetworkReachabilityTests {
    @Test("a stream starts with the current value then yields each change")
    func currentThenChanges() async {
        let reachability = ScriptedNetworkReachability(satisfied: true)
        var values = reachability.updates().makeAsyncIterator()

        #expect(await values.next() == true)
        reachability.set(false)
        #expect(await values.next() == false)
        reachability.set(true)
        #expect(await values.next() == true)
    }

    @Test("independent streams each receive every change")
    func independentStreams() async {
        let reachability = ScriptedNetworkReachability(satisfied: false)
        var first = reachability.updates().makeAsyncIterator()
        var second = reachability.updates().makeAsyncIterator()

        #expect(await first.next() == false)
        #expect(await second.next() == false)
        reachability.set(true)
        #expect(await first.next() == true)
        #expect(await second.next() == true)
    }

    @Test("a terminated stream stops receiving changes")
    func terminatedStream() async {
        let reachability = ScriptedNetworkReachability(satisfied: true)
        let received = BoolRecorder()
        let task = Task {
            for await value in reachability.updates() {
                await received.append(value)
            }
        }
        #expect(await eventually { await received.values == [true] })
        reachability.set(false)
        #expect(await eventually { await received.values == [true, false] })

        task.cancel()
        await task.value
        reachability.set(true)
        try? await Task.sleep(for: .milliseconds(20))

        #expect(await received.values == [true, false])
    }

    private func eventually(
        _ condition: @escaping @Sendable () async -> Bool
    ) async -> Bool {
        for _ in 0..<100 {
            if await condition() { return true }
            try? await Task.sleep(for: .milliseconds(5))
        }
        return false
    }
}

private actor BoolRecorder {
    private(set) var values: [Bool] = []

    func append(_ value: Bool) {
        values.append(value)
    }
}
