import DesignSystem
import SwiftUI

/// Which keys two objects can usefully be lined up on, and where they differ.
internal enum InventoryComparison {
    /// Every key either object records, in the order the first one records
    /// them, with the second's extras after. Not sorted: a template's field
    /// order is an editorial decision about what matters, and alphabetising
    /// would hand it to the alphabet.
    internal static func keys(across things: [InventoryThing]) -> [String] {
        var seen: Set<String> = []
        var ordered: [String] = []
        for thing in things {
            for property in thing.properties where property.origin != .custom {
                if seen.insert(property.id).inserted { ordered.append(property.key) }
            }
        }
        return ordered
    }

    internal static func value(of key: String, in thing: InventoryThing) -> String? {
        InventoryPropertySchema.duplicate(of: key, in: thing.properties)?.value.display
    }

    /// True when the objects do not all say the same thing, including when
    /// one of them says nothing, which is a difference a reviewer cares about.
    internal static func differs(on key: String, across things: [InventoryThing]) -> Bool {
        let values = things.map { value(of: key, in: $0) }
        return Set(values.map { $0 ?? "" }).count > 1
    }
}

/// Two objects side by side, one row per key.
///
/// A `Grid` rather than stacked `HStack`s: the key column has to be as wide as
/// the widest key and no wider, and at AX5 that width is not a number anybody
/// can write down.
internal struct InventoryComparisonGrid: View {
    internal let things: [InventoryThing]

    internal var body: some View {
        Grid(
            alignment: .leading, horizontalSpacing: PopsSpacing.md, verticalSpacing: PopsSpacing.md
        ) {
            GridRow {
                Text("Property")
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
                ForEach(things) { thing in
                    Text(thing.name)
                        .font(.popsCaption.weight(.semibold))
                        .foregroundStyle(Color.popsForeground)
                }
            }
            ForEach(InventoryComparison.keys(across: things), id: \.self) { key in
                PopsDivider().gridCellColumns(things.count + 1)
                row(key: key)
            }
        }
    }

    private func row(key: String) -> some View {
        let differs = InventoryComparison.differs(on: key, across: things)
        return GridRow {
            Text(key)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
            ForEach(things) { thing in
                Text(InventoryComparison.value(of: key, in: thing) ?? "Not recorded")
                    .font(.popsSubheadline.weight(differs ? .semibold : .regular))
                    .foregroundStyle(differs ? Color.popsForeground : Color.popsMutedForeground)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The query a reviewer is looking at the results of, said back to them.
internal struct InventoryQuerySummary: View {
    internal let clauses: [InventoryPropertyClause]
    internal let matches: Int

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.md) {
            ForEach(clauses) { clause in
                InventoryPropertyChip(clause.display, tone: .popsAccent)
            }
            Text(matches == 1 ? "1 item" : "\(matches) items")
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
    }
}

/// A search result, with the properties that made it one.
internal struct InventoryMatchRow: View {
    internal let thing: InventoryThing
    internal let clauses: [InventoryPropertyClause]

    internal var body: some View {
        VStack(alignment: .leading, spacing: PopsSpacing.xs) {
            Text(thing.name)
                .font(.popsBody)
                .foregroundStyle(Color.popsForeground)
            Text(matched)
                .font(.popsCaption)
                .foregroundStyle(Color.popsMutedForeground)
        }
        .padding(.vertical, PopsSpacing.xs)
    }

    private var matched: String {
        let values = clauses.compactMap { clause in
            InventoryPropertySchema.duplicate(of: clause.key, in: thing.properties)
                .map { "\($0.key) \($0.value.display)" }
        }
        return values.isEmpty ? thing.location : values.joined(separator: " · ")
    }
}
