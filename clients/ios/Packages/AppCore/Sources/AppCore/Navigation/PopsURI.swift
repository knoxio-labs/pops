/// A soft cross-pillar reference (ADR-042): `pops://<pillar>/<type>/<id>`.
///
/// Printed on an Inventory label as `pops://inventory/item/<id>` or
/// `pops://inventory/location/<id>`, the singular shape `parseSoftUri` in
/// `libs/sdk/src/soft-uri.ts` accepts, and read back by the QR
/// scanner or the `pops` URL scheme. The type is always singular — a
/// container is an item, not a second type — which is why there is no
/// `containers` case to route.
public struct PopsURI: Hashable, Sendable {
    public let pillar: String
    public let type: String
    public let id: String

    public init(pillar: String, type: String, id: String) {
        self.pillar = pillar
        self.type = type
        self.id = id
    }
}

/// Parses `pops://<pillar>/<type>/<id>`. Returns `nil` for any shape that
/// isn't a well-formed soft reference — callers treat that as a bad code, not
/// a pillar or type this build has never heard of; an unrecognised but
/// well-formed reference is `EntityRouteOutcome.unsupported(pillar:)`, not a
/// parse failure.
///
/// Mirrors `libs/sdk/src/soft-uri.ts`'s `parseSoftUri` case for case — the two
/// must agree, because a label printed by one platform is scanned by the
/// other. The id segment is greedy and may itself contain `/` (kept whole,
/// not split further), because an owning pillar's own id format is not this
/// grammar's concern.
public func parsePopsURI(_ uri: String) -> PopsURI? {
    let scheme = "pops://"
    guard uri.hasPrefix(scheme) else { return nil }

    let rest = uri.dropFirst(scheme.count)
    let segments = rest.split(separator: "/", maxSplits: 2, omittingEmptySubsequences: false)
    guard segments.count == 3 else { return nil }

    let pillar = String(segments[0])
    let type = String(segments[1])
    let id = String(segments[2])
    guard !pillar.isEmpty, !type.isEmpty, !id.isEmpty else { return nil }

    return PopsURI(pillar: pillar, type: type, id: id)
}
