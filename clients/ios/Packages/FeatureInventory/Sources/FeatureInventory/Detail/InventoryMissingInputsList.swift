import DesignSystem
import SwiftUI

/// The inputs an unavailable computed value is waiting on, one quiet line
/// each under its summary. A long list shows its first few and discloses the
/// rest, so the row stays compact.
internal struct InventoryMissingInputsList: View {
    internal let inputs: [InventoryMissingInput]
    internal var alignment: HorizontalAlignment = .leading

    @State private var expanded = false

    /// How many lines show before the rest are disclosed.
    internal static let collapsedCount = 3

    /// The lines on screen, and how many more a tap would show.
    internal static func visible(_ inputs: [InventoryMissingInput], expanded: Bool)
        -> (shown: [InventoryMissingInput], hidden: Int)
    {
        guard !expanded, inputs.count > collapsedCount + 1 else { return (inputs, 0) }
        return (Array(inputs.prefix(collapsedCount)), inputs.count - collapsedCount)
    }

    internal var body: some View {
        let visible = Self.visible(inputs, expanded: expanded)
        VStack(alignment: alignment, spacing: PopsSpacing.xs) {
            ForEach(visible.shown) { input in
                Text(input.text)
                    .font(.popsCaption)
                    .foregroundStyle(Color.popsMutedForeground)
            }
            if visible.hidden > 0 {
                Button("Show \(visible.hidden) more") { expanded = true }
                    .font(.popsCaption.weight(.semibold))
                    .buttonStyle(.borderless)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Missing inputs")
    }
}
