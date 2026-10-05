/// A user's decision for a batch of Ego actions and conversation tool access.
public struct EgoBatchDecision: Hashable, Sendable {
    public let approve: [String]
    public let reject: [String]
    public let alwaysAllow: [String]

    public init(approve: [String], reject: [String], alwaysAllow: [String]) {
        self.approve = approve
        self.reject = reject
        self.alwaysAllow = alwaysAllow
    }
}
