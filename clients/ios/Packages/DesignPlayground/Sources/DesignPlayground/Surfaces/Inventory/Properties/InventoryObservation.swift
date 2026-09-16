/// A template nobody wrote.
///
/// The fifth answer to `inventory-item-properties` needs one thing the other
/// four assume: somewhere for a template to come from. Here it is what the
/// catalogue already does, the keys that items like this one keep recording,
/// counted. Nothing is authored, and a key only becomes a field once enough
/// objects agree it is one.
internal struct InventoryObservedTemplate: Equatable {
    /// What the cluster calls itself. The subject's category when it has one,
    /// because a name is for reading and inference is bad at those.
    internal let name: String
    /// The keys the cluster agrees on, most-used first, each in the spelling
    /// the majority of them uses.
    internal let fields: [InventoryTemplateField]
    /// How many objects were counted. Shown, because "4 items record this" is
    /// the entire argument for accepting the suggestion.
    internal let sampleCount: Int
}

internal enum InventoryObservation {
    /// How much of a cluster has to record a key before it counts as a field.
    /// Half: lower and a one-off becomes a field, higher and a genuinely
    /// optional one (a cable's data rate) never does.
    private static let agreement = 0.5

    /// The objects that look like this one: same category, excluding itself.
    ///
    /// Category rather than key overlap, because key overlap makes every
    /// object with a Length look like every other, and a tape is not a cable.
    internal static func cluster(
        like subject: InventoryThing,
        in catalogue: [InventoryThing]
    ) -> [InventoryThing] {
        catalogue.filter { $0.category == subject.category && $0.id != subject.id }
    }

    /// The template the cluster implies, or nothing when too few objects
    /// agree on anything, the first of its kind has nothing to learn from,
    /// and saying so is better than inventing a template from one example.
    internal static func observed(
        like subject: InventoryThing,
        in catalogue: [InventoryThing]
    ) -> InventoryObservedTemplate? {
        let peers = cluster(like: subject, in: catalogue)
        guard peers.count >= 2 else { return nil }

        let needed = Double(peers.count) * agreement
        let counted = tally(in: peers)
        let fields =
            counted
            .filter { Double($0.count) >= needed }
            .sorted(by: mostUsedFirst)
            .map { InventoryTemplateField($0.key, $0.kind, unit: $0.unit) }

        guard !fields.isEmpty else { return nil }
        return InventoryObservedTemplate(
            name: subject.category, fields: fields, sampleCount: peers.count)
    }

    /// One key as the cluster records it: how many use it, in whose spelling,
    /// with what type and, for a measurement, in which unit each peer
    /// recorded it.
    ///
    /// A unit is collected rather than assigned, because the field's settled
    /// unit is the cluster's majority, not whichever peer this loop visits
    /// last, see ``InventoryObservedKey/unit``.
    private static func tally(in peers: [InventoryThing]) -> [InventoryObservedKey] {
        var counted: [String: InventoryObservedKey] = [:]
        for property in peers.flatMap(\.properties) where property.origin != .custom {
            let existing = counted[property.id]
            let unit = property.value.unitSymbol.map { [$0] } ?? []
            counted[property.id] = InventoryObservedKey(
                key: property.key,
                count: (existing?.count ?? 0) + 1,
                kind: property.value.kindLabel,
                units: (existing?.units ?? []) + unit,
                spellings: (existing?.spellings ?? []) + [property.key]
            )
        }
        return counted.values.map(\.settled)
    }

    /// Most-used first, and alphabetical between keys the cluster uses
    /// equally, so the field order is a fact about the catalogue rather than
    /// about what order a dictionary happened to enumerate in.
    private static func mostUsedFirst(_ one: InventoryObservedKey, _ other: InventoryObservedKey)
        -> Bool
    {
        one.count == other.count ? one.key < other.key : one.count > other.count
    }

    /// The spelling the catalogue mostly uses for a key, when it is not the
    /// one being offered. Case and hyphens only, two genuinely different
    /// words are a rename, which is ``renameSuggestion(for:given:on:)``.
    internal static func canonicalSpelling(
        of key: String,
        in catalogue: [InventoryThing]
    ) -> String? {
        let normalized = InventoryPropertySchema.normalized(key)
        let spellings = catalogue.flatMap(\.properties)
            .filter { $0.id == normalized }
            .map(\.key)
        guard let majority = InventoryObservedKey.mostCommon(of: spellings), majority != key else {
            return nil
        }
        return majority
    }

    /// The observed field a custom key is probably a second name for.
    ///
    /// Two keys are candidates when they measure the same thing and the object
    /// fills only one of them, a "Cable length" in feet beside a cluster that
    /// records "Length" in metres. It is a suggestion and it is shown as one:
    /// nothing here renames anything on its own.
    internal static func renameSuggestion(
        for property: InventoryProperty,
        given template: InventoryObservedTemplate,
        on thing: InventoryThing
    ) -> InventoryTemplateField? {
        guard let dimension = property.value.unitSymbol.flatMap(InventoryUnit.named)?.dimension
        else { return nil }
        return template.fields.first { field in
            guard field.id != property.id,
                InventoryPropertySchema.duplicate(of: field.key, in: thing.properties) == nil,
                let unit = field.unit.flatMap(InventoryUnit.named)
            else { return false }
            return unit.dimension == dimension
        }
    }
}

/// One key as a cluster records it, while it is being counted.
internal struct InventoryObservedKey {
    internal let key: String
    internal let count: Int
    internal let kind: String
    /// The unit each peer that recorded this key used, one entry per peer.
    /// ``unit`` resolves it; nothing here decides the winner early.
    internal let units: [String]
    internal let spellings: [String]

    /// The same key, named the way most of the cluster names it.
    internal var settled: InventoryObservedKey {
        InventoryObservedKey(
            key: Self.mostCommon(of: spellings) ?? key,
            count: count,
            kind: kind,
            units: units,
            spellings: spellings
        )
    }

    /// The unit most of the cluster recorded this key in, ties broken
    /// alphabetically. Not "the last peer counted", which is what a field
    /// that overwrote rather than tallied its unit used to settle for.
    internal var unit: String? { Self.mostCommon(of: units) }

    /// The most frequent element, ties broken alphabetically so the result
    /// does not depend on what order the catalogue happened to be read in.
    internal static func mostCommon(of values: [String]) -> String? {
        var counts: [String: Int] = [:]
        for value in values { counts[value, default: 0] += 1 }
        return counts.sorted { $0.value == $1.value ? $0.key < $1.key : $0.value > $1.value }
            .first?.key
    }
}
