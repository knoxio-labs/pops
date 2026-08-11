import AppCore

/// A ``ReachabilityWitness`` that does nothing but count.
public actor FakeReachabilityWitness: ReachabilityWitness {
    public private(set) var callCount = 0

    public init() {}

    public func noteReachable() async {
        callCount += 1
    }
}
