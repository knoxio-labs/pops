/// What Inventory knows about an object, in one vocabulary.
///
/// Every variant of `inventory-item-properties` reads from these types and
/// none of them owns a shape of its own, which is the only reason the four are
/// comparable: a reviewer looking at the templates variant and the tags
/// variant is looking at two presentations of the same cable, not at two
/// cables somebody described differently.
///
/// The vocabulary itself is what the experiment decides. It is written down
/// here so the decision can be about how much of it a screen shows rather than
/// about what the words mean.

/// A unit the catalogue recognises, and the quantity it measures.
///
/// A closed list rather than a free string, because "unsupported unit" is a
/// state the screens have to show and an open string has no way to be one.
internal struct InventoryUnit: Equatable {
    internal let symbol: String
    /// What it measures, "length", "power". Shown when a unit needs
    /// explaining and used to say why an entered one is not recognised.
    internal let dimension: String
    /// How many of this unit make one of its dimension's base unit: 0.001
    /// for millimetres, 1 for metres. What ``InventoryUnitConversion``
    /// multiplies by. Every dimension the catalogue knows only one unit for
    /// keeps the default, since a dimension of one has nothing to convert
    /// between.
    internal let multiplier: Double

    internal init(symbol: String, dimension: String, multiplier: Double = 1) {
        self.symbol = symbol
        self.dimension = dimension
        self.multiplier = multiplier
    }

    internal static let known: [InventoryUnit] = [
        InventoryUnit(symbol: "mm", dimension: "length", multiplier: 0.001),
        InventoryUnit(symbol: "cm", dimension: "length", multiplier: 0.01),
        InventoryUnit(symbol: "m", dimension: "length"),
        InventoryUnit(symbol: "kg", dimension: "mass"),
        InventoryUnit(symbol: "L", dimension: "volume"),
        InventoryUnit(symbol: "W", dimension: "power"),
        InventoryUnit(symbol: "V", dimension: "voltage"),
        InventoryUnit(symbol: "Gbps", dimension: "data rate"),
        InventoryUnit(symbol: "lm", dimension: "brightness"),
        InventoryUnit(symbol: "K", dimension: "colour temperature"),
    ]

    internal static func named(_ symbol: String) -> InventoryUnit? {
        known.first { $0.symbol == symbol }
    }
}

/// One fact about an object.
///
/// The cases are the presentations a value can take on screen, not storage
/// types: `choice` and `text` would both be a string in a database, and the
/// difference between them, one comes from a fixed set, the other does not ,
/// is exactly what a reviewer is deciding about.
internal enum InventoryPropertyValue: Equatable {
    case text(String)
    case choice(String)
    case flag(Bool)
    case measure(Double, unit: String)
    case span(low: Double, high: Double, unit: String)
    case link(String)

    internal var display: String {
        switch self {
        case .text(let value), .choice(let value), .link(let value):
            value
        case .flag(let value):
            value ? "Yes" : "No"
        case .measure(let amount, let unit):
            "\(Self.figure(amount)) \(unit)"
        case .span(let low, let high, let unit):
            "\(Self.figure(low))–\(Self.figure(high)) \(unit)"
        }
    }

    /// The type, named the way the person entering it would name it. Shown by
    /// the variants that let somebody pick one.
    internal var kindLabel: String {
        switch self {
        case .text: "Text"
        case .choice: "Choice"
        case .flag: "Yes or no"
        case .measure: "Measurement"
        case .span: "Range"
        case .link: "Link"
        }
    }

    internal var unitSymbol: String? {
        switch self {
        case .measure(_, let unit), .span(_, _, let unit): unit
        case .text, .choice, .flag, .link: nil
        }
    }

    /// False only when the value carries a unit the catalogue does not know.
    /// A value with no unit at all is not unsupported, it is unitless.
    internal var hasSupportedUnit: Bool {
        guard let unitSymbol else { return true }
        return InventoryUnit.named(unitSymbol) != nil
    }

    private static func figure(_ value: Double) -> String {
        value == value.rounded()
            ? String(format: "%.0f", value)
            : String(format: "%g", value)
    }
}

/// Where a property came from, which is what decides how much a screen trusts
/// it and what it offers to do with it.
internal enum InventoryPropertyOrigin: Equatable {
    /// A field the object's template asked for.
    case template
    /// A key somebody typed. No template knows about it.
    case custom
    /// Proposed by local inference and not yet accepted by anybody.
    case suggested(InventoryInferenceConfidence)
    /// Carried in from an older record whose template no longer exists.
    case legacy
}

internal enum InventoryInferenceConfidence: String, Equatable {
    case certain
    case likely
    case guess

    internal var label: String {
        switch self {
        case .certain: "Read off the label"
        case .likely: "Likely"
        case .guess: "Guess"
        }
    }
}

internal struct InventoryProperty: Identifiable, Equatable {
    internal let key: String
    internal let value: InventoryPropertyValue
    internal let origin: InventoryPropertyOrigin

    internal init(
        _ key: String,
        _ value: InventoryPropertyValue,
        origin: InventoryPropertyOrigin = .template
    ) {
        self.key = key
        self.value = value
        self.origin = origin
    }

    /// Two keys that differ only in case or spacing are one key, see
    /// ``InventoryPropertySchema/normalized(_:)`` for why that is the rule.
    internal var id: String { InventoryPropertySchema.normalized(key) }
}

/// A field a template asks for, whether or not an object has filled it in.
internal struct InventoryTemplateField: Identifiable, Equatable {
    internal let key: String
    internal let kindLabel: String
    internal let unit: String?
    /// What to put in it, for a field whose name does not say. Empty for the
    /// ones that do.
    internal let hint: String?
    /// The values a choice field accepts, declared by the type. Nil for every
    /// other kind. See ``InventoryFieldValidation`` for what a value outside
    /// this list means.
    internal let choices: [String]?

    internal init(
        _ key: String, _ kindLabel: String, unit: String? = nil, hint: String? = nil,
        choices: [String]? = nil
    ) {
        self.key = key
        self.kindLabel = kindLabel
        self.unit = unit
        self.hint = hint
        self.choices = choices
    }

    internal var id: String { InventoryPropertySchema.normalized(key) }
}

internal struct InventoryTemplate: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let fields: [InventoryTemplateField]
}

/// An object in the catalogue, with everything each variant needs to draw it.
internal struct InventoryThing: Identifiable, Equatable {
    internal let id: String
    internal let name: String
    internal let symbol: String
    internal let location: String
    /// What somebody would call it. Present even when no template matches, so
    /// the unknown-category state is a missing template rather than a missing
    /// noun.
    internal let category: String
    internal let template: InventoryTemplate?
    internal let properties: [InventoryProperty]
    /// The tags-and-description variant's whole vocabulary, and a secondary
    /// one everywhere else.
    internal let tags: [String]
    internal let notes: String
    /// Proposed but unaccepted. Empty once somebody has been through them.
    internal let suggestions: [InventoryProperty]

    internal var accepted: [InventoryProperty] {
        properties.filter { $0.origin != .custom }
    }

    internal var custom: [InventoryProperty] {
        properties.filter { $0.origin == .custom }
    }
}
