/// The rules the property vocabulary has, as opposed to the shapes it has.
///
/// These are here rather than inside a view because every one of them is a
/// question the experiment has to answer visibly, what counts as the same
/// key, what a template change does to data the new template did not ask for,
/// what search can and cannot reach. A screen that decides one of them in a
/// `ForEach` has decided it invisibly.
internal enum InventoryPropertySchema {
    /// Two keys are the same key when they differ only in case, surrounding
    /// space, inner spacing, or a hyphen where a space would do.
    ///
    /// The alternative, exact strings, gives a catalogue "Length", "length"
    /// and "Cable length " as three properties, which is the failure mode that
    /// turns structured data back into notes.
    internal static func normalized(_ key: String) -> String {
        let spaced = key.replacingOccurrences(of: "-", with: " ").replacingOccurrences(
            of: "_", with: " ")
        let words = spaced.lowercased().split(separator: " ", omittingEmptySubsequences: true)
        return words.joined(separator: " ")
    }

    /// The property a new key would collide with, if any.
    internal static func duplicate(
        of key: String,
        in properties: [InventoryProperty]
    ) -> InventoryProperty? {
        let candidate = normalized(key)
        guard !candidate.isEmpty else { return nil }
        return properties.first { normalized($0.key) == candidate }
    }

    /// Properties carrying a unit the catalogue does not recognise.
    internal static func unsupportedUnits(in properties: [InventoryProperty])
        -> [InventoryProperty]
    {
        properties.filter { !$0.value.hasSupportedUnit }
    }
}

/// One line of a property search.
internal struct InventoryPropertyClause: Identifiable, Equatable {
    internal enum Comparison: String, Equatable {
        case present = "has"
        case equals = "is"
        case atLeast = "at least"
    }

    internal let key: String
    internal let comparison: Comparison
    /// Unused by ``Comparison/present``, which is the clause somebody writes
    /// when they want every cable that records a wattage at all.
    internal let value: String

    internal init(key: String, comparison: Comparison, value: String = "") {
        self.key = key
        self.comparison = comparison
        self.value = value
    }

    internal var id: String {
        "\(InventoryPropertySchema.normalized(key))-\(comparison.rawValue)-\(value)"
    }

    internal func matches(_ thing: InventoryThing) -> Bool {
        guard let property = InventoryPropertySchema.duplicate(of: key, in: thing.properties)
        else { return false }
        switch comparison {
        case .present:
            return true
        case .equals:
            return property.value.display.caseInsensitiveCompare(value) == .orderedSame
        case .atLeast:
            guard let floor = Double(value), let amount = Self.amount(of: property.value) else {
                return false
            }
            return amount >= floor
        }
    }

    private static func amount(of value: InventoryPropertyValue) -> Double? {
        switch value {
        case .measure(let amount, _): amount
        case .span(let low, _, _): low
        case .text, .choice, .flag, .link: nil
        }
    }
}

extension Array where Element == InventoryPropertyClause {
    /// Every clause has to hold. An `or` would need a builder with grouping,
    /// which is a screen this experiment is not asking about yet.
    internal func matching(_ things: [InventoryThing]) -> [InventoryThing] {
        things.filter { thing in allSatisfy { $0.matches(thing) } }
    }
}
