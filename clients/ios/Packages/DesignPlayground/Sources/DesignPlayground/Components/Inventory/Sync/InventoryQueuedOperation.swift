/// One thing a person did on the phone that POPS has not taken yet.
///
/// The phone is authoritative for intent (ADR-001), so this is a record of a
/// decision, not a request that may or may not have been made. It carries the
/// words the reader used, the media staged with it, and the operation it
/// cannot land before, because replaying "put the kettle in Kitchen 12" before
/// Kitchen 12 exists is how a queue invents a repair nobody caused.
internal struct InventoryQueuedOperation: Identifiable, Equatable {
    /// Where this one is in the run, which is not the same as where the queue
    /// is. Several can be waiting behind one that is sending.
    internal enum Progress: Equatable {
        case waiting
        case sending
        /// Held back because something it depends on has not landed. Not a
        /// failure: nothing is wrong with this operation.
        case held
        case needsAttention
        case done
    }

    internal let id: String
    /// An ADR-001 verb. Anything else is a word this screen invented.
    internal let verb: String
    internal let subject: String
    /// What a reader needs to recognise their own change: where it went, how
    /// many, which container.
    internal let detail: String
    /// Position the phone recorded it in. The queue's own order, before
    /// dependencies rearrange anything.
    internal let enqueued: Int
    /// Photos staged with the change and still only on this phone. Shown
    /// because an operation that carries media is one a person will not want
    /// discarded casually.
    internal let photoCount: Int
    /// The operation this one has to land behind, if any.
    internal let dependsOn: String?
    internal var progress: Progress

    internal init(
        id: String,
        verb: String,
        subject: String,
        detail: String,
        enqueued: Int,
        photoCount: Int = 0,
        dependsOn: String? = nil,
        progress: Progress = .waiting
    ) {
        self.id = id
        self.verb = verb
        self.subject = subject
        self.detail = detail
        self.enqueued = enqueued
        self.photoCount = photoCount
        self.dependsOn = dependsOn
        self.progress = progress
    }

    internal var title: String { "\(verb) \(subject)" }
}

/// The order a queue is replayed in, and what a single failure takes with it.
///
/// Two rules, and they are in tension exactly once. A person expects their
/// changes to replay in the order they made them, so the default is the order
/// the phone recorded. But an operation that names something an earlier
/// operation created has to wait for it, whatever the clock said. Dependency
/// wins, and the display order is the replay order so that a reader watching
/// the queue drain sees what will actually happen.
internal enum InventoryQueue {
    /// Enqueue order, corrected so nothing precedes what it depends on.
    ///
    /// A stable topological sort: at each step the earliest-enqueued operation
    /// whose dependency has already been emitted. Operations whose dependency
    /// is absent or circular are emitted last in enqueue order rather than
    /// dropped, because a queue that silently loses an operation is the one
    /// failure this whole design exists to prevent.
    internal static func ordered(
        _ operations: [InventoryQueuedOperation]
    ) -> [InventoryQueuedOperation] {
        var remaining = operations.sorted { $0.enqueued < $1.enqueued }
        var emitted: Set<String> = []
        var result: [InventoryQueuedOperation] = []

        while !remaining.isEmpty {
            let index = remaining.firstIndex { operation in
                guard let dependency = operation.dependsOn else { return true }
                return emitted.contains(dependency)
                    || !remaining.contains { $0.id == dependency }
            }
            guard let index else {
                result.append(contentsOf: remaining)
                return result
            }
            let next = remaining.remove(at: index)
            emitted.insert(next.id)
            result.append(next)
        }
        return result
    }

    /// The operations a single failure holds back: everything that depends on
    /// it, and everything that depends on those.
    ///
    /// What this is for is the sentence a repair row can then say, "3 other
    /// changes are waiting behind this one", which is the difference between a
    /// repair a person postpones knowingly and one they postpone because it
    /// looked like it only affected itself.
    internal static func held(
        by failedID: String,
        in operations: [InventoryQueuedOperation]
    ) -> [InventoryQueuedOperation] {
        var blocked: Set<String> = [failedID]
        var changed = true
        while changed {
            changed = false
            for operation in ordered(operations)
            where !blocked.contains(operation.id)
                && operation.dependsOn.map(blocked.contains)
                    == true
            {
                blocked.insert(operation.id)
                changed = true
            }
        }
        return ordered(operations).filter { blocked.contains($0.id) && $0.id != failedID }
    }

    /// How many photos are staged on this phone and nowhere else.
    internal static func stagedPhotoCount(in operations: [InventoryQueuedOperation]) -> Int {
        operations.filter { $0.progress != .done }.reduce(0) { $0 + $1.photoCount }
    }
}
