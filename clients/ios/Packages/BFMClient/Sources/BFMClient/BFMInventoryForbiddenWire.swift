/// A `403` body: `device_revoked` (`case1`, no extra data) or
/// `capability_not_granted` (`case2`, naming the capability). One protocol
/// lets every operation's own `Forbidden.Body.JsonPayload` type be read the
/// same way despite each being distinct (ADR-033).
internal protocol WireForbiddenBody {
    var capabilityNotGranted: String? { get }
}

extension Operations.MobileInventory_catalogue.Output.Forbidden.Body.JsonPayload: WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_snapshot.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_changes.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_itemHistory.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_mutations.Output.Forbidden.Body.JsonPayload: WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_suggestCodes.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_putMedia.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileInventory_getMedia.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}
