import DesignSystem
import SwiftUI

/// One input an unavailable computed property is waiting on, staged to match
/// FeatureInventory's `InventoryMissingInputsList`: field and item, plus the
/// short parenthetical `InventoryMissingInputs` adds when the reason is not
/// simply unset — "missing", "deleted", or "not here yet" for something a
/// newer catalogue named that has not reached this phone, the same word the
/// catalogue repair surface uses for `InventoryFieldFit.notOnPhone`.
internal struct InventoryComputedPropertyMissingInput: Identifiable {
    internal let id: String
    internal let text: String
}

/// Every condition Item detail and the item form put in front of a reader
/// once a computed property is unavailable: one input, several, more than
/// fit before disclosure, a reference reason rather than simply unset, and
/// the pre-`missingInputs` fallback that names only the field a stored value
/// failed on.
internal enum InventoryMissingInputsScenario: String, CaseIterable, Identifiable {
    case single
    case several
    case collapsed
    case referenceReasons
    case fallback

    internal var id: String { rawValue }

    /// The rows listed under the summary. Empty when the summary already
    /// names the only input, on the property's own item — matching
    /// `InventoryMissingInputs.listed(_:)`, which drops that redundant row.
    internal var rows: [InventoryComputedPropertyMissingInput] {
        switch self {
        case .single, .fallback:
            return []
        case .several:
            return [
                .init(id: "width", text: "Width · Clear storage box"),
                .init(id: "height", text: "Height · Clear storage box"),
            ]
        case .collapsed:
            return (1...5).map {
                .init(id: "field-\($0)", text: "Field \($0) · Clear storage box")
            }
        case .referenceReasons:
            return [
                .init(id: "shelf", text: "Shelf · Blue case (deleted)"),
                .init(id: "stored-in", text: "Stored in · Travel kit (not here yet)"),
            ]
        }
    }

    /// The one line `InventoryProtocol2Display.unavailable(reason:missing:)`
    /// puts beside the field.
    internal var summary: String {
        switch self {
        case .single: "Unavailable until Width is set"
        case .fallback: "Unavailable until Depth on Rack is set"
        case .several: "Unavailable until 2 values are set"
        case .collapsed: "Unavailable until 5 values are set"
        case .referenceReasons: "Unavailable: 2 values are missing"
        }
    }

    internal var title: String {
        switch self {
        case .single: "One input"
        case .fallback: "Fallback to the failed field"
        case .several: "Several inputs"
        case .collapsed: "More than fit"
        case .referenceReasons: "Not simply unset"
        }
    }
}

/// The rows a long list discloses, mirroring
/// `InventoryMissingInputsList.visible(_:expanded:)` at the same threshold.
internal enum InventoryMissingInputsDisclosure {
    internal static let collapsedCount = 3

    internal static func visible(
        _ inputs: [InventoryComputedPropertyMissingInput], expanded: Bool
    ) -> (shown: [InventoryComputedPropertyMissingInput], hidden: Int) {
        guard !expanded, inputs.count > collapsedCount + 1 else { return (inputs, 0) }
        return (Array(inputs.prefix(collapsedCount)), inputs.count - collapsedCount)
    }
}

/// The compact caption list `InventoryMissingInputsList` draws under a
/// computed property's summary, redrawn here so the design record does not
/// depend on FeatureInventory.
internal struct InventoryMissingInputRows: View {
    internal let rows: [InventoryComputedPropertyMissingInput]

    @State private var expanded = false

    internal var body: some View {
        let visible = InventoryMissingInputsDisclosure.visible(
            rows, expanded: expanded)
        VStack(alignment: .trailing, spacing: PopsSpacing.xs) {
            ForEach(visible.shown) { row in
                Text(row.text)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if visible.hidden > 0 {
                Button("Show \(visible.hidden) more") { expanded = true }
                    .font(.popsCaption.weight(.semibold))
                    .buttonStyle(.borderless)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Missing inputs")
    }
}
