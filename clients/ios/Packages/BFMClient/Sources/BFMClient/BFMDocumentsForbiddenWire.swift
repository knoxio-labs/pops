extension Operations.MobileDocuments_getDocument.Output.Forbidden.Body.JsonPayload:
    WireForbiddenBody
{
    internal var capabilityNotGranted: String? {
        if case .case2(let denied) = self { denied.capability } else { nil }
    }
}
