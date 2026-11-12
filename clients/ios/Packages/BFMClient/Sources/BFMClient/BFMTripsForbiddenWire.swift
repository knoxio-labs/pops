extension Operations.MobileTrips_listTrips.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileTrips_getTrip.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}

extension Operations.MobileTrips_getTripV2.Output.Forbidden.Body.JsonPayload: WireForbiddenBody {
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}
