/// The order the drain sends the log in (ADR-002 D11, "Replay order"): enqueue
/// order, corrected so nothing precedes what it depends on, as the design
/// playground's `InventoryQueue.ordered` specifies.
///
/// At each step it takes the earliest-enqueued element whose dependencies in
/// the list have all been taken. A dependency that is not in the list (already
/// settled, or never logged here) does not hold anything back, and elements
/// caught in a dependency cycle come last in enqueue order rather than being
/// dropped: a queue that silently loses a change is the failure sync exists to
/// prevent.
internal enum DrainOrder {
    /// - Parameter elements: In enqueue order.
    static func ordered<Element>(
        _ elements: [Element], id: (Element) -> String, dependsOn: (Element) -> [String]
    ) -> [Element] {
        let position = Dictionary(
            elements.enumerated().map { (id($1), $0) }, uniquingKeysWith: { first, _ in first })
        var waitingOn = [Int](repeating: 0, count: elements.count)
        var dependents = [[Int]](repeating: [], count: elements.count)
        for (index, element) in elements.enumerated() {
            for dependency in Set(dependsOn(element)) {
                guard let before = position[dependency] else { continue }
                waitingOn[index] += 1
                dependents[before].append(index)
            }
        }
        var ready = waitingOn.indices.filter { waitingOn[$0] == 0 }
        var taken = [Bool](repeating: false, count: elements.count)
        var result: [Element] = []
        result.reserveCapacity(elements.count)
        while !ready.isEmpty {
            let next = ready.removeFirst()
            taken[next] = true
            result.append(elements[next])
            for dependent in dependents[next] {
                waitingOn[dependent] -= 1
                if waitingOn[dependent] == 0 {
                    let slot = ready.firstIndex { $0 > dependent } ?? ready.endIndex
                    ready.insert(dependent, at: slot)
                }
            }
        }
        result.append(contentsOf: elements.indices.filter { !taken[$0] }.map { elements[$0] })
        return result
    }
}
