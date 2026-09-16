import DesignSystem
import SwiftUI

/// Where a field's unit shows: on the tape whose width is convertible, on the
/// tape whose is not, and in the search clause that reaches both.
///
/// Length is the only dimension the catalogue carries more than one unit for,
/// so it is the one every variant here has to explain rather than the one
/// that happens to be shown.
internal struct InventoryFieldUnitView: View {
    internal let presentation: InventoryFieldStyle.UnitPresentation

    internal var body: some View {
        List {
            Section { InventoryThingHeader(thing: InventoryFieldFixtures.tapeInCentimetres) }
            widthLine("Width", InventoryFieldFixtures.tapeInCentimetres)
            unsupported
            searchClause
        }
        .playgroundInsetGroupedList()
    }

    private func widthLine(_ key: String, _ thing: InventoryThing) -> some View {
        Section {
            InventoryPropertyLine(key: key, value: widthDisplay(for: thing))
        } header: {
            Text("Width")
        } footer: {
            Text(entryFooter)
        }
    }

    private var unsupported: some View {
        Section {
            InventoryPropertyLine(
                key: "Width", value: widthDisplay(for: InventoryFieldFixtures.tapeInUnknownUnit))
            InventoryPropertyProblem(
                message: "\"in\" is not a unit the catalogue recognises",
                resolution: "Recorded as typed. Nothing converts it and nothing searches it.",
                tone: .popsWarning)
        } header: {
            Text("A second tape")
        }
    }

    private var searchClause: some View {
        Section {
            Text(searchDisplay).font(.popsBody).foregroundStyle(Color.popsForeground)
        } header: {
            Text("Searching by width")
        } footer: {
            Text("Centimetres and millimetres convert; the second tape's inches would not match.")
        }
    }

    private func widthDisplay(for thing: InventoryThing) -> String {
        let value = thing.properties.first { $0.key == "Width" }?.value.display ?? ""
        switch presentation {
        case .suffixInField: return value
        case .segmentedControl, .labelOnly: return value.components(separatedBy: " ").first ?? value
        }
    }

    private var entryFooter: String {
        switch presentation {
        case .suffixInField: "The unit is part of the value, cm here."
        case .segmentedControl: "A segmented control beside the field picks mm, cm or m."
        case .labelOnly: "The unit is named in the field's label, not repeated on the value."
        }
    }

    private var searchDisplay: String {
        let clause = InventoryFieldFixtures.widthSearch
        switch presentation {
        case .suffixInField: return "\(clause.key) \(clause.comparison.rawValue) \(clause.value) cm"
        case .segmentedControl:
            return "\(clause.key) \(clause.comparison.rawValue) \(clause.value) [cm ▾]"
        case .labelOnly: return "\(clause.key) (cm) \(clause.comparison.rawValue) \(clause.value)"
        }
    }
}
