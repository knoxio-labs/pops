import Observation

/// Suspends until `predicate` holds, resumed by Observation the moment a
/// tracked property changes rather than by polling, and bounded by a
/// deadline rather than a scheduling-turn budget — the same shape
/// `withDeadline` gives the Auth package's own concurrency probes, for
/// the same reason: a scheduling-turn count is a proxy for progress that
/// CPU starvation can make unsound, and a store that never answers must
/// still let the test fail promptly instead of hanging the suite.
///
/// `predicate` reads whatever `@Observable` state the caller closes over, so
/// this works for any view model shape without knowing its properties.
@MainActor
internal func awaitObservedCondition(
    deadline: Duration = .seconds(2), _ predicate: @escaping @Sendable @MainActor () -> Bool
) async {
    if predicate() { return }
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
        let resumeOnce = ResumeOnce(continuation)
        trackObservedConditionUntilTrue(predicate, resuming: resumeOnce)
        Task {
            try? await Task.sleep(for: deadline)
            await resumeOnce.resume()
        }
    }
}

/// Re-registers Observation tracking each time it fires, until
/// `predicate` holds, then resumes `resumeOnce`. A free function rather than
/// a nested closure: Swift refuses `@Sendable` on a main-actor-isolated
/// local function, which a closure recursing into itself needs in order
/// to be captured by the `Task { @MainActor in }` hop
/// `withObservationTracking`'s `onChange` requires.
@MainActor
private func trackObservedConditionUntilTrue(
    _ predicate: @escaping @Sendable @MainActor () -> Bool,
    resuming resumeOnce: ResumeOnce
) {
    withObservationTracking {
        _ = predicate()
    } onChange: {
        Task { @MainActor in
            if predicate() {
                await resumeOnce.resume()
            } else {
                trackObservedConditionUntilTrue(predicate, resuming: resumeOnce)
            }
        }
    }
}

/// Resumes a continuation exactly once, whichever of two independent
/// races — the awaited event firing, or the deadline elapsing — gets there
/// first. An actor rather than a lock: both races call in from `Task`s that
/// may run concurrently with each other.
private actor ResumeOnce {
    private var continuation: CheckedContinuation<Void, Never>?

    init(_ continuation: CheckedContinuation<Void, Never>) {
        self.continuation = continuation
    }

    func resume() {
        continuation?.resume()
        continuation = nil
    }
}
