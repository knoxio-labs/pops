import Foundation

extension InventoryPrimitiveValue {
    /// This value read as the kind its field declares, or nil when it cannot
    /// be one.
    ///
    /// The wire carries a decimal, date, date-time and URL as a plain JSON
    /// string, so a value decoded by its JSON shape alone arrives as
    /// `.string`; this gives it the type its field declares, by the server's
    /// rules (`value-dispatch.ts`): text holds 1 to 200 (short) or 20,000
    /// (long) Unicode scalars, a decimal, date and timestamp are canonical, and
    /// a URL is HTTPS and keeps the server's spelling. An integer, boolean,
    /// option, measurement and reference only have to be that case: the unit,
    /// option and target they name belong to the catalogue revision, not the
    /// kind, and a reference keeps any read-time state it carries.
    public func conformed(to kind: InventoryPrimitiveKind) -> InventoryPrimitiveValue? {
        switch (kind, self) {
        case (.integer, .integer), (.boolean, .boolean), (.enumeration, .enumeration),
            (.measurement, .measurement), (.reference, .reference):
            return self
        case (.shortText, .string), (.longText, .string), (.decimal, .string),
            (.decimal, .decimal), (.date, .string), (.date, .date), (.dateTime, .string),
            (.dateTime, .dateTime):
            return InventoryExpressionValue(self).canonical(kind: kind, fixedUnit: nil)
        case (.url, .string(let text)):
            return (try? InventoryCanonicalURL(canonical: text)).map(InventoryPrimitiveValue.url)
        case (.url, .url(let url)):
            return (try? InventoryCanonicalURL(canonical: url.text)).map(
                InventoryPrimitiveValue.url)
        default:
            return nil
        }
    }
}
